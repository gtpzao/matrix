import { normalizeTimeframeForFolder } from "./timeframes.mjs";

//[Declara enums aceitos pelo contrato publicado e pela validacao de promote.]
export const VALID_BIAS = new Set(["BUY", "SELL", "NEUTRAL"]);
export const VALID_TYPE = new Set(["instant", "continuous"]);
export const VALID_TIMEFRAMES = new Set(["1M", "1W", "1D", "4h", "2h", "1h", "30", "15"]);

//[Falha com mensagem direta quando uma regra de contrato nao e satisfeita.]
export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

//[Serializa data UTC em formato YYYY-MM-DD usado no frontmatter dos dossiers.]
export function dateYmdUtc(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

//[Serializa hora UTC compacta para compor slugs deterministicas de arquivos.]
export function hhmmUtc(date) {
  return `${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

//[Arredonda captura para slot operacional conforme granularidade do tipo de dossier.]
export function floorSlotTimeUtc(captureTimeUtc, mode) {
  const minutes = mode === "continuous" ? 240 : 60;
  const slotMs = minutes * 60 * 1000;
  return new Date(Math.floor(captureTimeUtc.getTime() / slotMs) * slotMs);
}

//[Valida timeframe instant e converte para forma segura em nome de slug.]
export function normalizeInstantTimeframe(timeframe) {
  const trimmed = String(timeframe).trim();
  assert(VALID_TIMEFRAMES.has(trimmed), `Unsupported TradingView timeframe "${trimmed}".`);
  return normalizeTimeframeForFolder(trimmed);
}

//[Deriva slug publica exclusivamente do frontmatter validado, evitando divergencia manual.]
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
