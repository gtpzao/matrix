import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { loadConfig } from "./config.mjs";
import {
  assert,
  dateYmdUtc,
  floorSlotTimeUtc,
  slugForFrontmatter
} from "./archive-contract.mjs";
import { analyzeDossierContent } from "./dossier-ai.mjs";
import {
  canonicalCaptureFileName,
  folderNameForCapture,
  modeTimeframes
} from "./timeframes.mjs";

//[Reconhece nomes canonical de capturas e extrai modo, ativo, data, hora e timeframe.]
const CAPTURE_FILE_PATTERN = /^(instant|continuous)_([a-z0-9]+)_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})_(1M|1W|1D|4h|2h|1h|30|15)\.png$/i;

//[Valida modo informado antes de inspecionar staging e chamar etapas que gravam arquivos.]
function ensureMode(mode) {
  if (mode !== "instant" && mode !== "continuous") {
    throw new Error(`Unsupported mode "${mode}". Use "instant" or "continuous".`);
  }
}

//[Cria identificador UTC compacto para pastas temporarias geradas durante dossier.]
function formatRunId(date = new Date()) {
  const compact = date.toISOString().replace(/[-:]/g, "");
  return compact.replace(/\.\d{3}Z$/, "Z");
}

//[Lê JSON opcional quando existe, retornando null para manifest ausente.]
async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

//[Extrai metadados do nome canonical ou retorna null quando padrao falha.]
function parseCaptureFileName(fileName) {
  const match = fileName.match(CAPTURE_FILE_PATTERN);
  if (!match) {
    return null;
  }

  return {
    mode: match[1].toLowerCase(),
    asset: match[2].toUpperCase(),
    datePart: match[3],
    hmPart: match[4],
    timeframe: match[5]
  };
}

//[Compara duas datas no mesmo minuto UTC para validar consistencia da captura.]
function sameUtcMinute(left, right) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate() &&
    left.getUTCHours() === right.getUTCHours() &&
    left.getUTCMinutes() === right.getUTCMinutes()
  );
}

//[Ordena timeframes conforme ordem esperada do modo para frontmatter e analise.]
function orderedTimeframes(mode, timeframes) {
  const expectedOrder = modeTimeframes(mode);
  return [...timeframes].sort((left, right) => {
    return expectedOrder.indexOf(left) - expectedOrder.indexOf(right);
  });
}

//[Renderiza index.md completo com frontmatter e secoes exigidas pelo contrato.]
function renderIndexMarkdown({
  asset,
  mode,
  bias,
  preview,
  analyses,
  slotTimeUtc,
  captureTimeUtc,
  tradingviewSymbol,
  tradingviewTimeframes,
  slideImages
}) {
  const title = `${asset} // ${mode.toUpperCase()}`;
  const analysisBlocks = analyses.map(({ timeframe, text }) => {
    return `### ${timeframe}\n\n${text}`;
  }).join("\n\n");

  const frontmatter = [
    "---",
    `title: "${title}"`,
    `asset: "${asset}"`,
    `type: "${mode}"`,
    `bias: "${bias}"`,
    `date: ${dateYmdUtc(slotTimeUtc)}`,
    `slotTimeUtc: "${slotTimeUtc.toISOString()}"`,
    `captureTimeUtc: "${captureTimeUtc.toISOString()}"`,
    `tradingviewSymbol: "${tradingviewSymbol}"`,
    "tradingviewTimeframes:",
    ...tradingviewTimeframes.map((timeframe) => `  - "${timeframe}"`),
    "slideImages:",
    ...slideImages.map((image) => `  - "${image}"`),
    "---"
  ].join("\n");

  return `${frontmatter}

## Preview

${preview}

## Bias

${bias}

## Analysis

${analysisBlocks}
`;
}

//[Monta objeto frontmatter usado para calcular slug antes de escrever arquivo.]
function buildFrontmatter({
  title,
  asset,
  mode,
  bias,
  slotTimeUtc,
  captureTimeUtc,
  tradingviewSymbol,
  tradingviewTimeframes,
  slideImages
}) {
  return {
    title,
    asset,
    type: mode,
    bias,
    date: dateYmdUtc(slotTimeUtc),
    slotTimeUtc: slotTimeUtc.toISOString(),
    captureTimeUtc: captureTimeUtc.toISOString(),
    tradingviewSymbol,
    tradingviewTimeframes,
    slideImages
  };
}

