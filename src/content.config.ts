import { defineCollection, z } from "astro:content";

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
    slideImages: z.array(z.string()).min(1)
  })
});

export const collections = { archives };
