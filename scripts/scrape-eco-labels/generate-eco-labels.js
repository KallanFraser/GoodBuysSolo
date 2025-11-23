/* eslint-disable no-console */
/**
 * One-shot script to grab ecolabel names from Ecolabel Index
 * and generate /data/ecolabels.js with a flat array of strings.
 *
 * NOTE: This is for personal/research use. Check Ecolabel Index's
 * terms of use before hammering it or redistributing the raw list.
 */

import fs from "fs/promises";
import path from "path";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const ECOLABEL_URL = "https://www.ecolabelindex.com/ecolabels/";

async function main() {
	console.log("[ecolabels] Fetching:", ECOLABEL_URL);
	const res = await fetch(ECOLABEL_URL);
	if (!res.ok) {
		throw new Error(`[ecolabels] HTTP ${res.status} fetching ${ECOLABEL_URL}`);
	}

	const html = await res.text();
	const $ = cheerio.load(html);

	// Pattern on the page: each label is an <h4> / "####" heading.
	// In the HTML we saw, it’s rendered as <h4> within those blocks.
	const names = new Set();

	$("h4, h3, h2").each((_, el) => {
		const text = $(el).text().trim();
		// Filter out generic headings like "All ecolabels"
		if (!text) return;
		if (/All ecolabels/i.test(text)) return;
		if (/Alphabetical index/i.test(text)) return;

		// Heuristic: most label names have at least 3 chars and no colon at end
		if (text.length >= 3) {
			names.add(text);
		}
	});

	const sorted = Array.from(names).sort((a, b) => a.localeCompare(b));

	console.log(`[ecolabels] Found ~${sorted.length} unique candidates`);

	const fileHeader =
		`// Auto-generated from ${ECOLABEL_URL}\n` + `// Run date: ${new Date().toISOString()}\n\n` + `export const ECO_LABELS = [\n`;

	const fileFooter = `];\n`;

	const body = sorted.map((name) => `  ${JSON.stringify(name)},`).join("\n");

	const fileContents = fileHeader + body + "\n" + fileFooter;

	const outPath = path.join(process.cwd(), "scripts", "scrape-eco-labels", "ecolabels.js");
	await fs.mkdir(path.dirname(outPath), { recursive: true });
	await fs.writeFile(outPath, fileContents, "utf-8");

	console.log("[ecolabels] Wrote:", outPath);
}

main().catch((err) => {
	console.error("[ecolabels] ERROR:", err);
	process.exit(1);
});
