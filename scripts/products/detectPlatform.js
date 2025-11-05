export function detectPlatform(html, headers = {}) {
	const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), String(v)]));
	if (h["x-shopify-stage"] || /cdn\.shopify\.com/.test(html)) return "shopify";
	if (/woocommerce|wp-content/i.test(html)) return "woocommerce";
	if (/bigcommerce/i.test(html)) return "bigcommerce";
	if (/magento|mage-cache-storage/i.test(html)) return "magento";
	return "generic";
}
