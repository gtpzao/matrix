export const MODE_TIMEFRAMES = Object.freeze({
  instant: ["15", "30", "1h", "2h"],
  continuous: ["1M", "1W", "1D", "4h"]
});

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

export function modeTimeframes(mode) {
  const timeframes = MODE_TIMEFRAMES[mode];
  if (!timeframes) {
    throw new Error(`Unsupported mode "${mode}".`);
  }
  return timeframes;
}

export function timeframeResolution(timeframe) {
  const resolution = TIMEFRAME_TO_RESOLUTION[timeframe];
  if (!resolution) {
    throw new Error(`Unsupported timeframe "${timeframe}".`);
  }
  return resolution;
}

export function normalizeTimeframeForFolder(timeframe) {
  return timeframe.toLowerCase();
}

export function folderNameForCapture({ asset, mode, timeframe = null }) {
  const base = `${asset.toLowerCase()}-${mode}`;
  if (mode === "instant") {
    if (!timeframe) {
      throw new Error("Instant dossiers require a timeframe-specific folder.");
    }
    return `${base}-${normalizeTimeframeForFolder(timeframe)}`;
  }
  return base;
}

export function formatUtcDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function formatUtcHm(date) {
  return [
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0")
  ].join("-");
}

export function canonicalCaptureFileName({ mode, asset, captureTimeUtc, timeframe }) {
  return `${mode}_${asset.toLowerCase()}_${formatUtcDate(captureTimeUtc)}_${formatUtcHm(captureTimeUtc)}_${timeframe}.png`;
}

export function sameUtcMinute(left, right) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate() &&
    left.getUTCHours() === right.getUTCHours() &&
    left.getUTCMinutes() === right.getUTCMinutes()
  );
}
