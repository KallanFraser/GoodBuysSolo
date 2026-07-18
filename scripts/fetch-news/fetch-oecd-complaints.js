/** @format */

import axios from "axios";

import { ENV } from "./config.js";
import { delayFor } from "../scrape-company-labels/http.js";

const PAGE_SIZE = 10;

export async function fetchOecdComplaints({ url, outletId, outletName }) {
	const host = new URL(url).host;
	const all = [];
	let page = 1;
	let totalPages = 1;

	while (page <= totalPages && all.length < ENV.MAX_ITEMS_PER_FEED) {
		await delayFor(host);
		const payload = await fetchFacetPage(url, page);
		if (!payload) {
			return { articles: all, feedMeta: { title: outletName, link: url }, error: `facet-page-${page}-failed` };
		}

		totalPages = parseTotalPages(payload) || totalPages;
		const items = parseComplaintItems(payload.template, { outletId, outletName });
		if (!items.length && page === 1) {
			return { articles: [], feedMeta: { title: outletName, link: url }, error: "no-complaint-items-found" };
		}

		for (const item of items) {
			if (all.length >= ENV.MAX_ITEMS_PER_FEED) break;
			all.push(item);
		}
		page += 1;
	}

	return {
		articles: all,
		feedMeta: { title: `${outletName} Complaints Database`, link: url },
		error: null,
	};
}

async function fetchFacetPage(pageUrl, page) {
	try {
		const body = new URLSearchParams();
		body.append("action", "facetwp_refresh");
		body.append("data[template]", "wp");
		body.append("data[soft_refresh]", "0");
		body.append("data[is_bfcache]", "0");
		body.append("data[first_load]", page === 1 ? "1" : "0");
		body.append("data[paged]", String(page));
		body.append("data[http_params][uri]", "complaints-database");
		body.append("data[http_params][url_vars]", "");

		const res = await axios.post(pageUrl, body.toString(), {
			timeout: ENV.REQUEST_TIMEOUT,
			headers: {
				"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
			},
		});
		return res.data;
	} catch {
		return null;
	}
}

function parseTotalPages(payload) {
	const n = payload?.settings?.pager?.total_pages;
	return Number.isFinite(n) ? n : parseInt(String(n || ""), 10) || null;
}

function parseComplaintItems(html, { outletId, outletName }) {
	if (!html || typeof html !== "string") return [];
	const items = [];
	const blocks = html.match(/<li class="list-complaint-results__item">[\s\S]*?<\/li>/g) || [];

	for (const block of blocks) {
		const href = capture(block, /<a href="([^"]+)" class="teaser-complaint__link">/);
		const titleRaw = capture(block, /<a href="[^"]+" class="teaser-complaint__link">([\s\S]*?)<\/a>/);
		const dateRaw = capture(block, /Date filed:\s*([^<]+)/);
		const issueRaw = capture(block, /<div class="teaser-complaint__issue">([\s\S]*?)<\/div>/);
		const statusRaw = capture(block, /<div class="complaint-status[^"]*">\s*([\s\S]*?)\s*<\/div>/);

		const title = cleanText(titleRaw);
		const url = href ? absolutize(href, "https://www.oecdwatch.org") : null;
		if (!title && !url) continue;

		const summary = cleanText(issueRaw);
		const status = cleanText(statusRaw);
		const categories = status ? [status] : [];
		const publishedAt = parseDate(dateRaw);

		items.push({
			outletId,
			outletName,
			url,
			urlSlug: slugFromUrl(url),
			title,
			summary,
			publishedAt,
			categories,
			guid: url,
		});
	}

	return items;
}

function capture(input, regex) {
	const m = input.match(regex);
	return m ? m[1] : "";
}

function cleanText(s) {
	return decodeEntities(
		String(s || "")
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.trim(),
	);
}

function decodeEntities(s) {
	if (!s) return "";
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function parseDate(raw) {
	const t = Date.parse(String(raw || "").trim());
	return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function absolutize(url, base) {
	try {
		return new URL(url, base).toString();
	} catch {
		return null;
	}
}

function slugFromUrl(url) {
	if (!url) return null;
	try {
		const u = new URL(url);
		const parts = u.pathname.split("/").filter(Boolean);
		return parts.length ? decodeURIComponent(parts[parts.length - 1]) : null;
	} catch {
		return null;
	}
}
