/** @format */

// News-specific matcher. Decides whether an article mentions any ecolabel
// from the registry. Architectural shape mirrors the crawler's matcher
// (bucket classification, multi-tier match path, startup guards) but the
// rules and inputs are different. See ARCHITECTURE.md §5 for the crawler
// version and the design rationale for this one.
//
// Three buckets instead of two:
//   SAFE       — multi-word, distinctive labels. Padded-substring match in
//                title + summary, case-insensitive.
//   AMBIGUOUS  — labels whose canonical or alias collides with common English
//                prose ("Fair Wear", "Gold Standard"). Only the canonical
//                full phrase is checked in prose; other aliases are suppressed
//                from tier 2.
//   ACRONYM    — short all-caps labels (FSC, WRAP, LEED, ENERGY STAR). Matched
//                case-SENSITIVELY in prose. "WRAP" is the label; "wrap" is not.
//
// Two tiers:
//   Tier 1 — structured field match: URL slug, <category>, <tag>. Token-
//            subsequence match, case-insensitive. All buckets eligible.
//   Tier 2 — text match in title + summary, with per-bucket rules above.
//
// Two startup guards (mirror of crawler's two):
//   Override-drift — overrides must reference labels that exist in labels.json.
//   Prose-collision — SAFE aliases must not collide with a curated dangerous
//                     prose set. Forces manual reclassification instead of
//                     silently shipping false positives.

import { FORCE_ACRONYM, FORCE_AMBIGUOUS, FORCE_SAFE, LABEL_ALIASES } from "./rules/label-overrides.js";

export const BUCKETS = Object.freeze({ SAFE: "SAFE", AMBIGUOUS: "AMBIGUOUS", ACRONYM: "ACRONYM" });

// Words that, when present in a label alias, mark it AMBIGUOUS — i.e., prose
// usage of the alias would collide with everyday sustainability copy. This
// list is curated, not a dictionary. Expand as false positives surface.
const DANGER_WORDS = new Set([
	"fair", "green", "blue", "gold", "organic", "safe", "best", "pure",
	"kind", "honest", "standard", "certified", "natural", "wild", "sustainable",
	"clean", "responsible", "friend", "friendly", "bird", "animal", "global",
]);

// Aliases that must never be classified SAFE even if the automation says so.
// The prose-collision guard throws if any SAFE alias matches this set. Keep
// conservative; we'd rather fail init than ship the FAIR class of bug.
const DANGEROUS_PROSE = new Set([
	"fair", "fairtrade", "green", "green seal", "green key", "gold", "gold standard",
	"bird", "blue", "blue flag", "blue angel", "organic", "safe", "best", "pure",
	"kind", "honest", "clean", "natural", "standard",
]);

let state = {
	labels: [],
	structuredIndex: null,
	isInitialized: false,
};

// --- init ---

export function initMatcher({ labels }) {
	if (state.isInitialized) return;
	if (!Array.isArray(labels) || labels.length === 0) {
		throw new Error("[news-matcher] initMatcher called with no labels");
	}

	const labelIdSet = new Set(labels.map((l) => l.id));
	guardOverrideDrift(labelIdSet);

	const labelRecords = labels.map(buildLabelRecord);

	guardProseCollision(labelRecords);

	const structuredIndex = new Map(); // normalized-token-join → Set<labelId>
	for (const label of labelRecords) {
		const keys = [label.id, label.canonical, ...label.aliases.map((a) => a.text)];
		for (const k of keys) {
			const norm = tokensOf(k).join(" ");
			if (!norm) continue;
			if (!structuredIndex.has(norm)) structuredIndex.set(norm, new Set());
			structuredIndex.get(norm).add(label.id);
		}
	}

	state = { labels: labelRecords, structuredIndex, isInitialized: true };

	const byBucket = { SAFE: 0, AMBIGUOUS: 0, ACRONYM: 0 };
	for (const l of labelRecords) byBucket[primaryBucket(l)]++;
	console.log(
		`[News Matcher] Initialized: ${labelRecords.length} labels ` +
			`(SAFE=${byBucket.SAFE}, AMBIGUOUS=${byBucket.AMBIGUOUS}, ACRONYM=${byBucket.ACRONYM}), ` +
			`${labelRecords.reduce((n, l) => n + l.aliases.length, 0)} alias entries.`,
	);
}

function buildLabelRecord(raw) {
	const { id, name } = raw;
	const canonical = name.trim();

	const aliasTexts = deriveAliasTexts(canonical, id);
	const forcedBucket = resolveForcedBucket(id);

	const aliases = aliasTexts.map((text) => ({
		text,
		bucket: forcedBucket || autoBucket(text),
		lowerTokens: tokensOf(text).join(" "),
		paddedLower: ` ${normaliseForMatch(text)} `,
		paddedCaseSensitive: ` ${text} `,
	}));

	return { id, canonical, aliases };
}

