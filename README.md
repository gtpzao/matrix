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
date: 2026-05-21
slotTimeUtc: "2026-05-21T08:00:00Z"
captureTimeUtc: "2026-05-21T08:57:34Z"
bias: "BUY"
tradingviewSymbol: "CRYPTO:BTCUSD"
tradingviewTimeframes:
  - "1W"
  - "1D"
  - "4h"
slideImages:
  - "./captures/continuous_btcusd_2026-05-21_08-57_1W.png"
---
```

## Archive console behavior

- `continuous` dossiers typically use `1W / 1D / 4h`
- `instant` dossiers are one timeframe each, currently `1h / 2h`
- center list supports one expanded archive at a time
- `OPEN ARCHIVE` goes to full archive page

## Dev

- `npm run dev`
- `npm run build`
- `npm run check`
- `npm run matrix:doctor`
- `npm run matrix:capture:instant`
- `npm run matrix:capture:continuous`
- `npm run matrix:dossier -- instant --folder btcusd-instant-1h,ethusd-instant-2h`
- `npm run matrix:dossier -- continuous --folder btcusd-continuous`
- `npm run matrix:promote -- --folder btcusd-instant-1h,ethusd-instant-2h,btcusd-continuous`
- `npm run matrix:pipeline:instant`
- `npm run matrix:pipeline:continuous`
- `npm run matrix:cleanup`

## Matrix capture workflow

- `capture` writes raw TradingView PNGs plus `capture_manifest.json` into `matrix-inboxtv`
- `dossier` converts canonical capture folders from `matrix-inboxtv` into `index.md + captures/*` folders in `matrix-incoming`
- `promote` validates staged dossiers from `matrix-incoming` and copies them into `src/content/archives`
- `pipeline` runs `capture -> dossier -> promote` for one mode in a single command
- `cleanup` clears staged dossier folders from `matrix-inboxtv` and `matrix-incoming`; by default it keeps `_failed`

Current dossier generation rules:

- `preview` is AI-generated from the capture set and capped at `15` words
- `bias` is AI-generated and can only be `BUY` or `SELL` for new dossiers
- each `## Analysis` paragraph is AI-generated and capped at `30` words
- local generation uses the Codex CLI authenticated with your ChatGPT account
- default launcher is `npx -y @openai/codex`; override with `MATRIX_DOSSIER_CODEX_BIN` if needed
- optional model override: `MATRIX_DOSSIER_CODEX_MODEL`

Expected operational cadence:

- every `1h`: run `npm run matrix:pipeline:instant`
- every `4h`: run `npm run matrix:pipeline:continuous`

With the current timeframe map, one `instant` run generates `2` dossiers per enabled asset (`1h`, `2h`), and one `continuous` run generates `1` dossier per enabled asset with `1W`, `1D`, `4h`.

Recommended cleanup policy:

- do not auto-clean staging on every `promote` by default
- use `--cleanup-staging` when the current run is already validated and you want a fire-and-forget flow
- keep `_failed` unless you explicitly call `cleanup --include-failed`

Current `dossier` automation uses chart-aware AI during the dossier step through the Codex CLI. It keeps the capture and promote flow unchanged, but now derives `Preview`, `Bias`, and `Analysis` from the PNGs. Legacy promoted dossiers may still contain `NEUTRAL` until they are regenerated or backfilled.
