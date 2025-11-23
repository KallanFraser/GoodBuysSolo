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
	OUTPUT_PATH: path.join(ROOT, "public", "data", "company-labels.json"),
	AUDIT_PATH: path.join(ROOT, "public", "data", "company-labels.audit.json"),
	HOST_STATS_PATH: path.join(ROOT, "public", "data", "company-labels.host-stats.json"),
};

// Helper to interpret boolean env vars sanely
function envFlag(name) {
	const v = process.env[name];
	if (!v) return false;
	const lower = String(v).toLowerCase();
	return lower === "1" || lower === "true" || lower === "yes";
}

export const ENV = {
	MAX_PAGES: parseInt(process.env.MAX_PAGES || "100", 10),
	MAX_DEPTH: parseInt(process.env.DEPTH || "3", 10),
	CONCURRENCY: parseInt(process.env.CONCURRENCY || "24", 10),
	BASE_DELAY_MS: parseInt(process.env.BASE_DELAY_MS || "900", 10),
	JITTER_MS: parseInt(process.env.JITTER_MS || "700", 10),
	REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT || "12000", 10),

	RETRIES: 2,
	DRY_RUN: envFlag("DRY_RUN"),
	SCORE_THRESHOLD: parseInt(process.env.SCORE_THRESHOLD || "7", 10),
	PER_LABEL_KEEP: parseInt(process.env.PER_LABEL_KEEP || "500", 10),
	CLEAR_OUTPUT: envFlag("CLEAR_OUTPUT"),

	TIME_LIMIT_MINUTES: parseInt(process.env.TIME_LIMIT_MINUTES || "30", 10),
	MAX_CANDIDATES_PER_LABEL: parseInt(process.env.MAX_CANDIDATES_PER_LABEL || "2500", 10),
};

export const THRESHOLDS = {
	MIN_SCORE: ENV.SCORE_THRESHOLD,
	HARD_MIN_SCORE: ENV.SCORE_THRESHOLD + 3,
};

// Global deadline for this process
export const DEADLINE = Date.now() + ENV.TIME_LIMIT_MINUTES * 60 * 1000;
