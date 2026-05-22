import { cp, mkdir, readFile, readdir, rename, rm, stat } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import matter from "gray-matter";
import { loadConfig } from "./config.mjs";
import { runCleanup } from "./cleanup.mjs";
import {
  assert,
  dateYmdUtc,
  slugForFrontmatter,
  VALID_BIAS,
  VALID_TIMEFRAMES,
  VALID_TYPE
} from "./archive-contract.mjs";

const WINDOWS_RETRYABLE_CODES = new Set(["EPERM", "EACCES", "ENOTEMPTY"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureArrayOfStrings(value, fieldName) {
  assert(Array.isArray(value), `"${fieldName}" must be an array.`);
  value.forEach((item, index) => {
    assert(typeof item === "string" && item.trim(), `"${fieldName}[${index}]" must be a non-empty string.`);
  });
}

function extractBiasFromBody(body) {
  const match = body.match(/^##\s+Bias\s*$([\s\S]*?)(?=^##\s+|\Z)/im);
  return match?.[1]?.trim().split(/\r?\n/).find(Boolean) ?? "";
}

function hasHeading(body, heading) {
  return new RegExp(`^##\\s+${heading}\\s*$`, "im").test(body);
}

function validateFrontmatter(frontmatter, body, dossierRoot) {
  assert(frontmatter && typeof frontmatter === "object", "Frontmatter is missing or invalid.");

  const requiredFields = [
    "title",
    "asset",
    "type",
    "bias",
    "date",
    "slotTimeUtc",
    "captureTimeUtc",
    "tradingviewSymbol",
    "tradingviewTimeframes",
    "slideImages"
  ];

  for (const field of requiredFields) {
    assert(frontmatter[field] !== undefined, `Missing required frontmatter field "${field}".`);
  }

  assert(typeof frontmatter.title === "string" && frontmatter.title.trim(), `"title" must be a non-empty string.`);
  assert(typeof frontmatter.asset === "string" && frontmatter.asset.trim(), `"asset" must be a non-empty string.`);
  assert(frontmatter.asset === frontmatter.asset.toUpperCase(), `"asset" must be uppercase in frontmatter.`);

  const type = String(frontmatter.type).trim().toLowerCase();
  assert(VALID_TYPE.has(type), `"type" must be "instant" or "continuous".`);
  frontmatter.type = type;

  const bias = String(frontmatter.bias).trim().toUpperCase();
  assert(VALID_BIAS.has(bias), `"bias" must be BUY, SELL, or NEUTRAL.`);
  frontmatter.bias = bias;

  assert(typeof frontmatter.tradingviewSymbol === "string" && frontmatter.tradingviewSymbol.trim(), `"tradingviewSymbol" must be a non-empty string.`);
  ensureArrayOfStrings(frontmatter.tradingviewTimeframes, "tradingviewTimeframes");
  ensureArrayOfStrings(frontmatter.slideImages, "slideImages");

  frontmatter.tradingviewTimeframes = frontmatter.tradingviewTimeframes.map((value) => String(value).trim());
  frontmatter.slideImages = frontmatter.slideImages.map((value) => String(value).trim());
  frontmatter.tradingviewTimeframes.forEach((timeframe) => {
    assert(VALID_TIMEFRAMES.has(timeframe), `Unsupported TradingView timeframe "${timeframe}".`);
  });

  const slotTimeUtc = new Date(frontmatter.slotTimeUtc);
  const captureTimeUtc = new Date(frontmatter.captureTimeUtc);
  const dateUtc = new Date(frontmatter.date);
  assert(!Number.isNaN(slotTimeUtc.getTime()), `"slotTimeUtc" must be a valid UTC timestamp.`);
  assert(!Number.isNaN(captureTimeUtc.getTime()), `"captureTimeUtc" must be a valid UTC timestamp.`);
  assert(!Number.isNaN(dateUtc.getTime()), `"date" must be a valid date.`);
  assert(dateYmdUtc(slotTimeUtc) === dateYmdUtc(dateUtc), `"date" must match the UTC day of slotTimeUtc.`);

  assert(hasHeading(body, "Preview"), `Body is missing "## Preview".`);
  assert(hasHeading(body, "Bias"), `Body is missing "## Bias".`);
  assert(hasHeading(body, "Analysis"), `Body is missing "## Analysis".`);

  const bodyBias = extractBiasFromBody(body).toUpperCase();
  assert(bodyBias === bias, `"## Bias" body value must match frontmatter bias.`);

  frontmatter.slideImages.forEach((relativePath) => {
    assert(relativePath.startsWith("./captures/"), `slideImages path must stay under ./captures/: ${relativePath}`);
    const capturePath = resolve(dossierRoot, relativePath.replace(/^\.\//, ""));
    assert(existsSync(capturePath), `Referenced capture file is missing: ${relativePath}`);
  });

  if (type === "instant") {
    assert(frontmatter.slideImages.length === 1, `Instant dossier must reference exactly one capture.`);
    assert(frontmatter.tradingviewTimeframes.length === 1, `Instant dossier must declare exactly one timeframe.`);
  } else {
    assert(frontmatter.slideImages.length >= 2, `Continuous dossier must reference multiple captures.`);
    assert(frontmatter.tradingviewTimeframes.length >= 2, `Continuous dossier must declare multiple timeframes.`);
  }

  return frontmatter;
}

async function readDossier(dossierRoot) {
  const indexPath = resolve(dossierRoot, "index.md");
  const raw = await readFile(indexPath, "utf8");
  const parsed = matter(raw);
  const frontmatter = validateFrontmatter(parsed.data, parsed.content, dossierRoot);
  return {
    dossierRoot,
    indexPath,
    raw,
    frontmatter
  };
}

async function replaceDirectory(targetDir, sourceDir) {
  const tempDir = resolve(dirname(targetDir), `.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(dirname(targetDir), { recursive: true });
  await cp(sourceDir, tempDir, { recursive: true, force: true });
  await rm(targetDir, { recursive: true, force: true });

  let lastError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rename(tempDir, targetDir);
      return;
    } catch (error) {
      lastError = error;
      if (!WINDOWS_RETRYABLE_CODES.has(error?.code)) {
        throw error;
      }
      await sleep(250);
      await rm(targetDir, { recursive: true, force: true });
    }
  }

  try {
    await cp(tempDir, targetDir, { recursive: true, force: true });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  if (lastError) {
    return;
  }
}

export async function runPromote({
  configPath,
  folders = [],
  dryRun = false,
  cleanupStaging = false
} = {}) {
  const config = loadConfig(configPath);
  const incomingRoot = config.paths.incomingRoot;
  const repoRoot = config.paths.repoRoot;

  const folderNames = folders.length > 0
    ? folders
    : (await readdir(incomingRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

  const selectedFolderNames = Array.isArray(folderNames) ? folderNames : [];
  assert(selectedFolderNames.length > 0, "No dossier folders were selected from matrix-incoming.");

  const results = [];

  for (const folderName of selectedFolderNames) {
    const dossierRoot = resolve(incomingRoot, folderName);
    const dossier = await readDossier(dossierRoot);
    const slug = slugForFrontmatter(dossier.frontmatter);
    const targetDir = resolve(repoRoot, "src", "content", "archives", dossier.frontmatter.type, slug);

    let status = "created";
    if (existsSync(targetDir)) {
      status = "updated";
    }

    if (!dryRun) {
      await replaceDirectory(targetDir, dossierRoot);
      const captureDir = resolve(targetDir, "captures");
      await stat(resolve(targetDir, "index.md"));
      await stat(captureDir);
    }

    results.push({
      sourceFolderName: folderName,
      sourceFolderPath: dossierRoot,
      targetDir,
      repoRelativeTarget: `src/content/archives/${dossier.frontmatter.type}/${slug}`,
      slug,
      type: dossier.frontmatter.type,
      asset: dossier.frontmatter.asset,
      tradingviewTimeframes: dossier.frontmatter.tradingviewTimeframes,
      status
    });
  }

  const cleanup = (!dryRun && cleanupStaging)
    ? await runCleanup({
        configPath,
        folders: selectedFolderNames,
        dryRun: false,
        includeFailed: false
      })
    : {
        skipped: true,
        reason: dryRun ? "dry-run" : "cleanup-disabled"
      };

  return {
    success: true,
    dryRun,
    cleanupStaging,
    incomingRoot,
    repoRoot,
    promotedCount: results.length,
    results,
    cleanup
  };
}
