/** @format */
// Salesforce Commerce Cloud extractor: robots sitemaps + listing crawl.

import { sitemapsFromRobots } from "../utils/http.js";

export default async function extractSFCC(ctx) {
	const {
		origin,
		localePrefix = "",
		fetchHtml,
		loadCheerio,
		stripNoisySections,
		extractJsonLDProducts,
		dedupeNames,
		looksLikeProductName,
		MAX_PAGES_PER_COMPANY,
	} = ctx;

	const endpointsUsed = new Set();
	const pagesVisited = new Set();
	const names = new Set();
	const notes = [];

	// 1) Discover product URLs from sitemaps (robots + common)
	const sitemapSeeds = new Set([
		`${origin}/sitemap.xml`,
		`${origin}/sitemap_index.xml`,
		`${origin}${localePrefix}/sitemap.xml`,
		`${origin}${localePrefix}/sitemap_index.xml`,
		`${origin}/sitemaps/sitemap.xml`,
	]);
	for (const m of await sitemapsFromRobots(origin)) sitemapSeeds.add(m);

	const productUrls = new Set();

	for (const sm of Array.from(sitemapSeeds)) {
		const xml = await fetchHtml(sm);
		if (!xml) continue;
		endpointsUsed.add(sm);
		const $x = loadCheerio(xml, { xmlMode: true });

		const childMaps = [];
		$x("sitemap > loc").each((_, el) => {
			const loc = $x(el).text().trim();
			if (/product|shop|catalog/i.test(loc)) childMaps.push(loc);
		});

		for (const cm of childMaps.slice(0, 16)) {
			endpointsUsed.add(cm);
			const cxml = await fetchHtml(cm);
			if (!cxml) continue;
			const $c = loadCheerio(cxml, { xmlMode: true });
			$c("url > loc").each((_, el) => {
				const loc = $c(el).text().trim();
				if (/(\/product\/|\/p\/|\/pd\/|\/prod\/)/i.test(loc)) productUrls.add(loc);
			});
		}

		$x("url > loc").each((_, el) => {
			const loc = $x(el).text().trim();
			if (/(\/product\/|\/p\/|\/pd\/|\/prod\/)/i.test(loc)) productUrls.add(loc);
		});
	}

	for (const url of Array.from(productUrls).slice(0, MAX_PAGES_PER_COMPANY)) {
		const html = await fetchHtml(url);
		if (!html) continue;
		pagesVisited.add(url);
		endpointsUsed.add(url);

		const $ = loadCheerio(html);
		stripNoisySections($);

		for (const n of extractJsonLDProducts($)) if (looksLikeProductName(n)) names.add(n);

		$("h1.product-name, .product-name h1, .product-detail .product-name, .product-title, .pdp-main h1, meta[itemprop='name']").each(
			(_, el) => {
				const t = ($(el).attr("content") || $(el).text() || "").trim();
				if (looksLikeProductName(t)) names.add(t);
			}
		);
	}

	// 2) Fallback: crawl listing roots, follow rel=next
	if (names.size === 0) {
		const roots = [
			`${origin}${localePrefix}/c/`,
			`${origin}${localePrefix}/products`,
			`${origin}${localePrefix}/shop`,
			`${origin}${localePrefix}/all-products`,
			`${origin}/c/`,
			`${origin}/products`,
			`${origin}/shop`,
		];

		for (const seed of roots) {
			let url = seed;
			let hops = 0;
			while (hops < Math.min(40, MAX_PAGES_PER_COMPANY)) {
				const html = await fetchHtml(url);
				if (!html) break;
				pagesVisited.add(url);
				endpointsUsed.add(url);

				const $ = loadCheerio(html);
				stripNoisySections($);

				const before = names.size;

				$(
					".product-tile a, .product-grid a, a.link-product, .grid-tile .name-link, a[data-pid], a[data-qa*='product'], a[name='ProductTile']"
				).each((_, el) => {
					const t = ($(el).attr("title") || $(el).text() || "").trim();
					if (looksLikeProductName(t)) names.add(t);
				});

				$(".product-name, .tile-body .pdp-link, .grid-tile .product-name, .card .card-title").each((_, el) => {
					const t = $(el).text().trim();
					if (looksLikeProductName(t)) names.add(t);
				});

				if (names.size === before) break;

				const next = $('link[rel="next"]').attr("href") || $(".pagination a.next").attr("href") || $(".page-next a").attr("href");
				if (!next) break;

				url = new URL(next, url).toString();
				hops++;
				if (names.size > 60 && hops > 5) break;
			}
			if (names.size > 0) break;
		}
	}

	return {
		products: dedupeNames(Array.from(names)),
		pagesVisited,
		endpointsUsed,
		notes,
	};
}
