import { readdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";
import { loadConfig } from "./config.mjs";

function unique(values) {
  return [...new Set(values)];
}

function normalizeFolderNames(folders) {
  return unique(
    folders
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
}

async function listDirectoryNames(rootPath) {
  if (!existsSync(rootPath)) {
    return [];
  }

  return (await readdir(rootPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

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
