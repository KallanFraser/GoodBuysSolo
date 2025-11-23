/** @format */

import fs from "fs/promises";
import path from "path";
import { PATHS } from "./config.js";

const { OUTPUT_PATH, HOST_STATS_PATH, AUDIT_PATH } = PATHS;

// Generic JSON loader with fallback
export async function loadJson(p, fallback) {
	try {
		const buf = await fs.readFile(p, "utf8");
		return JSON.parse(buf);
	} catch {
		return fallback;
	}
}

// Merge existing company-labels with freshly kept results
export function mergeCompanyLabels(existingArr = [], keptWithEvidence = [], options = {}) {
	const byCompany = new Map();

	// 1) Seed from existing array
	for (const entry of existingArr) {
		if (!entry || !entry.company) continue;
		const normalized = entry.company.trim();
		if (!normalized) continue;
		if (!byCompany.has(normalized)) {
			byCompany.set(normalized, {
				company: normalized,
				labels: new Set(entry.labels || []),
				evidenceByLabel: { ...(entry.evidenceByLabel || {}) },
			});
		} else {
			const merged = byCompany.get(normalized);
			for (const lbl of entry.labels || []) merged.labels.add(lbl);
			if (entry.evidenceByLabel) {
				for (const [lbl, evidArr] of Object.entries(entry.evidenceByLabel)) {
					const existingEvid = merged.evidenceByLabel[lbl] || [];
					merged.evidenceByLabel[lbl] = existingEvid.concat(evidArr || []);
				}
			}
		}
	}

	// 2) Merge in new keptWithEvidence
	for (const item of keptWithEvidence) {
		if (!item || !item.company) continue;
		const normalized = item.company.trim();
		if (!normalized) continue;

		const labels = item.labels || [];
		const evidenceByLabel = item.evidenceByLabel || {};

		if (!byCompany.has(normalized)) {
			byCompany.set(normalized, {
				company: normalized,
				labels: new Set(labels),
				evidenceByLabel: { ...evidenceByLabel },
			});
		} else {
			const merged = byCompany.get(normalized);
			for (const lbl of labels) merged.labels.add(lbl);
			for (const [lbl, evidArr] of Object.entries(evidenceByLabel)) {
				const existingEvid = merged.evidenceByLabel[lbl] || [];
				merged.evidenceByLabel[lbl] = existingEvid.concat(evidArr || []);
			}
		}
	}

	// 3) Convert Sets back to arrays for JSON output
	return Array.from(byCompany.values()).map((entry) => ({
		company: entry.company,
		labels: Array.from(entry.labels),
		evidenceByLabel: entry.evidenceByLabel,
	}));
}

export async function writeCompanyLabels(companyLabels) {
	await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

	const tmp = OUTPUT_PATH + ".tmp";
	await fs.writeFile(tmp, JSON.stringify(companyLabels, null, 2), "utf8");
	await fs.rename(tmp, OUTPUT_PATH);
	console.log(`Merged & wrote → ${OUTPUT_PATH}`);
}

// NEW: write audit file safely (always via tmp + rename)
export async function writeAudit(auditAll) {
	if (!Array.isArray(auditAll)) {
		console.warn("[writeAudit] auditAll was not an array, coercing to empty array");
		auditAll = [];
	}

	await fs.mkdir(path.dirname(AUDIT_PATH), { recursive: true });

	const tmp = AUDIT_PATH + ".tmp";
	await fs.writeFile(tmp, JSON.stringify(auditAll, null, 2), "utf8");
	await fs.rename(tmp, AUDIT_PATH);
	console.log(`Audit → ${AUDIT_PATH}`);
}

// NEW: write host stats
export async function writeHostStats(hostStats) {
	if (!hostStats || typeof hostStats !== "object") return;
	await fs.mkdir(path.dirname(HOST_STATS_PATH), { recursive: true });

	const tmp = HOST_STATS_PATH + ".tmp";
	await fs.writeFile(tmp, JSON.stringify(hostStats, null, 2), "utf8");
	await fs.rename(tmp, HOST_STATS_PATH);
	console.log(`Host stats → ${HOST_STATS_PATH}`);
}
