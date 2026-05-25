import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { isParallaxRelativeMode } from "./timeframes.mjs";

//[Define defaults e limites textuais usados para gerar conteudo curto de dossier.]
const DEFAULT_CODEX_BIN = "npx";
const DEFAULT_CODEX_ARGS = ["-y", "@openai/codex"];
const PREVIEW_MAX_WORDS = 15;
const ANALYSIS_MAX_WORDS = 30;
const ALLOWED_BIAS = new Set(["BUY", "SELL"]);
const libDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(libDir, "../..");

//[Remove acentos, caracteres estranhos e espacos duplicados antes de validar texto.]
function sanitizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

//[Corta texto por quantidade maxima de palavras depois da normalizacao ASCII.]
function truncateWords(value, maxWords) {
  const words = sanitizeText(value).split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

//[Exige texto nao vazio em campos obrigatorios retornados pela analise AI.]
function ensureText(value, label) {
  const text = sanitizeText(value);
  if (!text) {
    throw new Error(`Codex dossier response is missing "${label}".`);
  }
  return text;
}

//[Valida analises por timeframe, preservando ordem esperada e rejeitando duplicatas.]
function normalizeAnalyses(rawAnalyses, timeframes) {
  if (!Array.isArray(rawAnalyses)) {
    throw new Error("Codex dossier response is missing the analyses array.");
  }

  const normalized = new Map();

  for (const entry of rawAnalyses) {
    const timeframe = sanitizeText(entry?.timeframe);
    const text = truncateWords(
      ensureText(entry?.text, `analyses.${timeframe || "timeframe"}`),
      ANALYSIS_MAX_WORDS
    );

    if (!timeframes.includes(timeframe)) {
      throw new Error(`Codex dossier response returned an unexpected timeframe "${timeframe}".`);
    }

    if (normalized.has(timeframe)) {
      throw new Error(`Codex dossier response duplicated timeframe "${timeframe}".`);
    }

    normalized.set(timeframe, text);
  }

  return timeframes.map((timeframe) => {
    if (!normalized.has(timeframe)) {
      throw new Error(`Codex dossier response is missing timeframe "${timeframe}".`);
    }

    return {
      timeframe,
      text: normalized.get(timeframe)
    };
  });
}

//[Resolve binario Codex, argumentos default e override opcional de modelo.]
function resolveCodexCommand() {
  const binary = String(process.env.MATRIX_DOSSIER_CODEX_BIN || DEFAULT_CODEX_BIN).trim();
  const model = String(process.env.MATRIX_DOSSIER_CODEX_MODEL || "").trim();

  if (!binary) {
    throw new Error("MATRIX_DOSSIER_CODEX_BIN must be a non-empty executable name.");
  }

  const args = binary === DEFAULT_CODEX_BIN
    ? [...DEFAULT_CODEX_ARGS]
    : [];

  return { binary, args, model };
}

//[Gera schema JSON estrito para resposta do Codex conforme timeframes capturados.]
function schemaForTimeframes(timeframes) {
  return {
    type: "object",
    properties: {
      bias: {
        type: "string",
        enum: ["BUY", "SELL"]
      },
      preview: {
        type: "string"
      },
      analyses: {
        type: "array",
        minItems: timeframes.length,
        maxItems: timeframes.length,
        items: {
          type: "object",
          properties: {
            timeframe: {
              type: "string",
              enum: timeframes
            },
            text: {
              type: "string"
            }
          },
          required: ["timeframe", "text"],
          additionalProperties: false
        }
      }
    },
    required: ["bias", "preview", "analyses"],
    additionalProperties: false
  };
}

//[Monta prompt operacional curto, exigindo portugues sem acentos e JSON puro.]
function buildPrompt({ asset, mode, tradingviewSymbol, tradingviewTimeframes }) {
  const imageMap = tradingviewTimeframes
    .map((timeframe, index) => `Imagem ${index + 1}: ${timeframe}`)
    .join("; ");
  const [relativeBaseAsset, relativeQuoteAsset] = asset.split("/");
  const relativeInstructions = isParallaxRelativeMode(mode)
    ? [
        `Este dossier e de forca relativa: o grafico mostra o ratio ${relativeBaseAsset}/${relativeQuoteAsset}, nao preco absoluto isolado.`,
        `BUY significa comprar ${relativeBaseAsset} contra ${relativeQuoteAsset}; SELL significa vender ${relativeBaseAsset} contra ${relativeQuoteAsset}.`,
        "Na analysis, descreva tendencia, rompimento, compressao, reversao ou continuidade do ratio relativo."
      ]
    : [];

  return [
    "Analise os screenshots anexados do TradingView e retorne somente um JSON valido no schema fornecido.",
    "Escreva em portugues sem acentos, com frases curtas e objetivas.",
    `Asset: ${asset}.`,
    `TradingView symbol: ${tradingviewSymbol}.`,
    `Modo do dossier: ${mode}.`,
    `Timeframes esperados em ordem: ${tradingviewTimeframes.join(", ")}.`,
    `${imageMap}.`,
    ...relativeInstructions,
    "Escolha obrigatoriamente apenas um bias global: BUY ou SELL.",
    "Nunca use NEUTRAL.",
    "Preview: resumo da leitura central, com maximo 15 palavras.",
    `Analyses: exatamente ${tradingviewTimeframes.length} itens, um por timeframe, preservando a ordem informada.`,
    "Cada analysis: maximo 30 palavras.",
    "Baseie-se somente na estrutura visivel do grafico e em inferencia tecnica controlada.",
    "Nao use listas, disclaimers, metacomentarios ou probabilidade vaga.",
    "Se a evidencia estiver mista, escolha o lado estruturalmente mais sustentado."
  ].join(" ");
}

//[Escapa literal PowerShell usado para passar paths e argumentos no Windows.]
function quotePowerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

//[Cria processo Codex com pipe por stdin ou PowerShell wrapper no Windows.]
function spawnCodexProcess(binary, args, promptPath) {
  if (process.platform !== "win32") {
    return {
      child: spawn(binary, args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      }),
      usesStdin: true
    };
  }

  const command = [
    `Get-Content -Raw -LiteralPath ${quotePowerShellLiteral(promptPath)}`,
    "|",
    "&",
    quotePowerShellLiteral(binary),
    ...args.map((arg) => quotePowerShellLiteral(arg))
  ].join(" ");

  return {
    child: spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        command
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      }
    ),
    usesStdin: false
  };
}

