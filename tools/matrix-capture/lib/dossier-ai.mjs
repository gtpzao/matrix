import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const DEFAULT_CODEX_BIN = "npx";
const DEFAULT_CODEX_ARGS = ["-y", "@openai/codex"];
const PREVIEW_MAX_WORDS = 15;
const ANALYSIS_MAX_WORDS = 30;
const ALLOWED_BIAS = new Set(["BUY", "SELL"]);
const libDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(libDir, "../..");

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

function truncateWords(value, maxWords) {
  const words = sanitizeText(value).split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

function ensureText(value, label) {
  const text = sanitizeText(value);
  if (!text) {
    throw new Error(`Codex dossier response is missing "${label}".`);
  }
  return text;
}

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

function buildPrompt({ asset, mode, tradingviewSymbol, tradingviewTimeframes }) {
  const imageMap = tradingviewTimeframes
    .map((timeframe, index) => `Imagem ${index + 1}: ${timeframe}`)
    .join("; ");

  return [
    "Analise os screenshots anexados do TradingView e retorne somente um JSON valido no schema fornecido.",
    "Escreva em portugues sem acentos, com frases curtas e objetivas.",
    `Asset: ${asset}.`,
    `TradingView symbol: ${tradingviewSymbol}.`,
    `Modo do dossier: ${mode}.`,
    `Timeframes esperados em ordem: ${tradingviewTimeframes.join(", ")}.`,
    `${imageMap}.`,
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

function quotePowerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

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

async function readJsonFile(filePath, label) {
  const raw = await readFile(filePath, "utf8");

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

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
