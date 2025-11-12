/** @format */
/**
 * Product scraper (sitemap-first, PDP extraction)
 * See env knobs at the bottom of this header.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import * as cheerio from "cheerio";
import pLimit from "p-limit";

// -------------------------------------------------------------
// Paths & env
// -------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();

const COMPANIES_PATH = path.join(ROOT, "public", "data", "companies.json");
const OUTPUT_PATH = path.join(ROOT, "public", "data", "products.json");
const AUDIT_PATH = path.join(ROOT, "public", "data", "products.audit.json");

// Env knobs
const CLEAR_OUTPUT = !!process.env.CLEAR_OUTPUT;
const DRY_RUN = !!process.env.DRY_RUN;
const COMPANY_LIMIT = parseInt(process.env.COMPANY_LIMIT || "0", 10);
const CONCURRENCY_COMPANIES = parseInt(process.env.CONCURRENCY_COMPANIES || "5", 10);
const CONCURRENCY_PAGES = parseInt(process.env.CONCURRENCY_PAGES || "6", 10);
const MAX_PAGES_PER_COMPANY = parseInt(process.env.MAX_PAGES_PER_COMPANY || "80", 10);
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || "9000", 10);
const RETRIES = parseInt(process.env.RETRIES || "1", 10);
const BASE_DELAY_MS = parseInt(process.env.BASE_DELAY_MS || "400", 10);
const JITTER_MS = parseInt(process.env.JITTER_MS || "250", 10);
const PLATFORMS_ONLY = (process.env.PLATFORMS_ONLY || "")
	.split(",")
	.map((s) => s.trim().toLowerCase())
	.filter(Boolean);

// -------------------------------------------------------------
// Small utils
// -------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (b, j) => b + Math.floor(Math.random() * (j + 1));
const delay = async () => sleep(jitter(BASE_DELAY_MS, JITTER_MS));

function randomUserAgent() {
	const uas = [
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
		"Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0",
	];
	return uas[Math.floor(Math.random() * uas.length)];
}
function commonHeaders() {
	return {
		"User-Agent": randomUserAgent(),
		Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
		"Cache-Control": "no-cache",
		Pragma: "no-cache",
		"Accept-Encoding": "gzip, deflate, br",
		"Upgrade-Insecure-Requests": "1",
	};
}
async function getText(url, { timeout = REQUEST_TIMEOUT, retries = RETRIES } = {}) {
	for (let i = 0; i <= retries; i++) {
		try {
			const res = await axios.get(url, {
				headers: commonHeaders(),
				maxRedirects: 5,
				timeout,
				decompress: true,
				responseType: "text",
				validateStatus: () => true,
			});
			if (res.status >= 200 && res.status < 400 && typeof res.data === "string") return res.data;
			if (i < retries && (res.status === 403 || res.status === 429 || res.status >= 500)) {
				await sleep(700 * (i + 1));
				continue;
			}
			return null;
		} catch {
			if (i < retries) {
				await sleep(700 * (i + 1));
				continue;
			}
			return null;
		}
	}
	return null;
}
async function loadJson(p, fallback) {
	try {
		const buf = await fs.readFile(p, "utf8");
		return JSON.parse(buf);
	} catch {
		return fallback;
	}
}
async function writeJsonAtomic(p, obj) {
	await fs.mkdir(path.dirname(p), { recursive: true });
	const tmp = p + ".tmp";
	await fs.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
	await fs.rename(tmp, p);
}

// -------------------------------------------------------------
// Company normalization (accept string or object)
// -------------------------------------------------------------
function cleanHost(input) {
	if (!input) return null;
	try {
		// accept raw host (nike.com) or URL (https://www.nike.com/us)
		if (/^https?:\/\//i.test(input)) {
			const u = new URL(input);
			return u.host || null;
		}
		// plain host
		return input.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
	} catch {
		return null;
	}
}
function normalizeCompanyRecord(raw) {
	if (typeof raw === "string") {
		const name = raw.trim();
		return name ? { name } : null;
	}
	if (!raw || typeof raw !== "object") return null;

	// prefer common keys
	const name = (raw.name || raw.company || raw.brand || raw.title || "").toString().trim();
	if (!name) return null;

	// domain hints
	const domain = cleanHost(raw.domain) || cleanHost(raw.website) || cleanHost(raw.url) || null;

	return { name, domain };
}
function normalizeCompanyList(arr) {
	const out = [];
	for (const item of arr || []) {
		const rec = normalizeCompanyRecord(item);
		if (rec) out.push(rec);
	}
	return out;
}

// -------------------------------------------------------------
// Domain resolution
// -------------------------------------------------------------
function guessDomainHostsFromName(name) {
	const base = name.toLowerCase().replace(/[^a-z0-9]/g, "");
	if (!base) return [];
	return [`www.${base}.com`, `${base}.com`];
}
async function resolveDomainForCompany({ name, domain }) {
	// If caller already gave us a domain/website hint, use it
	if (domain) return domain;

	const guesses = guessDomainHostsFromName(name);
	for (const host of guesses) {
		const url = `https://${host}`;
		const html = await getText(url, { timeout: Math.min(REQUEST_TIMEOUT, 5000), retries: 0 });
		if (html) return host;
		await delay();
	}
	for (const host of guesses) {
		const url = `http://${host}`;
		const html = await getText(url, { timeout: Math.min(REQUEST_TIMEOUT, 5000), retries: 0 });
		if (html) return host;
		await delay();
	}
	// Fallback to first guess even if not reachable; sitemaps may still work
	return guesses[0] || null;
}

// -------------------------------------------------------------
// Sitemap walkers -> PDP URLs
// -------------------------------------------------------------
const SITEMAP_ALLOW = [
	/pdp/i,
	/product/i,
	/products?\//i,
	/item/i,
	/sku/i,
	/detail/i,
	/buy/i,
	/\/t\//i, // Nike /t/
];
const SITEMAP_BLOCK = [/blog/i, /news/i, /article/i, /help/i, /locator|storefinder/i, /gridwall/i, /category/i, /listing/i, /events?/i, /legal/i];
function extractLocsFromXml(xml) {
	const out = [];
	const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
	let m;
	while ((m = re.exec(xml))) out.push(m[1]);
	return out;
}
function isSitemapUrl(u) {
	try {
		const p = new URL(u).pathname.toLowerCase();
		return p.endsWith(".xml") || p.includes("/sitemap");
	} catch {
		return false;
	}
}
function isLikelyPdp(u) {
	let pathStr;
	try {
		pathStr = new URL(u).pathname.toLowerCase();
	} catch {
		return false;
	}
	if (SITEMAP_BLOCK.some((rx) => rx.test(pathStr))) return false;
	return SITEMAP_ALLOW.some((rx) => rx.test(pathStr));
}
async function collectPdpUrlsFromSitemaps(origin, { maxUrls = 4000 } = {}) {
	const seen = new Set();
	const pdps = new Set();

	const seeds = [new URL("/sitemap.xml", origin).toString(), new URL("/sitemap_index.xml", origin).toString()];
	const q = [...seeds];

	while (q.length && pdps.size < maxUrls) {
		const smUrl = q.shift();
		if (seen.has(smUrl)) continue;
		seen.add(smUrl);

		const xml = await getText(smUrl, { timeout: Math.min(REQUEST_TIMEOUT, 8000), retries: 1 });
		if (!xml) continue;

		const locs = extractLocsFromXml(xml);
		for (const loc of locs) {
			if (!isSitemapUrl(loc)) {
				if (isLikelyPdp(loc)) {
					pdps.add(loc);
					if (pdps.size >= maxUrls) break;
				}
			} else {
				q.push(loc);
			}
		}
	}

	const extras = ["/sitemap-products.xml", "/sitemap-product.xml", "/product-sitemap.xml", "/sitemap-pdp.xml"].map((p) =>
		new URL(p, origin).toString()
	);

	for (const guess of extras) {
		if (pdps.size >= maxUrls) break;
		if (seen.has(guess)) continue;
		seen.add(guess);
		const xml = await getText(guess, { timeout: 7000, retries: 1 });
		if (!xml) continue;
		const locs = extractLocsFromXml(xml);
		for (const loc of locs) {
			if (isLikelyPdp(loc)) {
				pdps.add(loc);
				if (pdps.size >= maxUrls) break;
			}
		}
	}

	return Array.from(pdps);
}

// -------------------------------------------------------------
// PDP name extraction
// -------------------------------------------------------------
function tryParseJson(text) {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
function harvestProductFromJsonLd(node, names) {
	if (!node || typeof node !== "object") return;
	const types = node["@type"];
	const isProduct = (t) => typeof t === "string" && /Product/i.test(t);
	const match = Array.isArray(types) ? types.some(isProduct) : isProduct(types);
	if (match) {
		const n = (node.name || node.title || "").toString().trim();
		if (n) names.add(n);
	}
	for (const k of Object.keys(node)) {
		const v = node[k];
		if (!v) continue;
		if (Array.isArray(v)) v.forEach((x) => harvestProductFromJsonLd(x, names));
		else if (typeof v === "object") harvestProductFromJsonLd(v, names);
	}
}
function collectJsonLdProducts($) {
	const names = new Set();
	$("script[type='application/ld+json']").each((_, el) => {
		const raw = $(el).contents().text();
		const parsed = tryParseJson(raw);
		const nodes = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
		for (const node of nodes) harvestProductFromJsonLd(node, names);
	});
	return Array.from(names);
}
function extractProductNameFromHtml(html, url) {
	const $ = cheerio.load(html);

	const fromLd = collectJsonLdProducts($);
	if (fromLd.length) return fromLd;

	const isProductOg = $('meta[property="og:type"]').attr("content")?.toLowerCase().includes("product");
	const ogTitle = $('meta[property="og:title"]').attr("content");
	if (isProductOg && ogTitle) return [ogTitle.trim()];

	if (isLikelyPdp(url)) {
		const h1 = $("h1").first().text().trim();
		if (h1 && h1.length > 2 && h1.length < 200) return [h1];
	}
	return [];
}

// -------------------------------------------------------------
// Platform detect (best-effort)
// -------------------------------------------------------------
function detectPlatform(html) {
	const s = (html || "").toLowerCase();
	if (/demandware|sfcc|dwcdn|dwanalytics|dwsid/.test(s)) return "sfcc";
	if (/cdn\.shopify|x-shopify|shopifytheme|\/collections\//.test(s)) return "shopify";
	if (/mage\.cookies|magento|varnish/i.test(s)) return "magento";
	if (/commercetools|cto\./i.test(s)) return "commercetools";
	return "generic";
}

// -------------------------------------------------------------
// Listing fallback (only if sitemaps fail)
// -------------------------------------------------------------
function guessListingEndpoints(origin) {
	const base = new URL(origin).origin;
	const patterns = ["/products", "/shop", "/store", "/catalog", "/collections/all", "/category", "/product-category"];
	const out = [];
	for (const p of patterns) {
		out.push(new URL(p, base).toString());
		out.push(new URL(p.replace(/^\//, "") + "?page=1", base).toString());
		out.push(new URL(p.replace(/^\//, "") + "/page/1", base).toString());
	}
	return Array.from(new Set(out));
}

// -------------------------------------------------------------
// Core harvest
// -------------------------------------------------------------
async function harvestProductsForDomain(origin, { pageConcurrency = CONCURRENCY_PAGES, maxPages = MAX_PAGES_PER_COMPANY } = {}) {
	const pdpUrls = await collectPdpUrlsFromSitemaps(origin, { maxUrls: maxPages * 50 });
	const endpointsUsed = new Set();
	const names = new Set();
	let pages = 0;

	if (pdpUrls.length) {
		const limit = pLimit(pageConcurrency);
		const tasks = pdpUrls.slice(0, maxPages * 50).map((u, idx) =>
			limit(async () => {
				if (idx % 25 === 0) process.stdout.write(`      · PDP ${idx + 1}/${Math.min(pdpUrls.length, maxPages * 50)}\n`);
				await delay();
				const html = await getText(u, { timeout: Math.min(REQUEST_TIMEOUT, 9000), retries: 1 });
				if (!html) return;
				pages++;
				extractProductNameFromHtml(html, u).forEach((n) => names.add(n));
			})
		);
		await Promise.all(tasks);
		return {
			products: Array.from(names).slice(0, 5000).sort(),
			pagesVisited: pages,
			endpointsUsed: pdpUrls.slice(0, 50),
		};
	}

	const guessed = guessListingEndpoints(origin);
	for (const url of guessed) {
		if (pages >= maxPages) break;
		await delay();
		const html = await getText(url, { timeout: Math.min(REQUEST_TIMEOUT, 9000), retries: 1 });
		if (!html) continue;
		pages++;
		endpointsUsed.add(url);
		const $ = cheerio.load(html);
		collectJsonLdProducts($).forEach((n) => names.add(n));
		$("a, h2, h3, .product-card, .product__title, .tile__title").each((_, el) => {
			const t = ($(el).attr("title") || $(el).text() || "").trim();
			if (t && t.length > 2 && t.length < 200) names.add(t);
		});
	}

	return {
		products: Array.from(names).slice(0, 5000).sort(),
		pagesVisited: pages,
		endpointsUsed: Array.from(endpointsUsed).slice(0, 50),
	};
}

// -------------------------------------------------------------
// Main
// -------------------------------------------------------------
(async () => {
	// Load companies and normalize
	const rawCompanies = await loadJson(COMPANIES_PATH, []);
	const companies = normalizeCompanyList(rawCompanies);
	if (!Array.isArray(companies) || companies.length === 0) {
		console.error(`No companies loaded. Create ${COMPANIES_PATH} with an array of names or objects.`);
		process.exit(1);
	}

	const toProcess = companies.slice(0, COMPANY_LIMIT > 0 ? COMPANY_LIMIT : companies.length);

	let results = CLEAR_OUTPUT ? [] : await loadJson(OUTPUT_PATH, []);
	const audit = [];

	console.log(`\n=== Companies to process: ${toProcess.length} ===`);
	console.log(`Output → ${OUTPUT_PATH}`);
	console.log(`Audit  → ${AUDIT_PATH}`);
	console.log(
		`Knobs: company_conc=${CONCURRENCY_COMPANIES}, page_conc=${CONCURRENCY_PAGES}, max_pages/company=${MAX_PAGES_PER_COMPANY}, delay=${BASE_DELAY_MS}±${JITTER_MS}, retries=${RETRIES}, timeout=${REQUEST_TIMEOUT}, dry=${!!DRY_RUN}, clear=${!!CLEAR_OUTPUT}, platforms_only=[${PLATFORMS_ONLY.join(
			","
		)}]`
	);

	const limitCompany = pLimit(CONCURRENCY_COMPANIES);
	const tasks = toProcess.map((rec) =>
		limitCompany(async () => {
			const label = rec.name || "(unknown)";
			console.log(`\n→ Company: ${label}`);

			const domain = await resolveDomainForCompany(rec);
			if (!domain) {
				console.log("   ✗ Could not resolve domain.");
				audit.push({ company: label, domain: null, error: "domain_resolution_failed" });
				return;
			}
			console.log(`   ✓ Domain: ${domain}`);

			const origin = `https://${domain}`;

			// Platform (best-effort) + optional filter
			let platform = "generic";
			const homeHtml = await getText(origin, { timeout: Math.min(REQUEST_TIMEOUT, 7000), retries: 0 });
			if (homeHtml) platform = detectPlatform(homeHtml);
			else console.log("   • (homepage blocked/unreachable — proceeding via sitemaps)");

			if (PLATFORMS_ONLY.length && !PLATFORMS_ONLY.includes(platform)) {
				console.log(`   • Skipping (platform ${platform} not in filter)`);
				audit.push({ company: label, domain, platform, skipped: true, reason: "platform_filter" });
				return;
			}
			console.log(`   • Platform: ${platform}`);

			try {
				const { products, pagesVisited, endpointsUsed } = await harvestProductsForDomain(origin, {
					pageConcurrency: CONCURRENCY_PAGES,
					maxPages: MAX_PAGES_PER_COMPANY,
				});

				console.log(`   ✓ Products found: ${products.length}  | Pages: ${pagesVisited}`);

				const record = {
					company: label,
					domain,
					platform,
					products,
					endpointsUsed,
					pagesVisited,
					notes: [],
				};

				// merge/replace
				results = results.filter((r) => r.company !== label);
				results.push(record);

				if (!DRY_RUN) {
					await writeJsonAtomic(OUTPUT_PATH, results);
					console.log(`Wrote products → ${OUTPUT_PATH}`);
				}

				audit.push({
					company: label,
					domain,
					platform,
					sample: products.slice(0, 10),
					totalProducts: products.length,
					pagesVisited,
				});
			} catch (err) {
				console.log(`   ✗ Error: ${err?.message || err}`);
				audit.push({ company: label, domain, error: String(err?.message || err) });
			}
		})
	);

	await Promise.all(tasks);

	try {
		await writeJsonAtomic(AUDIT_PATH, audit);
		console.log(`Wrote audit → ${AUDIT_PATH}`);
	} catch (e) {
		console.error("Failed writing audit:", e?.message || e);
	}

	console.log("\nDone.");
})();