//[Normaliza metadados de manifest para comparar com arquivos PNG encontrados.]
function metadataFromManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    return null;
  }

  return {
    type: typeof manifest.type === "string" ? manifest.type.trim().toLowerCase() : null,
    asset: typeof manifest.asset === "string" ? manifest.asset.trim().toUpperCase() : null,
    tradingviewSymbol: String(
      manifest.capturedTradingviewSymbol
      || manifest.requestedTradingviewSymbol
      || ""
    ).trim(),
    requestedTimeframes: Array.isArray(manifest.requestedTimeframes)
      ? manifest.requestedTimeframes.map((value) => String(value).trim()).filter(Boolean)
      : [],
    captureTimeUtc: manifest.captureTimeUtc ? new Date(manifest.captureTimeUtc) : null,
    files: Array.isArray(manifest.files) ? manifest.files : []
  };
}

//[Inspeciona pasta de captura, valida PNGs e calcula destinos canonicos do dossier.]
async function inspectCaptureFolder(folderPath) {
  const folderName = folderPath.split(/[/\\]/).pop() || folderPath;
  const manifestPath = resolve(folderPath, "capture_manifest.json");
  const manifest = metadataFromManifest(await readJsonIfExists(manifestPath));
  const entries = await readdir(folderPath, { withFileTypes: true });
  const pngFiles = entries
    .filter((entry) => entry.isFile() && /\.png$/i.test(entry.name))
    .map((entry) => entry.name);

  assert(pngFiles.length > 0, `Capture folder "${folderName}" does not contain any PNG files.`);

  const parsedFiles = pngFiles.map((fileName) => {
    const parsed = parseCaptureFileName(fileName);
    assert(parsed, `Capture file "${fileName}" does not use the canonical Matrix naming convention.`);
    return {
      ...parsed,
      fileName,
      sourcePath: resolve(folderPath, fileName)
    };
  });

  const first = parsedFiles[0];
  const captureTimeFromFile = new Date(`${first.datePart}T${first.hmPart.replace("-", ":")}:00.000Z`);
  assert(!Number.isNaN(captureTimeFromFile.getTime()), `Failed to parse capture time from "${first.fileName}".`);

  parsedFiles.forEach((file) => {
    assert(file.mode === first.mode, `Capture folder "${folderName}" mixes dossier types.`);
    assert(file.asset === first.asset, `Capture folder "${folderName}" mixes assets.`);
    assert(file.datePart === first.datePart && file.hmPart === first.hmPart, `Capture folder "${folderName}" mixes capture minutes.`);
  });

  const mode = first.mode;
  const asset = first.asset;
  const tradingviewTimeframes = orderedTimeframes(
    mode,
    parsedFiles.map((file) => file.timeframe)
  );

  if (mode === "instant") {
    assert(parsedFiles.length === 1, `Instant folder "${folderName}" must contain exactly one PNG.`);
  } else {
    assert(parsedFiles.length >= 2, `Continuous folder "${folderName}" must contain multiple PNGs.`);
  }

  if (manifest) {
    assert(!manifest.type || manifest.type === mode, `Manifest type does not match files in "${folderName}".`);
    assert(!manifest.asset || manifest.asset === asset, `Manifest asset does not match files in "${folderName}".`);
    if (manifest.captureTimeUtc instanceof Date && !Number.isNaN(manifest.captureTimeUtc.getTime())) {
      assert(
        sameUtcMinute(manifest.captureTimeUtc, captureTimeFromFile),
        `Manifest capture time does not match PNG minute in "${folderName}".`
      );
    }
    if (manifest.requestedTimeframes.length > 0) {
      const requestedSorted = orderedTimeframes(mode, manifest.requestedTimeframes);
      assert(
        JSON.stringify(requestedSorted) === JSON.stringify(tradingviewTimeframes),
        `Manifest timeframes do not match PNG files in "${folderName}".`
      );
    }
    if (manifest.files.length > 0) {
      const manifestFileNames = manifest.files
        .map((entry) => String(entry.fileName || "").trim())
        .filter(Boolean)
        .sort();
      const parsedFileNames = parsedFiles.map((entry) => entry.fileName).sort();
      assert(
        JSON.stringify(manifestFileNames) === JSON.stringify(parsedFileNames),
        `Manifest file list does not match PNG files in "${folderName}".`
      );
    }
  }

  const captureTimeUtc = manifest?.captureTimeUtc instanceof Date && !Number.isNaN(manifest.captureTimeUtc.getTime())
    ? manifest.captureTimeUtc
    : captureTimeFromFile;
  const tradingviewSymbol = manifest?.tradingviewSymbol || asset;
  const slotTimeUtc = floorSlotTimeUtc(captureTimeUtc, mode);
  const canonicalFiles = tradingviewTimeframes.map((timeframe) => ({
    timeframe,
    fileName: canonicalCaptureFileName({
      mode,
      asset,
      captureTimeUtc,
      timeframe
    })
  }));
  const targetFolderName = folderNameForCapture({
    asset,
    mode,
    timeframe: mode === "instant" ? tradingviewTimeframes[0] : null
  });
  const slideImages = canonicalFiles.map((file) => `./captures/${file.fileName}`);

  return {
    sourceFolderName: folderName,
    sourceFolderPath: folderPath,
    manifest,
    mode,
    asset,
    tradingviewSymbol,
    tradingviewTimeframes,
    captureTimeUtc,
    slotTimeUtc,
    parsedFiles,
    canonicalFiles,
    targetFolderName,
    title: `${asset} // ${mode.toUpperCase()}`,
    slideImages
  };
}

