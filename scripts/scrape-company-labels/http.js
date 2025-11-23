/** @format */

import axios from "axios";
import { ENV } from "./config.js";

const { BASE_DELAY_MS, JITTER_MS, REQUEST_TIMEOUT, RETRIES } = ENV;

// Per-host adaptive backoff multiplier (starts at 1)
const hostPenalty = new Map();

// Per-host stats we want to persist
// host -> {
//   host,
//   totalRequests,
//   successHtml,
//   nonHtmlOrEmpty,
//   blockCount,
//   errorCount,
//   statusCounts: { [status]: count },
//   lastStatus,
//   lastError,
//   lastDurationMs,
//   lastSeenAt
// }
const hostStats = new Map();

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const jitter = (base, j) => base + Math.floor(Math.random() * (j + 1));

function randomUserAgent() {
	const uas = [
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
	];
	return uas[Math.floor(Math.random() * uas.length)];
}

function isHtmlResponse(resp) {
	const ct = (resp.headers && resp.headers["content-type"]) || "";
	return ct.includes("text/html") || ct.includes("application/xhtml+xml");
}

// ---- host penalty helpers ----
export function getHostPenalty(host) {
	return Math.min(3, hostPenalty.get(host) || 1);
}

export const delayFor = async (host) => {
	const mult = getHostPenalty(host);
	const wait = Math.round(jitter(BASE_DELAY_MS, JITTER_MS) * mult);
	await sleep(wait);
};

// ---- host stats helpers ----
function getOrInitHostStats(host) {
	if (!hostStats.has(host)) {
		hostStats.set(host, {
			host,
			totalRequests: 0,
			successHtml: 0,
			nonHtmlOrEmpty: 0,
			blockCount: 0,
			errorCount: 0,
			statusCounts: {},
			lastStatus: null,
			lastError: null,
			lastDurationMs: null,
			lastSeenAt: null,
		});
	}
	return hostStats.get(host);
}

// Snapshot for writing to disk at the end
export function getHostStatsSnapshot() {
	const out = {};
	for (const [host, stats] of hostStats.entries()) {
		out[host] = stats;
	}
	return out;
}

// ---- main fetch ----
export async function fetchHtml(url, attempt = 0) {
	const headers = {
		"User-Agent": randomUserAgent(),
		Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
		"Cache-Control": "no-cache",
		Pragma: "no-cache",
	};

	const host = new URL(url).host;
	const penalty = getHostPenalty(host);
	const startTime = Date.now();

	if (attempt === 0) {
		console.log(`      [http] GET ${url} (host=${host}, penalty=${penalty.toFixed(2)})`);
	} else {
		console.log(`      [http] RETRY ${attempt} ${url} (host=${host}, penalty=${penalty.toFixed(2)})`);
	}

	const stats = getOrInitHostStats(host);

	try {
		const resp = await axios.get(url, {
			headers,
			maxRedirects: 5,
			timeout: REQUEST_TIMEOUT,
			validateStatus: () => true,
		});

		const dur = Date.now() - startTime;

		stats.totalRequests += 1;
		stats.lastStatus = resp.status;
		stats.lastDurationMs = dur;
		stats.lastSeenAt = new Date().toISOString();
		stats.statusCounts[resp.status] = (stats.statusCounts[resp.status] || 0) + 1;

		if (!isHtmlResponse(resp) || !resp.data) {
			const ct = (resp.headers && resp.headers["content-type"]) || "?";
			stats.nonHtmlOrEmpty += 1;
			console.log(`      [http] ${resp.status} non-HTML/empty (host=${host}, ${dur}ms, ct=${ct})`);
		} else {
			stats.successHtml += 1;
			console.log(`      [http] ${resp.status} OK (host=${host}, ${dur}ms)`);
		}

		// Count "blocks" (throttling) explicitly
		if (resp.status === 403 || resp.status === 429) {
			stats.blockCount += 1;
		}

		// Success path
		if (resp.status >= 200 && resp.status < 400 && isHtmlResponse(resp) && resp.data) {
			const cur = hostPenalty.get(host) || 1;
			hostPenalty.set(host, Math.max(1, cur * 0.95)); // cool off on success
			return String(resp.data);
		}

		// Adaptive backoff for throttles (clamped)
		if ([403, 429].includes(resp.status)) {
			const cur = hostPenalty.get(host) || 1;
			const next = Math.min(3, cur * 1.3);
			console.warn(`      [http] throttle status=${resp.status} on host=${host}, bump penalty ${cur.toFixed(2)} -> ${next.toFixed(2)}`);
			hostPenalty.set(host, next);
		}

		if (attempt < RETRIES && [403, 429, 500, 502, 503, 504].includes(resp.status)) {
			const backoff = 800 * (attempt + 1);
			console.log(`      [http] scheduling retry ${attempt + 1} for ${url} after ${backoff}ms`);
			await sleep(backoff);
			return fetchHtml(url, attempt + 1);
		}

		console.warn(`      [http] giving up on ${url} with status ${resp.status}`);
		return null;
	} catch (err) {
		const dur = Date.now() - startTime;

		stats.errorCount += 1;
		stats.lastError = err?.message || String(err);
		stats.lastDurationMs = dur;
		stats.lastSeenAt = new Date().toISOString();

		console.error(`      [http] error on ${url} (attempt=${attempt}, ${dur}ms):`, err?.message || err);

		if (attempt < RETRIES) {
			const backoff = 800 * (attempt + 1);
			console.log(`      [http] scheduling retry ${attempt + 1} for ${url} after ${backoff}ms (error path)`);
			await sleep(backoff);
			return fetchHtml(url, attempt + 1);
		}

		return null;
	}
}
