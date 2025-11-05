import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { fetchSitemapUrls } from "./fetchSitemapUrls.js";
import { detectPlatform } from "./detectPlatform.js";
import { discoverShopify } from "./discoverShopify.js";
import { extractProductFromHtml } from "./extractProductFromHtml.js";
import { allowedByRobots } from "./robots.js";
import { scoreProduct } from "./scoreProduct.js";
import { appendProducts } from "./store.js";

const UA = "GoodBuysBot/1.0 (+contact@example.com)";

// Nike and many enterprise sites use product pages like /t/air-zoom-pegasus-41-...
const PRODUCT_URL_REGEX = /\/(t|product|pd|dp)\/[a-z0-9-]+/i;
// “Collection-ish” pages we’ll expand from
const COLLECTION_HINT_REGEX = /product|prod|shop|item|collection|category|catalog|\/p\/|\/dp\/|\/sku\/|\/pd\//i;

export async function crawlCompany(company, options = {}) {
	const { ignoreRobots = false } = options;

	const origins = (company.domains || [])
		.map((d) => {
			try {
				const host = d.replace(/^https?:\/\//, "").replace(/\/+$/, "");
				return `https://${host}`;
			} catch {
				return null;
			}
		})
		.filter(Boolean);

	if (origins.length === 0) {
		console.log(`No domains configured for ${company.name || company.id}`);
		return;
	}

	// 0) Start with any seeded URLs to guarantee output.
	const discovered = new Set(company.seed_urls || []);

	// 1) Origin-level discovery (homepage links, platform fast-paths, sitemaps)
	for (const origin of origins) {
		if (!ignoreRobots) {
			const ok = await allowedByRobots(origin, UA);
			if (!ok) {
				console.log(`robots.txt disallows crawling ${origin}, skipping`);
				continue;
			}
		} else {
			console.log(`Ignoring robots.txt for ${origin} (testing mode)`);
		}

		try {
			const home = await fetch(origin, { headers: { "User-Agent": UA } });
			if (home.ok) {
				const html = await home.text();
				const platform = detectPlatform(html, Object.fromEntries(home.headers));

				// Shopify fast path
				if (platform === "shopify") {
					const urls = await discoverShopify(origin, UA);
					urls.forEach((u) => discovered.add(u));
				}

				// Internal links from homepage (cap ~200)
				const $ = cheerio.load(html);
				const internal = new Set();
				$("a[href]").each((_, el) => {
					const href = $(el).attr("href");
					if (!href) return;
					try {
						const u = new URL(href, origin);
						const baseHost = new URL(origin).host.replace(/^www\./, "");
						if (u.host.replace(/^www\./, "") === baseHost) internal.add(u.toString());
					} catch {
						/* ignore */
					}
				});
				[...internal].slice(0, 200).forEach((u) => discovered.add(u));
			}
		} catch (e) {
			console.warn("Failed platform detect/homepage scan:", e.message);
		}

		// Sitemaps
		try {
			const urls = await fetchSitemapUrls(origin, UA);
			urls.forEach((u) => discovered.add(u));
		} catch (e) {
			console.warn("Sitemap error:", e.message);
		}
	}

	const allFound = [...discovered];
	console.log(`Discovered ${allFound.length} raw URLs before filtering for ${company.name}`);

	// 2) Split: direct product-looking URLs vs collection-ish
	const productUrlCandidates = allFound.filter((u) => PRODUCT_URL_REGEX.test(new URL(u, "https://dummy").pathname));
	const collectionish = allFound.filter((u) => !PRODUCT_URL_REGEX.test(new URL(u, "https://dummy").pathname) && COLLECTION_HINT_REGEX.test(u));

	console.log(`Initial product-like URLs: ${productUrlCandidates.length}`);
	console.log(`Collection-like URLs to expand: ${collectionish.length}`);

	// 3) Expand collection pages → find product detail links (/t/... etc). Cap to keep polite.
	const expandedFromCollections = await expandCollectionsForProducts(collectionish, { limitPages: 30, perPageExtractCap: 100 });
	expandedFromCollections.forEach((u) => productUrlCandidates.push(u));

	// De-dup product candidates
	const productSet = new Set(productUrlCandidates.map((u) => normalizeUrl(u)));
	const finalProducts = [...productSet];

	console.log(`After collection expansion: ${finalProducts.length} product detail candidates`);
	if (finalProducts.length) {
		console.log(
			finalProducts
				.slice(0, 10)
				.map((x) => " - " + x)
				.join("\n")
		);
		if (finalProducts.length > 10) console.log(`...and ${finalProducts.length - 10} more`);
	}

	// 4) Fetch & parse product detail pages
	const out = [];
	const limiter = pLimit(8); // polite concurrency

	await Promise.all(
		finalProducts.map((u) =>
			limiter(async () => {
				try {
					const res = await fetch(u, { headers: { "User-Agent": UA } });
					if (!res.ok) return;
					const html = await res.text();

					const parsed = extractProductFromHtml(html);

					// Gate: real product if JSON-LD Product OR SKU/GTIN OR URL matches product pattern with an <h1>
					const $ = cheerio.load(html);
					const hasH1 = $("h1").first().text().trim().length > 0;
					const urlLooksProduct = PRODUCT_URL_REGEX.test(new URL(u).pathname);
					const isRealProduct = !!(parsed?.raw || parsed?.sku || parsed?.gtin || (urlLooksProduct && hasH1));
					if (!isRealProduct) return;

					// Company-product link (strict MVP)
					const score = scoreProduct(company, u, parsed);
					if (score < 0.5) return;

					const transformed = toCatalogShape(parsed, company);
					if (!transformed?.name || !transformed?.manufacturer_id) return;

					out.push(transformed);
				} catch {
					// swallow per-URL errors
				}
			})
		)
	);

	await appendProducts(out); // writes array [{ name, manufacturer_id }]
	console.log(`Saved ${out.length} products for ${company.name}`);
}

// ---------- helpers ----------

function pLimit(n) {
	const q = [];
	let active = 0;

	const next = () => {
		if (active >= n || q.length === 0) return;
		active++;
		const { fn, resolve } = q.shift();
		fn()
			.then(resolve)
			.catch(resolve)
			.finally(() => {
				active--;
				next();
			});
	};

	return (fn) =>
		new Promise((resolve) => {
			q.push({ fn, resolve });
			next();
		});
}

function toCatalogShape(parsed, company) {
	const name = (parsed?.name || "").trim();
	const manufacturer_id = company.manufacturer_id?.trim() || (company.id ? `m-${String(company.id).trim()}` : null);

	return name && manufacturer_id ? { name, manufacturer_id } : null;
}

function normalizeUrl(u) {
	try {
		const url = new URL(u);
		url.hash = "";
		url.search = "";
		return url.toString();
	} catch {
		return u;
	}
}

async function expandCollectionsForProducts(urls, { limitPages = 30, perPageExtractCap = 100 } = {}) {
	const out = new Set();
	const slice = urls.slice(0, limitPages);

	await Promise.all(
		slice.map(async (u) => {
			try {
				const res = await fetch(u, { headers: { "User-Agent": UA } });
				if (!res.ok) return;
				const html = await res.text();
				const $ = cheerio.load(html);

				const base = new URL(u);
				const found = [];
				$("a[href]").each((_, el) => {
					const href = $(el).attr("href");
					if (!href) return;
					try {
						const t = new URL(href, base.origin);
						// Keep only same-host links and product-looking paths
						const sameHost = t.host.replace(/^www\./, "") === base.host.replace(/^www\./, "");
						if (!sameHost) return;
						if (PRODUCT_URL_REGEX.test(t.pathname)) found.push(t.toString());
					} catch {
						/* ignore */
					}
				});

				found.slice(0, perPageExtractCap).forEach((x) => out.add(normalizeUrl(x)));
			} catch {
				// ignore single-page failures
			}
		})
	);

	return [...out];
}
