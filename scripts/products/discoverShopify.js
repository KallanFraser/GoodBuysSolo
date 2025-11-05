import fetch from "node-fetch";

export async function discoverShopify(origin, UA) {
	// best-effort: most stores expose collection feeds and sometimes /products.json
	const urls = new Set();

	// Try site-wide products listing (capped)
	for (const path of ["/products.json?limit=250", "/collections/all/products.json?limit=250"]) {
		try {
			const r = await fetch(origin + path, { headers: { "User-Agent": UA } });
			if (!r.ok) continue;
			const j = await r.json();
			const products = j.products || j;
			if (Array.isArray(products)) {
				products.forEach((p) => {
					if (p?.handle) urls.add(`${origin}/products/${p.handle}`);
					if (p?.variants) p.variants.forEach((v) => v?.product_url && urls.add(v.product_url));
				});
			}
		} catch {}
	}

	return [...urls];
}
