# ARCHITECTURE.md — GoodBuys

This document is the narrative reference for how the GoodBuys system works. It sits alongside `CLAUDE.md` (which defines working conventions) and `KNOWN_ISSUES.md` (which tracks documented-but-not-yet-fixed bugs). Read this once to understand the system end-to-end; refer back when making architectural decisions.

Focus is backend and crawler. Frontend gets a brief overview at the end.

---

## 1 — What the System Does

GoodBuys builds a centralised registry of ecolabels and the companies certified under them. The goal is to let consumers, researchers, and journalists verify whether a company's sustainability claims are backed by real third-party certification — or whether they're marketing noise.

The data pipeline produces a single artifact: a JSON file mapping each ecolabel to the companies credibly associated with that certification, along with per-entry confidence scores and audit trails pointing back to the exact source page where each company was found.

Everything in the backend exists to make that artifact trustworthy. The hardest part isn't crawling — it's deciding what counts as a real company name when the source text is ambiguous.

---

## 2 — The Core Technical Problem

The fundamental problem is **semantic ambiguity**. Certification body websites talk about companies in paragraphs of English prose. Many brand names are also common English words:

- "General" is a company (General Mills, General Electric) *and* an adjective
- "Fair" is a brand *and* an adjective that appears on every fair-trade certification page
- "Apex," "Summit," "Pioneer," "Crown," "Article," "Honest," "Champion," "Native" — all are real brands *and* common words that appear in sustainability copy, nav menus, or CMS templates

A naive string match would flood the output with false positives. The entire recognition architecture exists to handle this one problem. Every design decision — the three-tier matcher, the brand-list structure, the startup guards, the scoring weights — traces back to the question: *how do we decide whether this mention of "Fair" is the company or the word?*

This is why the system's top-line measure of quality is **precision**, not recall. A smaller, highly accurate registry is more valuable than a large, noisy one. One false positive in the top 10 entries undermines trust in the entire dataset.

---

## 3 — System Shape

The backend breaks into five concerns:

1. **Crawler pipeline** — BFS-style discovery across certification body websites, with per-host concurrency limits
2. **Recognition engine** — the matcher that turns raw DOM text into canonical company names
3. **Network layer** — adaptive HTTP fetching that handles rate limits, anti-bot measures, and site-specific quirks
4. **Data layer** — where extracted companies are persisted and how they're served to consumers
5. **Audit trail system** — the paper trail linking every registry entry back to its source

The API layer and the frontend are thin by comparison. The crawler and recognition engine are where the intellectual work lives.

---

## 4 — Crawler Pipeline

The pipeline is a per-label BFS: for each ecolabel in `labels.json`, the crawler walks outward from seed URLs, following links within the same host, extracting company candidates from each page, and stopping when it has exhausted reachable pages or hit the page cap.

### Flow

**Entry point (`run.js`):** Loads the list of ecolabels, initialises the matcher with the label names (this is the collision guard — see §5), then iterates through labels dispatching crawls via a bounded concurrency pool.

**Per-label crawl (`crawler.js`):** For each label, a BFS walks the label's seed host(s). The crawler:
- Maintains a visited set to avoid cycles
- Enforces a max-pages cap (to prevent a single label from monopolising the run)
- For each page, calls the extractor to pull company candidates
- Scores each candidate based on the DOM tag it was found in (an `<h1>` mention is worth more than a `<span>`) and applies a log-frequency boost when the same company appears across multiple pages of the same label
- Accumulates results into an in-memory registry

**Per-page extraction (`heuristics.js`):** Given a Cheerio DOM for a page, `extractCompanies` walks leaf-ish elements (the `h1`/`h2`/`li`/`td`/`th`/`p`/`a`/`span` nodes with ≤1 child) and, for each one:
- Calls the matcher on the element's text
- If the matcher returns a canonical company name, records the match along with the source tag for scoring

**Post-pass cleanup (`run.js` again):** When all labels finish, the in-memory registry is diffed against the previous run (for the audit trail — see §8), then written atomically to `public/data/company-labels.json` plus a parallel audit file.

### Tag-weighted scoring

The base score for a match depends on where in the DOM it was found. The weights are a deliberate prior about how trustworthy each position is:

