import { runCapture } from "./runner.mjs";
import { runDossier } from "./dossier.mjs";
import { runPromote } from "./promote.mjs";

function ensureMode(mode) {
  if (mode !== "instant" && mode !== "continuous") {
    throw new Error(`Unsupported mode "${mode}". Use "instant" or "continuous".`);
  }
}

function unique(values) {
  return [...new Set(values)];
}

export async function runPipeline(mode, options = {}) {
  ensureMode(mode);

  const captureResult = await runCapture(mode, options);
  const successfulCaptureFolders = unique(
    (captureResult.results || [])
      .filter((result) => result.success)
      .map((result) => result.folderName)
  );

  if (options.dryRun) {
    return {
      success: captureResult.success,
      dryRun: true,
      mode,
      capture: captureResult,
      dossier: {
        skipped: true,
        reason: "dry-run"
      },
      promote: {
        skipped: true,
        reason: "dry-run"
      }
    };
  }

  if (successfulCaptureFolders.length === 0) {
    return {
      success: false,
      dryRun: false,
      mode,
      capture: captureResult,
      dossier: {
        skipped: true,
        reason: "no-successful-captures"
      },
      promote: {
        skipped: true,
        reason: "no-successful-captures"
      }
    };
  }

  const dossierResult = await runDossier(mode, {
    ...options,
    folders: successfulCaptureFolders,
    dryRun: false
  });
  const promotedFolders = unique(
    (dossierResult.results || []).map((result) => result.targetFolderName)
  );
  const promoteResult = await runPromote({
    ...options,
    folders: promotedFolders,
    dryRun: false
  });

  return {
    success: captureResult.success && dossierResult.success && promoteResult.success,
    dryRun: false,
    mode,
    capture: captureResult,
    dossier: dossierResult,
    promote: promoteResult
  };
}
