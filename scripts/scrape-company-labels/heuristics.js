/** @format */

import * as cheerio from "cheerio";
import { matchCompany, initMatcher } from "./matcher.js";

// Re-export these for backward compatibility if other files need them
export const normalizeText = (s) => (s || "").replace(/\s+/g, " ").trim();

export function cleanText(s) {
	if (!s) return "";
	return normalizeText(
		s
			.replace(/\u00a0/g, " ")
			.replace(/\s+/g, " ")
			.trim()
	);
}

// --- NEW EXTRACTION LOGIC ---

/**
 * The new main entry point for extraction.
 * It iterates over the DOM and asks the Matcher: "Is this a company?"
 */
export function extractCompanies($, urlStr) {
	// Ensure matcher is loaded
	initMatcher();

	const found = new Map(); // Name -> { score, evidence }

	const addHit = (name, elementTag, contextText) => {
		if (!name) return;

		const existing = found.get(name) || { score: 0, sources: [] };

		// Scoring Weights:
		// H1/H2 = High Confidence
		// LI/TD = Medium Confidence (lists)
		// P/SPAN = Lower Confidence (unless standalone)

		let points = 10;
		if (["h1", "h2", "title"].includes(elementTag)) points = 20;
		if (["li", "th", "td"].includes(elementTag)) points = 15;

		existing.score += points;
		if (existing.sources.length < 3) {
			existing.sources.push(`<${elementTag}> ${contextText.slice(0, 50)}...`);
		}

		found.set(name, existing);
	};

	// 1. Scan specific "Standalone" tags
	// We look for EXACT matches or SAFE contained matches in these tags.
	$("h1, h2, h3, h4, h5, h6, li, td, th, div, span, p, a").each((_, el) => {
		// Skip if it has children (we want leaf nodes or close to leaf)
		if ($(el).children().length > 1) return;

		const text = cleanText($(el).text());
		if (!text || text.length > 200) return; // Skip giant paragraphs for speed

		const match = matchCompany(text);
		if (match) {
			addHit(match, el.tagName.toLowerCase(), text);
		}
	});

	// 2. Scan JSON-LD (Rich Snippets)
	// Often contains "Brand" or "Organization" objects
	const ld = parseJsonLD($);
	for (const org of ld) {
		// JSON-LD is usually very high quality, so we trust it
		const match = matchCompany(org);
		if (match) {
			addHit(match, "json-ld", "Schema.org Data");
		}
	}

	// Convert to the array format run.js expects
	// We filter out very low scores if necessary, but Dictionary matches are usually high intent.
	return Array.from(found.entries()).map(([company, data]) => ({
		company,
		evidence: {
			score: data.score,
			snippets: data.sources,
		},
	}));
}

// --- HELPER: JSON-LD ---

function parseJsonLD($) {
	const orgs = new Set();
	$('script[type="application/ld+json"]').each((_, el) => {
		try {
			const json = JSON.parse($(el).html());
			const traverse = (node) => {
				if (!node || typeof node !== "object") return;

				// Check for Brand/Org
				if (node["@type"] && /Organization|Brand|Corporation/i.test(node["@type"])) {
					if (node.name) orgs.add(node.name);
				}

				// Recurse
				for (const key in node) {
					if (Array.isArray(node[key])) node[key].forEach(traverse);
					else traverse(node[key]);
				}
			};
			traverse(json);
		} catch (e) {}
	});
	return Array.from(orgs);
}

// --- DEPRECATED / SHIM ---
// These are kept so we don't break imports in `run.js` or `crawler.js` immediately.
// We will simply redirect them or make them no-ops.

export function looksLikeCompany(t) {
	return false;
}
export function seedLabelNames(l) {}
export function stripNoisySections($, url) {
	// Basic cleanup still valid
	$("script, style, noscript, iframe, svg").remove();
}
// We handle ignore paths in crawler.js, so just export the helper
export function shouldIgnorePath(url) {
	return /login|signin|cart|checkout|privacy|terms/.test(url);
}

// --- MISSING HELPERS (Add these to the bottom of heuristics.js) ---

export function sameHost(a, b) {
	try {
		return new URL(a).host === new URL(b).host;
	} catch {
		return false;
	}
}

export function isPlausibleCompanyRow(row) {
	// Simple sanity check for existing data in your json file
	return row && row.company && row.company.length > 1 && row.company.length < 100;
}