- `h1`, `h2` → highest weight (headings are usually deliberate brand references)
- `li`, `th`, `td` → medium weight (list items and table cells often contain brand names but can also contain UI noise)
- Everything else (`p`, `a`, `span`) → base weight

On top of this, a log-frequency boost (`log2(1 + pagesCount)`) multiplies the total when the same company is matched on multiple pages within the same label. The idea is that a single mention on one page is noise; corroborating mentions across many pages is signal.

These weights are empirically tuned, not derived. If they need to change, the change should be justified by a visible precision improvement measured against the audit diff (see §8).

### What the crawler *doesn't* do today

The per-host rules in `rules/site-configs.js` are **unused**. The long-term precision lever is to apply per-site selectors — extract from `<main>` only, skip nav and footer regions, use certification-body-specific patterns — instead of walking every qualifying element on every page generically. This is the planned fix for Bug 2 (see §9).

---

## 5 — Recognition Engine

The recognition engine is the heart of the system. Everything it does is about deciding *when to trust a string match.*

It lives in `matcher.js` and operates on a pre-classified brand list loaded from `rules/manual-known-companies.js`. The classification happens once at startup: every brand is sorted into one of two buckets based on its risk profile.

### Two-bucket classification

**Safe brands (`SAFE_BRANDS`)** are canonical names that are *unlikely to collide with common English* — "Patagonia," "Adidas," "Ben & Jerry's." These can be matched via substring (with word-boundary padding). If the text "Patagonia asks all business leaders..." appears anywhere on a page, we count it as a Patagonia mention.

**Ambiguous brands (`AMBIGUOUS_BRANDS`)** are brands whose canonical names *are* common English words or generic UI labels — "Target," "Block," "Square," "Supreme," "Native," "Honest," "Dove." These are matched **only on exact match**: the element text must be the brand name and nothing else. A `<h1>` whose full content is "Dove" counts. A paragraph containing the sentence "dove viene coltivato il cotone" (Italian for "where cotton is grown") does not.

The classification rules are explicit:
- Anything ≤3 characters → ambiguous automatically (short strings are too dangerous to substring-match)
- Anything in `FORCE_AMBIGUOUS` → ambiguous, regardless of length
- Anything in the `BAD_WORDS` extras list (hardcoded common-word heuristics: generic nouns, bad plurals) → ambiguous
- Everything else → safe

`FORCE_AMBIGUOUS` is the primary editorial control. When a SAFE brand starts producing false positives, adding it to `FORCE_AMBIGUOUS` reclassifies it without removing it from the registry entirely.

### The three-tier match path

When `matchCompany(text)` is called on a piece of DOM text, the matcher walks three tiers:

1. **Exact match.** Lowercase the text, look it up in the canonical name map. If it hits, return the canonical name. This path fires regardless of whether the brand is safe or ambiguous.
2. **Safe substring match.** If tier 1 missed, scan for any SAFE brand whose padded lowercase form (`" patagonia "`) appears within the padded text (`" ...patagonia asks all... "`). Word-boundary padding on both sides prevents partial matches like "Pat" hitting "Patagonia."
3. **Return null.** If neither tier hit, the text has no known company reference.

Ambiguous brands *cannot* reach tier 2. They only match when they are the entire text. This is what prevents "the word 'fair' appearing in a sentence" from registering as the brand FAIR.

### The flaw in tier 1 (Bug 2)

The exact-match path has a subtle assumption baked into it: *if the text lookup succeeds, the text must be a standalone reference to the brand.* This was true when the matcher was called on paragraph-sized chunks. It is not true now that `extractCompanies` walks leaf elements — a nav menu item like `<a>Discover</a>` has element text "Discover" exactly, which exact-matches a brand even though it's really a UI link.

The consequence is that ambiguous brands with common-word names leak through tier 1 on pages where those words appear as standalone nav items, footer labels, or CMS copy. This is documented in `KNOWN_ISSUES.md` as Bug 2 and is the primary reason the current registry's top-scoring entries include Facebook, Instagram, Google, Article, and Discover — all false positives driven by social-share footers, analytics disclaimers, and nav menus.

