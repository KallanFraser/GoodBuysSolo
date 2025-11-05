export function scoreProduct(company, pageUrl, meta) {
	let s = 0;
	const host = safeHost(pageUrl);
	if (company.domains.includes(host)) s += 0.6;
	if (meta.brand && company.brand_aliases?.some((a) => String(meta.brand).toLowerCase().includes(a))) s += 0.2;
	if (meta.gtin && company.gs1_prefixes?.some((pref) => String(meta.gtin).startsWith(pref))) s += 0.2;
	return Math.min(1, s);
}

function safeHost(u) {
	try {
		return new URL(u).host.replace(/^www\./, "");
	} catch {
		return "";
	}
}
