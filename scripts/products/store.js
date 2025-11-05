import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(process.cwd(), "public", "data");
const productsPath = path.join(dataDir, "products.json");

// Ensure path exists
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Normalize existing file into an array (handles: missing, [], or newline JSON)
function readExistingArray() {
	if (!fs.existsSync(productsPath)) return [];
	const raw = fs.readFileSync(productsPath, "utf8").trim();
	if (!raw) return [];

	// Case 1: proper JSON array
	if (raw.startsWith("[")) {
		try {
			const arr = JSON.parse(raw);
			return Array.isArray(arr) ? arr : [];
		} catch {
			return [];
		}
	}

	// Case 2: newline-delimited JSON → convert to array
	const lines = raw.split("\n").filter(Boolean);
	const arr = [];
	for (const line of lines) {
		try {
			const obj = JSON.parse(line);
			// Only keep fields we care about if schema differs
			if (obj && obj.name && obj.manufacturer_id) {
				arr.push({ name: obj.name, manufacturer_id: obj.manufacturer_id });
			} else if (obj && obj.name && obj.company_id) {
				const mid = `m-${String(obj.company_id).trim()}`;
				arr.push({ name: String(obj.name).trim(), manufacturer_id: mid });
			}
		} catch {
			// ignore bad lines
		}
	}
	return arr;
}

// De-dupe by (manufacturer_id, lower(name))
function dedupe(items) {
	const seen = new Set();
	const out = [];
	for (const it of items) {
		if (!it?.name || !it?.manufacturer_id) continue;
		const key = `${it.manufacturer_id.toLowerCase()}|${it.name.toLowerCase()}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ name: it.name, manufacturer_id: it.manufacturer_id });
	}
	return out;
}

export async function appendProducts(newItems) {
	const existing = readExistingArray();
	const merged = dedupe([...existing, ...(Array.isArray(newItems) ? newItems : [])]);

	// Write as pretty JSON array
	fs.writeFileSync(productsPath, JSON.stringify(merged, null, 2));
}