The fix requires context-aware scoring, not another layer in the matcher. See §9.

### Startup guards

Two invariants are checked at matcher init and throw loudly if violated:

**Label collision guard.** Scans every SAFE brand whose lowercased form is a substring of any ecolabel name. If it finds any, init throws. This is what caught the FAIR bug (brand "FAIR" was a substring of the label "Fair Trade Certified," causing 560,000 false-positive score points). The guard is configured to ignore short brands (≤3 chars, already ambiguous) and only runs against label names present at startup — it's not live-updating. Any new label added between runs gets checked on the next init.

**Ambiguous docs drift guard.** The brand list has two sections: the main `MAIN_COMPANIES` array and a human-readable `AMBIGUOUS_BRAND_DOCS` section that documents which brands need special handling. The guard asserts that every entry in `AMBIGUOUS_BRAND_DOCS` is present in `FORCE_AMBIGUOUS` in `matcher.js`. If someone edits the docs section without updating `FORCE_AMBIGUOUS`, init throws. The intent is to prevent the documentation layer from drifting out of sync with the runtime classification.

Both guards are belt-and-braces. They can't catch every class of false positive — Bug 2's nav-link problem is outside their scope — but they make the most dangerous category of mistake (silently adding a new brand that collides with a common word or label name) fail immediately.

---

## 6 — Network Layer

All HTTP fetches go through `http.js`, which wraps Axios with adaptive per-host behaviour. The design assumes that certification body websites are sensitive to crawling and that the crawler should be a polite guest, not a hammer.

### Per-host penalty counter

Every host maintains a penalty score. The score:
- **Decays on success** — a clean 200 response reduces the penalty
- **Compounds on failure** — a 429, a timeout, or a 5xx increments the penalty
- **Drives the wait time between requests** — the higher the penalty, the longer the wait, with jitter applied on top to avoid synchronised request patterns

The effect is that the crawler automatically slows down on hosts that are struggling or rate-limiting, and speeds up on hosts that are responsive. No manual tuning per site required.

### Retry-After handling

When a host responds with HTTP 429 (Too Many Requests), the fetcher parses the `Retry-After` header and schedules the retry accordingly. This respects the server's stated preference instead of guessing.

### User-agent rotation

Requests rotate through a small pool of browser-style user-agents. This is not an anti-detection measure — it's a politeness measure so the crawler identifies consistently but doesn't look like an identical botnet hitting every page from the same string.

### What's missing

The retry loop currently doesn't apply exponential backoff between retries beyond what `Retry-After` tells it. If a site rate-limits repeatedly, the crawler waits for the stated Retry-After and then retries immediately. A true exponential backoff would be a useful hardening and is on the deferred list.

---

## 6.5 — News Fetcher

A sibling pipeline in `scripts/fetch-news/` that pulls articles from sustainability RSS feeds and matches them against the ecolabel registry. Purpose-built for a different problem than the crawler (news cycle vs certification body coverage) but sharing infrastructure where it makes sense.

### Flow

Load `labels.json` → initialise the news matcher with the label set (guards run here) → fetch all feeds in parallel with a bounded concurrency pool → parse RSS/Atom XML into normalised article records → match each article against every label → write one preview JSON file and one host-stats file atomically.

### Three-bucket matcher

The news matcher (`scripts/fetch-news/matcher.js`) is modelled on the crawler's matcher but uses **three** buckets instead of two because the acronym failure mode is qualitatively different from the ambiguous-prose mode:

- **SAFE** — distinctive multi-word labels (`Rainforest Alliance`, `Nordic Swan Ecolabel`). Matched via padded-substring in title + summary, case-insensitive. Substring matching on canonical + any alias.
- **AMBIGUOUS** — labels whose words collide with common English prose (`Fair Wear`, `Gold Standard`, `USDA Organic`). Matched via padded-substring on the canonical form only; non-canonical aliases are suppressed from the text-match tier. Still case-insensitive.
- **ACRONYM** — short all-caps labels (`FSC`, `WRAP`, `LEED`, `ENERGY STAR`). Matched **case-sensitively**: `WRAP` hits, `wrap` doesn't. In URL slugs (which are lowercase) an ACRONYM hit requires the slug to equal the acronym token exactly, not merely contain it — prevents `wrap-gifts` from false-matching `WRAP`.

