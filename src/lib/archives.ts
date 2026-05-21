import type { CollectionEntry } from "astro:content";

export type ArchiveEntry = CollectionEntry<"archives">;
export type ArchiveBias = ArchiveEntry["data"]["bias"];

const timeframeDisplayMap: Record<string, string> = {
  M: "1M",
  "1M": "1M",
  W: "1W",
  "1W": "1W",
  D: "1D",
  "1D": "1D",
  "240": "4h",
  "4H": "4h",
  "4h": "4h",
  "120": "2h",
  "2H": "2h",
  "2h": "2h",
  "60": "1h",
  "1H": "1h",
  "1h": "1h",
  "30": "30",
  "15": "15"
};

const archiveCaptureUrls = import.meta.glob(
  "../content/archives/**/captures/*.{png,jpg,jpeg,webp,avif,svg}",
  {
    eager: true,
    import: "default",
    query: "?url"
  }
) as Record<string, string>;

export type ResolvedArchive = {
  entry: ArchiveEntry;
  slug: string;
  type: string;
  typeLabel: string;
  url: string;
  dateDisplay: string;
  slotDisplay: string;
  captureDisplay: string;
  fileId: string;
  preview: string;
};

const typePriority = ["continuous", "instant"];
const markdownSectionPattern = (heading: string) =>
  new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`, "im");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function archiveDirectory(entry: ArchiveEntry): string {
  return entry.id.replace(/\/index\.(md|mdx)$/i, "");
}

export function archiveSlug(entry: ArchiveEntry): string {
  const parts = entry.id.split("/");
  const last = parts.at(-1) ?? "";
  if (last === "index.md" || last === "index.mdx") {
    return parts.at(-2) ?? entry.slug;
  }

  return last.replace(/\.(md|mdx)$/i, "");
}

export function archiveType(entry: ArchiveEntry): string {
  return entry.data.type.trim().toLowerCase();
}

export function formatArchiveDate(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  }).format(value);
}

export function formatArchiveTimestamp(value: Date): string {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(value);

  return `${formatted.replace(",", "")} UTC`;
}

export function typeLabel(type: string): string {
  return type.toUpperCase();
}

export function archiveUrl(entry: ArchiveEntry): string {
  return `/archives/${archiveType(entry)}/${archiveSlug(entry)}`;
}

export function sortArchives(entries: ArchiveEntry[]): ArchiveEntry[] {
  return [...entries].sort((left, right) => {
    const slotDiff =
      new Date(right.data.slotTimeUtc).getTime() -
      new Date(left.data.slotTimeUtc).getTime();
    if (slotDiff !== 0) {
      return slotDiff;
    }

    const captureDiff =
      new Date(right.data.captureTimeUtc).getTime() -
      new Date(left.data.captureTimeUtc).getTime();
    if (captureDiff !== 0) {
      return captureDiff;
    }

    return right.data.title.localeCompare(left.data.title);
  });
}

export function sortTypes(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => {
    const leftRank = typePriority.indexOf(left);
    const rightRank = typePriority.indexOf(right);

    if (leftRank !== -1 || rightRank !== -1) {
      return (leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank) -
        (rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank);
    }

    return left.localeCompare(right);
  });
}

export function archiveSection(entry: ArchiveEntry, heading: string): string {
  return entry.body.match(markdownSectionPattern(heading))?.[1]?.trim() ?? "";
}

export function stripMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[`*_>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function archivePreview(entry: ArchiveEntry): string {
  const previewSection = archiveSection(entry, "Preview");
  return stripMarkdown(previewSection) || entry.data.title;
}

export function displayTradingviewTimeframe(value: string): string {
  const trimmed = value.trim();
  return timeframeDisplayMap[trimmed] ?? trimmed;
}

export function displayTradingviewTimeframes(values: string[]): string[] {
  return values.map(displayTradingviewTimeframe);
}

export function resolveArchiveMedia(entry: ArchiveEntry): string[] {
  return entry.data.slideImages.map((imagePath) => {
    if (imagePath.startsWith("/") || /^https?:\/\//.test(imagePath)) {
      return imagePath;
    }

    const normalizedPath = imagePath.replace(/^\.\//, "");
    const captureKey = `../content/archives/${archiveDirectory(entry)}/${normalizedPath}`;
    return archiveCaptureUrls[captureKey] ?? imagePath;
  });
}

export function resolveArchive(entry: ArchiveEntry): ResolvedArchive {
  const slug = archiveSlug(entry);
  const type = archiveType(entry);

  return {
    entry,
    slug,
    type,
    typeLabel: typeLabel(type),
    url: archiveUrl(entry),
    dateDisplay: formatArchiveDate(new Date(entry.data.date)),
    slotDisplay: formatArchiveTimestamp(new Date(entry.data.slotTimeUtc)),
    captureDisplay: formatArchiveTimestamp(new Date(entry.data.captureTimeUtc)),
    fileId: slug.toUpperCase(),
    preview: archivePreview(entry)
  };
}
