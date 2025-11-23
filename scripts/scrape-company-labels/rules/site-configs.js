/** @format */

// IMPORTANT:
// These rules are ONLY for domain-specific extraction.
// They should focus on explicit brand/company directories,
// not generic noise. Keep selectors HIGH-PRECISION.
//
// Rules structure:
// {
//   "domain.com": {
//      rules: [
//         { selector: "...", attr: null, splitOn: null },
//         { selector: "...", attr: "title" },
//         { selector: "...", splitOn: /[,/]/ }
//      ]
//   },
//   ...
// }
//
// ALWAYS keep selectors extremely targeted.
//

export default {
	// ------------------------------------------
	// FAIR TRADE CERTIFIED
	// https://www.fairtradecertified.org/
	// ------------------------------------------
	"www.fairtradecertified.org": {
		rules: [
			// Brand cards on directory pages
			{ selector: ".brand-card h3", attr: null },
			{ selector: ".brand-card .brand-card__title", attr: null },
			{ selector: ".brand-card .card-title", attr: null },

			// Retailer / partner cards
			{ selector: ".partner-card h3", attr: null },
			{ selector: ".partner-card .partner-card__title", attr: null },

			// Links inside directory grids
			{ selector: ".brand-card a", attr: null },

			// Fallback high-precision grab for brand grids
			{ selector: ".grid .card h3", attr: null },
		],
	},

	// ------------------------------------------
	// RAINFOREST ALLIANCE
	// https://www.rainforest-alliance.org/
	// ------------------------------------------
	"www.rainforest-alliance.org": {
		rules: [
			// Certified directory tiles
			{ selector: ".search-results .result-card h3", attr: null },
			{ selector: ".search-results .result-card .result-title", attr: null },

			// Partner / member cards
			{ selector: ".partner-card h3", attr: null },

			// Certification listing tables
			{ selector: "table tr td:first-child", attr: null },

			// Links to certified producer/company profile pages
			{ selector: ".result-card a", attr: null },
		],
	},

	// ------------------------------------------
	// B CORP
	// https://www.bcorporation.net/
	// ------------------------------------------
	"www.bcorporation.net": {
		rules: [
			{ selector: ".search-result-card h3", attr: null },
			{ selector: ".search-result-card .title", attr: null },
			{ selector: ".company-card h3", attr: null },
		],
	},

	// ------------------------------------------
	// GOTS (Global Organic Textile Standard)
	// ------------------------------------------
	"global-standard.org": {
		rules: [
			{ selector: ".results-table td:nth-child(1)", attr: null },
			{ selector: ".certified-operator-name", attr: null },
		],
	},

	// ------------------------------------------
	// USDA ORGANIC / NOP
	// ------------------------------------------
	"organic.ams.usda.gov": {
		rules: [
			{ selector: "table tr td:nth-child(1)", attr: null },
			{ selector: ".result-record .name", attr: null },
		],
	},

	// ------------------------------------------
	// FSC (Forest Stewardship Council)
	// ------------------------------------------
	"fsc.org": {
		rules: [
			{ selector: ".certificate-item .company-name", attr: null },
			{ selector: ".certificate-item h3", attr: null },
		],
	},

	// ------------------------------------------
	// MSC / ASC (Marine/Responsible Fisheries)
	// ------------------------------------------
	"msc.org": {
		rules: [
			{ selector: ".result-card h3", attr: null },
			{ selector: ".result-card .name", attr: null },
		],
	},
	"asc-aqua.org": {
		rules: [
			{ selector: ".item-title", attr: null },
			{ selector: ".producer-name", attr: null },
		],
	},

	// ------------------------------------------
	// EU ORGANIC Directory
	// ------------------------------------------
	"ec.europa.eu": {
		rules: [{ selector: "table tr td:nth-child(1)", attr: null }],
	},

	// ------------------------------------------
	// WORKER RIGHTS CONSORTIUM
	// ------------------------------------------
	"www.workersrights.org": {
		rules: [
			{ selector: ".brand-list li", attr: null },
			{ selector: ".brand-directory li", attr: null },
		],
	},

	// ------------------------------------------
	// GENERAL TEMPLATE (fallback)
	// ------------------------------------------
	__TEMPLATE__: {
		rules: [
			// This is just a guide for future additions
			{ selector: ".card h3", attr: null },
			{ selector: ".directory-item h3", attr: null },
			{ selector: ".listing .title", attr: null },
			{ selector: "table tr td:first-child", attr: null },
		],
	},
};