Classification is automatic at init, driven by alias shape (uppercase-test and a curated `DANGER_WORDS` set), with a `rules/label-overrides.js` editorial escape hatch.

### Two tiers

1. **Structured-field match** — token-subsequence match against `<category>` tags, `<tag>` fields, and the URL slug. High signal; all buckets eligible (with the extra ACRONYM slug strictness above).
2. **Text match** — padded-substring in title + summary, with per-bucket rules above. Longest-match-wins within each label × field.

### Shared HTTP layer

The fetcher imports `fetchHtml` / `delayFor` / `getHostStatsSnapshot` directly from the crawler's `http.js` rather than duplicating them. This is deliberate: the per-host penalty counter is module-singleton state, so a host rate-limiting the crawler automatically slows the news fetcher on its next visit, and vice versa.

### Startup guards

Two, mirroring the crawler's guards:
- **Override-drift** — any label id referenced in `FORCE_ACRONYM` / `FORCE_AMBIGUOUS` / `FORCE_SAFE` / `LABEL_ALIASES` must exist in `labels.json`. Catches typos and stale overrides.
- **Prose-collision** — any SAFE alias whose lowercased form is in a curated `DANGEROUS_PROSE` set (e.g. `fair`, `green`, `bird`) forces init to throw. Prevents the FAIR-class bug from ever reaching the news side.

### Output

Single flat JSON array at `public/data/news-preview.json` (gitignored). Each entry includes the full article metadata and a `matches` array with `labelId`, `bucket`, `tier`, `where`, and `matchedText`. Unmatched articles are written too — they're audit data for the pipeline, not user content. A sibling `news-preview.host-stats.json` tracks per-host fetch success/error counts for debugging outlet rate-limits.

### Known retrieval issue

Triple Pundit intermittently returns HTTP 403 to the axios client even with UA rotation — looks like a Cloudflare TLS-fingerprint check. Curl with the same headers gets through; retries succeed variably. Flagged for a future pass; could be worked around by switching specific hosts to native `fetch()` or adding explicit backoff for 403 (currently only 429 retries). Not blocking — one dropped feed doesn't crash the run.

---

## 7 — Data Layer

The data layer has some historical mess that's tracked as architectural debt rather than fixed in place.

### What's shipped today

The crawler writes two artifacts at the end of every run:

**`public/data/company-labels.json`** — the registry. An array (or map, depending on view) of companies and the labels they're credibly associated with, with confidence scores and label coverage counts. This is the file consumers (the frontend, anyone querying the dataset) are meant to read.

**`public/data/company-labels.audit.json`** — the audit file. A per-label diff of what changed since the previous run: new companies found, companies lost, companies kept, companies dropped. This is the paper trail that makes the registry auditable (see §8).

The crawler also writes to a SQLite database (`goodbuys.db` — gitignored). This is currently **write-only** — the database is populated on every run but nothing reads from it. It exists as a staging area for a future migration where the frontend will query the database directly instead of fetching static JSON.

### The `src/data/` vs `public/data/` drift (open)

`app/api/search/route.js` statically-imports the registry from `src/data/` at build time. This means the API route's view of the registry is frozen at deploy time and diverges from the crawler's output (in `public/data/`) the moment the crawler runs again.

This is a known open issue. The planned fix is to have the API read `public/data/` at runtime with module-scope caching on first hit, and remove `src/data/` from the repo entirely. Scheduled to land as part of the cPanel / live-service migration; until then, `src/data/*.json` needs to be manually refreshed after each crawl for the product-search endpoint to reflect current data. Frontend pages that fetch `public/data/*.json` directly are **not** affected.

### The SQLite endgame

The long-term plan is to host the SQLite database and have the frontend (and API) query it directly, replacing the static-JSON distribution pattern. This unlocks:
- Pagination and filtering without loading the whole registry client-side
- Historical queries (what did the registry look like last month?)
- Analytical queries for greenwashing research (company/label relationships, cross-certification patterns, temporal trends)

