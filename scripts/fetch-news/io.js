/** @format */

// Atomic tmp + rename writes for the news fetcher outputs. Mirrors the
// pattern in scripts/scrape-company-labels/io.js — safety against partial
// writes matters here too: downstream consumers reading mid-write should
// never see a half-committed file.

import fs from "fs/promises";
import path from "path";

import { PATHS } from "./config.js";

const { OUTPUT_PATH, HOST_STATS_PATH } = PATHS;

export async function writePreview(articlesWithMatches) {
	if (!Array.isArray(articlesWithMatches)) {
		throw new Error(`[news-io] writePreview: expected array, got ${typeof articlesWithMatches}`);
	}
	await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
	const tmp = OUTPUT_PATH + ".tmp";
	await fs.writeFile(tmp, JSON.stringify(articlesWithMatches, null, 2), "utf8");
	await fs.rename(tmp, OUTPUT_PATH);
	console.log(`Preview  → ${OUTPUT_PATH}`);
}

export async function writeHostStats(hostStats) {
	if (!hostStats || typeof hostStats !== "object") return;
	await fs.mkdir(path.dirname(HOST_STATS_PATH), { recursive: true });
	const tmp = HOST_STATS_PATH + ".tmp";
	await fs.writeFile(tmp, JSON.stringify(hostStats, null, 2), "utf8");
	await fs.rename(tmp, HOST_STATS_PATH);
	console.log(`Host stats → ${HOST_STATS_PATH}`);
}
