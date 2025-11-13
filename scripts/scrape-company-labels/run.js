/** @format */
/**
 * Crawl label sites and extract company names.
 * Input:  /public/data/labels.json   (array of {id, name, source_url, ...})
 * Output: /public/data/company-labels.json (array of { company, labels:[...], evidenceByLabel:{...} })
 * Audit:  /public/data/company-labels.audit.json (why candidates were dropped)
 *
 * Env:
 *   MAX_PAGES=100 DEPTH=3 CONCURRENCY=24 BASE_DELAY_MS=900 JITTER_MS=700
 *   DRY_RUN=0            -> set to 1 to avoid writing outputs
 *   SCORE_THRESHOLD=7    -> raise to get stricter
 *   PER_LABEL_KEEP=500
 *   CLEAR_OUTPUT=1       -> start fresh (recommended if you saw past noise)
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import * as cheerio from "cheerio";
import pLimit from "p-limit";

// Core modular lists
import NEGATIVE_TERMS from "./negative-terms.js";
import SECTION_FILTERS from "./section-filters.js";
import IGNORED_PATHS from "./ignore-paths.js";
import SITE_CONFIGS from "./site-configs.js"; // {} OK

// Noise guards (audit-derived)
import NOISE_PHRASES from "./noise-phrases.js";
import NOISE_PREFIXES from "./noise-prefixes.js";
import NOISE_TOPICS from "./noise-topics.js";

// Split-out lists
import DIRECTORY_HINTS from "./directory-hints.js";
import GENERIC_NOUNS_LIST from "./generic-nouns.js";
import BAD_PLURALS_LIST from "./bad-plurals.js";
import PRODUCT_OR_VERB_TOKENS from "./product-verb-tokens.js";
import SYMBOL_BRAND_ALLOW_LIST from "./symbol-brand-allow.js";

// ---------- Paths ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();

const LABELS_PATH = path.join(ROOT, "public", "data", "labels.json");
const OUTPUT_PATH = path.join(ROOT, "public", "data", "company-labels.json");
const AUDIT_PATH = path.join(ROOT, "public", "data", "company-labels.audit.json");

// ---------- Config ----------
const MAX_PAGES = parseInt(process.env.MAX_PAGES || "100", 10);
const MAX_DEPTH = parseInt(process.env.DEPTH || "3", 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "24", 10);
const BASE_DELAY_MS = parseInt(process.env.BASE_DELAY_MS || "900", 10);
const JITTER_MS = parseInt(process.env.JITTER_MS || "700", 10);
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || "12000", 10);

const RETRIES = 2;
const DRY_RUN = !!process.env.DRY_RUN;
const SCORE_THRESHOLD = parseInt(process.env.SCORE_THRESHOLD || "7", 10);
const PER_LABEL_KEEP = parseInt(process.env.PER_LABEL_KEEP || "500", 10);
const CLEAR_OUTPUT = !!process.env.CLEAR_OUTPUT;

const MIN_SCORE = SCORE_THRESHOLD; // soft threshold per-page
const HARD_MIN_SCORE = SCORE_THRESHOLD + 3; // harder final filter

// Global time limit (minutes) for the whole run
const TIME_LIMIT_MINUTES = parseInt(process.env.TIME_LIMIT_MINUTES || "30", 10);
const DEADLINE = Date.now() + TIME_LIMIT_MINUTES * 60 * 1000;

// Hard cap on unique candidate names per label
const MAX_CANDIDATES_PER_LABEL = parseInt(process.env.MAX_CANDIDATES_PER_LABEL || "2500", 10);

// ---------- Build sets/regex from lists ----------
const STOP_WORDS = new Set(NEGATIVE_TERMS.map((s) => s.trim().toLowerCase()));
const NOISE_EXACT = new Set([...NOISE_PHRASES, ...NOISE_TOPICS].map((s) => s.trim().toLowerCase()));
const NOISE_STARTS = NOISE_PREFIXES.map((s) => s.trim().toLowerCase());

const GENERIC_NOUNS = new Set(GENERIC_NOUNS_LIST.map((s) => s.trim().toLowerCase()));
const BAD_PLURALS = new Set(BAD_PLURALS_LIST.map((s) => s.trim().toLowerCase()));

const PRODUCT_OR_VERB = new RegExp(`\\b(${PRODUCT_OR_VERB_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|")})\\b`, "i");

// Optional allowlist for legit symbolic brands (keep exact casing)
const SYMBOL_BRAND_ALLOW = new Set(SYMBOL_BRAND_ALLOW_LIST);

// Extra audit-driven noise guards
const LANGUAGE_WORDS = new Set([
	"english",
	"spanish",
	"french",
	"german",
	"italian",
	"portuguese",
	"chinese",
	"japanese",
	"korean",
	"arabic",
	"russian",
	"hindi",
	"bengali",
	"urdu",
]);

// phrases like "7 billion tonnes of CO₂"
const METRIC_PHRASE_RE = /\b(billion|million|thousand|tonnes?|tons?|kg|gigatonnes?|megatonnes?|tco2|co₂|co2)\b/i;

// phrases like "As mentioned in the report"
const AS_MENTIONED_PREFIX_RE = /^(as mentioned|as described|as shown|as outlined)\b/i;

// Per-host adaptive backoff multiplier (starts at 1)
const hostPenalty = new Map();

// ---------- Helpers ----------
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const jitter = (base, j) => base + Math.floor(Math.random() * (j + 1));

// Clamp host delay so we don't end up sleeping 8s per request
const delayFor = async (host) => {
	const mult = Math.min(3, hostPenalty.get(host) || 1);
	const wait = Math.round(jitter(BASE_DELAY_MS, JITTER_MS) * mult);
	await sleep(wait);
};

const normalizeText = (s) => (s || "").replace(/\s+/g, " ").trim();

function sameHost(u1, u2) {
	try {
		const a = new URL(u1);
		const b = new URL(u2);
		return a.host === b.host && a.protocol === b.protocol;
	} catch {
		return false;
	}
}

function absolutize(base, href) {
	try {
		return new URL(href, base).toString();
	} catch {
		return null;
	}
}

function isHtmlResponse(resp) {
	const ct = (resp.headers && resp.headers["content-type"]) || "";
	return ct.includes("text/html") || ct.includes("application/xhtml+xml");
}

function shouldIgnorePath(urlStr) {
	let p;
	try {
		p = new URL(urlStr).pathname.toLowerCase();
	} catch {
		return false;
	}
	return IGNORED_PATHS.some((prefix) => p === prefix || p.startsWith(prefix + "/") || p.startsWith(prefix));
}

function stripNoisySections($) {
	for (const sel of SECTION_FILTERS) {
		try {
			$(sel).remove();
		} catch {
			// ignore bad selectors
		}
	}
}

function randomUserAgent() {
	const uas = [
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
	];
	return uas[Math.floor(Math.random() * uas.length)];
}

// ---------- Known companies from previous runs ----------
let KNOWN_COMPANY_SET = new Set(); // lowercase
let KNOWN_COMPANY_CANON = new Map(); // lowercase -> canonical casing

function bootstrapKnownCompanies(existingArr) {
	KNOWN_COMPANY_SET = new Set();
	KNOWN_COMPANY_CANON = new Map();

	if (!Array.isArray(existingArr)) return;

	for (const row of existingArr) {
		if (!row || !row.company) continue;
		const canon = normalizeText(row.company);
		if (!canon) continue;
		const lower = canon.toLowerCase();
		if (!lower) continue;

		// Only seed names that still look like legit companies under current rules
		if (!looksLikeCompany(canon)) continue;

		KNOWN_COMPANY_SET.add(lower);
		if (!KNOWN_COMPANY_CANON.has(lower)) {
			KNOWN_COMPANY_CANON.set(lower, canon);
		}
	}

	if (KNOWN_COMPANY_SET.size) {
		console.log(`[seed] Loaded ${KNOWN_COMPANY_SET.size} known companies from existing company-labels.json`);
	}
}

// Inject known companies that appear in the page text into the candidate list
function injectKnownCompaniesFromHistory($, names) {
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

async function fetchHtml(url, attempt = 0) {
	const headers = {
		"User-Agent": randomUserAgent(),
		Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
		"Cache-Control": "no-cache",
		Pragma: "no-cache",
	};

	const host = new URL(url).host;
	const penalty = Math.min(3, hostPenalty.get(host) || 1);
	const startTime = Date.now();

	if (attempt === 0) {
		console.log(`      [http] GET ${url} (host=${host}, penalty=${penalty.toFixed(2)})`);
	} else {
		console.log(`      [http] RETRY ${attempt} ${url} (host=${host}, penalty=${penalty.toFixed(2)})`);
	}

	try {
		const resp = await axios.get(url, {
			headers,
			maxRedirects: 5,
			timeout: REQUEST_TIMEOUT,
			validateStatus: () => true,
		});

		const dur = Date.now() - startTime;

		if (!isHtmlResponse(resp) || !resp.data) {
			const ct = (resp.headers && resp.headers["content-type"]) || "?";
			console.log(`      [http] ${resp.status} non-HTML/empty (host=${host}, ${dur}ms, ct=${ct})`);
		} else {
			console.log(`      [http] ${resp.status} OK (host=${host}, ${dur}ms)`);
		}

		// Success path
		if (resp.status >= 200 && resp.status < 400 && isHtmlResponse(resp) && resp.data) {
			const cur = hostPenalty.get(host) || 1;
			hostPenalty.set(host, Math.max(1, cur * 0.95)); // cool off on success
			return String(resp.data);
		}

		// Adaptive backoff for throttles (clamped)
		if ([403, 429].includes(resp.status)) {
			const cur = hostPenalty.get(host) || 1;
			const next = Math.min(3, cur * 1.3);
			console.warn(`      [http] throttle status=${resp.status} on host=${host}, bump penalty ${cur.toFixed(2)} -> ${next.toFixed(2)}`);
			hostPenalty.set(host, next);
		}

		if (attempt < RETRIES && [403, 429, 500, 502, 503, 504].includes(resp.status)) {
			const backoff = 800 * (attempt + 1);
			console.log(`      [http] scheduling retry ${attempt + 1} for ${url} after ${backoff}ms`);
			await sleep(backoff);
			return fetchHtml(url, attempt + 1);
		}

		console.warn(`      [http] giving up on ${url} with status ${resp.status}`);
		return null;
	} catch (err) {
		const dur = Date.now() - startTime;
		console.error(`      [http] error on ${url} (attempt=${attempt}, ${dur}ms):`, err?.message || err);

		if (attempt < RETRIES) {
			const backoff = 800 * (attempt + 1);
			console.log(`      [http] scheduling retry ${attempt + 1} for ${url} after ${backoff}ms (error path)`);
			await sleep(backoff);
			return fetchHtml(url, attempt + 1);
		}

		return null;
	}
}

// ---------- Extraction ----------
function extractLinks($, baseUrl) {
	const origin = new URL(baseUrl).origin;
	const out = new Set();

	$("a[href]").each((_, el) => {
		const href = $(el).attr("href");
		if (!href) return;
		const abs = absolutize(baseUrl, href);
		if (!abs) return;
		if (!sameHost(origin, abs)) return;
		if (shouldIgnorePath(abs)) return;
		if (/\.(pdf|jpe?g|png|gif|svg|webp|ico|zip|gz|rar|7z|mp4|mp3|docx?)$/i.test(abs)) return;
		out.add(abs);
	});

	const prioritized = [];
	theOthers: {
	}
	const others = [];

	for (const u of out) {
		const p = new URL(u).pathname.toLowerCase();
		if (DIRECTORY_HINTS.some((h) => p.includes(h))) prioritized.push(u);
		else others.push(u);
	}

	// directory-like URLs first
	return [...prioritized, ...others];
}

function parseJsonLD($) {
	const orgs = [];
	const lists = [];
	$("script[type='application/ld+json']").each((_, el) => {
		const txt = $(el).contents().text();
		try {
			const parsed = JSON.parse(txt);
			const items = Array.isArray(parsed) ? parsed : [parsed];
			for (const it of items) collectLd(it, orgs, lists);
		} catch {
			// ignore parse errors
		}
	});
	return { orgs, lists };
}

function collectLd(node, orgs, lists) {
	if (!node || typeof node !== "object") return;
	const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
	if (types.some((t) => /Organization|LocalBusiness|Brand/i.test(t))) {
		if (node.name) orgs.push(normalizeText(node.name));
	}
	if (types.some((t) => /ItemList/i.test(t)) && Array.isArray(node.itemListElement)) {
		for (const e of node.itemListElement) {
			const v = e?.item?.name || e?.name;
			if (v) lists.push(normalizeText(v));
		}
	}
	for (const k of Object.keys(node)) {
		const v = node[k];
		if (v && typeof v === "object") collectLd(v, orgs, lists);
	}
}

// Heuristic prefilter for “looks like a company-ish string”
const PHONEISH = /^\+?\s*\d[\d\s().\-+]*$/;

function looksLikeCompany(txt) {
	if (!txt) return false;
	const t = normalizeText(txt);
	if (t.length < 2 || t.length > 80) return false;
	const lower = t.toLowerCase();

	// Hard blocks
	if (STOP_WORDS.has(lower)) return false;
	if (NOISE_EXACT.has(lower)) return false;
	if (NOISE_STARTS.some((p) => lower.startsWith(p))) return false;
	if (GENERIC_NOUNS.has(lower)) return false;
	if (BAD_PLURALS.has(lower)) return false;

	// language-only tokens like "English", "Spanish" showing up in menus
	if (LANGUAGE_WORDS.has(lower)) return false;

	// "As mentioned in ..." style fragments
	if (AS_MENTIONED_PREFIX_RE.test(t)) return false;

	// Metric / CO₂ phrases like "7 billion tonnes of CO₂"
	if (/\d/.test(t) && METRIC_PHRASE_RE.test(t)) return false;

	// Block common meta suffixes when the phrase looks like a heading
	if (
		/\b(membership form|products|farmer services|policy and guidelines|full story|privacy policy|award criteria|requirements|faqs?)\b/i.test(
			t
		)
	) {
		return false;
	}

	if (PHONEISH.test(t) || /\d{2,}[-\s)]+/.test(t)) return false;
	if (/^(about|access|according to|all )/i.test(t)) return false;
	if (PRODUCT_OR_VERB.test(t)) return false;

	// obvious non-entities
	if (/^(©|copyright)/i.test(t)) return false;
	if (/^[{}<>]/.test(t)) return false;
	if (!/[a-z]/i.test(t)) return false;

	// block lower-case sentences and very long phrases (likely headings)
	const tokens = t.split(/\s+/);
	if (tokens.length > 5) return false;
	const isAllLower = t === t.toLowerCase();
	if (isAllLower) return false;

	// symbol-leading unless allowlisted
	if (/^[&+\-]/.test(t) && !SYMBOL_BRAND_ALLOW.has(t)) return false;

	// Brand/company shape
	const titleLike = /^[A-Z][A-Za-z0-9&\-\.'() ]+[A-Za-z0-9)]$/.test(t);
	const allCapsShort = /^[A-Z0-9&\-\.]{2,30}$/.test(t);
	const suffixHit =
		/\b(Inc|Incorporated|LLC|Ltd|Limited|AG|GmbH|S\.?A\.?|Co\.?|Company|Corporation|PLC|LLP|NV|BV|OY|Spa|S\.p\.A|AB|AS|SRL|SAS|SA|KK)\b\.?/i.test(
			t
		);

	return suffixHit || allCapsShort || titleLike;
}

// One-time plausibility filter for existing company-labels.json rows
function isPlausibleCompanyRow(row) {
	if (!row || !row.company) return false;
	const canon = normalizeText(row.company);
	if (!canon) return false;
	if (!looksLikeCompany(canon)) return false;
	return true;
}

function extractCompaniesGeneric($) {
	const candidates = new Set();
	const selectors = [
		"ul li",
		"ol li",
		"table td",
		".brand, .brands, .company, .companies, .member, .members, .licensee, .licensees",
		"a",
		"h3, h4, h5",
	];

	$(selectors.join(",")).each((_, el) => {
		const tt = normalizeText($(el).text());
		if (looksLikeCompany(tt)) candidates.add(tt);
	});

	$("a[title], a[aria-label]").each((_, el) => {
		const tt = normalizeText($(el).attr("title") || $(el).attr("aria-label") || "");
		if (looksLikeCompany(tt)) candidates.add(tt);
	});

	// clean end decorations
	const cleaned = new Set();
	for (const c of candidates) {
		const v = c.replace(/\s*(\||–|—).+$/, "");
		if (looksLikeCompany(v)) cleaned.add(v);
	}
	return Array.from(cleaned);
}

function extractCompaniesPerSite($, hostname) {
	const cfg = SITE_CONFIGS[hostname];
	if (!cfg) return null;
	const names = new Set();
	try {
		const { listSelector, itemSelector, nameSelector } = cfg;
		const scope = listSelector ? $(listSelector) : $;
		const items = itemSelector ? scope.find(itemSelector) : scope.find(nameSelector);

		items.each((_, el) => {
			const t = nameSelector ? normalizeText($(el).find(nameSelector).text()) : normalizeText($(el).text());
			if (looksLikeCompany(t)) names.add(t);
		});

		return Array.from(names);
	} catch {
		return null;
	}
}

/**
 * Score a bunch of candidate names on a single page.
 * Returns Map(name -> { score, reasons[], urls:Set, ext, detail, suffix, schema, known, snippets[] })
 */
