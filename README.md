# Matrix Dossier

Astro + TypeScript static site for a Matrix-styled market analysis archive, ready for Netlify.

## Stack

- Astro
- TypeScript
- Astro Content Collections
- Static deploy on Netlify
- Vanilla client script for archive filtering + TradingView widgets

## Local run

Use `npm.cmd` on Windows PowerShell.

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:4321`.

Build production output:

```powershell
npm.cmd run build
```

## Content model

Current collection lives in:

```txt
src/content/dossiers/
```

Hybrid structure supported by the collection glob. Current implementation uses one folder per dossier:

```txt
src/content/dossiers/
  topdown/
    btcusd-2026-05-20/
      index.md
  instant/
    ethusd-2026-05-22/
      index.md
```

Downloads live in:

```txt
public/files/
```

Visual slide exports or covers live in:

```txt
public/images/dossiers/
```

## Add a new dossier

1. Create a new folder in `src/content/dossiers/<type>/<slug>/`.
2. Add `index.md` with frontmatter.
3. If you have a PPTX, copy it to `public/files/`.
4. If you have slide exports or a cover, copy them to `public/images/dossiers/`.
5. Push to GitHub. Netlify rebuilds on deploy.

Example frontmatter:

```yaml
---
title: "BTCUSD // TOPDOWN"
slug: "btcusd-2026-05-20"
type: "topdown"
asset: "BTCUSD"
date: 2026-05-20
excerpt: "Do mensal ao 30 minutos: o preco entrega o mapa inteiro."
thesis: "Estrutura macro construtiva, curto prazo corretivo."
cover: "/images/dossiers/btcusd-topdown-cover.svg"
pptx: "/files/btcusd-topdown-2026-05-20.pptx"
markdownDownload: "/files/btcusd-topdown-2026-05-20.md"
tradingviewSymbol: "BINANCE:BTCUSDT"
tradingviewTimeframes:
  - "D"
  - "240"
slideImages:
  - "/images/dossiers/btcusd-topdown-slide-01.svg"
  - "/images/dossiers/btcusd-topdown-slide-02.svg"
featured: true
status: "active"
---
```

## Type system

Types are automatic. No central config file.

- `type` in frontmatter defines the dossier branch.
- Archive navigation is built from the existing content.
- New types like `macro`, `liquidity`, `event` appear automatically once content exists.

## TradingView

Archive console always renders two live widgets for the selected dossier.

- Set the TradingView symbol in `tradingviewSymbol`
- Set the two intervals in `tradingviewTimeframes`

Examples:

- `BINANCE:BTCUSDT`
- `BINANCE:ETHUSDT`
- `TVC:DXY`
- `TVC:US10Y`

Common interval values:

- `D`
- `W`
- `240`
- `60`
- `30`
- `15`
- `5`

## Visual exports

V1 expects manual slide exports.

- If `slideImages` exists, the dossier page renders them first.
- If no slide exports exist yet, the page still works with cover, markdown, and download links.

## Netlify deploy

This repo already includes `netlify.toml`.

Netlify settings:

- Build command: `npm run build`
- Publish directory: `dist`

Recommended flow:

1. Push this project to GitHub
2. Import the GitHub repo in Netlify
3. Keep build command and publish directory from `netlify.toml`
4. Deploy

## Current sample dossiers

- Real:
  - `BTCUSD // TOPDOWN`
  - `US10Y // PANELA DE PRESSAO`
- Seed:
  - `ETHUSD // INSTANT`
  - `DXY // INSTANT`

## Notes

- Home route: `/`
- Archive route: `/archive`
- Dossier route pattern: `/dossiers/<type>/<slug>/`
- Site is static. No adapter required for this version.
