# Known Issues

Registry of bugs and data-quality risks that are documented but not yet fixed. Read this at session start. New Claude sessions should check here before making assumptions about the data in `public/data/company-labels.json`.

Each entry is dated and describes: what it is, what evidence exists, why it's deferred, and what the proper fix looks like.

---

## Bug 2 — AMBIGUOUS exact-match leak on nav / footer links

**First documented:** 2026-04-16
**Status:** Documented. Not fixed. Deferred to a dedicated matcher-precision session co-designed with `scripts/scrape-company-labels/rules/site-configs.js` wiring.
**Severity:** High for data quality. The current top 15 entries in `company-labels.json` by score include multiple obvious false positives.

### Evidence

Snapshot of `public/data/company-labels.json` at the time this was found:

| Rank | Score | Label coverage | Entry | Verdict |
|----:|------:|--------------:|-------|--------|
| 1 | 560,335 | 22 labels | FAIR | False positive — substring of "Fair Trade Certified", "Fair Wear", etc. **Fixed in same commit by deleting from brand list + adding label-collision guard.** |
| 2 | 69,676 | 12 labels | Facebook | False positive — social-share footer links |
| 3 | 69,432 | 12 labels | Instagram | False positive — same pattern |
| 4 | 38,949 | 5 labels | Article | False positive — Vancouver furniture brand, but "article" is CMS copy everywhere |
| 5 | 23,453 | 8 labels | Discover | False positive — "Discover" is in FORCE_AMBIGUOUS but still leaks via exact-match on nav menu items |
| ~10 | 16,008 | 12 labels | Google | False positive — same class as Facebook |

For comparison, the highest-scoring *real* brand entry at the time was Adidas at 18,814 (3 labels). Several false positives outscored every legitimate v1-priority brand.

### Root cause

`scripts/scrape-company-labels/matcher.js`, exact-match path (the `LOWER_TO_CANON.has(lower)` branch).

The comment that previously stood at that branch said:

> "Since 'matchCompany' is usually called on the *full content* of an element (h1, li), an exact match here IMPLIES it is standalone."

That assumption is wrong. `heuristics.js extractCompanies` walks every `<a>`, `<li>`, `<span>`, `<p>`, etc. with ≤1 child. In practice, leaf elements whose entire text is a common UI word are pervasive:

- Social-share links: `<a>Facebook</a>`, `<a>Instagram</a>`, `<a>Google</a>`
- Nav menu items: `<a>Discover</a>`, `<li>Supreme</li>`, `<a>Target</a>`
- Generic UI: `<li>Article</li>`

Any brand whose canonical name is also common UI copy accumulates score on every page of every site the crawler visits, regardless of whether `FORCE_AMBIGUOUS` is set — because exact-match runs *before* the ambiguity gate kicks in.

### Why the label-collision guard (added same commit) doesn't cover this

The guard in `initMatcher` catches the case where a SAFE brand's lowercased form is a substring of an ecolabel name. That closed the FAIR / Bird class of false positive. It does nothing for the case where a brand is a common English word or a generic UI label with no label-name connection.

### Deferred proper fix

Needs context-aware scoring. Likely direction:

1. Wire `scripts/scrape-company-labels/rules/site-configs.js` (currently unused) into `crawler.js` so per-host selectors can scope extraction to content regions only.
2. Identify and strip nav / footer / header regions before `extractCompanies` runs, or score matches inside those regions at zero.
3. Tighten exact-match for AMBIGUOUS brands — require at least one corroborating context signal on the same page (e.g. the brand also appears in a `<title>` or an `h1`, or in JSON-LD).

This deserves before/after audit-diff comparisons and shouldn't be rushed in alongside unrelated work.

### Temporary mitigations (if you need to query the data today)

- Treat single-word entries with ≥5 label coverage as suspect until manually reviewed.
- Downstream consumers (the frontend search pages, anything using the registry as truth) should ignore or demote the specific known offenders: Facebook, Instagram, Google, Article, Discover, plus anything else in that neighbourhood on the leaderboard.
- Do not present the registry as greenwashing evidence without a manual review pass — the top entries by score are false positives.

### References

- `scripts/scrape-company-labels/matcher.js` — the exact-match branch (see the `KNOWN BUG` comment at the branch)
- `scripts/scrape-company-labels/heuristics.js` — `extractCompanies`, the DOM walk that feeds the matcher
- `scripts/scrape-company-labels/rules/site-configs.js` — currently unused, intended infrastructure for the proper fix
