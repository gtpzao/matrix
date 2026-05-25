import { defineCollection, z } from "astro:content";

//[Define contrato minimo da colecao archives, garantindo frontmatter essencial antes do build Astro.]
const archives = defineCollection({
  schema: z.object({
    title: z.string(),
    type: z.string(),
    asset: z.string(),
    bias: z.enum(["BUY", "SELL", "NEUTRAL"]),
    date: z.coerce.date(),
    slotTimeUtc: z.coerce.date(),
    captureTimeUtc: z.coerce.date(),
    tradingviewSymbol: z.string(),
    tradingviewTimeframes: z.array(z.string()).min(1),
    slideImages: z.array(z.string()).min(1),
    relativeBaseAsset: z.string().optional(),
    relativeQuoteAsset: z.string().optional()
  })
});

//[Exporta colecoes consumidas pelas rotas Astro durante sync de conteudo e renderizacao.]
export const collections = { archives };
