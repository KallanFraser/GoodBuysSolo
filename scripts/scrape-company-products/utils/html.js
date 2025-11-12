/** @format */
import * as cheerio from "cheerio";
import SECTION_FILTERS from "../lists/section-filters.js";
import NOISE_PHRASES from "../lists/noise-phrases.js";
import NOISE_PREFIXES from "../lists/noise-prefixes.js";
import GENERIC_NOUNS from "../lists/generic-nouns.js";
import PRODUCT_JUNK from "../lists/product-junk.js";

export function loadCheerio(html, opts = {}) {
	return cheerio.load(html, opts);
}

export function normalizeText(s) {
	return (s || "").replace(/\s+/g, " ").trim();
}

export function stripNoisySections($) {
	for (const sel of SECTION_FILTERS) {
		try {
			$(sel).remove();
		} catch {}
	}
}

export function extractJsonLDProducts($) {
	const out = new Set();
	$("script[type='application/ld+json']").each((_, el) => {
		let raw = $(el).contents().text();
		try {
			const parsed = JSON.parse(raw);
			const nodes = Array.isArray(parsed) ? parsed : [parsed];
			for (const n of nodes) collectProductNames(n, out);
		} catch {}
	});
	return Array.from(out);
}

function collectProductNames(node, out) {
	if (!node || typeof node !== "object") return;
	const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
	if (types.some((t) => /Product/i.test(t))) {
		const n = node.name || node.title;
		if (n) out.add(normalizeText(n));
	}
	for (const k of Object.keys(node)) {
		const v = node[k];
		if (v && typeof v === "object") collectProductNames(v, out);
	}
}

export function looksLikeProductName(txt) {
	const t = normalizeText(txt);
	if (t.length < 2 || t.length > 120) return false;

	const lower = t.toLowerCase();
	if (NOISE_PHRASES.includes(lower)) return false;
	if (PRODUCT_JUNK.includes(lower)) return false;
	if (GENERIC_NOUNS.includes(lower)) return false;
	for (const p of NOISE_PREFIXES) if (lower.startsWith(p)) return false;

	if (/^(©|copyright)/i.test(t)) return false;
	if (/^\d+$/.test(t)) return false;
	if (/add to cart|learn more|view details|read more/i.test(t)) return false;
	if (t.split(/\s+/).length > 12) return false;

	return true;
}

export function dedupeNames(arr) {
	const seen = new Set();
	const out = [];
	for (const s of arr) {
		const key = s
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[^\w]+/g, " ")
			.trim();
		if (!seen.has(key)) {
			seen.add(key);
			out.push(s);
		}
	}
	return out;
}

/** NEW: discover a locale path prefix like /en-us from homepage */
export function discoverLocalePrefix(homeHtml) {
	try {
		const $ = loadCheerio(homeHtml);
		// 1) link[rel=alternate][hreflang] that matches English
		let href =
			$('link[rel="alternate"][hreflang="en-us"]').attr("href") ||
			$('link[rel="alternate"][hreflang="en"]').attr("href") ||
			$('link[rel="canonical"]').attr("href");
		if (href) {
			const u = new URL(href, "https://dummy.invalid");
			const path = u.pathname || "/";
			// If it looks like /en-us/... keep the first segment
			const seg = path.split("/").filter(Boolean)[0] || "";
			if (/^[a-z]{2}([-_][a-z]{2})?$/i.test(seg)) return `/${seg.toLowerCase()}`;
		}

		// 2) meta og:url hint
		const og = $('meta[property="og:url"]').attr("content");
		if (og) {
			const u = new URL(og);
			const seg = (u.pathname || "/").split("/").filter(Boolean)[0] || "";
			if (/^[a-z]{2}([-_][a-z]{2})?$/i.test(seg)) return `/${seg.toLowerCase()}`;
		}
	} catch {}
	return ""; // no locale prefix
}
