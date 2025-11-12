/** @format */
export const Platform = {
	Shopify: "shopify",
	Woo: "woo",
	Magento: "magento",
	SFCC: "sfcc", // NEW
	Generic: "generic",
};

export function detectPlatform(html, origin) {
	const h = html.toLowerCase();

	// Shopify
	if (h.includes("shopify") || h.includes('id="shopify-section') || h.includes("x-shopify-stage") || /cdn\.shopify\.com/.test(h))
		return Platform.Shopify;

	// WooCommerce
	if (h.includes("woocommerce") || /\/wp-content\/plugins\/woocommerce\//.test(h) || /class="woocommerce/.test(h) || h.includes("wp-json"))
		return Platform.Woo;

	// Magento
	if (h.includes("mage-init") || h.includes("magento") || /\/static\/version\d+/.test(h) || /\/catalog\/product\//.test(h))
		return Platform.Magento;

	// Salesforce Commerce Cloud / Demandware (LEGO, Patagonia, Nike, etc)
	if (
		/on\/demandware\.store/i.test(h) ||
		/demandware\.static/i.test(h) ||
		/salesforce commerce cloud/i.test(h) ||
		/dwshop/i.test(h) ||
		/dwcontent|dwrest/i.test(h)
	)
		return Platform.SFCC;

	return Platform.Generic;
}
