/** @format */
import { normalizeText } from "../utils/html.js";

export async function resolveDomainForCompany(name, seedDomain, domainHints) {
	// 1) explicit domain wins
	if (seedDomain) return seedDomain.replace(/^https?:\/\//, "").replace(/^www\./, "");

	// 2) hints from company-labels evidence
	const hints = domainHints?.get(name) || new Set();
	if (hints.size > 0) {
		// Prefer shortest, non-marketplace-ish host
		const candidates = Array.from(hints).filter(
			(h) => !/amazon\.|ebay\.|etsy\.|shopify\.|bigcartel\.|bigcommerce\.|walmart\.|alibaba\.|aliexpress\./i.test(h)
		);
		candidates.sort((a, b) => a.length - b.length);
		if (candidates[0]) return candidates[0];
	}

	// 3) naive guess: normalize brand name and try .com (last resort; often wrong)
	const slug = normalizeText(name)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");
	if (slug.length >= 3) return `${slug}.com`;

	return null;
}
