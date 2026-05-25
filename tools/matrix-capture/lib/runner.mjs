import { mkdir, rename, rm, stat, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { clearClipboard, saveClipboardImage } from "./windows-clipboard.mjs";
import { deriveParallaxRelativePairs, loadConfig } from "./config.mjs";
import { TradingViewDesktop } from "./tradingview-desktop.mjs";
import {
  canonicalCaptureFileName,
  folderNameForCapture,
  isParallaxRelativeMode,
  isSupportedMode,
  modeTimeframes,
  sameUtcMinute
} from "./timeframes.mjs";

//[Lista atalhos tentados para exportar imagem nativa do TradingView para clipboard.]
const NATIVE_EXPORT_SHORTCUTS = [
  { key: "s", modifiers: ["ctrl", "shift"], label: "Ctrl+Shift+S" },
  { key: "s", modifiers: ["alt"], label: "Alt+S" },
  { key: "s", modifiers: ["ctrl", "alt"], label: "Ctrl+Alt+S" },
  { key: "s", modifiers: ["alt", "shift"], label: "Alt+Shift+S" }
];

const CONTINUOUS_MINUTE_BUFFER_SECONDS = 30;
const MIN_CAPTURE_BYTES = 20_000;

//[Aguarda intervalo curto entre interacoes CDP e exportacoes de imagem.]
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

//[Gera identificador UTC compacto para isolar cada execucao em staging temporario.]
function formatRunId(date = new Date()) {
  const compact = date.toISOString().replace(/[-:]/g, "");
  return compact.replace(/\.\d{3}Z$/, "Z");
}

//[Bloqueia modos desconhecidos antes de tocar TradingView ou filesystem operacional.]
function ensureMode(mode) {
  if (!isSupportedMode(mode)) {
    throw new Error(`Unsupported mode "${mode}". Use "instant", "continuous" or "parallax-relative".`);
  }
}

//[Cria diretorio pai antes de gravar JSON ou capturas em paths novos.]
async function mkdirParent(targetPath) {
  await mkdir(dirname(targetPath), { recursive: true });
}

//[Substitui diretorio final por temporario completo, reduzindo estados intermediarios visiveis.]
async function replaceDirectory(targetDir, tempDir) {
  await mkdir(dirname(targetDir), { recursive: true });
  await rm(targetDir, { recursive: true, force: true });
  await rename(tempDir, targetDir);
}

//[Grava JSON indentado apos garantir que diretorio pai existe no disco.]
async function writeJson(filePath, payload) {
  await mkdirParent(filePath);
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

//[Filtra ativos habilitados por modo e por lista opcional recebida na CLI.]
function selectAssets(config, mode, assetFilter) {
  if (isParallaxRelativeMode(mode)) {
    if (assetFilter.size > 0) {
      throw new Error("--asset is not supported for parallax-relative; the relative matrix is always complete.");
    }

    return deriveParallaxRelativePairs(config.assets);
  }

  const wanted = assetFilter.size > 0 ? assetFilter : null;
  return config.assets.filter((entry) => {
    if (!entry[mode]) {
      return false;
    }
    if (!wanted) {
      return true;
    }
    return wanted.has(entry.asset);
  });
}

//[Evita iniciar continuous perto da virada de minuto para manter capturas consistentes.]
async function waitForContinuousMinuteWindow() {
  const now = new Date();
  const remainingSeconds = 60 - now.getUTCSeconds();
  if (remainingSeconds > CONTINUOUS_MINUTE_BUFFER_SECONDS) {
    return null;
  }

  const waitMs = remainingSeconds * 1000 + 1000;
  await sleep(waitMs);
  return waitMs;
}

//[Tenta atalhos de exportacao, salva clipboard como PNG e valida tamanho minimo.]
async function captureNativeTradingViewImage(desktop, outputPath) {
  let lastError = null;
  for (const shortcut of NATIVE_EXPORT_SHORTCUTS) {
    try {
      clearClipboard();
      await desktop.focusChart();
      await desktop.pressShortcut(shortcut.key, shortcut.modifiers);
      saveClipboardImage(outputPath, { timeoutMs: 8000, pollMs: 250 });
      const fileStat = await stat(outputPath);
      if (fileStat.size < MIN_CAPTURE_BYTES) {
        throw new Error(`Clipboard export was unexpectedly small (${fileStat.size} bytes).`);
      }
      return {
        shortcut: shortcut.label,
        sizeBytes: fileStat.size
      };
    } catch (error) {
      lastError = `${shortcut.label}: ${error.message}`;
      await rm(outputPath, { force: true });
    }
  }

  throw new Error(`TradingView native export failed. ${lastError || "No screenshot shortcut succeeded."}`);
}

//[Cria pasta temporaria limpa para uma captura especifica dentro do run.]
async function prepareTempFolder(baseRoot, runId, folderName) {
  const tempDir = resolve(baseRoot, "_tmp", runId, folderName);
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });
  return tempDir;
}

