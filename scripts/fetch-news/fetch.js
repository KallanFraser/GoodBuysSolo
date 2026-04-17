/** @format */

// Thin wrapper over the crawler's shared http.js. Reuse is deliberate —
// per-host penalty state lives in that module and is shared across the
// news fetcher and the crawler, so a host rate-limiting one also slows
// the other.
//
// http.js's fetchHtml doesn't care about Content-Type; it returns the raw
// response body as a string. RSS feeds return that body as XML text, which
// is exactly what we need for downstream parsing.

import { fetchHtml, delayFor } from "../scrape-company-labels/http.js";

export async function fetchFeed(feedUrl) {
	const host = new URL(feedUrl).host;
	await delayFor(host);
	return fetchHtml(feedUrl);
}
