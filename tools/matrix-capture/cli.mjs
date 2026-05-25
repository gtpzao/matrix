#!/usr/bin/env node

//[Importa comandos operacionais expostos pela CLI para captura, dossier, promote e limpeza.]
import { runCapture, runDoctor } from "./lib/runner.mjs";
import { runCleanup } from "./lib/cleanup.mjs";
import { runDossier } from "./lib/dossier.mjs";
import { runPipeline } from "./lib/pipeline.mjs";
import { runPromote } from "./lib/promote.mjs";

//[Mostra sintaxe suportada quando usuario chama ajuda ou fornece argumentos invalidos.]
function printUsage() {
  console.error(`Usage:
  node tools/matrix-capture/cli.mjs doctor
  node tools/matrix-capture/cli.mjs capture <instant|continuous|parallax-relative> [now] [--asset BTCUSD,ETHUSD] [--dry-run]
  node tools/matrix-capture/cli.mjs dossier <instant|continuous|parallax-relative> [--asset BTCUSD,ETHUSD] [--folder btcusd-continuous,btcusd-instant-15] [--dry-run]
  node tools/matrix-capture/cli.mjs pipeline <instant|continuous|parallax-relative> [now] [--asset BTCUSD,ETHUSD] [--dry-run] [--cleanup-staging]
  node tools/matrix-capture/cli.mjs promote [--folder btcusd-continuous,btcusd-instant-15] [--dry-run] [--cleanup-staging]
  node tools/matrix-capture/cli.mjs cleanup [--folder btcusd-continuous,btcusd-instant-15] [--dry-run] [--include-failed]`);
}

//[Cria erro marcado para imprimir usage junto da mensagem de validacao.]
function usageError(message) {
  const error = new Error(message);
  error.showUsage = true;
  return error;
}

//[Separa posicionais e flags, normalizando listas separadas por virgula para arrays.]
function parseArgs(argv) {
  const positionals = [];
  const options = {
    assetNames: [],
    folders: [],
    dryRun: false,
    cleanupStaging: false,
    includeFailed: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (token === "--cleanup-staging") {
      options.cleanupStaging = true;
      continue;
    }
    if (token === "--include-failed") {
      options.includeFailed = true;
      continue;
    }
    if (token === "--asset") {
      const raw = argv[index + 1];
      if (!raw) {
        throw new Error("--asset requires a comma-separated value.");
      }
      options.assetNames = raw.split(",").map((value) => value.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    if (token === "--folder") {
      const raw = argv[index + 1];
      if (!raw) {
        throw new Error("--folder requires a comma-separated value.");
      }
      options.folders = raw.split(",").map((value) => value.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    positionals.push(token);
  }

  return { positionals, options };
}

//[Despacha comando solicitado para modulo correto e define exit code operacional.]
async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const command = positionals[0];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  if (command === "doctor") {
    const result = await runDoctor();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "capture") {
    const mode = positionals[1];
    if (!mode) {
      throw usageError('Missing mode. Use "instant", "continuous" or "parallax-relative".');
    }
    if (positionals[2] && positionals[2] !== "now") {
      throw usageError(`Unexpected positional "${positionals[2]}". Use "now" or omit it.`);
    }
    const result = await runCapture(mode, options);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 2);
  }

  if (command === "dossier") {
    const mode = positionals[1];
    if (!mode) {
      throw usageError('Missing mode. Use "instant", "continuous" or "parallax-relative".');
    }
    const result = await runDossier(mode, options);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 2);
  }

  if (command === "pipeline") {
    const mode = positionals[1];
    if (!mode) {
      throw usageError('Missing mode. Use "instant", "continuous" or "parallax-relative".');
    }
    if (positionals[2] && positionals[2] !== "now") {
      throw usageError(`Unexpected positional "${positionals[2]}". Use "now" or omit it.`);
    }
    const result = await runPipeline(mode, options);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 2);
  }

  if (command === "promote") {
    const result = await runPromote(options);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "cleanup") {
    const result = await runCleanup(options);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw usageError(`Unknown command "${command}".`);
}

//[Converte falhas nao tratadas em saida legivel e codigo de erro consistente.]
main().catch((error) => {
  console.error(error.message);
  if (error.showUsage) {
    printUsage();
  }
  process.exit(1);
});
