/** @format */

// /app/lib/data.js
import labels from "../../public/data/labels.json";
import products from "../../public/data/products.json";
import manufacturerLabels from "../../public/data/manufacturer-labels.json";
import productLabels from "../../public/data/product-labels.json";
function resolveLabelIds(ids = []) {
	return ids.map((id) => labels.find((l) => l.id === id)).filter(Boolean);
}

export function findProductByName(query) {
	if (!query) return null;
	const q = query.trim().toLowerCase();
	const hit =
		products.find((p) => p.name.toLowerCase() === q) ||
		products.find((p) => p.name.toLowerCase().includes(q)) ||
		products.find((p) => (p.alt_names || []).some((a) => a.toLowerCase() === q)) ||
		products.find((p) => (p.alt_names || []).some((a) => a.toLowerCase().includes(q)));
	console.log("[findProductByName] query:", query, "hit:", hit?.id);
	return hit || null;
}

export function getManufacturerLabels(manufacturerId) {
	const entry = manufacturerLabels.find((m) => m.manufacturer_id === manufacturerId);
	if (!entry) return { manufacturerName: "Unknown", labels: [] };
	return { manufacturerName: entry.manufacturer_name, labels: resolveLabelIds(entry.label_ids) };
}

export function getProductLabels(productId) {
	const entry = productLabels.find((p) => p.product_id === productId);
	return resolveLabelIds(entry?.label_ids || []);
}

export function mergeUniqueLabels(...labelArrays) {
	const map = new Map();
	labelArrays.flat().forEach((l) => {
		if (!map.has(l.id)) map.set(l.id, l);
	});
	return Array.from(map.values());
}

export function roughEthicsScore(labelObjs) {
	if (!labelObjs?.length) return null;
	const sum = labelObjs.reduce((acc, l) => acc + (l.rigor_score || 0), 0);
	return Math.round((sum / labelObjs.length) * 10) / 10;
}

export function suggestProducts(query, limit = 5) {
	if (!query?.trim()) return [];
	const q = query.trim().toLowerCase();

	// score: startsWith > includes; name > alt_names
	const scored = products
		.map((p) => {
			const name = p.name.toLowerCase();
			const alts = (p.alt_names || []).map((a) => a.toLowerCase());
			let score = -1;

			if (name.startsWith(q)) score = Math.max(score, 3);
			if (name.includes(q)) score = Math.max(score, 2);

			for (const a of alts) {
				if (a.startsWith(q)) {
					score = Math.max(score, 2.5);
					break;
				}
				if (a.includes(q)) {
					score = Math.max(score, 1.5);
				}
			}

			return { p, score };
		})
		.filter((x) => x.score >= 0);

	scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
	return scored.slice(0, limit).map((x) => x.p);
}
