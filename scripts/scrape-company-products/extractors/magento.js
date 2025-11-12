/** @format */
export default async function extractMagento(ctx) {
	const { origin, fetchHtml, loadCheerio, stripNoisySections, extractJsonLDProducts, dedupeNames, looksLikeProductName, MAX_PAGES_PER_COMPANY } =
		ctx;

	const endpointsUsed = new Set();
	const pagesVisited = new Set();
	const names = new Set();
	const notes = [];

	// 1) sitemap route
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
				for (const n of extractJsonLDProducts($)) if (looksLikeProductName(n)) names.add(n);
				// Title backups
				$(".page-title span, .product-info-main .page-title-wrapper h1").each((_, el) => {
					const t = $(el).text().trim();
					if (looksLikeProductName(t)) names.add(t);
				});
			}
		}
	}

	// 2) Category pagination heuristics ?p=N and /page/N
	const catSeeds = [`${origin}/catalog/category/view/`, `${origin}/?p=1`, `${origin}/page/1`];
	for (const seed of catSeeds) {
		let page = 1;
		while (page <= Math.min(30, MAX_PAGES_PER_COMPANY)) {
			const url = seed.includes("?p=") ? `${origin}/?p=${page}` : seed.replace(/\/\d+$/, "") + `/page/${page}`;
			const html = await fetchHtml(url);
			if (!html) break;
			pagesVisited.add(url);
			endpointsUsed.add(url);
			const $ = loadCheerio(html);
			stripNoisySections($);

			const before = names.size;
			$(".product-item .product-item-name a, .product-item .product-item-link").each((_, el) => {
				const t = $(el).text().trim();
				if (looksLikeProductName(t)) names.add(t);
			});
			if (names.size === before) break;
			page++;
		}
	}

	return {
		products: dedupeNames(Array.from(names)),
		pagesVisited,
		endpointsUsed,
		notes,
	};
}
