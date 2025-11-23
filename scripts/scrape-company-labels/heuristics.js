/** @format */

import NEGATIVE_TERMS from "./rules/negative-terms.js";
import SECTION_FILTERS from "./rules/section-filters.js";
import IGNORED_PATHS_LIST from "./rules/ignore-paths.js";
import SITE_CONFIGS from "./rules/site-configs.js";

import NOISE_PHRASES from "./rules/noise-phrases.js";
import NOISE_PREFIXES from "./rules/noise-prefixes.js";
import NOISE_TOPICS from "./rules/noise-topics.js";

import DIRECTORY_HINTS from "./rules/directory-hints.js";
import GENERIC_NOUNS_LIST from "./rules/generic-nouns.js";
import BAD_PLURALS_LIST from "./rules/bad-plurals.js";
import PRODUCT_OR_VERB_TOKENS from "./rules/product-verb-tokens.js";
import SYMBOL_BRAND_ALLOW_LIST from "./rules/symbol-brand-allow.js";

const IGNORED_PATHS = IGNORED_PATHS_LIST || [];

// Basic sets derived from rule lists
const GENERIC_NOUNS = new Set((GENERIC_NOUNS_LIST || []).map((s) => s.toLowerCase()));
const BAD_PLURALS = new Set((BAD_PLURALS_LIST || []).map((s) => s.toLowerCase()));
const PRODUCT_OR_VERB = new RegExp((PRODUCT_OR_VERB_TOKENS || []).join("|"), "i");
const SYMBOL_BRAND_ALLOW = new Set(SYMBOL_BRAND_ALLOW_LIST || []);

const NEGATIVE = new Set((NEGATIVE_TERMS || []).map((s) => s.toLowerCase()));
const SECTION_FILTER = SECTION_FILTERS || {};

const NOISE_PHRASES_SET = new Set((NOISE_PHRASES || []).map((s) => s.toLowerCase()));
const NOISE_PREFIXES_SET = new Set((NOISE_PREFIXES || []).map((s) => s.toLowerCase()));
const NOISE_TOPICS_SET = new Set((NOISE_TOPICS || []).map((s) => s.toLowerCase()));

const SITE_CONFIGS_MAP = SITE_CONFIGS || {};

// Helper word sets / patterns

const LANGUAGE_WORDS = new Set([
	"english",
	"en",
	"français",
	"francais",
	"español",
	"espanol",
	"es",
	"deutsch",
	"de",
	"italiano",
	"pt",
	"português",
	"portugues",
	"简体中文",
	"繁體中文",
	"中文",
	"japanese",
	"日本語",
]);

// Words that are almost certainly nav / UI, not company names
const STOP_WORDS = new Set([
	"home",
	"about",
	"about us",
	"contact",
	"contact us",
	"shop",
	"products",
	"services",
	"blog",
	"news",
	"login",
	"log in",
	"sign in",
	"sign up",
	"register",
	"menu",
	"learn",
	"learn more",
	"read more",
	"our story",
	"our impact",
	"careers",
	"faq",
	"faqs",
]);

// Exact junk strings that show up a lot as link text / headings
const NOISE_EXACT = new Set([
	"learn more",
	"read more",
	"find out more",
	"view more",
	"view all",
	"see more",
	"see all",
	"click here",
	"more info",
	"more information",
	"terms and conditions",
	"privacy policy",
	"cookie policy",
	"back to top",
	"next",
	"previous",
	"prev",
]);

// Metric-ish patterns (CO2 etc.)
const METRIC_PHRASE_RE = /\b(tonnes?|tons?|kg|kilograms?|g|grams?|tco2e?|tco2|co₂|co2)\b/i;
// "As mentioned in..." fragments
const AS_MENTIONED_PREFIX_RE = /^(as mentioned|as described|as shown|as outlined)\b/i;

// Phone-ish
const PHONEISH = /^\+?\s*\d[\d\s().\-+]*$/;

// ---------- Label-name noise (eco labels should never be "companies") ----------

let LABEL_NAME_NOISE = new Set();

/**
 * Seed the label-name noise set from labels.json.
 * Call once in run.js after loading labels.
 */
