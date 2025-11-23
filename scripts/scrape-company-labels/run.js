/** @format */

import pLimit from "p-limit";
import fs from "fs/promises";

import { PATHS, ENV } from "./config.js";
import { loadJson, mergeCompanyLabels, writeCompanyLabels, writeHostStats, writeAudit } from "./io.js";

import { isPlausibleCompanyRow, seedLabelNames } from "./heuristics.js";
import { bootstrapKnownCompanies } from "./known-companies.js";
import { crawlLabel } from "./crawler.js";
import { getHostStatsSnapshot } from "./http.js";

const { LABELS_PATH, OUTPUT_PATH, AUDIT_PATH } = PATHS;
const { MAX_PAGES, MAX_DEPTH, CONCURRENCY, SCORE_THRESHOLD, PER_LABEL_KEEP, CLEAR_OUTPUT, DRY_RUN } = ENV;

// flip to true if you want extra logs
const DEBUG = false;

async function main() {
	console.log("=======================================");
	console.log("        GoodBuys Label Scraper         ");
	console.log("=======================================");

	// --------------------------
	// 1. Load labels.json
	// --------------------------
	const labels = await loadJson(LABELS_PATH);
	if (!Array.isArray(labels) || labels.length === 0) {
		console.error("[run] ERROR: labels.json is empty or unreadable");
		return;
	}

	// Seed label names into heuristics (so label names never look like companies)
	seedLabelNames(labels);

	// --------------------------
	// 2. Load existing company-labels
	// --------------------------
	let existingCompanyLabels = await loadJson(OUTPUT_PATH, []);

	// Keep only rows that still look sane
	existingCompanyLabels = existingCompanyLabels.filter((row) => isPlausibleCompanyRow(row));

	// Build a quick index of what we *already* had per label so we can compare
	// new crawl results against historical data in the audit.
	const prevByLabel = new Map();
	for (const row of existingCompanyLabels) {
		const labelsArr = Array.isArray(row.labels) ? row.labels : [];
		for (const lbl of labelsArr) {
			if (!prevByLabel.has(lbl)) {
				prevByLabel.set(lbl, []);
			}
			prevByLabel.get(lbl).push(row.company);
		}
	}

	// Known-company boosting (reuse previously found companies)
	if (!CLEAR_OUTPUT && existingCompanyLabels.length) {
		bootstrapKnownCompanies(existingCompanyLabels);
	}

	let companyLabels = CLEAR_OUTPUT ? [] : existingCompanyLabels;
	const auditAll = [];

	console.log(`Loaded ${labels.length} labels from ${LABELS_PATH}`);
	console.log(`Output → ${OUTPUT_PATH}`);
	console.log(`Audit  → ${AUDIT_PATH}`);
	console.log(`CLEAR_OUTPUT=${CLEAR_OUTPUT} DRY_RUN=${DRY_RUN}`);
	console.log(`MAX_PAGES=${MAX_PAGES} MAX_DEPTH=${MAX_DEPTH} CONCURRENCY=${CONCURRENCY} SCORE_THRESHOLD=${SCORE_THRESHOLD}`);
	console.log("");

	// --------------------------
	// 3. Crawl each label (with concurrency)
	// --------------------------
	const limit = pLimit(CONCURRENCY);

	const tasks = labels.map((label) =>
		limit(async () => {
			const { id, name, seed_urls = [], source_url } = label;

			const seeds = seed_urls && seed_urls.length > 0 ? seed_urls : source_url ? [source_url] : [];

			if (DEBUG) {
				console.log(`\n[DEBUG] Starting label: ${id}`);
				console.log("[DEBUG] Seeds:", seeds);
			}

			const startUrl = seeds[0] || source_url;
			if (!startUrl) {
				console.warn(`[${id}] Skipping label – no valid seed/source URL.`);
				return;
			}

			let result;
			try {
				result = await crawlLabel(startUrl, {
					maxPages: MAX_PAGES,
					maxDepth: MAX_DEPTH,
					seeds,
				});
			} catch (err) {
				console.error(`[ERROR] crawlLabel crashed for ${id}:`, err);
				return;
			}

			if (!result) {
				console.error(`[ERROR] crawlLabel returned no result for ${id}`);
				return;
			}

			const { kept = [], droppedSample = [], droppedCount = 0, pagesCrawled = 0 } = result;

			// Shape kept results into
			// { company, labels:[labelId], evidenceByLabel:{ [labelId]: [evidence] } }
			if (kept.length > 0) {
				const keptForThisLabel = kept.map((item) => {
					const evidence = item.evidence || {};
					const evidenceEntry = {
						...evidence,
						labelId: id,
						labelName: name,
					};

					return {
						company: item.company,
						labels: [id],
						evidenceByLabel: {
							[id]: [evidenceEntry],
						},
					};
				});

				companyLabels = mergeCompanyLabels(companyLabels, keptForThisLabel, {
					perLabelLimit: PER_LABEL_KEEP,
				});
			}

			// Build audit entry using existing company-labels data as a baseline
			const prevCompanies = prevByLabel.get(id) || [];
			const prevSet = new Set(prevCompanies.map((c) => c.toLowerCase()));

			const newNames = kept.map((k) => (k.company || "").trim()).filter(Boolean);
			const newSet = new Set(newNames.map((c) => c.toLowerCase()));

			const newlyFound = [];
			for (const name of newNames) {
				if (!prevSet.has(name.toLowerCase())) {
					newlyFound.push(name);
				}
			}

			const lost = [];
			for (const name of prevCompanies) {
				if (!newSet.has(name.toLowerCase())) {
					lost.push(name);
				}
			}

			// Always push an audit row – even if nothing was dropped – so the file
			// never looks "empty" for labels we actually touched.
			auditAll.push({
				label: id,
				name,
				pagesCrawled,
				scoreThreshold: SCORE_THRESHOLD,
				keptCount: kept.length,
				droppedCount,
				prevCount: prevCompanies.length,
				newlyFoundCount: newlyFound.length,
				lostCount: lost.length,
				sample: {
					// keep audit sample intentionally small to avoid a gigantic file
					kept: kept.slice(0, 25).map(({ company, evidence }) => ({
						company,
						score: evidence && typeof evidence.score === "number" ? evidence.score : null,
						pagesSeen: evidence && typeof evidence.pagesSeen === "number" ? evidence.pagesSeen : null,
						urls: Array.isArray(evidence && evidence.urls) ? evidence.urls.slice(0, 5) : [],
						flags: (evidence && evidence.flags) || {},
						snippets: Array.isArray(evidence && evidence.snippets) ? evidence.snippets.slice(0, 3) : [],
					})),
					dropped: droppedSample.slice(0, 50),
					prevCompanies: prevCompanies.slice(0, 50),
					newlyFound: newlyFound.slice(0, 50),
					lost: lost.slice(0, 50),
				},
			});

			console.log(`[${id}] kept=${kept.length} dropped=${droppedCount} pages=${pagesCrawled}`);
		})
	);

	await Promise.all(tasks);

	// --------------------------
	// 4. Write outputs
	// --------------------------
	console.log("\nWriting outputs...");
	if (DRY_RUN) {
		console.log("[DRY_RUN] Skipping writes to company-labels.json and audit.");
	} else {
		await writeCompanyLabels(companyLabels);
		await writeAudit(auditAll);
	}

	// Host stats for debugging rate limits / 403s
	const hostStats = getHostStatsSnapshot();
	await writeHostStats(hostStats);

	console.log("Done ✔");
	console.log("=======================================");
}

main().catch((err) => {
	console.error("Fatal error in run.js:", err);
	process.exit(1);
});
