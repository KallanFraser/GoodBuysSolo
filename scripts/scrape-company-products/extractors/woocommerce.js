/** @format */
export default async function extractWoo(ctx) {
	const { origin, fetchHtml, loadCheerio, stripNoisySections, extractJsonLDProducts, dedupeNames, looksLikeProductName, MAX_PAGES_PER_COMPANY } =
		ctx;

	const endpointsUsed = new Set();
	const pagesVisited = new Set();
	const names = new Set();
	const notes = [];

	// 1) product sitemap if linked in /sitemap.xml
	const siteXml = await fetchHtml(`${origin}/sitemap.xml`);
	if (siteXml) {
		const $x = loadCheerio(siteXml, { xmlMode: true });
		const productSitemaps = [];
		$x("sitemap>loc").each((_, el) => {
			const loc = $x(el).text().trim();
			if (/product/i.test(loc)) productSitemaps.push(loc);
		});

		for (const sm of productSitemaps.slice(0, 8)) {
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
				// JSON-LD first
				for (const n of extractJsonLDProducts($)) if (looksLikeProductName(n)) names.add(n);
				// Woo product title class
				$(".product_title, .woocommerce-product-title, h1.product_title").each((_, el) => {
					const t = $(el).text().trim();
					if (looksLikeProductName(t)) names.add(t);
				});
			}
		}
	}

	// 2) Crawl /shop/page/N (common Woo pattern)
	let page = 1;
	while (page <= Math.min(40, MAX_PAGES_PER_COMPANY)) {
		const url = `${origin}/shop/page/${page}`;
		const html = await fetchHtml(url);
		if (!html) break;
		pagesVisited.add(url);
		endpointsUsed.add(url);
		const $ = loadCheerio(html);
		stripNoisySections($);

		const before = names.size;
		$(".products .product .woocommerce-loop-product__title, .products .product h2, .product-title a").each((_, el) => {
			const t = $(el).text().trim();
			if (looksLikeProductName(t)) names.add(t);
		});

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