function scoreCandidates($, baseUrl, rawNames) {
	const pagePath = new URL(baseUrl).pathname.toLowerCase();

	const headingText = $("h1,h2,h3,h4").text();
	const hasDirHeading = /(brands?|members?|retailers?|partners?|licensee?s?|approved|where to buy|brand directory|company directory)/i.test(
		headingText
	);
	const pageDirLike = DIRECTORY_HINTS.some((h) => pagePath.includes(h));
	const baseDirBoost = (pageDirLike ? 1 : 0) + (hasDirHeading ? 1 : 0);

	// link context
	const externalNames = new Set();
	const detailNames = new Set();

	$("a[href]").each((_, el) => {
		const text = normalizeText($(el).text());
		if (!looksLikeCompany(text)) return;
		const abs = absolutize(baseUrl, $(el).attr("href"));
		if (!abs) return;
		if (!sameHost(baseUrl, abs)) {
			externalNames.add(text);
		} else {
			const path = new URL(abs).pathname.toLowerCase();
			if (/\/(member|company|brand|licensee)[\/-]/.test(path)) {
				detailNames.add(text);
			}
		}
	});

	const result = new Map();
	const add = (name, delta, reason, url) => {
		if (!result.has(name)) {
			result.set(name, {
				score: 0,
				reasons: [],
				urls: new Set(),
				ext: false,
				detail: false,
				suffix: false,
				schema: false,
				known: false,
				snippets: [],
			});
		}
		const r = result.get(name);
		r.score += delta;
		r.reasons.push(reason);
		if (url) r.urls.add(url);
	};

	const hasSuffix = (n) =>
		/\b(Inc|Incorporated|LLC|Ltd|Limited|AG|GmbH|S\.?A\.?|Co\.?|Company|Corporation|PLC|LLP|NV|BV|OY|Spa|S\.p\.A|AB|AS|SRL|SAS|SA|KK)\b\.?/i.test(
			n
		);

	for (const n of rawNames) {
		add(n, baseDirBoost, pageDirLike ? "directory_like_url" : hasDirHeading ? "directory_heading" : "base", baseUrl);
		const r = result.get(n);

		const lower = n.toLowerCase();
		const isKnown = KNOWN_COMPANY_SET.size > 0 && KNOWN_COMPANY_SET.has(lower);

		if (isKnown) {
			add(n, 8, "known_company_from_history", baseUrl);
			r.known = true;
		}

		if (externalNames.has(n)) {
			add(n, 2, "external_link_anchor", baseUrl);
			r.ext = true;
		}
		if (detailNames.has(n)) {
			add(n, 1, "internal_detail_page", baseUrl);
			r.detail = true;
		}
		if (hasSuffix(n)) {
			r.suffix = true;
			add(n, 1, "company_suffix", baseUrl);
		}

		// penalties
		if (NOISE_EXACT.has(lower)) add(n, -6, "noise_exact", baseUrl);
		if (NOISE_STARTS.some((p) => lower.startsWith(p))) add(n, -4, "noise_prefix", baseUrl);
		if (GENERIC_NOUNS.has(lower)) add(n, -6, "generic_noun", baseUrl);
		if (BAD_PLURALS.has(lower)) add(n, -5, "bad_plural", baseUrl);
		if (PHONEISH.test(n) || /\d{2,}[-\s)]+/.test(n)) add(n, -8, "phone_pattern", baseUrl);
		if (PRODUCT_OR_VERB.test(n)) add(n, -4, "product_or_verb", baseUrl);
		if (/^(about|access|document|portal|application|privacy|terms|press|news|events|careers)\b/i.test(n)) add(n, -6, "menuish", baseUrl);
		if (/^[&+\-]/.test(n) && !SYMBOL_BRAND_ALLOW.has(n)) add(n, -3, "symbol_leading", baseUrl);
	}

	// snippets (small, capped)
	const want = new Set(rawNames.slice(0, 50));
	$("*:not(:has(*))").each((_, el) => {
		const t = normalizeText($(el).text());
		if (!want.has(t)) return;
		const rec = result.get(t);
		if (rec && rec.snippets.length < 2) {
			rec.snippets.push(t.slice(0, 160));
		}
	});

	return result;
}

