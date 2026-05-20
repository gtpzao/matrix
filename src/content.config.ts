import { defineCollection, z } from "astro:content";

const dossiers = defineCollection({
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    type: z.string(),
    asset: z.string(),
    date: z.coerce.date(),
    excerpt: z.string(),
    thesis: z.string().optional(),
    cover: z.string().optional(),
    pptx: z.string().optional(),
    markdownDownload: z.string().optional(),
    tradingviewSymbol: z.string(),
    tradingviewTimeframes: z.array(z.string()).min(2),
    slideImages: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    status: z.string().default("active")
  })
});

export const collections = { dossiers };
