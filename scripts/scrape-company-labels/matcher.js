/** @format */

import MANUAL_KNOWN_COMPANIES, { AMBIGUOUS_BRAND_DOCS } from "./rules/manual-known-companies.js";
import GENERIC_NOUNS from "./rules/generic-nouns.js";
import BAD_PLURALS from "./rules/bad-plurals.js";

function normalizeText(s) {
	return (s || "").replace(/\s+/g, " ").trim();
}

// --- CONFIGURATION ---

// Brands that are technically English words but are SO common we might want to manually force them as "Ambiguous"
// to ensure they are only picked up when standalone.
const FORCE_AMBIGUOUS = new Set([
	"Gap",
	"Target",
	"Apple",
	"Coach",
	"Guess",
	"Puma",
	"Supreme",
	"Square",
	"Block",
	"Caterpillar",
	"Amazon",
	"Alphabet",
	"Meta",
	"Box",
	"Visa",
	"Discover",
	"Spectrum",
	"Frontier",
	"Pioneer",
	"Pilot",
	"Native",
	"Honest",
	"Dove",
	"Kind",
	"Simple",
]);

// --- STATE ---

const SAFE_BRANDS = new Set(); // "Patagonia", "Whole Foods Market"
const AMBIGUOUS_BRANDS = new Set(); // "Gap", "Target", "Apple"
const LOWER_TO_CANON = new Map(); // "patagonia" -> "Patagonia"

let isInitialized = false;

// --- INITIALIZATION ---

export function initMatcher({ labelNames = [] } = {}) {
	if (!isInitialized) {
		// 1. Build a "Bad Word" set from your existing rules
		// If a brand name is in generic-nouns.js, it is automatically Ambiguous.
		const BAD_WORDS = new Set([
			...GENERIC_NOUNS,
			...BAD_PLURALS,
			...["gap", "target", "apple", "coach", "guess", "best", "free", "total", "smart", "kind", "simple"],
		]);

		for (const raw of MANUAL_KNOWN_COMPANIES) {
			const name = normalizeText(raw);
			if (!name) continue;
			const lower = name.toLowerCase();

			LOWER_TO_CANON.set(lower, name);

			// LOGIC: Is this brand "Safe" or "Ambiguous"?

			// Condition A: Is it in the manual FORCE_AMBIGUOUS list?
			if (FORCE_AMBIGUOUS.has(name)) {
				AMBIGUOUS_BRANDS.add(lower);
				continue;
			}

			// Condition B: Is it a single word that looks like a generic noun?
			if (!name.includes(" ") && BAD_WORDS.has(lower)) {
				AMBIGUOUS_BRANDS.add(lower);
				continue;
			}

			// Condition C: Is it very short (<= 3 chars)? (e.g. "On", "Gap")
			// Unless it's a known acronym like "IBM", short stuff is risky.
			if (name.length <= 3) {
				AMBIGUOUS_BRANDS.add(lower);
				continue;
			}

			// Otherwise -> SAFE
			SAFE_BRANDS.add(lower);
		}

		// Guard against drift between the AMBIGUOUS_BRAND_DOCS curation layer
		// in manual-known-companies.js and FORCE_AMBIGUOUS here. Every brand
		// listed in the docs section must be present in FORCE_AMBIGUOUS; if
		// someone adds to one without the other, fail loudly instead of
		// silently demoting a brand back to SAFE.
		guardAmbiguousDocsSync();

		console.log(`[Matcher] Initialized: ${SAFE_BRANDS.size} Safe Brands, ${AMBIGUOUS_BRANDS.size} Ambiguous Brands.`);
		isInitialized = true;
	}

	// Guard against SAFE brands that are substrings of ecolabel names.
	// Why: a brand like "FAIR" silently produced 22-label false positives on
	// pages mentioning "Fair Trade Certified" before this check existed. See
	// KNOWN_ISSUES.md. Runs whenever labels are passed so the check can't be
	// skipped by re-entering a pre-initialised matcher.
	if (labelNames.length) {
		guardLabelCollisions(labelNames);
	}
}

