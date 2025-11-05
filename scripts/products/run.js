// Simple CLI to crawl one or all companies.
// Usage:
//   node scripts/products/run.js --company "Nike"
//   node scripts/products/run.js --all
//   node scripts/products/run.js --company "Nike" --ignore-robots

import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { crawlCompany } from "./crawlCompany.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Point to /public/data (project root)
const dataDir = path.join(process.cwd(), "public", "data");
const companiesPath = path.join(dataDir, "companies.seed.json");

const args = process.argv.slice(2);
const get = (k, def = null) => {
	const idx = args.findIndex((a) => a === `--${k}`);
	return idx >= 0 ? args[idx + 1] ?? true : def;
};
const companyArg = get("company");
const all = args.includes("--all");
const ignoreRobots = args.includes("--ignore-robots");

if (!fs.existsSync(companiesPath)) {
	console.error("Missing public/data/companies.seed.json");
	process.exit(1);
}

const companies = JSON.parse(fs.readFileSync(companiesPath, "utf8"));

(async () => {
	if (all) {
		for (const c of companies) {
			console.log(`\n=== Crawling ${c.name} ===`);
			await crawlCompany(c, { ignoreRobots });
		}
	} else if (companyArg) {
		const c = companies.find((x) => x.name?.toLowerCase() === String(companyArg).toLowerCase() || x.id === companyArg);
		if (!c) {
			console.error("Company not found in seed file");
			process.exit(1);
		}
		await crawlCompany(c, { ignoreRobots });
	} else {
		console.log('Usage: --company "Name" OR --all [--ignore-robots]');
	}
})();