function deriveAliasTexts(canonical, id) {
	const out = new Set([canonical]);

	// Parenthetical split: "Better Cotton (BCI)" → "Better Cotton" + "BCI"
	// Also handles "GOTS (Global Organic Textile Standard)" — both parts
	// become aliases.
	const parenMatch = canonical.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
	if (parenMatch) {
		out.add(parenMatch[1].trim());
		out.add(parenMatch[2].trim());
	}

	// Slash split: "GREENGUARD / GREENGUARD Gold" → both sides
	if (canonical.includes(" / ")) {
		for (const part of canonical.split(" / ")) out.add(part.trim());
	}

	// Manual aliases from overrides
	const manual = LABEL_ALIASES[id] || [];
	for (const m of manual) if (m) out.add(String(m).trim());

	// Drop empties and dedupe
	return Array.from(out).filter(Boolean);
}

function resolveForcedBucket(id) {
	if (FORCE_ACRONYM.has(id)) return BUCKETS.ACRONYM;
	if (FORCE_AMBIGUOUS.has(id)) return BUCKETS.AMBIGUOUS;
	if (FORCE_SAFE.has(id)) return BUCKETS.SAFE;
	return null;
}

function autoBucket(aliasText) {
	const t = aliasText.trim();

	// ACRONYM: entire alias is uppercase letters/digits (optionally with
	// hyphens/spaces between tokens) and reasonably short. Catches "FSC",
	// "WRAP", "LEED", "ENERGY STAR", "OEKO-TEX", "SA8000".
	if (/^[A-Z0-9][A-Z0-9\s\-]{1,19}$/.test(t) && !/[a-z]/.test(t)) {
		return BUCKETS.ACRONYM;
	}

	// AMBIGUOUS: any lowercased word-token is a DANGER_WORD.
	const words = t
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter(Boolean);
	if (words.some((w) => DANGER_WORDS.has(w))) return BUCKETS.AMBIGUOUS;

	return BUCKETS.SAFE;
}

// Primary bucket for a label — used for reporting counts ONLY, not match
// logic. Match rules are applied per-alias in matchTextFields; this function
// just decides which bucket a label is labelled as in the startup log line.
// Most severe wins: AMBIGUOUS > ACRONYM > SAFE, because AMBIGUOUS has the
// tightest prose rule (canonical-only, aliases suppressed) and dominates a
// label's character for reporting purposes.
function primaryBucket(label) {
	if (label.aliases.some((a) => a.bucket === BUCKETS.AMBIGUOUS)) return BUCKETS.AMBIGUOUS;
	if (label.aliases.some((a) => a.bucket === BUCKETS.ACRONYM)) return BUCKETS.ACRONYM;
	return BUCKETS.SAFE;
}

// --- guards ---

function guardOverrideDrift(labelIdSet) {
	const missing = [];
	const inspect = (which, set) => {
		for (const id of set) if (!labelIdSet.has(id)) missing.push({ which, id });
	};
	inspect("FORCE_ACRONYM", FORCE_ACRONYM);
	inspect("FORCE_AMBIGUOUS", FORCE_AMBIGUOUS);
	inspect("FORCE_SAFE", FORCE_SAFE);
	for (const id of Object.keys(LABEL_ALIASES)) {
		if (!labelIdSet.has(id)) missing.push({ which: "LABEL_ALIASES", id });
	}
	if (!missing.length) return;

	const lines = missing.map((m) => `  - ${m.which}: "${m.id}" (not in labels.json)`).join("\n");
	throw new Error(
		[
			`[news-matcher] Override-drift guard failed.`,
			`${missing.length} override(s) reference label id(s) that don't exist in labels.json:`,
			lines,
			``,
			`Fix: remove the stale id(s) from rules/label-overrides.js, or add the missing label(s) to labels.json.`,
		].join("\n"),
	);
}

function guardProseCollision(labelRecords) {
	const offenders = [];
	for (const label of labelRecords) {
		for (const alias of label.aliases) {
			if (alias.bucket !== BUCKETS.SAFE) continue;
			const lower = normaliseForMatch(alias.text);
			if (DANGEROUS_PROSE.has(lower)) {
				offenders.push({ labelId: label.id, alias: alias.text, lower });
			}
		}
	}
	if (!offenders.length) return;

	const lines = offenders
		.map((o) => `  - label "${o.labelId}": alias "${o.alias}" normalises to "${o.lower}" which is in DANGEROUS_PROSE`)
		.join("\n");
	throw new Error(
		[
			`[news-matcher] Prose-collision guard failed.`,
			`${offenders.length} SAFE alias(es) collide with curated dangerous-prose terms — matching these in prose would cause systematic false positives:`,
			lines,
			``,
			`Fix each by doing ONE of:`,
			`  (a) Add the label id to FORCE_AMBIGUOUS in rules/label-overrides.js (the common case).`,
			`  (b) If the alias is genuinely unambiguous despite its form, widen DANGEROUS_PROSE or narrow the alias.`,
		].join("\n"),
	);
}

// --- matching ---

/**
 * Match an article against all labels.
 * @param {{ title: string, summary: string, categories: string[], urlSlug: string|null }} article
 * @returns {Array<{labelId, bucket, tier, where, matchedText}>}
 */
