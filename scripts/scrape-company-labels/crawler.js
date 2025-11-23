/** @format */

import * as cheerio from "cheerio";

import { ENV, THRESHOLDS, DEADLINE } from "./config.js";
import DIRECTORY_HINTS from "./rules/directory-hints.js";

import { delayFor, fetchHtml, getHostPenalty } from "./http.js";
import {
	stripNoisySections,
	parseJsonLD,
	extractLinks,
	extractCompaniesGeneric,
	extractCompaniesPerSite,
	scoreCandidates,
	shouldIgnorePath,
	sameHost,
} from "./heuristics.js";
import { injectKnownCompaniesFromHistory, getKnownCompanySet } from "./known-companies.js";

const { MAX_CANDIDATES_PER_LABEL } = ENV;
const { MIN_SCORE, HARD_MIN_SCORE } = THRESHOLDS;

export async function crawlLabel(startUrl, { maxPages, maxDepth, seeds: extraSeeds }) {
	const origin = new URL(startUrl).origin;
	const hostname = new URL(startUrl).host;

	const seeds = new Set([startUrl]);
	for (const hint of DIRECTORY_HINTS) {
		try {
			const u = new URL(hint, origin).toString();
			if (!shouldIgnorePath(u)) seeds.add(u);
		} catch {
			// ignore bad URLs from hints
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
				// ignore bad URLs from label seed_urls
			}
		}
	}

	const queue = [];
	const enqueued = new Set();

	for (const s of seeds) {
		if (!enqueued.has(s)) {
			queue.push({ url: s, depth: 0 });
			enqueued.add(s);
		}
	}

	const visited = new Set();
	const agg = new Map(); // name -> { totalScore, reasons[], urls Set, pages Set, flags, known, snippets }
	const dropped = [];
	let pagesCrawled = 0;
	let cursor = 0;

	const knownCompanySet = getKnownCompanySet();

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
		stripNoisySections($, url);

		const { orgs: ldOrgs, lists: ldList } = parseJsonLD($);

		const ldSet = new Set([...ldOrgs, ...ldList]);

		let names = extractCompaniesPerSite($, hostname);
		if (!names || names.length === 0) {
			names = extractCompaniesGeneric($);
		}

		let mergedNames = Array.from(new Set([...names, ...ldSet]));

		mergedNames = injectKnownCompaniesFromHistory($, mergedNames);

		if (mergedNames.length > 0) {
			const scoredMap = scoreCandidates($, url, mergedNames, knownCompanySet);

			for (const [name, info] of scoredMap.entries()) {
				const hasStrongSignal = info.ext || info.detail || info.suffix || info.schema || info.known;

				if (info.score < MIN_SCORE && !hasStrongSignal) {
					dropped.push({
						name,
						url,
						reason: "failed_score_filter",
						score: info.score,
					});
					continue;
				}

				if (!agg.has(name)) {
					agg.set(name, {
						totalScore: 0,
						reasons: [],
						urls: new Set(),
						pages: new Set(),
						flags: {
							ext: false,
							detail: false,
							suffix: false,
							schema: false,
						},
						known: false,
						snippets: [],
					});
				}

				const rec = agg.get(name);
				rec.totalScore += info.score;
				for (const rs of info.reasons) rec.reasons.push(rs);
				if (info.urls) {
					for (const u of info.urls) rec.urls.add(u);
				}
				rec.pages.add(url);
				rec.flags.ext = rec.flags.ext || !!info.ext;
				rec.flags.detail = rec.flags.detail || !!info.detail;
				rec.flags.suffix = rec.flags.suffix || !!info.suffix;
				rec.flags.schema = rec.flags.schema || !!info.schema;
				rec.known = rec.known || !!info.known;

				if (info.snippets) {
					for (const sn of info.snippets) {
						if (rec.snippets.length < 5) {
							rec.snippets.push(sn);
						}
					}
				}
			}

			if (agg.size >= MAX_CANDIDATES_PER_LABEL) {
				console.log(`  [STOP] Reached MAX_CANDIDATES_PER_LABEL=${MAX_CANDIDATES_PER_LABEL} for ${hostname}, stopping label crawl.`);
				break;
			}
		}

		if (depth < maxDepth && pagesCrawled < maxPages) {
			const links = extractLinks($, url);
			for (const next of links) {
				if (!sameHost(startUrl, next)) continue;
				if (shouldIgnorePath(next)) continue;
				if (visited.has(next) || enqueued.has(next)) continue;
				enqueued.add(next);
				queue.push({ url: next, depth: depth + 1 });
			}
		}
	}

	const kept = [];

	for (const [name, rec] of agg.entries()) {
		const pageCount = rec.pages.size;
		const strongSignal = rec.flags.ext || rec.flags.detail || rec.flags.suffix || rec.flags.schema || rec.known;

		const baseScore = rec.totalScore;
		const diversityBoost = Math.log2(1 + pageCount);

		let finalScore = baseScore * diversityBoost;
		if (!strongSignal) {
			finalScore *= 0.4;
		}

		if ((!rec.known && finalScore < MIN_SCORE) || (!strongSignal && finalScore < HARD_MIN_SCORE)) {
			dropped.push({
				name,
				score: finalScore,
				pagesSeen: pageCount,
				droppedBecause: "below_threshold",
				sampleReasons: rec.reasons.slice(0, 5),
			});
		} else {
			kept.push({
				company: name,
				evidence: {
					score: finalScore,
					pagesSeen: pageCount,
					urls: Array.from(rec.urls),
					flags: rec.flags,
					reasons: rec.reasons.slice(0, 10),
					snippets: rec.snippets.slice(0, 5),
				},
			});
		}
	}

	kept.sort((a, b) => b.evidence.score - a.evidence.score || a.company.localeCompare(b.company));

	return {
		pagesCrawled,
		kept,
		droppedSample: dropped.slice(0, 200),
		droppedCount: dropped.length,
	};
}
