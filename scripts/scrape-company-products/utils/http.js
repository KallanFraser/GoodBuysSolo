/** @format */
// Lightweight HTTP utils with jittered concurrency + robots sitemap discovery.

import axios from "axios";
import pLimit from "p-limit";

let CONFIG = {
	BASE_DELAY_MS: 800,
	JITTER_MS: 600,
	RETRIES: 2,
	REQUEST_TIMEOUT: 20000,
	CONCURRENCY_PAGES: 4,
};

let limit = pLimit(CONFIG.CONCURRENCY_PAGES);

export function setHttpConfig(cfg) {
	CONFIG = { ...CONFIG, ...cfg };
	limit = pLimit(CONFIG.CONCURRENCY_PAGES);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base, j) => base + Math.floor(Math.random() * (j + 1));

function randomUA() {
	const uas = [
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
	];
	return uas[Math.floor(Math.random() * uas.length)];
}

async function _get(url, type = "html", attempt = 0) {
	const headers = {
		"User-Agent": randomUA(),
		Accept:
			type === "json"
				? "application/json,text/javascript;q=0.9,*/*;q=0.8"
				: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
		"Cache-Control": "no-cache",
		Pragma: "no-cache",
	};

	try {
		const resp = await axios.get(url, {
			headers,
			maxRedirects: 5,
			timeout: CONFIG.REQUEST_TIMEOUT,
			validateStatus: () => true,
		});

		if (resp.status >= 200 && resp.status < 400 && resp.data) {
			return resp.data;
		}

		if (attempt < CONFIG.RETRIES && [403, 429, 500, 502, 503, 504].includes(resp.status)) {
			await sleep(800 * (attempt + 1));
			return _get(url, type, attempt + 1);
		}
		return null;
	} catch {
		if (attempt < CONFIG.RETRIES) {
			await sleep(800 * (attempt + 1));
			return _get(url, type, attempt + 1);
		}
		return null;
	}
}

export async function fetchHtml(url) {
	return limit(async () => {
		await sleep(jitter(CONFIG.BASE_DELAY_MS, CONFIG.JITTER_MS));
		const data = await _get(url, "html");
		return typeof data === "string" ? data : null;
	});
}

export async function fetchJson(url) {
	return limit(async () => {
		await sleep(jitter(CONFIG.BASE_DELAY_MS, CONFIG.JITTER_MS));
		const data = await _get(url, "json");
		if (!data) return null;
		try {
			return typeof data === "string" ? JSON.parse(data) : data;
		} catch {
			return null;
		}
	});
}

// Pull Sitemap: lines from robots.txt
export async function sitemapsFromRobots(origin) {
	const robotsUrl = `${origin.replace(/\/$/, "")}/robots.txt`;
	const txt = await fetchHtml(robotsUrl);
	if (!txt) return [];
	const maps = [];
	for (const line of String(txt).split(/\r?\n/)) {
		const m = line.match(/^\s*sitemap:\s*(\S+)\s*$/i);
		if (m) maps.push(m[1].trim());
	}
	return maps;
}