// ---------- Crawl ----------
async function crawlLabel(startUrl, opts) {
	const { maxPages, maxDepth, seeds: extraSeeds } = opts || {};
	const origin = new URL(startUrl).origin;
	const hostname = new URL(startUrl).host;

	const seeds = new Set([startUrl]);
	for (const hint of DIRECTORY_HINTS) {
		try {
			const u = new URL(hint, origin).toString();
			if (!shouldIgnorePath(u)) seeds.add(u);
		} catch {
			// ignore bad URLs from hints
		}
	}

	// Optional per-label seeds from labels.json (seed_urls)
	if (Array.isArray(extraSeeds)) {
		for (const hint of extraSeeds) {
			if (!hint) continue;
			try {
				const u = new URL(hint, origin).toString();
				// keep it anchored to the same host as the base URL
				if (!sameHost(startUrl, u)) continue;
				if (!shouldIgnorePath(u)) seeds.add(u);
			} catch {
				// ignore bad URLs from label seed_urls
			}
		}
	}

	const queue = [];
	const enqueued = new Set();

	for (const s of seeds) {
		if (!enqueued.has(s)) {
			queue.push({ url: s, depth: 0 });
			enqueued.add(s);
		}
	}

	const visited = new Set();
	const agg = new Map(); // name -> { totalScore, reasons[], urls Set, pages Set, flags, known, snippets }
	const dropped = [];
	let pagesCrawled = 0;
	let cursor = 0;

	while (cursor < queue.length && pagesCrawled < maxPages) {
		// Global time limit for the whole run
		if (Date.now() > DEADLINE) {
			console.log("  [STOP] Global time limit reached, stopping crawl for this label.");
			break;
		}

		const { url, depth } = queue[cursor++];
		if (visited.has(url)) continue;
		if (shouldIgnorePath(url)) continue;
		visited.add(url);

		const host = new URL(url).host;
		const penalty = Math.min(3, hostPenalty.get(host) || 1);
		const remaining = queue.length - cursor;

		console.log(
			`  ↳ [${pagesCrawled + 1}/${maxPages}] depth=${depth} host=${host} penalty=${penalty.toFixed(2)} remaining=${remaining} GET ${url}`
		);

		await delayFor(host);

		const html = await fetchHtml(url);
		if (!html) continue;

		pagesCrawled++;
		const $ = cheerio.load(html);
		stripNoisySections($);

		// Schema.org
		const { orgs: ldOrgs, lists: ldList } = parseJsonLD($);
		const ldSet = new Set([...ldOrgs, ...ldList]);

		// Per-site or generic
		let names = extractCompaniesPerSite($, hostname);
		if (!names || names.length === 0) {
			names = extractCompaniesGeneric($);
		}

		// Merge with schema names
		let mergedNames = Array.from(new Set([...names, ...ldSet]));

		// Also inject previously-confirmed companies that show up in the page body
		mergedNames = injectKnownCompaniesFromHistory($, mergedNames);

		if (mergedNames.length > 0) {
			// Score all candidates on this page in one shot
			const scoredMap = scoreCandidates($, url, mergedNames);

			for (const [name, info] of scoredMap.entries()) {
				// quick per-page filter: if it's garbage and has no strong signal, drop
				const hasStrongSignal = info.ext || info.detail || info.suffix || info.schema || info.known;

				if (info.score < MIN_SCORE && !hasStrongSignal) {
					dropped.push({
						name,
						url,
						reason: "failed_score_filter",
						score: info.score,
					});
					continue;
				}

				if (!agg.has(name)) {
					agg.set(name, {
						totalScore: 0,
						reasons: [],
						urls: new Set(),
						pages: new Set(),
						flags: {
							ext: false,
							detail: false,
							suffix: false,
							schema: false,
						},
						known: false,
						snippets: [],
					});
				}

				const rec = agg.get(name);
				rec.totalScore += info.score;
				for (const rs of info.reasons) rec.reasons.push(rs);
				if (info.urls) {
					for (const u of info.urls) rec.urls.add(u);
				}
				rec.pages.add(url);
				rec.flags.ext = rec.flags.ext || !!info.ext;
				rec.flags.detail = rec.flags.detail || !!info.detail;
				rec.flags.suffix = rec.flags.suffix || !!info.suffix;
				rec.flags.schema = rec.flags.schema || !!info.schema;
				rec.known = rec.known || !!info.known;

				if (info.snippets) {
					for (const sn of info.snippets) {
						if (rec.snippets.length < 5) {
							rec.snippets.push(sn);
						}
					}
				}
			}

			// If this label is already saturated with candidates, bail early
			if (agg.size >= MAX_CANDIDATES_PER_LABEL) {
				console.log(`  [STOP] Reached MAX_CANDIDATES_PER_LABEL=${MAX_CANDIDATES_PER_LABEL} for ${hostname}, stopping label crawl.`);
				break;
			}
		}

		// Enqueue further links
		if (depth < maxDepth && pagesCrawled < maxPages) {
			const links = extractLinks($, url);
			for (const next of links) {
				if (!sameHost(startUrl, next)) continue;
				if (shouldIgnorePath(next)) continue;
				if (visited.has(next) || enqueued.has(next)) continue;
				enqueued.add(next);
				queue.push({ url: next, depth: depth + 1 });
			}
		}
	}

	// Collapse agg into a sorted list with final scores
	const kept = [];

	for (const [name, rec] of agg.entries()) {
		const pageCount = rec.pages.size;
		const strongSignal = rec.flags.ext || rec.flags.detail || rec.flags.suffix || rec.flags.schema || rec.known;

		const baseScore = rec.totalScore;
		const diversityBoost = Math.log2(1 + pageCount);

		let finalScore = baseScore * diversityBoost;
		if (!strongSignal) {
			finalScore *= 0.4;
		}

		// Be kinder to companies we've already confirmed historically
		if ((!rec.known && finalScore < MIN_SCORE) || (!strongSignal && finalScore < HARD_MIN_SCORE)) {
			dropped.push({
				name,
				score: finalScore,
				pagesSeen: pageCount,
				droppedBecause: "below_threshold",
				sampleReasons: rec.reasons.slice(0, 5),
			});
		} else {
			kept.push({
				company: name,
				evidence: {
					score: finalScore,
					pagesSeen: pageCount,
					urls: Array.from(rec.urls),
					flags: rec.flags,
					reasons: rec.reasons.slice(0, 10),
					snippets: rec.snippets.slice(0, 5),
				},
			});
		}
	}

	kept.sort((a, b) => b.evidence.score - a.evidence.score || a.company.localeCompare(b.company));

	const keptTrimmed = kept.slice(0, PER_LABEL_KEEP);

	return {
		pagesCrawled,
		kept: keptTrimmed,
		droppedSample: dropped.slice(0, 200),
	};
}

