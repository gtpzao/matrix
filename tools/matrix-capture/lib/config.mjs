import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

//[Calcula paths principais a partir da localizacao da ferramenta dentro do repo.]
const libDir = dirname(fileURLToPath(import.meta.url));
export const toolRoot = resolve(libDir, "..");
export const repoRoot = resolve(toolRoot, "../..");
export const projectRoot = resolve(repoRoot, "..");
export const defaultConfigPath = resolve(toolRoot, "config", "assets.json");

//[Normaliza entrada de ativo e valida flags exigidas para ambos modos.]
function normalizeAssetEntry(entry, index) {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Asset entry #${index + 1} must be an object.`);
  }

  const asset = String(entry.asset || "").trim().toUpperCase();
  const tradingviewSymbol = String(entry.tradingviewSymbol || "").trim();
  if (!asset) {
    throw new Error(`Asset entry #${index + 1} is missing "asset".`);
  }
  if (!tradingviewSymbol) {
    throw new Error(`Asset "${asset}" is missing "tradingviewSymbol".`);
  }
  if (typeof entry.instant !== "boolean" || typeof entry.continuous !== "boolean") {
    throw new Error(`Asset "${asset}" must declare boolean "instant" and "continuous" flags.`);
  }

  return {
    asset,
    tradingviewSymbol,
    instant: entry.instant,
    continuous: entry.continuous
  };
}

//[Carrega assets.json, aplica defaults e devolve paths operacionais absolutos.]
export function loadConfig(configPath = defaultConfigPath) {
  if (!existsSync(configPath)) {
    throw new Error(`Capture config not found at ${configPath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse ${configPath}: ${error.message}`);
  }

  const assets = Array.isArray(parsed.assets)
    ? parsed.assets.map(normalizeAssetEntry)
    : [];

  if (assets.length === 0) {
    throw new Error(`Capture config at ${configPath} must include at least one asset.`);
  }

  return {
    configPath,
    cdpPort: Number.isInteger(parsed.cdpPort) ? parsed.cdpPort : 9222,
    layoutName: typeof parsed.layoutName === "string" && parsed.layoutName.trim()
      ? parsed.layoutName.trim()
      : null,
    assets,
    paths: {
      repoRoot,
      projectRoot,
      inboxTvRoot: resolve(projectRoot, "matrix-inboxtv"),
      incomingRoot: resolve(projectRoot, "matrix-incoming")
    }
  };
}

//[Deriva matriz ordenada completa de pares relativos a partir dos ativos habilitados nos dois modos base.]
export function deriveParallaxRelativePairs(assets) {
  const eligible = assets.filter((entry) => entry.instant && entry.continuous);

  return eligible.flatMap((base) =>
    eligible
      .filter((quote) => quote.asset !== base.asset)
      .map((quote) => ({
        asset: `${base.asset}/${quote.asset}`,
        tradingviewSymbol: `${base.tradingviewSymbol}/${quote.tradingviewSymbol}`,
        instant: false,
        continuous: false,
        parallaxRelative: true,
        relativeBaseAsset: base.asset,
        relativeQuoteAsset: quote.asset
      }))
  );
}
