/** @format */

// REMOVED: import { normalizeText } from "./heuristics.js";
import MANUAL_KNOWN_COMPANIES from "./rules/manual-known-companies.js";
import GENERIC_NOUNS from "./rules/generic-nouns.js";
import BAD_PLURALS from "./rules/bad-plurals.js";

// --- HELPER (Moved here to avoid circular dependency) ---
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
]);

// --- STATE ---

const SAFE_BRANDS = new Set(); // "Patagonia", "Whole Foods Market"
const AMBIGUOUS_BRANDS = new Set(); // "Gap", "Target", "Apple"
const LOWER_TO_CANON = new Map(); // "patagonia" -> "Patagonia"

let isInitialized = false;

// --- INITIALIZATION ---

export function initMatcher() {
	if (isInitialized) return;

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

	console.log(`[Matcher] Initialized: ${SAFE_BRANDS.size} Safe Brands, ${AMBIGUOUS_BRANDS.size} Ambiguous Brands.`);
	isInitialized = true;
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

		// If it's ambiguous (e.g. "Gap"), we only accept it if it was a Standalone match.
		// Since 'matchCompany' is usually called on the *full content* of an element (h1, li),
		// an exact match here IMPLIES it is standalone.
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
