/** @format */

import { normalizeText, looksLikeCompany } from "./heuristics.js";
import MANUAL_KNOWN_COMPANIES from "./rules/manual-known-companies.js";

let KNOWN_COMPANY_SET = new Set(); // lowercase
let KNOWN_COMPANY_CANON = new Map(); // lowercase -> canonical casing

export function getKnownCompanySet() {
	return KNOWN_COMPANY_SET;
}

// internal helper to add a name into the known set
function addSeedName(name) {
	const canon = normalizeText(name);
	if (!canon) return;

	const lower = canon.toLowerCase();
	if (!lower) return;

	// still run through heuristics so trash doesn't get seeded
	if (!looksLikeCompany(canon)) return;

	if (!KNOWN_COMPANY_SET.has(lower)) {
		KNOWN_COMPANY_SET.add(lower);
		KNOWN_COMPANY_CANON.set(lower, canon);
	}
}

/**
 * Bootstrap known companies from:
 * - existingArr: rows from company-labels.json (what you’ve already scraped)
 * - MANUAL_KNOWN_COMPANIES: your manual rules file (array of strings)
 *
 * Signature stays the same: run.js just calls bootstrapKnownCompanies(existingCompanyLabels)
 */
export function bootstrapKnownCompanies(existingArr) {
	KNOWN_COMPANY_SET = new Set();
	KNOWN_COMPANY_CANON = new Map();

	let countFromLabels = 0;
	let countFromManual = 0;

	// 1) Seed from company-labels.json (historical scrapes)
	if (Array.isArray(existingArr)) {
		for (const row of existingArr) {
			if (!row || !row.company) continue;
			const before = KNOWN_COMPANY_SET.size;
			addSeedName(row.company);
			if (KNOWN_COMPANY_SET.size > before) countFromLabels++;
		}
	}

	// 2) Seed from manual list (simple array of names)
	if (Array.isArray(MANUAL_KNOWN_COMPANIES)) {
		for (const name of MANUAL_KNOWN_COMPANIES) {
			if (typeof name !== "string") continue;
			const before = KNOWN_COMPANY_SET.size;
			addSeedName(name);
			if (KNOWN_COMPANY_SET.size > before) countFromManual++;
		}
	}

	const total = KNOWN_COMPANY_SET.size;
	console.log(`[seed] Known companies bootstrapped → from labels: ${countFromLabels}, from manual: ${countFromManual}, total unique: ${total}`);
}

// Inject known companies that appear in the page text into the candidate list
export function injectKnownCompaniesFromHistory($, names) {
	if (!KNOWN_COMPANY_CANON.size) return names;

	const bodyText = normalizeText($("body").text()).toLowerCase();
	if (!bodyText) return names;

	const extra = new Set();

	for (const [lower, canon] of KNOWN_COMPANY_CANON.entries()) {
		if (lower.length < 3) continue;
		if (bodyText.includes(lower)) {
			extra.add(canon);
		}
	}

	if (!extra.size) return names;

	return Array.from(new Set([...names, ...extra]));
}
