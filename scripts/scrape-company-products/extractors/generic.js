/** @format */
// Generic storefront extractor: robots sitemaps + listing roots + rel=next.

import { sitemapsFromRobots } from "../utils/http.js";

export default async function extractGeneric(ctx) {
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

	// 1) Sitemaps
	const sitemapSeeds = new Set([
		`${origin}/sitemap.xml`,
		`${origin}/sitemap_index.xml`,
		`${origin}${localePrefix}/sitemap.xml`,
		`${origin}${localePrefix}/sitemap_index.xml`,
	]);
	for (const m of await sitemapsFromRobots(origin)) sitemapSeeds.add(m);

	for (const sm of Array.from(sitemapSeeds)) {
		const xml = await fetchHtml(sm);
		if (!xml) continue;
		endpointsUsed.add(sm);
		const $x = loadCheerio(xml, { xmlMode: true });

		const childMaps = [];
		$x("sitemap>loc").each((_, el) => {
			const loc = $x(el).text().trim();
			if (/product|shop|catalog|store/i.test(loc)) childMaps.push(loc);
		});

		for (const cm of childMaps.slice(0, 8)) {
			endpointsUsed.add(cm);
			const cxml = await fetchHtml(cm);
			if (!cxml) continue;
			const $c = loadCheerio(cxml, { xmlMode: true });
			const urls = [];
			$c("url>loc").each((_, el) => urls.push($c(el).text().trim()));

			for (const url of urls.slice(0, MAX_PAGES_PER_COMPANY)) {
				const html = await fetchHtml(url);
				if (!html) continue;
				pagesVisited.add(url);
				const $ = loadCheerio(html);
				stripNoisySections($);

				for (const n of extractJsonLDProducts($)) if (looksLikeProductName(n)) names.add(n);

				$("h1, h2, .product-title, .card-title, .tile-title, [itemprop='name']").each((_, el) => {
					const t = ($(el).attr("content") || $(el).text() || "").trim();
					if (looksLikeProductName(t)) names.add(t);
				});
			}
		}
	}

	// 2) Listing roots + pagination
	const bases = ["/products", "/shop", "/store", "/catalog", "/collections/all", "/category", "/product-category"];
	const roots = [];
	for (const b of bases) roots.push(`${origin}${localePrefix}${b}`);
	for (const b of bases) roots.push(`${origin}${b}`);

	for (const seed of roots) {
		let url = seed;
		let hops = 0;
		while (hops < Math.min(40, MAX_PAGES_PER_COMPANY)) {
			const url1 = url.includes("?page=") || /\/page\/\d+$/.test(url) ? url : `${url}?page=${hops + 1}`;
			const url2 = url.includes("/page/") ? url : `${url.replace(/\/$/, "")}/page/${hops + 1}`;

			const html = (await fetchHtml(url1)) || (await fetchHtml(url2)) || (await fetchHtml(url));
			if (!html) break;

			pagesVisited.add(url1);
			pagesVisited.add(url2);
			pagesVisited.add(url);
			endpointsUsed.add(url1);
			endpointsUsed.add(url2);
			endpointsUsed.add(url);

			const $ = loadCheerio(html);
			stripNoisySections($);

			const before = names.size;

			$(".product, .product-card, .grid__item, [data-product], .product-item, .card, .product-grid-item, .product-tile").each((_, el) => {
				const t =
					$(el)
						.find(".product-title, .card__heading, .card-title, .productitem--title, .product-name, .pdp-link, a[title], a")
						.first()
						.text()
						.trim() || "";
				if (looksLikeProductName(t)) names.add(t);
			});

			const nextHref =
				$('link[rel="next"]').attr("href") || $(".pagination a.next").attr("href") || $(".page-next a").attr("href") || null;

			if (names.size === before && !nextHref) break;

			url = nextHref ? new URL(nextHref, url).toString() : url;
			hops++;
			if (names.size > 80 && hops > 5) break;
		}
		if (names.size > 0) break;
	}

	return {
		products: dedupeNames(Array.from(names)),
		pagesVisited,
		endpointsUsed,
		notes,
	};
}
