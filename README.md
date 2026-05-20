# Matrix Archive

Astro app for `Matrix Archive`, with:

- landing page at `/`
- archive console at `/archive`
- archive file pages at `/archives/<type>/<slug>/`

## Content structure

```text
src/content/archives/
  continuous/
    <slug>/
      index.md
  instant/
    <slug>/
      index.md
```

Frontmatter shape:

```md
---
title: "BTCUSD // CONTINUOUS"
type: "continuous"
asset: "BTCUSD"
date: 2026-05-20
excerpt: "Short console summary."
thesis: "Optional thesis."
cover: "/images/archives/btcusd-continuous-cover.svg"
pptx: "/files/btcusd-continuous-2026-05-20.pptx"
markdownDownload: "/files/btcusd-continuous-2026-05-20.md"
tradingviewSymbol: "CRYPTO:BTCUSD"
tradingviewTimeframes:
  - "M"
  - "W"
  - "D"
slideImages:
  - "/images/archives/btcusd-continuous-slide-01.svg"
featured: true
status: "active"
---
```

## Archive console behavior

- `continuous` uses `M / W / D`
- `instant` uses `240 / 120 / 60`
- center list supports one expanded archive at a time
- `OPEN ARCHIVE` goes to full archive page

## Dev

- `npm run dev`
- `npm run build`
- `npm run check`
