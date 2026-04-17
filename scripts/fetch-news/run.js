/** @format */

// News fetcher pipeline: retrieve → parse → match → write.
// Produces a preview JSON dump of all fetched articles with their match
// results, plus a host-stats file for debugging rate limits / 403s. See
// scripts/scrape-company-labels/run.js for the architectural pattern this
// mirrors, and the README-adjacent comment in matcher.js for the matching
// design. This session's scope ends at the preview file; no DB writes,
// no API exposure, no frontend.

import pLimit from "p-limit";
import fs from "fs/promises";

import FEEDS from "./rules/feeds.js";
import { ENV, PATHS } from "./config.js";
import { fetchFeed } from "./fetch.js";
import { parseFeed } from "./parse.js";
import { initMatcher, matchArticle } from "./matcher.js";
import { writePreview, writeHostStats } from "./io.js";
import { getHostStatsSnapshot } from "../scrape-company-labels/http.js";

async function main() {
	console.log("=======================================");
	console.log("      GoodBuys News Fetcher            ");
	console.log("=======================================");
	console.log(`Feeds: ${FEEDS.length}   Concurrency: ${ENV.CONCURRENCY}`);

	// Init the matcher before any fetches so any guard violations throw early
	// (same principle as the crawler: fail loud at startup).
	const labels = JSON.parse(await fs.readFile(PATHS.LABELS_PATH, "utf8"));
	initMatcher({ labels });
	console.log("");

	const limit = pLimit(ENV.CONCURRENCY);
	const results = [];

	const tasks = FEEDS.map((feed) =>
		limit(async () => {
			const started = Date.now();
			try {
				const xml = await fetchFeed(feed.url);
				const elapsed = Date.now() - started;
				if (!xml) {
					console.error(`[${feed.id}] FAIL — fetch returned null (see host-stats)`);
					results.push({ feed, ok: false, error: "empty-response", elapsed });
					return;
				}
				const head = xml.slice(0, 500);
				const looksLikeXml = /^\s*<\?xml/.test(head) || /^\s*<(rss|feed)\b/i.test(head);

				const { articles, feedMeta, error: parseError } = parseFeed(xml, {
					outletId: feed.id,
					outletName: feed.name,
				});
				if (parseError) {
					console.error(`[${feed.id}] parse-error: ${parseError}`);
					results.push({ feed, ok: false, error: `parse: ${parseError}`, elapsed });
					return;
				}

				// Truncate to MAX_ITEMS_PER_FEED to cap memory / log volume.
				const capped = articles.slice(0, ENV.MAX_ITEMS_PER_FEED);

				// Match each article.
				const annotated = capped.map((a) => ({ ...a, matches: matchArticle(a) }));
				const matchedCount = annotated.filter((a) => a.matches.length).length;

				console.log(
					`[${feed.id}] ok — ${xml.length.toLocaleString()} bytes in ${elapsed}ms, parsed ${capped.length}/${articles.length} items, ` +
						`${matchedCount} matched${looksLikeXml ? "" : "   WARN: no xml prologue"}`,
				);
				results.push({ feed, ok: true, bytes: xml.length, elapsed, articles: annotated, feedMeta });
			} catch (err) {
				const elapsed = Date.now() - started;
				console.error(`[${feed.id}] FAIL — ${err.message || err}`);
				results.push({ feed, ok: false, error: err.message || String(err), elapsed });
			}
		}),
	);

	await Promise.all(tasks);

	console.log("");
	console.log("--- Summary ---");
	let totalArticles = 0;
	let totalMatched = 0;
	for (const r of results) {
		if (r.ok) {
			totalArticles += r.articles.length;
			const matched = r.articles.filter((a) => a.matches.length).length;
			totalMatched += matched;
			console.log(
				`  OK    ${r.feed.id.padEnd(20)} ${String(r.articles.length).padStart(3)} items   ${String(matched).padStart(3)} matched`,
			);
		} else {
			console.log(`  FAIL  ${r.feed.id.padEnd(20)} ${r.error}`);
		}
	}
	console.log(`  ------------------------------------------`);
	console.log(`  TOTAL: ${totalArticles} articles, ${totalMatched} matched to ≥1 label`);

	// Every matched article, per feed, with the specific matches inline.
	console.log("");
	console.log("--- All matched articles ---");
	for (const r of results) {
		if (!r.ok) continue;
		const matched = r.articles.filter((a) => a.matches.length);
		if (!matched.length) continue;
		console.log(`  [${r.feed.id}] ${matched.length} matched:`);
		for (const a of matched) {
			console.log(`    "${a.title.slice(0, 85)}${a.title.length > 85 ? "..." : ""}"`);
			for (const m of a.matches) {
				console.log(`       → ${m.labelId.padEnd(28)} ${m.bucket.padEnd(10)} ${m.tier.padEnd(17)} @${m.where}   [${String(m.matchedText).slice(0, 40)}]`);
			}
		}
		console.log("");
	}

	// Unmatched sample (so we can eyeball whether we missed anything we should have caught).
	console.log("--- Unmatched sample (first 3 per feed) ---");
	for (const r of results) {
		if (!r.ok) continue;
		const unmatched = r.articles.filter((a) => !a.matches.length).slice(0, 3);
		if (!unmatched.length) continue;
		console.log(`  [${r.feed.id}]`);
		for (const a of unmatched) {
			console.log(`    - ${a.title.slice(0, 100)}${a.title.length > 100 ? "..." : ""}`);
		}
	}
	console.log("");

	console.log("--- Host stats ---");
	const hs = getHostStatsSnapshot();
	if (Object.keys(hs).length === 0) {
		console.log("  (no errors recorded)");
	} else {
		console.log(JSON.stringify(hs, null, 2));
	}
	console.log("");

	// --- Writes ---
	if (ENV.DRY_RUN) {
		console.log("[DRY_RUN] Skipping preview + host-stats writes.");
	} else {
		const fetchedAt = new Date().toISOString();
		const flat = [];
		for (const r of results) {
			if (!r.ok) continue;
			for (const a of r.articles) flat.push({ ...a, fetchedAt });
		}
		// Each write isolated so one failure doesn't lose the other output.
		await tryWrite("news-preview.json", () => writePreview(flat));
		await tryWrite("news-preview.host-stats.json", () => writeHostStats(hs));
	}

	console.log("");
	console.log("Done.");
}

async function tryWrite(label, fn) {
	try {
		await fn();
	} catch (err) {
		console.error(`[news] FAIL write ${label}: ${err.message || err}`);
	}
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