//[Executa Codex CLI com imagens, schema de saida e workspace em modo read-only.]
async function runCodexExec({
  codexBinary,
  codexArgs,
  model,
  prompt,
  promptPath,
  captureFiles,
  schemaPath,
  outputPath,
  workdir
}) {
  const args = [
    ...codexArgs,
    "exec",
    "-C",
    workdir,
    "--sandbox",
    "read-only",
    "--output-schema",
    schemaPath,
    "-o",
    outputPath,
    "--color",
    "never"
  ];

  if (model) {
    args.push("-m", model);
  }

  for (const capture of captureFiles) {
    args.push("-i", capture.sourcePath);
  }

  args.push("-");

  return await new Promise((resolvePromise, rejectPromise) => {
    const { child, usesStdin } = spawnCodexProcess(codexBinary, args, promptPath);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      rejectPromise(new Error(`Failed to launch Codex CLI: ${error.message}`));
    });

    if (usesStdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }

    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }

      const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
      rejectPromise(new Error(`Codex CLI dossier analysis failed with exit code ${code}.${detail ? `\n${detail}` : ""}`));
    });
  });
}

//[Lê arquivo JSON produzido pelo Codex e melhora erro quando parse falha.]
async function readJsonFile(filePath, label) {
  const raw = await readFile(filePath, "utf8");

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

//[Prepara arquivos temporarios, chama Codex e devolve payload bruto validavel.]
async function fetchAiAnalysis({ asset, mode, tradingviewSymbol, tradingviewTimeframes, captureFiles }) {
  const { binary, args, model } = resolveCodexCommand();
  const tempRoot = await mkdtemp(resolve(tmpdir(), "matrix-dossier-codex-"));
  const schemaPath = resolve(tempRoot, "schema.json");
  const outputPath = resolve(tempRoot, "result.json");
  const promptPath = resolve(tempRoot, "prompt.txt");
  const prompt = buildPrompt({
    asset,
    mode,
    tradingviewSymbol,
    tradingviewTimeframes
  });

  try {
    await writeFile(
      schemaPath,
      JSON.stringify(schemaForTimeframes(tradingviewTimeframes), null, 2),
      "utf8"
    );
    await writeFile(promptPath, prompt, "utf8");

    await runCodexExec({
      codexBinary: binary,
      codexArgs: args,
      model,
      prompt,
      promptPath,
      captureFiles,
      schemaPath,
      outputPath,
      workdir: repoRoot
    });

    return {
      payload: await readJsonFile(outputPath, "Codex dossier output"),
      model: model || "codex-cli-default"
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

//[Valida payload final da AI e normaliza bias, preview e analises por timeframe.]
export async function analyzeDossierContent({
  asset,
  mode,
  tradingviewSymbol,
  tradingviewTimeframes,
  captureFiles
}) {
  const { payload, model } = await fetchAiAnalysis({
    asset,
    mode,
    tradingviewSymbol,
    tradingviewTimeframes,
    captureFiles
  });

  const bias = sanitizeText(payload?.bias).toUpperCase();
  if (!ALLOWED_BIAS.has(bias)) {
    throw new Error(`Codex dossier response returned invalid bias "${bias}".`);
  }

  const preview = truncateWords(ensureText(payload?.preview, "preview"), PREVIEW_MAX_WORDS);
  const analyses = normalizeAnalyses(payload?.analyses, tradingviewTimeframes);

  return {
    bias,
    preview,
    analyses,
    model
  };
}
