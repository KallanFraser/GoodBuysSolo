/** @format */
export default async function extractShopify(ctx) {
	const { origin, fetchHtml, loadCheerio, stripNoisySections, extractJsonLDProducts, dedupeNames, looksLikeProductName, MAX_PAGES_PER_COMPANY } =
		ctx;

	const endpointsUsed = new Set();
	const pagesVisited = new Set();
	const names = new Set();
	const notes = [];

	// 1) Try product sitemaps via /sitemap.xml
	const siteXml = await fetchHtml(`${origin}/sitemap.xml`);
	if (siteXml) {
		const $x = loadCheerio(siteXml, { xmlMode: true });
		// find *product* sitemaps
		const productSitemaps = [];
		$x("sitemap>loc").each((_, el) => {
			const loc = $x(el).text().trim();
			if (/product/i.test(loc)) productSitemaps.push(loc);
		});

		for (const sm of productSitemaps.slice(0, 8)) {
			// cap a bit
			endpointsUsed.add(sm);
			const xml = await fetchHtml(sm);
			if (!xml) continue;
			const $sm = loadCheerio(xml, { xmlMode: true });
			const urls = [];
			$sm("url>loc").each((_, el) => urls.push($sm(el).text().trim()));
			for (const url of urls.slice(0, MAX_PAGES_PER_COMPANY)) {
				const html = await fetchHtml(url);
				if (!html) continue;
				pagesVisited.add(url);
				const $ = loadCheerio(html);
				stripNoisySections($);

				// JSON-LD Product (best)
				const ldNames = extractJsonLDProducts($);
				for (const n of ldNames) if (looksLikeProductName(n)) names.add(n);

				// Backup: h1/h2 product titles
				$("h1, .product__title, .product-title, .product-single__title").each((_, el) => {
					const t = $(el).text().trim();
					if (looksLikeProductName(t)) names.add(t);
				});
			}
		}
	} else {
		notes.push("no_sitemap_xml");
	}

	// 2) As a fallback, crawl /collections/all pages (HTML, paginated)
	let page = 1;
	while (page <= Math.min(40, MAX_PAGES_PER_COMPANY)) {
		const url = `${origin}/collections/all?page=${page}`;
		const html = await fetchHtml(url);
		if (!html) break;
		pagesVisited.add(url);
		endpointsUsed.add(url);
		const $ = loadCheerio(html);
		stripNoisySections($);

		const before = names.size;
		// Common card selectors
		$(".grid-product__title, .product-card__title, a.card__heading, a.full-unstyled-link, .productitem--title a").each((_, el) => {
			const t = $(el).text().trim();
			if (looksLikeProductName(t)) names.add(t);
		});
		// Stop if no growth
		if (names.size === before) break;
		page++;
	}

	return {
		products: dedupeNames(Array.from(names)),
		pagesVisited,
		endpointsUsed,
		notes,
	};
}