The SQLite module (`db.js`) is well-written — WAL mode, prepared statements, transactional writes — and ready to serve as the backbone when the migration happens. What's blocking the migration is a decision about deployment topology (hosted SQLite vs a proper Postgres instance) and the API design. For now, keep the write path and don't wire the read path yet.

---

## 8 — Audit Trail System

Auditability is a hard requirement, not a nice-to-have. The project is a research artifact; every claim it makes about a company's certifications must be traceable back to a source. Without that, the registry can't be used for academic writing or journalism without extensive manual verification.

### What gets recorded

For every company entry in the registry, the system preserves:
- The **source URL** where the match was made
- The **DOM tag** it was found in (which feeds into the scoring)
- The **timestamp** of the crawl that produced the match
- The **label** the match is associated with
- The **score** and the factors that produced it

### Run-to-run diffing

At the end of each crawl, `run.js` diffs the new in-memory registry against the previous `company-labels.json` on disk, producing four per-label numbers:
- **`newlyFound`** — companies in this run but not the last
- **`lost`** — companies in the last run but not this one
- **`keptCount`** — companies present in both
- **`droppedCount`** — companies that appeared in the raw extraction but didn't meet the score threshold

The diff is written to `company-labels.audit.json`. This is the key tool for evaluating changes to the matcher or crawler. Before making a precision-related change (new brands, new matcher logic, new selectors), capture the current audit output. After the change, run again and diff the diffs. If `newlyFound` is spiking on labels that shouldn't have new companies, the change is creating noise. If `lost` is spiking on labels where you'd expect continuity, the change is eating signal. This is how Bug 2's fix will be validated when it lands.

### Why atomic writes matter

All file writes in the system go through an atomic `tmp + rename` pattern (see `io.js`). The point is not just safety against crashes — it's that a partially-written registry that looks superficially valid but has a truncated tail is worse than no registry at all. Consumers that read `public/data/company-labels.json` mid-write would get garbage. The atomic pattern ensures readers only ever see fully-committed files.

This matters especially for the audit file. A corrupted audit file makes run-to-run comparison impossible and silently breaks the ability to validate future changes.

---

## 9 — Known Bugs and Deferred Design Decisions

The full list lives in `KNOWN_ISSUES.md`. This section names the high-leverage ones and explains *why* they're deferred rather than fixed.

### Bug 2 — ambiguous exact-match leak on nav/footer links

**The problem.** The matcher's tier 1 (exact match) assumes that if element text exactly equals a known brand name, it's a standalone brand reference. Real DOMs violate this constantly. Social-share footers have `<a>Facebook</a>`, `<a>Instagram</a>`. Nav menus have `<a>Discover</a>`. CMS templates have `<li>Article</li>`. All of these exact-match on brands that are meant to require context.

**Why it's deferred.** A quick fix (strip nav words, aggressive FORCE_AMBIGUOUS additions) would be a band-aid that holds for a month and then breaks when the brand list grows. The proper fix is **context-aware scoring** — knowing *where on the page* a match occurred and weighting it accordingly. That requires:
- Wiring `rules/site-configs.js` (currently unused) into the crawler to allow per-host content selectors
- Identifying and excluding nav/footer/header regions before extraction runs
- Adding corroboration requirements for ambiguous brands (a match in `<a>Discover</a>` should only count if the same brand appears in a `<title>` or content region on the same page)

This is a full session of work and needs before/after audit-diff validation. Rushing it in alongside unrelated work would create tech debt.

### Historical carryover (removed, not fixed)

There used to be a dead `known-companies.js` module trying to solve a real problem: the manual brand list is hand-maintained and inevitably incomplete, so companies discovered by the crawler should feed back into the input side of future runs. The implementation was broken (gated on a shimmed function that always returned false) and the set wasn't read anywhere.

This was removed rather than fixed because a correct version requires a trust model the system doesn't have yet. "A name we extracted" is not the same as "a name we should trust for future extractions" — especially when the current registry contains known false positives (Bug 2). Fixing Bug 2 is a precondition for this feature to be worth building.

The label collision guard added in the same cleanup partially addresses the underlying motivation — it makes the manual brand list safer to grow by failing loudly on additions that would collide with label names. That's protection for one end of the loop; the full historical-carryover feature was trying to automate the other end.

### Site-configs.js

