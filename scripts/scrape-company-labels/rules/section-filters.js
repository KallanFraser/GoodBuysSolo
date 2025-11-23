/** @format */

// IMPORTANT:
// These filters should ONLY remove sections that NEVER contain brand/company data.
// DO NOT remove grids, lists, cards, product-like containers, category wrappers,
// community/partner/member sections, or anything that *might* hold companies.

// Structure:
// {
//   globalRemove: [selectors],
//   pathSpecific: [
//      { pathPrefix: "/something", remove: [selectors...] }
//   ]
// }

export default {
	globalRemove: [
		// Navbars / footers / headers
		"header",
		"nav",
		"footer",

		// Cookie banners / consent
		"#cookie-banner",
		".cookie-banner",
		".cookie-consent",
		".cookies",
		".cookie-container",

		// Popups / modals
		".modal",
		".popup",
		".newsletter-popup",
		"#newsletter-modal",
		".subscribe-popup",

		// Advertisements / promos (safe)
		".ad",
		".ads",
		".advertisement",
		".promo-banner",

		// Social media embeds
		".social-links",
		".social-media",
		".share-buttons",

		// Utility UI elements
		".breadcrumbs",
		".pagination",
		".search-bar",
		".search-box",
		".search-container",

		// Sidebars (rarely contain companies)
		".sidebar",
		".side-column",
		".aside",

		// Hero sections – big banners, no data
		".hero",
		".hero-section",
		".page-hero",
		".banner",

		// Forms / CTAs
		"form",
		".contact-form",
		".newsletter",
		".subscribe",
	],

	// Minimal path-specific rules (we only target obvious trash)
	pathSpecific: [
		{
			pathPrefix: "/privacy",
			remove: ["body"], // nuke entire page, nothing useful ever here
		},
		{
			pathPrefix: "/terms",
			remove: ["body"],
		},
		{
			pathPrefix: "/login",
			remove: ["body"],
		},
		{
			pathPrefix: "/account",
			remove: ["body"],
		},
	],
};
