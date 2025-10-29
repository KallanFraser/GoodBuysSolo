#!/usr/bin/env node
/**
 * GoodBuys Scraper (v0.4)
 * - Inputs: /public/data/big-brands.json (+ products.json manufacturers + extra-brands.csv)
 * - Aliases: explicit + auto (diacritics, common shorthands)
 * - Adapters: b-corp, rainforest-alliance, oeko-tex, gots, fsc,
 *             fair-wear, better-cotton, lwg, bluesign, sa8000,
 *             certified-vegan, bpi-compostable, animal-welfare-approved,
 *             bap, energy-star, green-seal, carbon-trust
 * - Evidence-based matches with audit file
 * - Pagination, HTTP cache, concurrency, fuzzy fallback, optional headless
 *
 * CLI:
 *   --brand "Nike"
 *   --labels b-corp,gots,fsc
 *   --dry-run
 *   --clear-cache
 *   --max-pages 5
 *   --headless            (uses Playwright when needed)
 *
 * Output:
 *   /public/data/manufacturer-labels.json  (schema unchanged)
 *   /public/data/manufacturer-labels-audit.json  (append-only evidence log)
 *
 * @format
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import Fuse from "fuse.js";
import pLimit from "p-limit";

// __filename / __dirname helpers for ESM.
// ROOT is the project root (one level up from this script).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");

// ----------------------- Paths
// Centralized file paths so everything reads/writes in one place.
const DATA_DIR = path.join(ROOT, "public", "data");
const OUT_PATH = path.join(DATA_DIR, "manufacturer-labels.json"); // main output (normalized)
const AUDIT_PATH = path.join(DATA_DIR, "manufacturer-labels-audit.json"); // evidence log (append-only)
const BIG_BRANDS_PATH = path.join(DATA_DIR, "big-brands.json"); // seed brands list
const ALIASES_PATH = path.join(DATA_DIR, "brand-aliases.json"); // manual alias overrides
const SLUGS_PATH = path.join(DATA_DIR, "label-slugs.json"); // known direct slugs per label
const MANUAL_PATH = path.join(DATA_DIR, "manual-manufacturer-labels.json"); // curated truths to merge last
const PRODUCTS_PATH = path.join(DATA_DIR, "products.json"); // optional          // pull manufacturers from products
const EXTRA_BRANDS_CSV = path.join(DATA_DIR, "extra-brands.csv"); // optional    // quick CSV add-in for brands

// Lightweight on-disk HTTP cache to avoid hammering sites.
const CACHE_DIR = path.join(__dirname, ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "http-cache.json");

// ----------------------- Config
// Custom UA to be polite; helps sites understand who’s calling.
const UA = "GoodBuys-Scraper/0.4 (+https://goodbuys.info)";

// ----------------------- CLI flags
// Parse flags via regex—simple and dependency-free.
// Example: --brand "Nike" --labels b-corp,gots --dry-run --max-pages 5 --headless
const argv = process.argv.slice(2).join(" ");
const FLAG_BRAND = /--brand\s+"?([^"]+)"?/i.exec(argv)?.[1] || null;
const DRY_RUN = /--dry-run/i.test(argv);
const CLEAR_CACHE = /--clear-cache/i.test(argv);
const HEADLESS = /--headless/i.test(argv);
const LABELS_FILTER =
	/--labels\s+([a-z0-9\-,]+)/i
		.exec(argv)?.[1]
		?.split(",")
		?.map((s) => s.trim().toLowerCase()) || null;
const MAX_PAGES = parseInt(/--max-pages\s+(\d+)/i.exec(argv)?.[1] || "3", 10);

// ----------------------- Utils
// Sleep utility to be nice to servers and pace requests.
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
// Ensure a directory exists (mkdir -p vibes).
const ensureDir = (p) => {
	if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

// Normalize a brand/manufacturer name for comparison:
// - lowercase
// - strip diacritics/symbol noise (keeps letters/numbers/&/.-)
// - collapse spaces
function normalizeName(s) {
	return (s || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^\p{L}\p{N}\s&.-]/gu, "")
		.replace(/\s+/g, " ")
		.trim();
}
// Build a word-boundary regex for exact-ish matching of a name inside text/URLs.
function wordBoundaryRe(name) {
	const n = normalizeName(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`\\b${n}\\b`, "i");
}

// Generate auto-aliases for common brand patterns (P&G, Nestlé, L'Oréal, H&M).
// This catches different spellings/diacritics users or sites may use.
function autoAliases(name) {
	const n = normalizeName(name);
	const out = new Set([name, name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")]);
	if (/\bprocter\b.*\bgamble\b/.test(n)) out.add("P&G").add("Procter & Gamble").add("Procter and Gamble");
	if (/\bnestle\b/.test(n)) out.add("Nestlé").add("Nestle SA").add("Nestle S.A.");
	if (/\bloreal\b/.test(n) || /\bl'oréal\b/.test(n)) out.add("L'Oreal").add("L’Oréal");
	if (/\bh&m\b/.test(n)) out.add("H and M").add("HM").add("H & M");
	return [...out];
}
// Full alias list = raw name + explicit aliases from file + autoAliases above.
// Returns unique list, preserves original user-facing variants.
function namesFor(brandName, aliasesMap) {
	const base = normalizeName(brandName);
	const explicit = aliasesMap[base] || [];
	return Array.from(new Set([brandName, ...explicit, ...autoAliases(brandName)]));
}
// Deduplicate array of objects by key (last write wins).
function uniqBy(arr, key) {
	const m = new Map();
	for (const x of arr) m.set(x[key], x);
	return [...m.values()];
}

// ----------------------- Cache
// In-memory HTTP cache, persisted to disk so re-runs don’t redo network work.
let HTTP_CACHE = {};
function loadCache() {
	ensureDir(CACHE_DIR);
	if (CLEAR_CACHE && fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
	if (fs.existsSync(CACHE_FILE)) {
		try {
			HTTP_CACHE = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) || {};
		} catch {
			HTTP_CACHE = {};
		}
	}
}
function saveCache() {
	ensureDir(CACHE_DIR);
	fs.writeFileSync(CACHE_FILE, JSON.stringify(HTTP_CACHE, null, 2), "utf8");
}
// Fetch with caching (text-only). Keeps status/ok/text so callers can decide.
async function cachedGet(url) {
	if (HTTP_CACHE[url]) return HTTP_CACHE[url];
	const res = await fetch(url, { headers: { "User-Agent": UA } });
	const text = await res.text();
	const obj = { ok: res.ok, status: res.status, text };
	HTTP_CACHE[url] = obj;
	return obj;
}

// Optional headless for JS-rendered pages (only if --headless)
// Uses Playwright to load dynamic content that plain fetch can’t see.
async function headlessGet(url) {
	if (!HEADLESS) return { ok: false, status: 0, text: "" };
	const { chromium } = await import("playwright");
	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({ userAgent: UA });
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
	await page.waitForTimeout(1200); // small settle delay for late DOM updates
	const html = await page.content();
	await browser.close();
	return { ok: true, status: 200, text: html };
}

// ----------------------- IO
// Safe JSON loader with fallback (no crash on missing/invalid files).
function loadJson(p, fallback) {
	try {
		return JSON.parse(fs.readFileSync(p, "utf8"));
	} catch {
		return fallback;
	}
}
// If output exists, load it so we can upsert into it; else start empty.
function loadExisting() {
	return fs.existsSync(OUT_PATH) ? loadJson(OUT_PATH, []) : [];
}
// Write the normalized rows to disk (unless dry-run). Sorted for stable diffs.
function writeOut(rows) {
	if (DRY_RUN) {
		console.log("💡 dry-run: NOT writing to", OUT_PATH);
		return;
	}
	ensureDir(DATA_DIR);
	const sorted = [...rows].sort((a, b) => a.manufacturer_name.localeCompare(b.manufacturer_name));
	fs.writeFileSync(OUT_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf8");
	console.log(`✅ Updated ${OUT_PATH} (${sorted.length} rows)`);
}
// Append audit entries (evidence log). Never delete, only grow.
function appendAudit(entries) {
	const prev = fs.existsSync(AUDIT_PATH) ? loadJson(AUDIT_PATH, []) : [];
	const out = prev.concat(entries);
	fs.writeFileSync(AUDIT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
}
// Insert or update a manufacturer row and ensure label_ids contains id exactly once.
function upsert(rows, { manufacturer_id, manufacturer_name, label_id }) {
	let row = rows.find((r) => r.manufacturer_id === manufacturer_id);
	if (!row) {
		row = { manufacturer_id, manufacturer_name, label_ids: [] };
		rows.push(row);
	}
	if (!row.manufacturer_name) row.manufacturer_name = manufacturer_name;
	if (!row.label_ids.includes(label_id)) row.label_ids.push(label_id);
}

// Pull extra brands from products.json and CSV
// From products.json: collapse products -> unique manufacturers by id.
function loadProductsManufacturers() {
	if (!fs.existsSync(PRODUCTS_PATH)) return [];
	try {
		const products = JSON.parse(fs.readFileSync(PRODUCTS_PATH, "utf8"));
		const map = new Map();
		for (const p of products) {
			if (p.manufacturer_id && p.manufacturer_name) {
				map.set(p.manufacturer_id, { manufacturer_id: p.manufacturer_id, name: p.manufacturer_name });
			}
		}
		return [...map.values()];
	} catch {
		return [];
	}
}
// From extra-brands.csv: support two formats
//   "id,name"  or just "name" (auto id as "m-{slug}")
function loadExtraBrandsCSV() {
	if (!fs.existsSync(EXTRA_BRANDS_CSV)) return [];
	const raw = fs.readFileSync(EXTRA_BRANDS_CSV, "utf8");
	return raw
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean)
		.map((line) => {
			const [a, b] = line.split(",").map((x) => (x || "").trim());
			if (b) return { manufacturer_id: a, name: b };
			const id = "m-" + normalizeName(a).replace(/\s+/g, "-");
			return { manufacturer_id: id, name: a };
		});
}

// ----------------------- Generic scanners
// scanPagesForAliases: exact-ish brand name detection in common text/link tags.
// Returns first matching evidence URLs (prioritized by page order) to prove membership.
async function scanPagesForAliases(pages, aliases) {
	const evidences = [];
	for (const name of aliases) {
		const re = wordBoundaryRe(name);
		for (const url of pages) {
			let r = await cachedGet(url);
			if (!r.ok && HEADLESS) r = await headlessGet(url);
			if (!r.ok) continue;

			const $ = cheerio.load(r.text);
			$("a[href], h1, h2, h3, h4, p, li").each((_, el) => {
				const text = ($(el).text() || "").trim();
				const href = $(el).attr("href") || "";
				// Try both on-screen text and href (with dashes converted) to catch sluggy matches.
				if (re.test(text) || re.test(href.replace(/-/g, " "))) {
					try {
						evidences.push(new URL(href || url, url).toString());
					} catch {
						evidences.push(url);
					}
				}
			});
			if (evidences.length) break; // stop early once we have a hit for this alias
			await sleep(150); // be polite
		}
		if (evidences.length) break; // stop once any alias hits
	}
	return evidences;
}

// fuzzyCandidates: build a token corpus from the page and fuse-search for near matches.
// Useful when sites list names with weird punctuation/casing/partials.
function fuzzyCandidates(text, aliases) {
	const corpus = text
		.replace(/\s+/g, " ")
		.split(/[><"'\/\[\]\(\)\|,;:]+/)
		.map((s) => s.trim())
		.filter((s) => s.length >= 3 && s.length <= 80);

	const fuse = new Fuse([...new Set(corpus)], {
		includeScore: true,
		threshold: 0.3, // stricter match; lower is stricter
	});

	const out = new Set();
	for (const name of aliases) {
		const hits = fuse.search(name);
		for (const h of hits.slice(0, 5)) out.add(h.item);
	}
	return [...out];
}
// scanPagesFuzzyThenConfirm: fuzz to find candidates, then confirm with strict word-boundary checks.
// Returns a URL as evidence if any candidate actually matches a real alias by regex.
async function scanPagesFuzzyThenConfirm(pages, aliases) {
	const evidences = [];
	for (const url of pages) {
		let r = await cachedGet(url);
		if (!r.ok && HEADLESS) r = await headlessGet(url);
		if (!r.ok) continue;

		const fuzz = fuzzyCandidates(r.text, aliases);
		if (!fuzz.length) continue;

		for (const cand of fuzz) {
			for (const alias of aliases) {
				const re = wordBoundaryRe(alias);
				if (re.test(cand)) evidences.push(url);
			}
		}
		if (evidences.length) break; // one good evidence is enough
	}
	return evidences;
}

// ----------------------- Adapters (return {ok:boolean, evidences:string[]})
// Each adapter knows how/where to look for a label’s member/partner listings.
// They aim to produce at least one convincing URL as "evidence".

// B Corp: search both the directory and the site search; fall back to known slugs.
async function checkBCorp(_brand, aliases, slugs) {
	const evidences = [];
	const searchBase = "https://www.bcorporation.net/en-us/find-a-b-corp/?search=";
	const siteBase = "https://www.bcorporation.net/en-us/?s=";

	const scan = (html, base, re) => {
		const $ = cheerio.load(html);
		$("a[href]").each((_, el) => {
			const href = $(el).attr("href") || "";
			const text = ($(el).text() || "").trim();
			if (
				/\/en-us\/find-a-b-corp\/company\/[^/]+\/?$/i.test(href) &&
				(re.test(text) || re.test(href.replace(/-/g, " ")))
			) {
				try {
					evidences.push(new URL(href, base).toString());
				} catch {}
			}
		});
	};

	for (const name of aliases) {
		const re = wordBoundaryRe(name);
		const q = encodeURIComponent(name);

		let r1 = await cachedGet(`${searchBase}${q}`);
		if (!r1.ok && HEADLESS) r1 = await headlessGet(`${searchBase}${q}`);
		if (r1.ok) scan(r1.text, searchBase, re);
		if (evidences.length) break;

		let r2 = await cachedGet(`${siteBase}${q}`);
		if (!r2.ok && HEADLESS) r2 = await headlessGet(`${siteBase}${q}`);
		if (r2.ok) scan(r2.text, siteBase, re);
		if (evidences.length) break;

		// known slug fallback
		const key = normalizeName(name);
		const slugList = (slugs["b-corp"] || {})[key] || [];
		if (slugList.length) evidences.push(...slugList);
		if (evidences.length) break;
	}
	return { ok: evidences.length > 0, evidences };
}

// The rest follow a common pattern:
// 1) define listing pages (support pagination via MAX_PAGES when possible)
// 2) try exact-ish matches; if nothing, try fuzzy+confirm
async function checkRainforestAlliance(_b, aliases) {
	const pages = Array.from({ length: MAX_PAGES }, (_, i) =>
		i === 0
			? "https://www.rainforest-alliance.org/find-certified/"
			: `https://www.rainforest-alliance.org/find-certified/page/${i + 1}/`
	);
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}

async function checkOekoTex(_b, aliases) {
	const pages = Array.from({ length: MAX_PAGES }, (_, i) =>
		i === 0
			? "https://www.oeko-tex.com/en/buying-guide"
			: `https://www.oeko-tex.com/en/buying-guide?page=${i + 1}`
	);
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}

async function checkGOTS(_b, aliases) {
	const pages = Array.from({ length: MAX_PAGES }, (_, i) =>
		i === 0
			? "https://global-standard.org/find-suppliers"
			: `https://global-standard.org/find-suppliers?page=${i + 1}`
	);
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}

async function checkFSC(_b, aliases) {
	const pages = Array.from({ length: MAX_PAGES }, (_, i) =>
		i === 0 ? "https://www.fsc.org/en/newsfeed" : `https://www.fsc.org/en/newsfeed?page=${i + 1}`
	);
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}

async function checkFairWear(_b, aliases) {
	const pages = ["https://www.fairwear.org/brands"];
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}
async function checkBetterCotton(_b, aliases) {
	const pages = ["https://bettercotton.org/who-we-are/our-membership/members/"];
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}
async function checkLWG(_b, aliases) {
	const pages = [
		"https://www.leatherworkinggroup.com/members/",
		"https://www.leatherworkinggroup.com/news/",
	];
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}
async function checkBluesign(_b, aliases) {
	const pages = ["https://www.bluesign.com/en/brands", "https://www.bluesign.com/en/partners"];
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}
async function checkSA8000(_b, aliases) {
	const pages = ["https://sa-intl.org/sa8000-certified-organizations/"];
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}
async function checkCertifiedVegan(_b, aliases) {
	const pages = ["https://vegan.org/companies-using-our-logo/"];
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}
async function checkBPI(_b, aliases) {
	const pages = ["https://bpiworld.org/Certified-Companies", "https://products.bpiworld.org/companies"];
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}
async function checkAnimalWelfareApproved(_b, aliases) {
	const pages = [
		"https://agreenerworld.org/certifications/animal-welfare-approved/",
		"https://directory.certifiedbyagw.com/",
	];
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}
async function checkBAP(_b, aliases) {
	const pages = ["https://www.bapcertification.org/Marketplace"];
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}
async function checkEnergyStar(_b, aliases) {
	const pages = ["https://www.energystar.gov/partner_resources"];
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}
async function checkGreenSeal(_b, aliases) {
	const pages = ["https://certified.greenseal.org/"];
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}
async function checkCarbonTrust(_b, aliases) {
	const pages = [
		"https://www.carbontrust.com/what-we-do/assurance-and-certification",
		"https://www.carbontrust.com/resources",
	];
	let evidences = await scanPagesForAliases(pages, aliases);
	if (!evidences.length) evidences = await scanPagesFuzzyThenConfirm(pages, aliases);
	return { ok: evidences.length > 0, evidences };
}

// ----------------------- Registry
// Master list of labels we support. Each has:
// - id: stable key used in output
// - human: display name for logs
// - check: adapter function
const ADAPTERS = [
	{ id: "b-corp", human: "B Corp", check: checkBCorp },
	{ id: "rainforest-alliance", human: "Rainforest Alliance", check: checkRainforestAlliance },
	{ id: "oeko-tex", human: "OEKO-TEX", check: checkOekoTex },
	{ id: "gots", human: "GOTS", check: checkGOTS },
	{ id: "fsc", human: "FSC", check: checkFSC },

	// More
	{ id: "fair-wear", human: "Fair Wear", check: checkFairWear },
	{ id: "better-cotton", human: "Better Cotton (BCI)", check: checkBetterCotton },
	{ id: "lwg", human: "Leather Working Group", check: checkLWG },
	{ id: "bluesign", human: "bluesign", check: checkBluesign },
	{ id: "sa8000", human: "SA8000", check: checkSA8000 },
	{ id: "certified-vegan", human: "Certified Vegan", check: checkCertifiedVegan },
	{ id: "bpi-compostable", human: "BPI Compostable", check: checkBPI },
	{ id: "animal-welfare-approved", human: "Animal Welfare Approved", check: checkAnimalWelfareApproved },
	{ id: "bap", human: "Best Aquaculture Practices", check: checkBAP },
	{ id: "energy-star", human: "ENERGY STAR", check: checkEnergyStar },
	{ id: "green-seal", human: "Green Seal", check: checkGreenSeal },
	{ id: "carbon-trust", human: "Carbon Trust", check: checkCarbonTrust },
];

// ----------------------- Main
// Orchestrates the whole run:
// 1) init cache
// 2) load brand sources (+ optional products/csv)
// 3) filter adapters by --labels
// 4) for each brand, generate aliases and run all adapters w/ concurrency
// 5) upsert rows + buffer audit evidence
// 6) merge manual truths
// 7) normalize + write outputs + save cache
(async () => {
	loadCache();

	// Load brand sources
	const BRANDS_SEED = loadJson(BIG_BRANDS_PATH, []);
	const BRANDS_FROM_PRODUCTS = loadProductsManufacturers();
	const BRANDS_FROM_CSV = loadExtraBrandsCSV();
	let BIG_BRANDS = uniqBy([...BRANDS_SEED, ...BRANDS_FROM_PRODUCTS, ...BRANDS_FROM_CSV], "manufacturer_id");

	// If --brand is passed, hard-filter to that exact normalized name.
	if (FLAG_BRAND) {
		BIG_BRANDS = BIG_BRANDS.filter((b) => normalizeName(b.name) === normalizeName(FLAG_BRAND));
	}
	if (!BIG_BRANDS.length) {
		console.error("❌ No brands found. Add to big-brands.json / products.json / extra-brands.csv");
		process.exit(1);
	}

	// Filter adapters if --labels provided
	const adapters = LABELS_FILTER ? ADAPTERS.filter((a) => LABELS_FILTER.includes(a.id)) : ADAPTERS;

	// Load any existing output to preserve previous labels; audit buffered per run.
	const rows = loadExisting();
	const AUDIT_BUFFER = [];
	console.log(`Loaded ${rows.length} existing rows`);
	if (CLEAR_CACHE) console.log("🧹 cache cleared");

	// Limit concurrent checks to avoid spamming sites (tuned to 4 per brand).
	const limit = pLimit(4); // 4 concurrent label checks per brand

	for (const brand of BIG_BRANDS) {
		// Build alias list for the brand (manual + automatic).
		const aliasList = namesFor(brand.name, loadJson(ALIASES_PATH, {}));
		console.log(`\n🔎 ${brand.name}  (aliases: ${aliasList.join(" | ")})`);

		// Run all adapters concurrently (within limit) for this brand.
		const tasks = adapters.map((a) =>
			limit(async () => {
				try {
					const { ok, evidences } = await a.check(brand.name, aliasList, loadJson(SLUGS_PATH, {}));
					console.log(
						`  • ${a.human}: ${ok ? "YES" : "no"}${
							ok && evidences?.length ? `  (${evidences[0]})` : ""
						}`
					);
					if (ok) {
						// Update output rows with the label
						upsert(rows, {
							manufacturer_id: brand.manufacturer_id,
							manufacturer_name: brand.name,
							label_id: a.id,
						});
						// Buffer evidence for audit log (up to 3 URLs per hit)
						AUDIT_BUFFER.push({
							manufacturer_id: brand.manufacturer_id,
							manufacturer_name: brand.name,
							label_id: a.id,
							evidence: evidences?.slice(0, 3) || [],
							ts: new Date().toISOString(),
						});
					}
				} catch (err) {
					// Adapter-level error isolation—one label failing shouldn’t kill the brand.
					console.warn(`  ! ${a.human} error:`, err?.message || err);
				}
			})
		);

		await Promise.all(tasks);
		await sleep(200); // small pause between brands to be gentle
	}

	// Merge manual truths last
	// Anything in manual-manufacturer-labels.json is treated as authoritative and appended to audit.
	const MANUAL = loadJson(MANUAL_PATH, []);
	for (const m of MANUAL) {
		for (const id of m.label_ids || []) {
			upsert(rows, {
				manufacturer_id: m.manufacturer_id,
				manufacturer_name: m.manufacturer_name,
				label_id: id,
			});
			AUDIT_BUFFER.push({
				manufacturer_id: m.manufacturer_id,
				manufacturer_name: m.manufacturer_name,
				label_id: id,
				evidence: ["manual-manufacturer-labels.json"],
				ts: new Date().toISOString(),
			});
		}
	}

	// Normalize + write + audit
	// Ensure label_ids are unique; then write outputs and persist cache.
	const normalized = rows.map((r) => ({
		manufacturer_id: r.manufacturer_id,
		manufacturer_name: r.manufacturer_name,
		label_ids: Array.from(new Set(r.label_ids)),
	}));

	writeOut(normalized);
	appendAudit(AUDIT_BUFFER);
	saveCache();
})();

/*
The scraper takes a list of big brands.
For each brand, it also makes a few name variations (like “P&G” for “Procter & Gamble”).

It visits a bunch of certification sites (B-Corp, GOTS, OEKO-TEX, FSC, Fair Wear, Better Cotton, LWG, bluesign, etc.).
On each site, it looks through the page text and links for the brand name, using strict word matches so “Apple” ≠ “pineapple”.

If it finds a real mention or profile page, it marks that brand as having that label and saves the proof link.

It writes a clean results file with each brand and the labels it has.
It also writes an audit file with the evidence links so you can double-check.

You can add more brands from simple files, and turn on a headless browser only when a site is heavy on JavaScript.
There’s caching so it doesn’t refetch the same pages, and it runs a few checks in parallel to be faster.
*/
