import { normalizeTimeframeForFolder } from "./timeframes.mjs";

export const VALID_BIAS = new Set(["BUY", "SELL", "NEUTRAL"]);
export const VALID_TYPE = new Set(["instant", "continuous"]);
export const VALID_TIMEFRAMES = new Set(["1M", "1W", "1D", "4h", "2h", "1h", "30", "15"]);

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function dateYmdUtc(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function hhmmUtc(date) {
  return `${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function floorSlotTimeUtc(captureTimeUtc, mode) {
  const minutes = mode === "continuous" ? 240 : 15;
  const slotMs = minutes * 60 * 1000;
  return new Date(Math.floor(captureTimeUtc.getTime() / slotMs) * slotMs);
}

export function normalizeInstantTimeframe(timeframe) {
  const trimmed = String(timeframe).trim();
  assert(VALID_TIMEFRAMES.has(trimmed), `Unsupported TradingView timeframe "${trimmed}".`);
  return normalizeTimeframeForFolder(trimmed);
}

export function slugForFrontmatter(frontmatter) {
  const slotTimeUtc = new Date(frontmatter.slotTimeUtc);
  const assetLower = String(frontmatter.asset).trim().toLowerCase();
  const type = String(frontmatter.type).trim().toLowerCase();
  const datePart = dateYmdUtc(slotTimeUtc);
  const timePart = hhmmUtc(slotTimeUtc);

  if (type === "instant") {
    const timeframe = normalizeInstantTimeframe(frontmatter.tradingviewTimeframes[0]);
    return `${type}-${assetLower}-${timeframe}-${datePart}-${timePart}`;
  }

  return `${type}-${assetLower}-${datePart}-${timePart}`;
}
