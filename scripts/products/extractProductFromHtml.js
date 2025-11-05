import * as cheerio from "cheerio";

export function extractProductFromHtml(html) {
	const $ = cheerio.load(html);

	// JSON-LD first
	let jsonlds = [];
	$('script[type="application/ld+json"]').each((_, el) => {
		const raw = $(el).contents().text();
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) jsonlds.push(...parsed);
			else jsonlds.push(parsed);
		} catch {}
	});

	const prod = jsonlds.find((n) => {
		const t = n?.["@type"];
		if (!t) return false;
		if (t === "Product") return true;
		if (Array.isArray(t) && t.includes("Product")) return true;
		return false;
	});

	if (prod) {
		return {
			name: prod.name || $("h1").first().text().trim(),
			brand: prod.brand?.name || prod.brand || meta($, "og:site_name"),
			gtin: prod.gtin13 || prod.gtin12 || prod.gtin || prod.gtin8 || null,
			sku: prod.sku || $('[itemprop="sku"]').attr("content") || $(".sku").first().text().trim() || null,
			image: Array.isArray(prod.image) ? prod.image[0] : prod.image || meta($, "og:image") || null,
			category: prod.category || null,
			raw: prod,
		};
	}

	// Fallback
	return {
		name: $("h1").first().text().trim(),
		brand: meta($, "og:site_name") || $('meta[name="author"]').attr("content") || null,
		gtin: $('meta[itemprop="gtin13"]').attr("content") || null,
		sku: $('[itemprop="sku"]').attr("content") || $(".sku").first().text().trim() || null,
		image: meta($, "og:image") || null,
		category: null,
	};
}

function meta($, property) {
	return $(`meta[property="${property}"]`).attr("content") || $(`meta[name="${property}"]`).attr("content");
}
