/** @format */

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();

export const PATHS = {
	ROOT,
	SCRIPT_DIR: __dirname,
	LABELS_PATH: path.join(ROOT, "public", "data", "labels.json"),
	OUTPUT_PATH: path.join(ROOT, "public", "data", "news-preview.json"),
	HOST_STATS_PATH: path.join(ROOT, "public", "data", "news-preview.host-stats.json"),
};

function envFlag(name) {
	const v = process.env[name];
	if (!v) return false;
	const lower = String(v).toLowerCase();
	return lower === "1" || lower === "true" || lower === "yes";
}

export const ENV = {
	CONCURRENCY: parseInt(process.env.NEWS_CONCURRENCY || "5", 10),
	REQUEST_TIMEOUT: parseInt(process.env.NEWS_REQUEST_TIMEOUT || "15000", 10),
	MAX_ITEMS_PER_FEED: parseInt(process.env.NEWS_MAX_ITEMS_PER_FEED || "50", 10),
	BASE_DELAY_MS: parseInt(process.env.NEWS_BASE_DELAY_MS || "800", 10),
	JITTER_MS: parseInt(process.env.NEWS_JITTER_MS || "500", 10),
	DRY_RUN: envFlag("DRY_RUN"),
};