//[Move captura incompleta para _failed e grava detalhes estruturados do erro.]
async function moveFailedCapture(baseRoot, runId, folderName, tempDir, details) {
  const failedDir = resolve(baseRoot, "_failed", runId, folderName);
  await rm(failedDir, { recursive: true, force: true });
  await mkdir(dirname(failedDir), { recursive: true });
  await rename(tempDir, failedDir);
  await writeJson(resolve(failedDir, "capture_error.json"), details);
  return failedDir;
}

//[Finaliza captura bem-sucedida escrevendo manifest e movendo temp para destino.]
async function finalizeSuccessfulCapture(baseRoot, folderName, tempDir, manifest) {
  await writeJson(resolve(tempDir, "capture_manifest.json"), manifest);
  const finalDir = resolve(baseRoot, folderName);
  await replaceDirectory(finalDir, tempDir);
  return finalDir;
}

//[Captura um dossier planejado, trocando symbol/timeframes e preservando falhas isoladas.]
async function captureSingleDossier({
  desktop,
  inboxTvRoot,
  runId,
  asset,
  mode,
  requestedTimeframes
}) {
  const isInstant = mode === "instant";
  const isContinuous = mode === "continuous";
  const folderName = folderNameForCapture({
    asset: asset.asset,
    mode,
    timeframe: isInstant ? requestedTimeframes[0] : null
  });
  const tempDir = await prepareTempFolder(inboxTvRoot, runId, folderName);

  try {
    await desktop.setSymbol(asset.tradingviewSymbol);

    if (isContinuous) {
      await waitForContinuousMinuteWindow();
    }

    const captureTimeUtc = new Date();
    const captureMinuteUtc = new Date(captureTimeUtc);
    const files = [];

    for (const timeframe of requestedTimeframes) {
      const currentMinute = new Date();
      if (!isInstant && !sameUtcMinute(currentMinute, captureMinuteUtc)) {
        throw new Error("Continuous capture crossed into a different UTC minute before finishing all required timeframes.");
      }

      await desktop.setTimeframe(timeframe);
      await sleep(750);

      const currentState = await desktop.getState();
      const fileName = canonicalCaptureFileName({
        mode,
        asset: asset.asset,
        captureTimeUtc: captureMinuteUtc,
        timeframe
      });
      const outputPath = resolve(tempDir, fileName);
      const exportResult = await captureNativeTradingViewImage(desktop, outputPath);
      files.push({
        timeframe,
        fileName,
        filePath: outputPath,
        shortcut: exportResult.shortcut,
        sizeBytes: exportResult.sizeBytes,
        chartState: currentState
      });
      await sleep(300);
    }

    const manifest = {
      asset: asset.asset,
      type: mode,
      requestedTradingviewSymbol: asset.tradingviewSymbol,
      capturedTradingviewSymbol: files[0]?.chartState?.fullName || files[0]?.chartState?.symbol || asset.tradingviewSymbol,
      ...(asset.relativeBaseAsset && asset.relativeQuoteAsset
        ? {
            relativeBaseAsset: asset.relativeBaseAsset,
            relativeQuoteAsset: asset.relativeQuoteAsset
          }
        : {}),
      requestedTimeframes,
      captureTimeUtc: captureTimeUtc.toISOString(),
      backend: "tradingview-desktop-native-export",
      runId,
      files: files.map((file) => ({
        timeframe: file.timeframe,
        fileName: file.fileName,
        requestedTradingviewSymbol: asset.tradingviewSymbol,
        capturedTradingviewSymbol: file.chartState?.fullName || file.chartState?.symbol || asset.tradingviewSymbol,
        shortcut: file.shortcut,
        sizeBytes: file.sizeBytes,
        chartState: file.chartState
      }))
    };

    const finalDir = await finalizeSuccessfulCapture(
      inboxTvRoot,
      folderName,
      tempDir,
      manifest
    );

    return {
      success: true,
      asset: asset.asset,
      mode,
      folderName,
      finalDir,
      manifest,
      files
    };
  } catch (error) {
    const failedDir = await moveFailedCapture(inboxTvRoot, runId, folderName, tempDir, {
      asset: asset.asset,
      type: mode,
      requestedTradingviewSymbol: asset.tradingviewSymbol,
      ...(asset.relativeBaseAsset && asset.relativeQuoteAsset
        ? {
            relativeBaseAsset: asset.relativeBaseAsset,
            relativeQuoteAsset: asset.relativeQuoteAsset
          }
        : {}),
      requestedTimeframes,
      runId,
      error: error.message
    });

    return {
      success: false,
      asset: asset.asset,
      mode,
      folderName,
      failedDir,
      error: error.message
    };
  }
}

