/** @format */

import * as cheerio from "cheerio";
import { ENV, THRESHOLDS, DEADLINE } from "./config.js";
import DIRECTORY_HINTS from "./rules/directory-hints.js";
import { delayFor, fetchHtml } from "./http.js";
import { extractCompanies, stripNoisySections, shouldIgnorePath, sameHost } from "./heuristics.js";

const { MAX_CANDIDATES_PER_LABEL } = ENV;
const { MIN_SCORE } = THRESHOLDS;

export async function crawlLabel(startUrl, { maxPages, maxDepth }) {
	const origin = new URL(startUrl).origin;
	const seeds = new Set([startUrl]);

	for (const hint of DIRECTORY_HINTS) {
		try {
			const u = new URL(hint, origin).toString();
			if (!shouldIgnorePath(u)) seeds.add(u);
		} catch {}
	}

	const queue = [];
	const enqueued = new Set();
	for (const s of seeds) {
		queue.push({ url: s, depth: 0 });
		enqueued.add(s);
	}

	const visited = new Set();
	const agg = new Map();
	const dropped = [];
	let pagesCrawled = 0;
	let cursor = 0;

	while (cursor < queue.length && pagesCrawled < maxPages) {
		// Global time limit check
		if (Date.now() > DEADLINE) {
			console.log("  [STOP] Global time limit reached for this label.");
			break;
		}

		const { url, depth } = queue[cursor++];
		if (visited.has(url)) continue;
		visited.add(url);

		const host = new URL(url).host;
		await delayFor(host);

		const html = await fetchHtml(url);
		if (!html) continue;

		pagesCrawled++;
		const $ = cheerio.load(html);
		stripNoisySections($);

		const findings = extractCompanies($);
		for (const { company, evidence } of findings) {
			if (!agg.has(company)) {
				agg.set(company, { totalScore: 0, pages: new Set(), snippets: [] });
			}
			const rec = agg.get(company);
			rec.totalScore += evidence.score;
			rec.pages.add(url);
			if (rec.snippets.length < 5) rec.snippets.push(...(evidence.snippets || []));
		}

		if (agg.size >= MAX_CANDIDATES_PER_LABEL) break;

		if (depth < maxDepth) {
			$("a[href]").each((_, el) => {
				const href = $(el).attr("href");
				try {
					const next = new URL(href, url).toString();
					if (sameHost(startUrl, next) && !enqueued.has(next) && !shouldIgnorePath(next)) {
						enqueued.add(next);
						queue.push({ url: next, depth: depth + 1 });
					}
				} catch {}
			});
		}
	}

	const kept = Array.from(agg.entries())
		.map(([name, rec]) => {
			// Log-frequency boost: a mention across many pages of the same
			// label is signal; a single-page hit is usually noise. log2 keeps
			// one page from dominating the score — doubling page count adds
			// ~1x, not 2x.
			const score = rec.totalScore * Math.log2(1 + rec.pages.size);
			return { company: name, score, pagesSeen: rec.pages.size, rec };
		})
		.filter((item) => {
			if (item.score < MIN_SCORE) {
				dropped.push(item);
				return false;
			}
			return true;
		})
		.map((item) => ({
			company: item.company,
			evidence: { score: item.score, pagesSeen: item.pagesSeen, urls: Array.from(item.rec.pages), snippets: item.rec.snippets },
		}));

	return {
		pagesCrawled,
		kept,
		droppedSample: dropped.slice(0, 50),
		droppedCount: dropped.length,
	};
}
