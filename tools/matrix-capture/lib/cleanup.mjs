import { readdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";
import { loadConfig } from "./config.mjs";

//[Remove duplicatas preservando primeira ocorrencia para relatorios de limpeza previsiveis.]
function unique(values) {
  return [...new Set(values)];
}

//[Normaliza nomes recebidos por flag, removendo vazios antes de comparar folders.]
function normalizeFolderNames(folders) {
  return unique(
    folders
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
}

//[Lista subdiretorios existentes, retornando vazio quando root ainda nao existe.]
async function listDirectoryNames(rootPath) {
  if (!existsSync(rootPath)) {
    return [];
  }

  return (await readdir(rootPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

//[Seleciona folders removiveis, preservando failed salvo quando flag explicita permite.]
function folderCleanupTargets(folderNames, { includeFailed }) {
  return folderNames.filter((name) => {
    if (name === "_tmp") {
      return true;
    }
    if (name === "_failed") {
      return includeFailed;
    }
    return !name.startsWith("_");
  });
}

//[Remove folders de uma raiz operacional, respeitando dry-run e filtros manuais.]
async function cleanupOneRoot(rootPath, {
  folders = [],
  includeFailed = false,
  dryRun = false
} = {}) {
  const existingNames = await listDirectoryNames(rootPath);
  const wantedNames = folders.length > 0
    ? normalizeFolderNames(folders)
    : folderCleanupTargets(existingNames, { includeFailed });

  const removable = wantedNames.filter((name) => {
    if (!existingNames.includes(name)) {
      return false;
    }
    if (name === "_failed") {
      return includeFailed;
    }
    if (name === "_tmp") {
      return true;
    }
    return !name.startsWith("_");
  });

  if (!dryRun) {
    for (const name of removable) {
      await rm(resolve(rootPath, name), { recursive: true, force: true });
    }
  }

  return {
    rootPath,
    removedFolders: removable,
    removedCount: removable.length
  };
}

//[Limpa inbox e incoming com mesmas regras, devolvendo resumo para CLI.]
export async function runCleanup({
  configPath,
  folders = [],
  includeFailed = false,
  dryRun = false
} = {}) {
  const config = loadConfig(configPath);
  const selectedFolders = normalizeFolderNames(folders);

  const inbox = await cleanupOneRoot(config.paths.inboxTvRoot, {
    folders: selectedFolders,
    includeFailed,
    dryRun
  });
  const incoming = await cleanupOneRoot(config.paths.incomingRoot, {
    folders: selectedFolders,
    includeFailed,
    dryRun
  });

  return {
    success: true,
    dryRun,
    includeFailed,
    inboxTvRoot: config.paths.inboxTvRoot,
    incomingRoot: config.paths.incomingRoot,
    cleanedFolders: selectedFolders,
    inbox,
    incoming
  };
}