// ---------- IO ----------
async function loadJson(p, fallback) {
	try {
		const buf = await fs.readFile(p, "utf8");
		return JSON.parse(buf);
	} catch {
		return fallback;
	}
}

function mergeCompanyLabels(existingArr, labelId, keptWithEvidence) {
	const map = new Map(); // company -> { labels:Set, evidenceByLabel:{} }

	if (Array.isArray(existingArr)) {
		for (const row of existingArr) {
			if (!row || !row.company) continue;
			map.set(row.company, {
				labels: new Set(Array.isArray(row.labels) ? row.labels : []),
				evidenceByLabel: row.evidenceByLabel || {},
			});
		}
	}

	for (const item of keptWithEvidence) {
		const { company, evidence } = item;
		if (!map.has(company)) {
			map.set(company, {
				labels: new Set(),
				evidenceByLabel: {},
			});
		}
		const rec = map.get(company);
		rec.labels.add(labelId);
		rec.evidenceByLabel[labelId] = rec.evidenceByLabel[labelId] || [];
		if (rec.evidenceByLabel[labelId].length < 3) {
			rec.evidenceByLabel[labelId].push(evidence);
		}
	}

	const out = Array.from(map.entries()).map(([company, rec]) => ({
		company,
		labels: Array.from(rec.labels).sort(),
		evidenceByLabel: rec.evidenceByLabel,
	}));

	out.sort((a, b) => a.company.localeCompare(b.company));

	return out;
}