//[Verifica conexao CDP, paths resolvidos e estado atual do grafico TradingView.]
export async function runDoctor({ configPath } = {}) {
  const config = loadConfig(configPath);
  const desktop = new TradingViewDesktop({ port: config.cdpPort });
  try {
    const state = await desktop.getState();
    return {
      success: true,
      cdpPort: config.cdpPort,
      layoutName: config.layoutName,
      configPath: config.configPath,
      inboxTvRoot: config.paths.inboxTvRoot,
      incomingRoot: config.paths.incomingRoot,
      assetCount: config.assets.length,
      chart: state
    };
  } finally {
    await desktop.close();
  }
}

//[Planeja ou executa capturas para todos ativos e timeframes habilitados do modo.]
export async function runCapture(mode, { configPath, assetNames = [], dryRun = false } = {}) {
  ensureMode(mode);
  const config = loadConfig(configPath);
  const selectedAssets = selectAssets(
    config,
    mode,
    new Set(assetNames.map((value) => String(value).trim().toUpperCase()).filter(Boolean))
  );

  if (selectedAssets.length === 0) {
    throw new Error(`No assets are enabled for mode "${mode}" with the provided filter.`);
  }

  const timeframes = modeTimeframes(mode);
  const plannedDossiers = [];

  for (const asset of selectedAssets) {
    if (mode === "continuous" || isParallaxRelativeMode(mode)) {
      plannedDossiers.push({
        asset: asset.asset,
        mode,
        requestedTradingviewSymbol: asset.tradingviewSymbol,
        ...(asset.relativeBaseAsset && asset.relativeQuoteAsset
          ? {
              relativeBaseAsset: asset.relativeBaseAsset,
              relativeQuoteAsset: asset.relativeQuoteAsset
            }
          : {}),
        requestedTimeframes: timeframes,
        folderName: folderNameForCapture({ asset: asset.asset, mode })
      });
      continue;
    }

    for (const timeframe of timeframes) {
      plannedDossiers.push({
        asset: asset.asset,
        mode,
        requestedTradingviewSymbol: asset.tradingviewSymbol,
        requestedTimeframes: [timeframe],
        folderName: folderNameForCapture({ asset: asset.asset, mode, timeframe })
      });
    }
  }

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      configPath: config.configPath,
      inboxTvRoot: config.paths.inboxTvRoot,
      plannedDossiers
    };
  }

  const runId = formatRunId();
  const desktop = new TradingViewDesktop({ port: config.cdpPort });

  try {
    if (config.layoutName) {
      await desktop.switchLayout(config.layoutName);
    } else {
      await desktop.connect();
    }

    const results = [];
    for (const planned of plannedDossiers) {
      results.push(await captureSingleDossier({
        desktop,
        inboxTvRoot: config.paths.inboxTvRoot,
        runId,
        asset: selectedAssets.find((entry) => entry.asset === planned.asset),
        mode,
        requestedTimeframes: planned.requestedTimeframes
      }));
    }

    return {
      success: results.every((result) => result.success),
      runId,
      mode,
      inboxTvRoot: config.paths.inboxTvRoot,
      plannedDossiers,
      results
    };
  } finally {
    await desktop.close();
  }
}
