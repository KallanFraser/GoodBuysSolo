# GoodBuys

A platform for detecting corporate greenwashing by mapping ecolabels to the companies certified under them. Built as a research artifact at Santa Clara University's Sustainability Research Lab — a centralised global registry users, researchers, and journalists can query to verify sustainability claims against real third-party certifications.

## Prerequisites

- **Node.js 20.6+** (Next.js 16 requirement; no `.nvmrc` committed)
- **npm** (bundled with Node)
- Write access to the project root (the crawler creates `goodbuys.db` in place)

## Install

```bash
npm install
```

No secrets required for local development. `.env.scraper` ships with sensible defaults in the repo.

## Running the app

### Dev server

```bash
npm run dev
```

Starts Next.js at http://localhost:3000. The frontend fetches data from `public/data/*.json` directly, so the dev server works as long as those files exist (they're committed).

### Production build

```bash
npm run build
npm start
```

## Data pipelines

### Company–label crawler

Walks certification body websites and builds the company registry in `public/data/company-labels.json`.

```bash
npm run scrape:companies          # full run (~30 min with default config)
npm run scrape:companies:dry      # runs the full crawl but skips all writes
```

Outputs (all in `public/data/`):
- `company-labels.json` — the registry (company → labels with evidence)
- `company-labels.audit.json` — per-label diff from the previous run
- `company-labels.host-stats.json` — per-host fetch success/error counts
- `goodbuys.db` — SQLite mirror (gitignored, currently write-only)

Config: `.env.scraper` (tunables like `MAX_PAGES`, `CONCURRENCY`, `SCORE_THRESHOLD`). The brand dictionary lives in `scripts/scrape-company-labels/rules/manual-known-companies.js`.

### News fetcher

Pulls sustainability RSS feeds and matches articles against the label registry.

```bash
npm run fetch:news        # full run (~15 s)
npm run fetch:news:dry    # skip writes
```

Tunables (optional, shell env only — no dotenv file): `NEWS_CONCURRENCY`, `NEWS_REQUEST_TIMEOUT`, `NEWS_MAX_ITEMS_PER_FEED`, `NEWS_BASE_DELAY_MS`, `NEWS_JITTER_MS`. Defaults in `scripts/fetch-news/config.js` are sensible for most runs.

Outputs (all in `public/data/`):
- `news-preview.json` — every fetched article with its matched labels (gitignored)
- `news-preview.host-stats.json` — per-host fetch stats (gitignored)

Config: `scripts/fetch-news/rules/feeds.js` (feed list), `scripts/fetch-news/rules/label-overrides.js` (matcher classification overrides).

### Ecolabel generator

Regenerates `public/data/labels.json` from the curated seed in `scripts/scrape-eco-labels/ecolabels.js`.

```bash
npm run generate:ecolabels
```

Run this after editing the seed list.

## Key files

| File | Purpose |
|------|---------|
| `public/data/labels.json` | Ecolabel registry — input to both pipelines |
| `public/data/company-labels.json` | Crawler output |
| `public/data/news-preview.json` | News fetcher output (gitignored) |
| `scripts/scrape-company-labels/rules/manual-known-companies.js` | Human-curated brand dictionary |
| `scripts/fetch-news/rules/feeds.js` | RSS feed list |
| `scripts/fetch-news/rules/label-overrides.js` | News matcher classification overrides |
| `.env.scraper` | Crawler env tunables |

## Docs

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — system overview: crawler pipeline, recognition engine, network layer, news fetcher, data layer, audit trail
- **[CLAUDE.md](CLAUDE.md)** — project principles and working conventions
- **[KNOWN_ISSUES.md](KNOWN_ISSUES.md)** — documented bugs that affect registry data quality; read before treating the output as ground truth
