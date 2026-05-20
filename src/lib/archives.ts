import type { CollectionEntry } from "astro:content";

export type ArchiveEntry = CollectionEntry<"archives">;

export type ResolvedArchive = {
  entry: ArchiveEntry;
  slug: string;
  type: string;
  typeLabel: string;
  url: string;
  dateDisplay: string;
  fileId: string;
};

const typePriority = ["continuous", "instant"];

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

export function typeLabel(type: string): string {
  return type.toUpperCase();
}

export function archiveUrl(entry: ArchiveEntry): string {
  return `/archives/${archiveType(entry)}/${archiveSlug(entry)}`;
}

export function sortArchives(entries: ArchiveEntry[]): ArchiveEntry[] {
  return [...entries].sort((left, right) => {
    const dateDiff =
      new Date(right.data.date).getTime() - new Date(left.data.date).getTime();
    if (dateDiff !== 0) {
      return dateDiff;
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
    fileId: `${entry.data.asset}-${slug}`.toUpperCase()
  };
}
