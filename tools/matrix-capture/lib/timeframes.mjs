//[Define timeframes capturados por modo, preservando ordem usada em manifests e dossiers.]
export const PARALLAX_RELATIVE_MODE = "parallax-relative";

export const MODE_TIMEFRAMES = Object.freeze({
  instant: ["1h", "2h"],
  continuous: ["1W", "1D", "4h"],
  [PARALLAX_RELATIVE_MODE]: ["1D"]
});

//[Mapeia labels internos para resolucoes aceitas pela API do TradingView.]
export const TIMEFRAME_TO_RESOLUTION = Object.freeze({
  "15": "15",
  "30": "30",
  "1h": "60",
  "2h": "120",
  "4h": "240",
  "1D": "D",
  "1W": "W",
  "1M": "M"
});

//[Converte resolucoes retornadas pelo TradingView para labels usados pelo projeto.]
export const RESOLUTION_TO_TIMEFRAME = Object.freeze({
  "15": "15",
  "30": "30",
  "60": "1h",
  "120": "2h",
  "240": "4h",
  D: "1D",
  W: "1W",
  M: "1M"
});

//[Retorna lista de timeframes do modo ou falha para modo desconhecido.]
export function modeTimeframes(mode) {
  const timeframes = MODE_TIMEFRAMES[mode];
  if (!timeframes) {
    throw new Error(`Unsupported mode "${mode}".`);
  }
  return timeframes;
}

//[Centraliza validacao dos modos operacionais aceitos pela ferramenta.]
export function isSupportedMode(mode) {
  return Boolean(MODE_TIMEFRAMES[mode]);
}

//[Identifica o modo relativo que usa pares A/B e timeframe diario unico.]
export function isParallaxRelativeMode(mode) {
  return mode === PARALLAX_RELATIVE_MODE;
}

//[Resolve timeframe individual para resolucao TradingView usada ao trocar grafico.]
export function timeframeResolution(timeframe) {
  const resolution = TIMEFRAME_TO_RESOLUTION[timeframe];
  if (!resolution) {
    throw new Error(`Unsupported timeframe "${timeframe}".`);
  }
  return resolution;
}

//[Normaliza timeframe para trecho de folder, mantendo formato minusculo quando necessario.]
export function normalizeTimeframeForFolder(timeframe) {
  return timeframe.toLowerCase();
}

//[Converte ativo ou par relativo em trecho seguro para pasta, slug e nome de PNG.]
export function assetKeyForFile(asset) {
  return String(asset)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

//[Monta folder de captura, exigindo timeframe especifico para dossiers instant.]
export function folderNameForCapture({ asset, mode, timeframe = null }) {
  const base = `${assetKeyForFile(asset)}-${mode}`;
  if (mode === "instant") {
    if (!timeframe) {
      throw new Error("Instant dossiers require a timeframe-specific folder.");
    }
    return `${base}-${normalizeTimeframeForFolder(timeframe)}`;
  }
  return base;
}

//[Formata data UTC sem depender de locale ou timezone da maquina.]
export function formatUtcDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

//[Formata hora e minuto UTC usados em nomes canonical de capturas.]
export function formatUtcHm(date) {
  return [
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0")
  ].join("-");
}

//[Gera nome canonical de PNG combinando modo, ativo, minuto UTC e timeframe.]
export function canonicalCaptureFileName({ mode, asset, captureTimeUtc, timeframe }) {
  return `${mode}_${assetKeyForFile(asset)}_${formatUtcDate(captureTimeUtc)}_${formatUtcHm(captureTimeUtc)}_${timeframe}.png`;
}

//[Compara datas no nivel de minuto UTC para proteger capturas continuous.]
export function sameUtcMinute(left, right) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate() &&
    left.getUTCHours() === right.getUTCHours() &&
    left.getUTCMinutes() === right.getUTCMinutes()
  );
}
