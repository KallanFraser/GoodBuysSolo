// symbol-brand-allow.js
// ---------------------------------------------------------------------------
// Allowlist of brands that legitimately START with a symbol. These are exceptions
// to the “block symbol-leading names” rule in run.js. Keep exact casing for the
// most common representations you expect to see on the web. Add more as needed.
//
// Notes:
// - Only add **true company/brand names**, not product lines or campaigns.
// - Our gate in run.js only checks leading: &, +, -
// - Keep one entry per casing you actually see in the wild (scraped text is
//   case-sensitive here).
// ---------------------------------------------------------------------------

export default [
	// Ampersand-led brands
	"& Other Stories",
	"& OTHER STORIES",

	"&Tradition", // Danish furniture/design brand
	"&TRADITION",

	"&pizza", // US fast-casual chain
	"&PIZZA",

	"&SONS", // UK clothing brand (stylised in caps)
	"&Sons",

	// If you truly need hyphen/plus-led *companies* (rare), add below:
	// "+rehabstudio",     // (example: digital studio; verify if you need it)
	// "-M-"               // (example: if you encounter a legit hyphen-led brand)

	// Put new, verified symbol-led brands above this line.
];