//[Troca diretorio de destino por temp ja pronto, removendo versao anterior.]
async function replaceDirectory(targetDir, tempDir) {
  await mkdir(dirname(targetDir), { recursive: true });
  await rm(targetDir, { recursive: true, force: true });
  await rename(tempDir, targetDir);
}

//[Prepara pasta temporaria de incoming com subpasta captures ja criada.]
async function prepareTempFolder(baseRoot, runId, folderName) {
  const tempDir = resolve(baseRoot, "_tmp", runId, folderName);
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(resolve(tempDir, "captures"), { recursive: true });
  return tempDir;
}

//[Lista folders de inbox ignorando diretorios internos iniciados por underline.]
async function listInboxFolders(inboxTvRoot) {
  return (await readdir(inboxTvRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("_"));
}

//[Converte capturas validadas em dossiers staged, chamando AI fora do dry-run.]
export async function runDossier(mode, { configPath, assetNames = [], folders = [], dryRun = false } = {}) {
  ensureMode(mode);
  const config = loadConfig(configPath);
  const inboxTvRoot = config.paths.inboxTvRoot;
  const incomingRoot = config.paths.incomingRoot;
  const allowedAssets = new Set(
    config.assets
      .filter((entry) => entry[mode])
      .map((entry) => entry.asset)
  );
  const wantedAssets = new Set(
    assetNames.map((value) => String(value).trim().toUpperCase()).filter(Boolean)
  );
  const requestedFolders = folders.length > 0 ? new Set(folders) : null;
  const allFolderNames = requestedFolders
    ? [...requestedFolders]
    : await listInboxFolders(inboxTvRoot);

  const inspected = [];
  for (const folderName of allFolderNames) {
    const folderPath = resolve(inboxTvRoot, folderName);
    assert(existsSync(folderPath), `Selected inbox folder does not exist: ${folderName}`);
    const dossier = await inspectCaptureFolder(folderPath);
    if (dossier.mode !== mode) {
      continue;
    }
    if (!allowedAssets.has(dossier.asset)) {
      continue;
    }
    if (wantedAssets.size > 0 && !wantedAssets.has(dossier.asset)) {
      continue;
    }
    inspected.push(dossier);
  }

  assert(inspected.length > 0, `No inbox capture folders were selected for mode "${mode}".`);

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      inboxTvRoot,
      incomingRoot,
      dossierCount: inspected.length,
      results: inspected.map((dossier) => ({
        sourceFolderName: dossier.sourceFolderName,
        sourceFolderPath: dossier.sourceFolderPath,
        targetFolderName: dossier.targetFolderName,
        targetFolderPath: resolve(incomingRoot, dossier.targetFolderName),
        slug: slugForFrontmatter(buildFrontmatter({
          title: dossier.title,
          asset: dossier.asset,
          mode: dossier.mode,
          bias: "BUY",
          slotTimeUtc: dossier.slotTimeUtc,
          captureTimeUtc: dossier.captureTimeUtc,
          tradingviewSymbol: dossier.tradingviewSymbol,
          tradingviewTimeframes: dossier.tradingviewTimeframes,
          slideImages: dossier.slideImages
        })),
        type: dossier.mode,
        asset: dossier.asset,
        tradingviewSymbol: dossier.tradingviewSymbol,
        tradingviewTimeframes: dossier.tradingviewTimeframes,
        captureTimeUtc: dossier.captureTimeUtc.toISOString(),
        slotTimeUtc: dossier.slotTimeUtc.toISOString(),
        bias: null,
        ai: {
          skipped: true,
          reason: "dry-run"
        }
      }))
    };
  }

  const runId = formatRunId();
  const results = [];

  for (const dossier of inspected) {
    const aiContent = await analyzeDossierContent({
      asset: dossier.asset,
      mode: dossier.mode,
      tradingviewSymbol: dossier.tradingviewSymbol,
      tradingviewTimeframes: dossier.tradingviewTimeframes,
      captureFiles: dossier.parsedFiles
    });
    const frontmatter = buildFrontmatter({
      title: dossier.title,
      asset: dossier.asset,
      mode: dossier.mode,
      bias: aiContent.bias,
      slotTimeUtc: dossier.slotTimeUtc,
      captureTimeUtc: dossier.captureTimeUtc,
      tradingviewSymbol: dossier.tradingviewSymbol,
      tradingviewTimeframes: dossier.tradingviewTimeframes,
      slideImages: dossier.slideImages
    });
    const indexMarkdown = renderIndexMarkdown({
      asset: dossier.asset,
      mode: dossier.mode,
      bias: aiContent.bias,
      preview: aiContent.preview,
      analyses: aiContent.analyses,
      slotTimeUtc: dossier.slotTimeUtc,
      captureTimeUtc: dossier.captureTimeUtc,
      tradingviewSymbol: dossier.tradingviewSymbol,
      tradingviewTimeframes: dossier.tradingviewTimeframes,
      slideImages: dossier.slideImages
    });
    const tempDir = await prepareTempFolder(incomingRoot, runId, dossier.targetFolderName);
    for (const file of dossier.canonicalFiles) {
      const source = dossier.parsedFiles.find((entry) => entry.timeframe === file.timeframe);
      await copyFile(source.sourcePath, resolve(tempDir, "captures", file.fileName));
    }
    await writeFile(resolve(tempDir, "index.md"), indexMarkdown, "utf8");

    const targetFolderPath = resolve(incomingRoot, dossier.targetFolderName);
    await replaceDirectory(targetFolderPath, tempDir);

    results.push({
      sourceFolderName: dossier.sourceFolderName,
      sourceFolderPath: dossier.sourceFolderPath,
      targetFolderName: dossier.targetFolderName,
      targetFolderPath,
      slug: slugForFrontmatter(frontmatter),
      type: dossier.mode,
      asset: dossier.asset,
      tradingviewSymbol: dossier.tradingviewSymbol,
      tradingviewTimeframes: dossier.tradingviewTimeframes,
      captureTimeUtc: dossier.captureTimeUtc.toISOString(),
      slotTimeUtc: dossier.slotTimeUtc.toISOString(),
      bias: aiContent.bias,
      aiModel: aiContent.model,
      status: "generated"
    });
  }

  return {
    success: true,
    dryRun: false,
    runId,
    inboxTvRoot,
    incomingRoot,
    dossierCount: results.length,
    results
  };
}
