/** @format */

import Database from "better-sqlite3";
import path from "path";
import { calculateRigorScore } from "../../lib/rigorScore.js";
import { PATHS } from "./config.js";

// We resolve the root directory dynamically based on the script location to avoid cwd issues
const rootDir = path.resolve(PATHS.SCRIPT_DIR, "../../");
const dbPath = path.join(rootDir, "goodbuys.db");

// Lazy-opened so a DB-open failure (permissions, file locked, corrupt) throws
// a readable error from initDatabase() rather than an opaque stack at module
// import time — otherwise the crawler crashes before any work starts.
let db = null;
function getDb() {
	if (db) return db;
	try {
		db = new Database(dbPath);
		db.pragma("journal_mode = WAL");
		return db;
	} catch (err) {
		throw new Error(
			`[db] Failed to open SQLite database at ${dbPath}: ${err.message}. ` +
				`Check file permissions, disk space, and that no other process holds the file.`,
		);
	}
}

// We create the necessary tables if they do not already exist
export function initDatabase() {
	getDb().exec(`
		CREATE TABLE IF NOT EXISTS labels (
			id TEXT PRIMARY KEY,
			name TEXT,
			category TEXT,
			rigor_score INTEGER
		);

		CREATE TABLE IF NOT EXISTS companies (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT UNIQUE
		);

		CREATE TABLE IF NOT EXISTS company_labels (
			company_id INTEGER,
			label_id TEXT,
			score INTEGER,
			pages_seen INTEGER,
			FOREIGN KEY(company_id) REFERENCES companies(id),
			FOREIGN KEY(label_id) REFERENCES labels(id),
			PRIMARY KEY(company_id, label_id)
		);
	`);
}

// We insert or update static label data from the json file
export function seedLabelsTable(labels) {
	const d = getDb();
	const insert = d.prepare(`
		INSERT INTO labels (id, name, category, rigor_score)
		VALUES (@id, @name, @category, @rigor_score)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			category = excluded.category,
			rigor_score = excluded.rigor_score
	`);

	const transaction = d.transaction((labelsData) => {
		for (const label of labelsData) {
			insert.run({
				id: label.id,
				name: label.name,
				category: label.category,
				rigor_score: calculateRigorScore(label) ?? 0,
			});
		}
	});

	transaction(labels);
}

// We parse the scraped output and upsert companies alongside their label evidence
export function exportToDatabase(companyLabels) {
	const d = getDb();
	const insertCompany = d.prepare(`
		INSERT INTO companies (name) VALUES (@name)
		ON CONFLICT(name) DO NOTHING
	`);

	const getCompanyId = d.prepare(`SELECT id FROM companies WHERE name = ?`);

	const insertEvidence = d.prepare(`
		INSERT INTO company_labels (company_id, label_id, score, pages_seen)
		VALUES (@company_id, @label_id, @score, @pages_seen)
		ON CONFLICT(company_id, label_id) DO UPDATE SET
			score = excluded.score,
			pages_seen = excluded.pages_seen
	`);

	const transaction = d.transaction((data) => {
		for (const row of data) {
			insertCompany.run({ name: row.company });
			const companyRecord = getCompanyId.get(row.company);

			if (!companyRecord) continue;

			for (const labelId of row.labels) {
				const evidenceArray = row.evidenceByLabel[labelId] || [];

				// We aggregate evidence if multiple entries exist for the same label
				let totalScore = 0;
				let totalPages = 0;
				for (const ev of evidenceArray) {
					totalScore += ev.score || 0;
					totalPages += ev.pagesSeen || 0;
				}

				insertEvidence.run({
					company_id: companyRecord.id,
					label_id: labelId,
					score: totalScore,
					pages_seen: totalPages,
				});
			}
		}
	});

	transaction(companyLabels);
}
