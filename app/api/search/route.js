import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import companyLabelsData from "../../../src/data/company-labels.json";
import labelsData from "../../../src/data/labels.json";

// 1. PRE-COMPUTE LOOKUP MAPS
const labelMap = new Map(
	(Array.isArray(labelsData) ? labelsData : []).map((l) => [l.id, l]),
);

// Normalize helper
const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, "");

const companyMap = new Map();
if (Array.isArray(companyLabelsData)) {
	companyLabelsData.forEach((entry) => {
		const key = normalize(entry.company);
		companyMap.set(key, entry);
	});
}

export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const query = searchParams.get("q");

	if (!query) {
		return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
	}

	try {
		console.log(`[SearchAPI] Scraping DuckDuckGo for: "${query}"`);

		const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
			},
		});

		const html = await res.text();
		const $ = cheerio.load(html);
		const results = [];

		$(".result").each((i, element) => {
			if (i >= 15) return;

			const title = $(element).find(".result__title").text().trim();
			const link = $(element).find(".result__a").attr("href");
			const snippet = $(element).find(".result__snippet").text().trim();

			if (title && link) {
				let domain = "";
				try {
					const urlObj = new URL(link);
					domain = urlObj.hostname.replace("www.", "").split(".")[0];
				} catch {
					domain = "";
				}

				// Enrichment Logic
				const normalizedDomain = normalize(domain);
				const normalizedTitle = normalize(title);

				let matchedCompany = null;
				let ecoData = null;

				if (companyMap.has(normalizedDomain)) {
					matchedCompany = companyMap.get(normalizedDomain);
				} else {
					for (const [key, val] of companyMap.entries()) {
						if (normalizedTitle.includes(key) && key.length > 3) {
							matchedCompany = val;
							break;
						}
					}
				}

				if (matchedCompany) {
					const enrichedLabels = matchedCompany.labels.map((id) => labelMap.get(id)).filter(Boolean);

					ecoData = {
						// FIX: Use snake_case to match frontend
						company_name: matchedCompany.company,
						labels: enrichedLabels,
						label_count: enrichedLabels.length,
					};
				}

				results.push({
					title,
					link,
					domain,
					snippet,
					eco_data: ecoData,
				});
			}
		});

		return NextResponse.json({
			query,
			count: results.length,
			results,
		});
	} catch (error) {
		console.error("Scraping error:", error);
		return NextResponse.json({ error: "Failed to fetch results" }, { status: 500 });
	}
}
