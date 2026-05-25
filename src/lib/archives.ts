import type { CollectionEntry } from "astro:content";

//[Centraliza tipos derivados da colecao Astro para evitar duplicacao nas paginas.]
export type ArchiveEntry = CollectionEntry<"archives">;
export type ArchiveBias = ArchiveEntry["data"]["bias"];

//[Normaliza resolucoes TradingView para labels humanos exibidos no console e pagina.]
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

//[Resolve arquivos de captura empacotados pelo Vite sem depender de paths publicos manuais.]
const archiveCaptureUrls = import.meta.glob(
  "../content/archives/**/captures/*.{png,jpg,jpeg,webp,avif,svg}",
  {
    eager: true,
    import: "default",
    query: "?url"
  }
) as Record<string, string>;

//[Define formato enriquecido usado pelas paginas depois de resolver datas, slug e preview.]
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

//[Ordena tipos principais antes de tipos futuros, mantendo fallback alfabetico previsivel.]
const typePriority = ["continuous", "parallax-relative", "instant"];
const assetPriority = ["BTCUSD", "ETHUSD"];
const timeframePriority = ["1h", "2h", "4h", "1D", "1W", "1M"];
const markdownSectionPattern = (heading: string) =>
  new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`, "im");

//[Escapa headings dinamicos para construir regex segura contra caracteres especiais.]
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

//[Extrai diretorio do dossier para montar chave relativa usada pelo glob de capturas.]
function archiveDirectory(entry: ArchiveEntry): string {
  return entry.id.replace(/\/index\.(md|mdx)$/i, "");
}

//[Calcula slug publico tanto para index.md em pasta quanto para arquivo markdown direto.]
export function archiveSlug(entry: ArchiveEntry): string {
  const parts = entry.id.split("/");
  const last = parts.at(-1) ?? "";
  if (last === "index.md" || last === "index.mdx") {
    return parts.at(-2) ?? entry.slug;
  }

  return last.replace(/\.(md|mdx)$/i, "");
}

//[Normaliza tipo vindo do frontmatter antes de montar filtros, rotas e URLs.]
export function archiveType(entry: ArchiveEntry): string {
  return entry.data.type.trim().toLowerCase();
}

//[Formata data em portugues usando UTC para evitar drift entre maquinas locais.]
export function formatArchiveDate(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  }).format(value);
}

//[Formata timestamp de arquivo em UTC explicito para leitura operacional no console.]
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

//[Transforma tipo normalizado em label curta usada na interface visual.]
export function typeLabel(type: string): string {
  if (type === "parallax-relative") {
    return "PARALLAX";
  }

  return type.toUpperCase();
}

//[Monta URL canonical da pagina completa a partir de tipo normalizado e slug.]
export function archiveUrl(entry: ArchiveEntry): string {
  return `/archives/${archiveType(entry)}/${archiveSlug(entry)}`;
}

//[Ordena dossiers por slot, captura e titulo para feed recente deterministico.]
export function sortArchives(entries: ArchiveEntry[]): ArchiveEntry[] {
  return [...entries].sort((left, right) => {
    const slotDiff =
      new Date(right.data.slotTimeUtc).getTime() -
      new Date(left.data.slotTimeUtc).getTime();
    if (slotDiff !== 0) {
      return slotDiff;
    }

    const assetDiff = compareAssets(left.data.asset, right.data.asset);
    if (assetDiff !== 0) {
      return assetDiff;
    }

    const timeframeDiff = compareArchiveTimeframes(left, right);
    if (timeframeDiff !== 0) {
      return timeframeDiff;
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

//[Ordena dossiers instant do menor timeframe para o maior sem afetar continuous.]
function compareArchiveTimeframes(left: ArchiveEntry, right: ArchiveEntry): number {
  if (archiveType(left) !== "instant" || archiveType(right) !== "instant") {
    return 0;
  }

  const leftTimeframe = displayTradingviewTimeframe(left.data.tradingviewTimeframes[0] ?? "");
  const rightTimeframe = displayTradingviewTimeframe(right.data.tradingviewTimeframes[0] ?? "");
  const leftRank = timeframePriority.indexOf(leftTimeframe);
  const rightRank = timeframePriority.indexOf(rightTimeframe);

  if (leftRank !== -1 || rightRank !== -1) {
    return (leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank) -
      (rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank);
  }

  return leftTimeframe.localeCompare(rightTimeframe);
}

//[Ordena ativos de exibicao mantendo BTC antes de ETH e fallback alfabetico.]
export function compareAssets(left: string, right: string): number {
  const leftAsset = left.trim().toUpperCase();
  const rightAsset = right.trim().toUpperCase();
  const leftRank = assetPriority.indexOf(leftAsset);
  const rightRank = assetPriority.indexOf(rightAsset);

  if (leftRank !== -1 || rightRank !== -1) {
    return (leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank) -
      (rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank);
  }

  return leftAsset.localeCompare(rightAsset);
}

//[Ordena filtros de tipo com prioridade manual para fluxos principais do produto.]
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

//[Extrai uma secao markdown por heading, permitindo preview derivado do corpo publicado.]
export function archiveSection(entry: ArchiveEntry, heading: string): string {
  return entry.body.match(markdownSectionPattern(heading))?.[1]?.trim() ?? "";
}

//[Remove marcadores markdown comuns para gerar texto curto usado em metadata e cards.]
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

//[Retorna preview escrito no dossier ou cai para titulo quando secao falta.]
export function archivePreview(entry: ArchiveEntry): string {
  const previewSection = archiveSection(entry, "Preview");
  return stripMarkdown(previewSection) || entry.data.title;
}

//[Converte timeframe individual para label exibivel, preservando valor desconhecido como fallback.]
export function displayTradingviewTimeframe(value: string): string {
  const trimmed = value.trim();
  return timeframeDisplayMap[trimmed] ?? trimmed;
}

//[Normaliza lista de timeframes mantendo mesma ordem declarada no frontmatter.]
export function displayTradingviewTimeframes(values: string[]): string[] {
  return values.map(displayTradingviewTimeframe);
}

//[Transforma paths relativos de capturas em URLs processadas pelo build Astro.]
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

//[Agrega campos resolvidos mais usados por paginas e componentes de arquivo.]
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
