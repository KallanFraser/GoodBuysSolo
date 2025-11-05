import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";

export async function fetchSitemapUrls(origin, UA) {
	const urls = new Set();
	for (const p of ["/sitemap.xml", "/sitemap_index.xml"]) {
		const res = await fetch(origin + p, { headers: { "User-Agent": UA } });
		if (!res.ok) continue;
		const xml = await res.text();
		const parser = new XMLParser({ ignoreAttributes: false });
		const data = parser.parse(xml);

		const locs = [];
		collectLocs(data, locs);
		for (const u of locs) {
			// if it’s a sitemap index, fetch nested sitemaps
			if (/sitemap.*\.xml$/i.test(u) && !/product|collection|shop|item/i.test(u)) {
				try {
					const r = await fetch(u, { headers: { "User-Agent": UA } });
					if (r.ok) {
						const x = await r.text();
						const d = parser.parse(x);
						collectLocs(d, locs);
					}
				} catch {}
			}
			urls.add(u);
		}
	}
	return [...urls];
}

function collectLocs(node, out) {
	if (!node || typeof node !== "object") return;
	if (node.url?.loc) out.push(node.url.loc);
	if (Array.isArray(node.url)) node.url.forEach((x) => x?.loc && out.push(x.loc));
	if (node.sitemap?.loc) out.push(node.sitemap.loc);
	if (Array.isArray(node.sitemap)) node.sitemap.forEach((x) => x?.loc && out.push(x.loc));
	for (const k of Object.keys(node)) collectLocs(node[k], out);
}
