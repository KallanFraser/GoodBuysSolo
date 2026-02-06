/** @format */
import axios from "axios";
import { ENV } from "./config.js";

// Rotating User-Agents
const USER_AGENTS = [
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

const hostPenalties = new Map();
const hostStats = new Map();

export async function fetchHtml(url, retryCount = 0) {
	const host = new URL(url).host;
	const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

	try {
		const response = await axios.get(url, {
			timeout: ENV.REQUEST_TIMEOUT,
			headers: {
				"User-Agent": ua,
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.5",
			},
		});

		// FIX: Safety check to avoid NaN if host isn't in map yet
		if (hostPenalties.has(host)) {
			const current = hostPenalties.get(host) || 0;
			hostPenalties.set(host, Math.max(0, current - 0.5));
		}

		return response.data;
	} catch (err) {
		const status = err.response?.status;

		// Stats recording
		const stats = hostStats.get(host) || { success: 0, errors: {} };
		stats.errors[status || "Timeout"] = (stats.errors[status || "Timeout"] || 0) + 1;
		hostStats.set(host, stats);

		// 429 Rate Limit Handling
		if (status === 429 && retryCount < ENV.RETRIES) {
			const wait = parseInt(err.response.headers["retry-after"] || "5", 10) * 1000;
			console.warn(`[429] ${host} rate limit. Retrying in ${wait / 1000}s...`);

			// Increase penalty
			const currentPenalty = hostPenalties.get(host) || 0;
			hostPenalties.set(host, currentPenalty + 2);

			await new Promise((r) => setTimeout(r, wait));
			return fetchHtml(url, retryCount + 1);
		}

		return null;
	}
}

export function getHostPenalty(host) {
	return hostPenalties.get(host) || 0;
}

export async function delayFor(host) {
	const penalty = getHostPenalty(host);
	const base = ENV.BASE_DELAY_MS + penalty * 1000;
	const jitter = Math.random() * ENV.JITTER_MS;
	await new Promise((res) => setTimeout(res, base + jitter));
}

export function getHostStatsSnapshot() {
	return Object.fromEntries(hostStats);
}
