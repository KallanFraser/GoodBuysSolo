/** @format */

// IMPORTANT:
// Only block paths that NEVER contain brand/company listings.
// DO NOT block "shop", "store", "community", "partners", "members", "brands"
// because eco-label directories often live under those paths.

export default [
	// Account / Auth
	"/login",
	"/signin",
	"/sign-in",
	"/signup",
	"/sign-up",
	"/register",
	"/account",
	"/my-account",
	"/user",
	"/profile",

	// Cart / Checkout
	"/cart",
	"/checkout",
	"/bag",

	// Pure marketing pages (safe to ignore)
	"/blog",
	"/article",
	"/news",
	"/press",

	// Legal (always useless)
	"/privacy",
	"/privacy-policy",
	"/terms",
	"/terms-of-use",
	"/terms-and-conditions",
	"/cookies",
	"/cookie-policy",

	// Search pages usually contain junk and no structured listings
	"/search",

	// Contact / About (never brand listings)
	"/contact",
	"/contact-us",
	"/about",
	"/about-us",

	// Misc generic pages
	"/donate",
	"/events",
	"/careers",
	"/jobs",
	"/resources",
];