// ---------- Main ----------
(async () => {
	const limit = pLimit(CONCURRENCY);

	const labels = await loadJson(LABELS_PATH, []);
	if (!Array.isArray(labels) || labels.length === 0) {
		console.error("No labels loaded. Check /public/data/labels.json");
		process.exit(1);
	}

	const existingCompanyLabelsRaw = await loadJson(OUTPUT_PATH, []);

	// Clean existing company-labels.json rows using current heuristics
	const existingCompanyLabels = Array.isArray(existingCompanyLabelsRaw)
		? existingCompanyLabelsRaw.filter((row) => isPlausibleCompanyRow(row))
		: [];

	if (Array.isArray(existingCompanyLabelsRaw) && existingCompanyLabels.length !== existingCompanyLabelsRaw.length) {
		console.log(`[clean] Filtered existing company-labels.json: ${existingCompanyLabelsRaw.length} -> ${existingCompanyLabels.length}`);
	}

	// Use cleaned existing list as seed of "known good" companies unless we're explicitly nuking output
	if (!CLEAR_OUTPUT && Array.isArray(existingCompanyLabels) && existingCompanyLabels.length) {
		bootstrapKnownCompanies(existingCompanyLabels);
	}

	let companyLabels = CLEAR_OUTPUT ? [] : existingCompanyLabels;

	const auditAll = [];

	console.log(`Loaded ${labels.length} labels from ${LABELS_PATH}`);
	console.log(`Output → ${OUTPUT_PATH}`);
	console.log(`Audit  → ${AUDIT_PATH}`);
	console.log(
		`Limits: pages/label=${MAX_PAGES}, depth=${MAX_DEPTH}, concurrency=${CONCURRENCY}, threshold=${SCORE_THRESHOLD}, clear=${CLEAR_OUTPUT}`
	);
	console.log(
		`Timeouts: request=${REQUEST_TIMEOUT}ms, time_limit=${TIME_LIMIT_MINUTES}min, max_candidates_per_label=${MAX_CANDIDATES_PER_LABEL}\n`
	);

	const tasks = labels.map((label) =>
		limit(async () => {
			const { id, name, source_url, seed_urls } = label || {};
			if (!id || !source_url) return;

			const seeds = Array.isArray(seed_urls) ? seed_urls.filter(Boolean) : [];

			console.log(`\n=== Label: ${name || id} (${id}) ===`);
			console.log(`Start URL: ${source_url}`);
			if (seeds.length) {
				console.log("Seed URLs:");
				for (const s of seeds) console.log(`  - ${s}`);
			} else {
				console.log("Seed URLs: (none)");
			}

			try {
				const { pagesCrawled, kept, droppedSample } = await crawlLabel(source_url, {
					maxPages: MAX_PAGES,
					maxDepth: MAX_DEPTH,
					seeds,
				});

				console.log(`Pages: ${pagesCrawled} | kept: ${kept.length} | dropped(sample): ${droppedSample.length}`);

				if (kept.length > 0 && !DRY_RUN) {
					companyLabels = mergeCompanyLabels(companyLabels, id, kept);
					await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

					const tmp = OUTPUT_PATH + ".tmp";
					await fs.writeFile(tmp, JSON.stringify(companyLabels, null, 2), "utf8");
					await fs.rename(tmp, OUTPUT_PATH);
					console.log(`Merged & wrote → ${OUTPUT_PATH}`);
				}

				auditAll.push({
					labelId: id,
					name,
					pagesCrawled,
					keptPreview: kept.slice(0, 10),
					droppedSample,
				});
			} catch (err) {
				console.error(`Error crawling ${id}:`, err?.message || err);
				auditAll.push({
					labelId: id,
					error: String(err?.message || err),
				});
			}
		})
	);

	await Promise.all(tasks);

	try {
		await fs.mkdir(path.dirname(AUDIT_PATH), { recursive: true });
		const tmpA = AUDIT_PATH + ".tmp";
		await fs.writeFile(tmpA, JSON.stringify(auditAll, null, 2), "utf8");
		await fs.rename(tmpA, AUDIT_PATH);
	} catch (e) {
		console.error("Failed writing audit file:", e?.message || e);
	}

	console.log("\nDone.");
})();