function guardAmbiguousDocsSync() {
	const missing = [];
	for (const name of AMBIGUOUS_BRAND_DOCS) {
		if (!FORCE_AMBIGUOUS.has(name)) missing.push(name);
	}
	if (!missing.length) return;

	const lines = missing.map((n) => `  - "${n}"`).join("\n");
	throw new Error(
		[
			`[matcher] AMBIGUOUS_BRAND_DOCS drift detected.`,
			`${missing.length} brand(s) listed in rules/manual-known-companies.js AMBIGUOUS_BRAND_DOCS`,
			`are NOT present in FORCE_AMBIGUOUS in matcher.js:`,
			lines,
			``,
			`Each brand in the docs section must also be in FORCE_AMBIGUOUS or it will`,
			`be silently classified as SAFE (substring-matchable), re-introducing the`,
			`false-positive class documented in KNOWN_ISSUES.md.`,
			``,
			`Fix: add the missing brand(s) to FORCE_AMBIGUOUS in matcher.js.`,
		].join("\n"),
	);
}

function guardLabelCollisions(labelNames) {
	const labelLowers = [];
	for (const raw of labelNames) {
		const norm = normalizeText(raw).toLowerCase();
		if (norm) labelLowers.push(norm);
	}
	if (!labelLowers.length) return;

	const offenders = [];
	for (const brandLower of SAFE_BRANDS) {
		if (brandLower.length < 4) continue;
		const padBrand = ` ${brandLower} `;
		for (const lbl of labelLowers) {
			if (` ${lbl} `.includes(padBrand)) {
				offenders.push({ brand: LOWER_TO_CANON.get(brandLower), label: lbl });
				break;
			}
		}
	}

	if (!offenders.length) return;

	const lines = offenders.map((o) => `  - "${o.brand}" appears inside ecolabel name "${o.label}"`).join("\n");
	const msg = [
		`[matcher] Label-collision guard failed.`,
		`${offenders.length} SAFE brand(s) collide with ecolabel names — this WILL cause systematic false positives.`,
		`See KNOWN_ISSUES.md for the FAIR/Bird incident that motivated this guard.`,
		``,
		lines,
		``,
		`Fix each collision by doing ONE of:`,
		`  (a) Remove the brand from scripts/scrape-company-labels/rules/manual-known-companies.js`,
		`      if it is not in v1 priority scope.`,
		`  (b) Add it to FORCE_AMBIGUOUS in matcher.js to restrict it to standalone`,
		`      exact matches only (acceptable if the brand is genuinely important but rare).`,
	].join("\n");
	throw new Error(msg);
}

// --- MATCHING LOGIC ---

/**
 * Checks a raw text string (like "Patagonia" or "We bridge the gap")
 * and returns the canonical Company Name if it's a valid hit.
 */
export function matchCompany(rawText) {
	if (!isInitialized) initMatcher();
	if (!rawText) return null;

	const norm = normalizeText(rawText);
	if (!norm) return null;
	const lower = norm.toLowerCase();

	// 1. Exact Match Check (Highest Priority)
	// If the text is EXACTLY "Gap" or "Patagonia", we take it.
	if (LOWER_TO_CANON.has(lower)) {
		const canon = LOWER_TO_CANON.get(lower);

		// KNOWN BUG: "standalone == safe" is not actually true for nav/footer links
		// like <a>Facebook</a> or <a>Discover</a>. See KNOWN_ISSUES.md (Bug 2).
		return canon;
	}

	// 2. Substring Check (Only for SAFE brands)
	// We scan the text to see if it *contains* a Safe Brand.
	// e.g. text: "Certified by Patagonia Provisions" -> matches "Patagonia"
	// We DO NOT scan for Ambiguous brands here. "Fill in the gap" will NOT trigger "Gap".

	// Optimization: This is O(N*M). For a massive list, we'd want a Trie.
	// For 2000 brands, a loop is fine.
	for (const safeLower of SAFE_BRANDS) {
		// We pad with spaces to ensure we match whole words
		// e.g. "Patagonia" matches " Patagonia ", but not "Unpatagonian"
		const paddedText = ` ${lower} `;
		const paddedBrand = ` ${safeLower} `;

		if (paddedText.includes(paddedBrand)) {
			return LOWER_TO_CANON.get(safeLower);
		}
	}

	return null;
}