Exists in the repo, imported by nothing. This is the intended infrastructure for the Bug 2 fix. It will eventually hold per-host rules like "extract only from `<main>`" or "ignore the `#cookie-notice` region." Don't delete it; don't use it for anything else.

### DuckDuckGo scraping in `/api/search`

The product search endpoint scrapes DuckDuckGo HTML. This is fragile (depends on unstable HTML structure), ToS-adjacent, and a demo feature rather than production-grade infrastructure. If the endpoint becomes a real product surface, it needs to be replaced with a proper search API. For now, treat as a known limitation.

---

## 10 — API Layer (Brief)

Two route handlers:

**`/api/search`** — product enrichment. Takes a product query, scrapes DuckDuckGo for matching pages, and enriches the results against the company-labels registry. Used by the frontend product search UI. Fragile for the reasons above.

**`/api/contact`** — contact form submissions. Rate-limited per-IP (in-process only — not multi-instance safe), writes atomically to a JSON file. Stores the submitter's IP, which is probably something the privacy policy should acknowledge.

The registry itself is **not** served via an API today. The frontend fetches `public/data/company-labels.json` directly at the CDN edge. This is deliberate — the registry is fundamentally a static artifact between crawl runs, and serving it as a static file is simpler and cheaper than running a query layer. When the SQLite migration happens, the registry will move behind an API, but until then, keep it static.

---

## 11 — Frontend (Brief)

Next.js App Router, plain CSS per page (no Tailwind, no CSS-in-JS). Every page follows the same pattern:
- `useEffect` on mount fetches `public/data/*.json`
- State is set from the fetched data
- Client-side filtering/sorting on user interaction

This is fine at current scale (low thousands of companies, a few hundred labels). When the registry grows past the point where loading all of it on every page visit becomes painful, the migration path is: add HTTP cache headers, then add a client-side cache layer (SWR-style), then eventually move to a paginated backend API — probably as part of the SQLite migration.

The frontend doesn't need to understand the recognition engine or the crawler. It consumes the output artifact and displays it. Keep it simple; don't spread matcher logic into the frontend.

---

## 12 — How to Work on This System

A few principles that fall out of the architecture:

**Precision beats recall.** If a change adds 50 new companies but 5 of them are visibly in the top 10 by score, it's a net loss. Always check the audit diff on the top-scoring entries after a matcher or crawler change.

**Fail loudly at init.** The startup guards exist because silent data corruption is the worst failure mode. If you're adding new validation, make it throw on violation — a warning will be ignored.

**The brand list is curated, not mined.** `manual-known-companies.js` is a human-editorial artifact. Every addition should be deliberate. The guards protect against accidents; judgment protects against mistakes.

**Don't touch the audit trail.** The diff-based audit is the only way to validate that a change improved things. If you break or bypass it, you lose the ability to measure quality, and at that point you're coding blind.

**Read KNOWN_ISSUES.md before making recommendations about the data.** The current registry has documented false positives in its top entries. Any analysis that treats the registry as ground truth without accounting for Bug 2 will mislead its consumer.

---

## 13 — Glossary

- **Ecolabel** — A sustainability certification (Fair Trade Certified, Bird Friendly, Rainforest Alliance, etc.). Each ecolabel has one or more certification body websites where certified companies are listed.
- **Label name** — The human-readable name of an ecolabel. Stored in `labels.json` and used at matcher init for the collision guard.
- **Brand** — A company name known to the matcher. Lives in `manual-known-companies.js`.
- **Canonical name** — The brand's display form. The matcher normalises all inputs to lowercase for comparison but returns the canonical form on match.
- **Safe brand** — A brand whose name is unlikely to collide with common English. Eligible for substring matching.
- **Ambiguous brand** — A brand whose name is also a common word, UI label, or generic noun. Only matched on exact element text.
- **Tier** — A level in the matcher's match path. Tier 1 is exact match; tier 2 is safe substring; tier 3 returns null.
- **Audit diff** — The per-run comparison of registry output against the previous run. The primary tool for validating matcher/crawler changes.
- **Startup guard** — An invariant check at matcher init that throws if violated. Currently two: label collision guard and ambiguous docs drift guard.