export function matchArticle(article) {
	if (!state.isInitialized) throw new Error("[news-matcher] matchArticle called before initMatcher");

	const seen = new Set(); // `${labelId}:${where}` to deduplicate same-field hits
	const matches = [];

	for (const hit of matchStructuredFields(article)) {
		const key = `${hit.labelId}:${hit.where}:${hit.tier}`;
		if (seen.has(key)) continue;
		seen.add(key);
		matches.push(hit);
	}
	for (const hit of matchTextFields(article)) {
		const key = `${hit.labelId}:${hit.where}:${hit.tier}`;
		if (seen.has(key)) continue;
		seen.add(key);
		matches.push(hit);
	}

	return matches;
}

function matchStructuredFields(article) {
	const out = [];
	const haystacks = [];
	for (const c of article.categories || []) {
		haystacks.push({ tokens: tokensOf(c), where: "category", text: c });
	}
	if (article.urlSlug) haystacks.push({ tokens: tokensOf(article.urlSlug), where: "urlSlug", text: article.urlSlug });

	for (const { tokens, where, text } of haystacks) {
		const matchedLabelsForThisHaystack = new Set();
		for (const label of state.labels) {
			if (matchedLabelsForThisHaystack.has(label.id)) continue;
			for (const alias of label.aliases) {
				const needle = tokensOf(alias.text);
				if (!needle.length) continue;
				if (!acceptStructuredMatch(alias, needle, tokens, where, text)) continue;
				out.push({
					labelId: label.id,
					bucket: alias.bucket,
					tier: "structured-field",
					where,
					matchedText: alias.text,
					sourceText: text,
				});
				matchedLabelsForThisHaystack.add(label.id);
				break;
			}
		}
	}
	return out;
}

// Per-bucket rules for tier 1 (structured fields). Stricter for ACRONYM to
// prevent slugs like "wrap-gifts" from false-matching WRAP: URL slugs are
// always lowercase so the case-sensitivity trick doesn't work there, and a
// subsequence match is too permissive. For categories we can still require
// the acronym to appear in its canonical (all-caps) form.
function acceptStructuredMatch(alias, needle, tokens, where, rawText) {
	if (alias.bucket !== BUCKETS.ACRONYM) {
		return hasTokenSubsequence(tokens, needle);
	}
	// ACRONYM bucket from here on.
	if (where === "urlSlug") {
		// Slug must be exactly the acronym (no surrounding tokens).
		if (tokens.length !== needle.length) return false;
		return hasTokenSubsequence(tokens, needle);
	}
	// Category/tag: subsequence + raw-text must contain the alias all-caps.
	if (!hasTokenSubsequence(tokens, needle)) return false;
	const paddedRaw = ` ${normaliseForMatchPreserveCase(rawText)} `;
	return paddedRaw.includes(alias.paddedCaseSensitive);
}

function matchTextFields(article) {
	const out = [];
	const fields = [];
	if (article.title) fields.push({ raw: article.title, where: "title" });
	if (article.summary) fields.push({ raw: article.summary, where: "summary" });

	for (const { raw, where } of fields) {
		const paddedLower = ` ${normaliseForMatch(raw)} `;
		const paddedCaseSensitive = ` ${normaliseForMatchPreserveCase(raw)} `;

		for (const label of state.labels) {
			// Collect all hits for this label in this field, then longest-match-wins.
			const candidates = [];
			for (const alias of label.aliases) {
				const hit = tryMatchAlias(alias, label, paddedLower, paddedCaseSensitive);
				if (hit) candidates.push({ alias, hit });
			}
			if (!candidates.length) continue;

			// Longest matched text wins for this label in this field.
			candidates.sort((a, b) => b.alias.text.length - a.alias.text.length);
			const winner = candidates[0];
			out.push({
				labelId: label.id,
				bucket: winner.alias.bucket,
				tier: winner.hit.tier,
				where,
				matchedText: winner.alias.text,
			});
		}
	}
	return out;
}

function tryMatchAlias(alias, label, paddedLower, paddedCaseSensitive) {
	if (alias.bucket === BUCKETS.SAFE) {
		if (paddedLower.includes(alias.paddedLower)) return { tier: "text-substring" };
		return null;
	}
	if (alias.bucket === BUCKETS.AMBIGUOUS) {
		// Only the label's canonical is eligible in prose.
		if (alias.text !== label.canonical) return null;
		if (paddedLower.includes(alias.paddedLower)) return { tier: "text-canonical" };
		return null;
	}
	if (alias.bucket === BUCKETS.ACRONYM) {
		if (paddedCaseSensitive.includes(alias.paddedCaseSensitive)) return { tier: "text-acronym" };
		return null;
	}
	return null;
}

// --- normalisation helpers ---

function normaliseForMatch(s) {
	return String(s || "")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normaliseForMatchPreserveCase(s) {
	return String(s || "")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^A-Za-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function tokensOf(s) {
	if (!s) return [];
	return normaliseForMatch(s).split(" ").filter(Boolean);
}

function hasTokenSubsequence(haystack, needle) {
	if (!needle.length || needle.length > haystack.length) return false;
	outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
		for (let j = 0; j < needle.length; j++) {
			if (haystack[i + j] !== needle[j]) continue outer;
		}
		return true;
	}
	return false;
}