export function seedLabelNames(labels) {
	LABEL_NAME_NOISE = new Set();

	if (!Array.isArray(labels)) return;

	for (const label of labels) {
		if (!label) continue;

		const maybeNames = [label.name, label.id, label.slug, label.shortName, label.code];
		for (const raw of maybeNames) {
			if (!raw || typeof raw !== "string") continue;
			const norm = normalizeText(raw);
			if (!norm) continue;
			LABEL_NAME_NOISE.add(norm);
			LABEL_NAME_NOISE.add(norm.toLowerCase());
		}
	}
}

// ---------- Shared helpers ----------

export const normalizeText = (s) => (s || "").replace(/\s+/g, " ").trim();

export function cleanText(s) {
	if (!s) return "";
	return normalizeText(
		s
			.replace(/\u00a0/g, " ") // nbsp
			.replace(/\s+/g, " ")
			.replace(/\s*[\r\n]+\s*/g, " ")
			.trim()
	);
}

// ---------- Main "looks like company" heuristic ----------

export function looksLikeCompany(txt) {
	// Cheap guards
	if (!txt) return false;
	const t = cleanText(txt);
	if (!t) return false;

	// Very short / very long are unlikely company display names
	if (t.length < 2 || t.length > 80) return false;

	const lower = t.toLowerCase();

	// 1) Things that are *definitely not* companies ---------------------

	// Eco-label names / ids themselves (seeded via seedLabelNames)
	if (LABEL_NAME_NOISE.has(lower)) return false;

	// Pure stop words / menu items
	if (STOP_WORDS.has(lower)) return false;
	if (NOISE_EXACT.has(lower)) return false;

	// Prefix-based boilerplate like "read more", "learn more about ..."
	for (const p of NOISE_PREFIXES_SET) {
		if (lower.startsWith(p)) return false;
	}

	// Very topic-y phrases (these used to hard-block in rules; we keep them strong)
	for (const topic of NOISE_TOPICS_SET) {
		if (lower.includes(topic)) return false;
	}

	// Pure generic nouns or bad plurals (e.g. "products", "services")
	if (GENERIC_NOUNS.has(lower)) return false;
	if (BAD_PLURALS.has(lower)) return false;

	// Language / locale labels ("english", "français", etc.)
	if (LANGUAGE_WORDS && LANGUAGE_WORDS.has(lower)) return false;

	// Phone numbers, emails, or URLs
	if (PHONEISH.test(t)) return false;
	if (/@/.test(t)) return false;
	if (/https?:\/\//i.test(t)) return false;

	// "As mentioned in ..." style sentence fragments
	if (AS_MENTIONED_PREFIX_RE.test(lower)) return false;

	// Metric / CO₂ phrases like "7 billion tonnes of CO₂"
	if (/\d/.test(t) && METRIC_PHRASE_RE.test(lower)) return false;

	// Lines that look like copyright / legal footers
	if (/^(©|copyright)/i.test(lower)) return false;

	// Obvious junk or markup fragments
	if (/^[{}<>]/.test(t)) return false;
	if (!/[a-z]/i.test(t)) return false;

	// Token level checks ----------------------------------------------
	const tokens = t.split(/\s+/);

	// If it's a long lowercase sentence, it's almost never a company
	if (tokens.length > 5) return false;
	const isAllLower = t === t.toLowerCase();
	if (isAllLower) return false;

	// Symbol-leading names only allowed if explicitly allow-listed
	if (/^[&+\-]/.test(t) && !SYMBOL_BRAND_ALLOW.has(t)) return false;

	// 2) Positive "company-ish" shape signals ------------------------

	// Title-like phrases: First letter capitalized, mostly word-ish chars
	const titleLike = /^[A-Z][A-Za-z0-9&\-\.'() ]*[A-Za-z0-9)]$/.test(t);

	// Short all-caps brand strings: "FYFFES", "H&M"
	const allCapsShort = /^[A-Z0-9&\-\.]{2,30}$/.test(t);

	// Common legal suffixes: Inc, Ltd, GmbH, LLC, etc.
	const suffixHit =
		/\b(Inc|Incorporated|LLC|Ltd|Limited|AG|GmbH|S\.?A\.?|Co\.?|Company|Corp|Corporation|PLC|LLP|NV|BV|OY|Spa|S\.p\.A\.?|AB|AS|SRL|SAS|SA|KK)\b\.?/i.test(
			t
		);

	// At least one of these needs to be true for us to consider it a company.
	return suffixHit || allCapsShort || titleLike;
}

// sanity check for existing rows
export function isPlausibleCompanyRow(row) {
	if (!row || !row.company) return false;
	const canon = normalizeText(row.company);
	if (!canon) return false;

	// Be more forgiving for already-saved rows so we don't wipe good data
	// every time we tweak looksLikeCompany(). Just enforce basic sanity.
	if (canon.length < 2 || canon.length > 120) return false;
	if (!/[a-z]/i.test(canon)) return false;

	return true;
}

// ---------- Extraction helpers ----------

export function shouldIgnorePath(urlStr) {
	let p;
	try {
		p = new URL(urlStr).pathname.toLowerCase();
	} catch {
		return false;
	}
	return IGNORED_PATHS.some((prefix) => p === prefix || p.startsWith(prefix + "/") || p.startsWith(prefix));
}

export function stripNoisySections($, urlStr) {
	let pathname = null;

	try {
		if (urlStr) {
			pathname = new URL(urlStr).pathname.toLowerCase();
		}
	} catch {
		// ignore
	}

	// Remove sections that are clearly not company listings (global)
	for (const sel of SECTION_FILTER.globalRemove || []) {
		$(sel).remove();
	}

	// Path-specific removals (e.g. "blog" sections, footer-only paths)
	if (pathname) {
		for (const rule of SECTION_FILTER.pathSpecific || []) {
			const { pathPrefix, selectors } = rule || {};
			if (!pathPrefix || !selectors) continue;
			if (!pathname.startsWith(pathPrefix)) continue;

			for (const sel of selectors) {
				if (!sel) continue;
				$(sel).remove();
			}
		}
	}
}

export function extractLinks($, baseUrl) {
	const out = new Set();

	$("a[href]").each((_, el) => {
		const href = ($(el).attr("href") || "").trim();
		if (!href) return;

		// Skip pure anchors and JS voids
		if (href.startsWith("#")) return;
		if (/^javascript:/i.test(href)) return;

		try {
			const u = new URL(href, baseUrl);
			out.add(u.toString());
		} catch {
			// ignore bad URLs
		}
	});

	return Array.from(out);
}

export function extractCompaniesGeneric($) {
	const names = new Set();

	// Links
	$("a").each((_, el) => {
		const t = cleanText($(el).text());
		if (!t) return;
		if (!looksLikeCompany(t)) return;
		names.add(t);
	});

	// Headings
	$("h1,h2,h3,h4,h5,h6").each((_, el) => {
		const t = cleanText($(el).text());
		if (!t) return;
		if (!looksLikeCompany(t)) return;
		names.add(t);
	});

	// List items
	$("li").each((_, el) => {
		const t = cleanText($(el).text());
		if (!t) return;
		if (!looksLikeCompany(t)) return;
		names.add(t);
	});

	// Table cells
	$("td,th").each((_, el) => {
		const t = cleanText($(el).text());
		if (!t) return;
		if (!looksLikeCompany(t)) return;
		names.add(t);
	});

	return Array.from(names);
}

export function extractCompaniesPerSite($, hostname) {
	const cfg = SITE_CONFIGS_MAP[hostname];
	if (!cfg) return null;

	const names = new Set();

	for (const rule of cfg.rules || []) {
		const { selector, attr, splitOn } = rule;
		if (!selector) continue;

		$(selector).each((_, el) => {
			let raw = "";
			if (attr) {
				raw = $(el).attr(attr) || "";
			} else {
				raw = $(el).text() || "";
			}

			if (!raw) return;

			const parts = splitOn ? raw.split(splitOn) : [raw];
			for (let part of parts) {
				const t = cleanText(part);
				if (!t) continue;
				if (!looksLikeCompany(t)) continue;
				names.add(t);
			}
		});
	}

	return names.size ? Array.from(names) : null;
}

// ---------- JSON-LD and link helpers ----------

/**
 * Parse all <script type="application/ld+json"> blocks and extract
 * organization-like names using extractCompaniesFromJsonLd. Return
 * a simple object of { orgs, lists } for backward compatibility with crawler logic.
 */
export function parseJsonLD($) {
	const orgs = new Set();
	const lists = new Set();

	if (!$ || typeof $.root !== "function") {
		return { orgs: [], lists: [] };
	}

	$('script[type="application/ld+json"]').each((_, el) => {
		// Some cheerio versions require .html(), some .text()
		let raw = $(el).html() || $(el).text() || "";
		raw = raw.trim();
		if (!raw) return;

		try {
			const parsed = JSON.parse(raw);
			const stack = Array.isArray(parsed) ? [...parsed] : [parsed];

			while (stack.length) {
				const node = stack.pop();
				if (!node || typeof node !== "object") continue;

				if (Array.isArray(node["@graph"])) {
					for (const child of node["@graph"]) {
						stack.push(child);
					}
				}

				if (Array.isArray(node.itemListElement)) {
					for (const item of node.itemListElement) {
						if (item && typeof item === "object" && item.name) {
							const n = cleanText(item.name);
							if (n) lists.add(n);
						}
					}
				}

				const type = node["@type"];
				const name = node.name || node.legalName || node.alternateName;

				if (name && type && /Organization|Corporation|Brand|LocalBusiness/i.test(type)) {
					const n = cleanText(name);
					if (n) orgs.add(n);
				}
			}
		} catch {
			// ignore bad JSON-LD
		}
	});

	return {
		orgs: Array.from(orgs),
		lists: Array.from(lists),
	};
}

/**
 * Simple host equality check used to keep crawls within a single site.
 */
export function sameHost(a, b) {
	try {
		const ua = new URL(a);
		const ub = new URL(b);
		return ua.host === ub.host;
	} catch {
		return false;
	}
}

// ---------- Scoring ----------

export function scoreCandidates($, urlStr, rawNames, knownCompanySet) {
	const result = new Map();

	const add = (name, delta, reason, extra) => {
		const existing = result.get(name) || {
			score: 0,
			reasons: [],
			ext: false,
			detail: false,
			suffix: false,
			schema: false,
			known: false,
			snippets: [],
		};
		existing.score += delta;
		existing.reasons.push(reason);

		if (reason === "ext_link") existing.ext = true;
		if (reason === "detail_page") existing.detail = true;
		if (reason === "suffix_hit") existing.suffix = true;
		if (reason === "schema_org") existing.schema = true;
		if (reason === "known_company") existing.known = true;

		if (extra && extra.snippet && existing.snippets.length < 3) {
			existing.snippets.push(extra.snippet);
		}

		result.set(name, existing);
	};

	const HOST = (() => {
		try {
			return new URL(urlStr).host.toLowerCase();
		} catch {
			return "";
		}
	})();

	const bodyText = cleanText($("body").text() || "").toLowerCase();
	// bodyText is available if you want future features that look at page-wide context

	// Normalize raw names first
	const names = [];
	for (const raw of rawNames || []) {
		const n = cleanText(raw);
		if (!n) continue;
		names.push(n);
	}

	// Base scoring loop
	for (const n of names) {
		// base score
		add(n, 1, "base");

		const lower = n.toLowerCase();

		// negative hints (soft penalties only)
		if (NEGATIVE.has(lower)) {
			add(n, -5, "negative_term");
		}

		// generic nouns / product verbs -> penalty, not hard drop
		if (PRODUCT_OR_VERB.test(n)) add(n, -2, "product_or_verb");

		for (const phrase of NOISE_PHRASES_SET) {
			if (lower.includes(phrase)) {
				add(n, -3, "noise_phrase");
			}
		}

		for (const topic of NOISE_TOPICS_SET) {
			if (lower.includes(topic)) {
				add(n, -2, "noise_topic");
			}
		}

		// known companies: boost
		if (knownCompanySet && knownCompanySet.has(n)) {
			add(n, 4, "known_company");
		}

		// directory-based hints (URL path)
		for (const hint of DIRECTORY_HINTS || []) {
			if (hint.host && HOST && HOST !== hint.host) continue;
			if (hint.pathPrefix && !urlStr.includes(hint.pathPrefix)) continue;
			add(n, hint.boost || 1, "directory_hint");
		}
	}

	// snippets (small, capped) — tie some example text to top candidates
	const want = new Set(names.slice(0, 50));
	$("*:not(:has(*))").each((_, el) => {
		const t = cleanText($(el).text());
		if (!t) return;
		if (!want.has(t)) return;
		const rec = result.get(t);
		if (rec && rec.snippets.length < 2) {
			rec.snippets.push(t.slice(0, 160));
		}
	});

	return result;
}
