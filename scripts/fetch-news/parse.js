/** @format */

// RSS 2.0 / Atom parser. Input: raw XML string. Output: { articles: [...], feedMeta: {...}, error? }.
// Each article is normalised to:
//   {
//     outletId, outletName, url, urlSlug, title, summary,
//     publishedAt (ISO-8601 string or null),
//     categories: string[],
//     guid: string | null
//   }
//
// Summary and title are HTML-stripped and entity-decoded. No downstream
// consumer should need to touch HTML.

import { XMLParser } from "fast-xml-parser";

const xmlParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	trimValues: true,
	// fast-xml-parser promotes repeated-element siblings to arrays if we tell it which tags are always arrays.
	// We want <item> (RSS) and <entry> (Atom) always-array, plus <category> always-array.
	isArray: (name) => ["item", "entry", "category"].includes(name),
});

export function parseFeed(xml, { outletId, outletName } = {}) {
	if (!xml || typeof xml !== "string") {
		return { articles: [], feedMeta: null, error: "empty-or-non-string-input" };
	}

	let parsed;
	try {
		parsed = xmlParser.parse(xml);
	} catch (err) {
		return { articles: [], feedMeta: null, error: `xml-parse-failed: ${err.message}` };
	}

	// RSS 2.0: <rss><channel><item>...
	// Atom 1.0: <feed><entry>...
	if (parsed.rss && parsed.rss.channel) {
		return parseRss2(parsed.rss.channel, { outletId, outletName });
	}
	if (parsed.feed) {
		return parseAtom(parsed.feed, { outletId, outletName });
	}
	return { articles: [], feedMeta: null, error: "unrecognised-feed-format" };
}

function parseRss2(channel, { outletId, outletName }) {
	const items = Array.isArray(channel.item) ? channel.item : [];
	const feedBaseUrl = firstString(channel.link) || null;
	const articles = items
		.map((item) => normaliseRssItem(item, { outletId, outletName, feedBaseUrl }))
		.filter(Boolean);
	return {
		articles,
		feedMeta: { title: stripText(channel.title), link: feedBaseUrl },
	};
}

function parseAtom(feed, { outletId, outletName }) {
	const entries = Array.isArray(feed.entry) ? feed.entry : [];
	const articles = entries.map((e) => normaliseAtomEntry(e, { outletId, outletName })).filter(Boolean);
	return {
		articles,
		feedMeta: { title: stripText(feed.title), link: atomLink(feed.link) },
	};
}

function normaliseRssItem(item, { outletId, outletName, feedBaseUrl }) {
	const { text: extractedTitle, href: extractedHref } = extractRssTitle(item.title, feedBaseUrl);
	const url = firstString(item.link) || extractedHref || guidToString(item.guid);
	const title = extractedTitle || stripText(item.title);
	if (!url && !title) return null;

	const summary = stripHtml(item.description || item["content:encoded"] || "");
	const publishedAt = parseDate(item.pubDate || item["dc:date"]);
	const categories = Array.isArray(item.category) ? item.category.map(categoryToString).filter(Boolean) : [];
	const guid = guidToString(item.guid);
	const urlSlug = slugFromUrl(url);

	return {
		outletId,
		outletName,
		url: url || null,
		urlSlug,
		title,
		summary,
		publishedAt,
		categories,
		guid,
	};
}

function normaliseAtomEntry(entry, { outletId, outletName }) {
	const url = atomLink(entry.link);
	const title = stripText(entry.title);
	if (!url && !title) return null;

	const summary = stripHtml(entry.summary || entry.content || "");
	const publishedAt = parseDate(entry.published || entry.updated);
	const categories = Array.isArray(entry.category)
		? entry.category.map((c) => (typeof c === "string" ? c : c["@_term"] || c["@_label"] || "")).filter(Boolean)
		: [];
	const guid = typeof entry.id === "string" ? entry.id : null;
	const urlSlug = slugFromUrl(url);

	return {
		outletId,
		outletName,
		url: url || null,
		urlSlug,
		title,
		summary,
		publishedAt,
		categories,
		guid,
	};
}

// --- helpers ---

function firstString(v) {
	if (!v) return null;
	if (typeof v === "string") return v;
	if (Array.isArray(v)) return firstString(v[0]);
	if (typeof v === "object") return v["#text"] || v["@_href"] || null;
	return null;
}

function atomLink(link) {
	if (!link) return null;
	if (typeof link === "string") return link;
	if (Array.isArray(link)) {
		const alternate = link.find((l) => l["@_rel"] === "alternate" || !l["@_rel"]);
		return alternate?.["@_href"] || link[0]?.["@_href"] || null;
	}
	return link["@_href"] || null;
}

function categoryToString(c) {
	if (!c) return "";
	if (typeof c === "string") return c.trim();
	if (typeof c === "object") return (c["#text"] || c["@_term"] || "").trim();
	return "";
}

function guidToString(g) {
	if (!g) return null;
	if (typeof g === "string") return g;
	if (typeof g === "object") return g["#text"] || null;
	return null;
}

function extractRssTitle(titleNode, feedBaseUrl) {
	if (!titleNode) return { text: "", href: null };
	if (typeof titleNode === "string") {
		return { text: decodeEntities(titleNode).trim(), href: null };
	}
	if (Array.isArray(titleNode)) {
		for (const n of titleNode) {
			const got = extractRssTitle(n, feedBaseUrl);
			if (got.text || got.href) return got;
		}
		return { text: "", href: null };
	}
	if (typeof titleNode === "object") {
		if (titleNode.a) {
			const anchor = Array.isArray(titleNode.a) ? titleNode.a[0] : titleNode.a;
			const href = absolutizeMaybe(
				typeof anchor === "string" ? null : anchor?.["@_href"] || null,
				feedBaseUrl,
			);
			const text = decodeEntities(
				typeof anchor === "string" ? anchor : anchor?.["#text"] || "",
			).trim();
			return { text, href };
		}
		for (const v of Object.values(titleNode)) {
			const got = extractRssTitle(v, feedBaseUrl);
			if (got.text || got.href) return got;
		}
	}
	return { text: "", href: null };
}

function absolutizeMaybe(url, baseUrl) {
	if (!url || typeof url !== "string") return null;
	try {
		if (baseUrl) return new URL(url, baseUrl).toString();
		return new URL(url).toString();
	} catch {
		return null;
	}
}

function parseDate(d) {
	if (!d) return null;
	const str = typeof d === "string" ? d : d["#text"];
	if (!str) return null;
	const t = Date.parse(str);
	return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function slugFromUrl(url) {
	if (!url) return null;
	try {
		const u = new URL(url);
		const parts = u.pathname.split("/").filter(Boolean);
		if (!parts.length) return null;
		// Last non-numeric-only segment is usually the article slug.
		for (let i = parts.length - 1; i >= 0; i--) {
			if (!/^\d+$/.test(parts[i])) return decodeURIComponent(parts[i]);
		}
		return decodeURIComponent(parts[parts.length - 1]);
	} catch {
		return null;
	}
}

function stripText(v) {
	if (!v) return "";
	if (typeof v === "string") return decodeEntities(v).trim();
	if (typeof v === "object") return decodeEntities(v["#text"] || "").trim();
	return "";
}

function stripHtml(v) {
	const raw = typeof v === "string" ? v : v?.["#text"] || "";
	if (!raw) return "";
	return decodeEntities(
		raw
			.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<script[\s\S]*?<\/script>/gi, " ")
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
		.replace(/&nbsp;/g, " ")
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
