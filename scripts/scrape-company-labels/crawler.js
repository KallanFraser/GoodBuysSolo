/** @format */

import * as cheerio from "cheerio";

import { ENV, THRESHOLDS, DEADLINE } from "./config.js";
import DIRECTORY_HINTS from "./rules/directory-hints.js";

import { delayFor, fetchHtml, getHostPenalty } from "./http.js";
import { extractCompanies, stripNoisySections, shouldIgnorePath, sameHost } from "./heuristics.js";

const { MAX_CANDIDATES_PER_LABEL } = ENV;
const { MIN_SCORE } = THRESHOLDS;

export async function crawlLabel(startUrl, { maxPages, maxDepth, seeds: extraSeeds }) {
	const origin = new URL(startUrl).origin;
	// const hostname = new URL(startUrl).host; // No longer needed for site-specific configs

	// 1. Build the seed set (startUrl + directory hints + extra seeds)
	const seeds = new Set([startUrl]);
	for (const hint of DIRECTORY_HINTS) {
		try {
			const u = new URL(hint, origin).toString();
			if (!shouldIgnorePath(u)) seeds.add(u);
		} catch {
			// ignore bad URLs
		}
	}

	if (Array.isArray(extraSeeds)) {
		for (const hint of extraSeeds) {
			if (!hint) continue;
			try {
				const u = new URL(hint, origin).toString();
				if (!sameHost(startUrl, u)) continue;
				if (!shouldIgnorePath(u)) seeds.add(u);
			} catch {
				// ignore
			}
		}
	}

	// 2. Initialize Queue
	const queue = [];
	const enqueued = new Set();

	for (const s of seeds) {
		if (!enqueued.has(s)) {
			queue.push({ url: s, depth: 0 });
			enqueued.add(s);
		}
	}

	const visited = new Set();
	const agg = new Map();
	// agg structure: name -> { totalScore, pages: Set, snippets: [], reasons: [] }

	const dropped = [];
	let pagesCrawled = 0;
	let cursor = 0;

	// 3. Main Crawl Loop
	while (cursor < queue.length && pagesCrawled < maxPages) {
		if (Date.now() > DEADLINE) {
			console.log("  [STOP] Global time limit reached, stopping crawl for this label.");
			break;
		}

		const { url, depth } = queue[cursor++];
		if (visited.has(url)) continue;
		if (shouldIgnorePath(url)) continue;
		visited.add(url);

		const host = new URL(url).host;
		const penalty = getHostPenalty(host);
		const remaining = queue.length - cursor;

		console.log(
			`  ↳ [${pagesCrawled + 1}/${maxPages}] depth=${depth} host=${host} penalty=${penalty.toFixed(2)} remaining=${remaining} GET ${url}`
		);

		await delayFor(host);

		const html = await fetchHtml(url);
		if (!html) continue;

		pagesCrawled++;
		const $ = cheerio.load(html);

		// Clean up junk before processing
		stripNoisySections($, url);

		// --- NEW EXTRACTION LOGIC ---
		// This now relies on the Matcher (Safe vs Ambiguous list)
		const findings = extractCompanies($, url);

		if (findings.length > 0) {
			for (const { company, evidence } of findings) {
				if (!agg.has(company)) {
					agg.set(company, {
						totalScore: 0,
						pages: new Set(),
						snippets: [],
						reasons: [],
					});
				}

				const rec = agg.get(company);
				rec.totalScore += evidence.score;
				rec.pages.add(url);

				// Collect snippets (up to 5 max)
				if (evidence.snippets && rec.snippets.length < 5) {
					rec.snippets.push(...evidence.snippets.slice(0, 5 - rec.snippets.length));
				}
			}
		}

		// Stop if we found way too many candidates (avoids memory leaks on massive directories)
		if (agg.size >= MAX_CANDIDATES_PER_LABEL) {
			console.log(`  [STOP] Reached MAX_CANDIDATES_PER_LABEL=${MAX_CANDIDATES_PER_LABEL}, stopping.`);
			break;
		}

		// 4. Queue new links
		if (depth < maxDepth && pagesCrawled < maxPages) {
			$("a[href]").each((_, el) => {
				const href = ($(el).attr("href") || "").trim();
				if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

				try {
					const next = new URL(href, url).toString();
					if (!sameHost(startUrl, next)) return;
					if (shouldIgnorePath(next)) return;
					if (visited.has(next) || enqueued.has(next)) return;

					enqueued.add(next);
					queue.push({ url: next, depth: depth + 1 });
				} catch {
					// ignore
				}
			});
		}
	}

	// 5. Aggregate & Filter Results
	const kept = [];

	for (const [name, rec] of agg.entries()) {
		const pageCount = rec.pages.size;

		// Diversity Boost: The more pages a company appears on, the more confident we are.
		// We multiply the score by log2(pageCount + 1).
		const diversityBoost = Math.log2(1 + pageCount);
		const finalScore = rec.totalScore * diversityBoost;

		// Threshold Check
		// Since we use a dictionary now, matches are high-confidence.
		// However, we still filter out very weak signals (e.g. 1 mention in a paragraph).
		if (finalScore < MIN_SCORE) {
			dropped.push({
				name,
				score: finalScore,
				pagesSeen: pageCount,
				droppedBecause: "below_threshold",
			});
		} else {
			kept.push({
				company: name,
				evidence: {
					score: finalScore,
					pagesSeen: pageCount,
					urls: Array.from(rec.pages), // Simplified: just keep page URLs
					snippets: rec.snippets.slice(0, 5),
					flags: { known: true }, // It matched our list, so it's "known"
				},
			});
		}
	}

	// Sort best matches first
	kept.sort((a, b) => b.evidence.score - a.evidence.score || a.company.localeCompare(b.company));

	return {
		pagesCrawled,
		kept,
		droppedSample: dropped.slice(0, 50),
		droppedCount: dropped.length,
	};
}
