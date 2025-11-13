/** @format */
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const FILE_PATH = path.join(process.cwd(), "public", "formEntries", "formEntries.json");

export async function POST(request) {
	try {
		const body = await request.json();
		const { name, email, message } = body || {};

		if (!name || !email || !message) {
			return NextResponse.json({ ok: false, error: "Missing required fields." }, { status: 400 });
		}

		// Ensure directory exists
		await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });

		let entries = [];
		try {
			const existingRaw = await fs.readFile(FILE_PATH, "utf-8");
			const parsed = JSON.parse(existingRaw);
			if (Array.isArray(parsed)) {
				entries = parsed;
			}
		} catch (err) {
			// If file doesn't exist yet, ignore
			if (err.code !== "ENOENT") {
				console.error("Error reading existing formEntries:", err);
			}
		}

		const newEntry = {
			id: Date.now(),
			name,
			email,
			message,
			createdAt: new Date().toISOString(),
		};

		entries.push(newEntry);

		await fs.writeFile(FILE_PATH, JSON.stringify(entries, null, 2), "utf-8");

		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error("Error handling contact form POST:", err);
		return NextResponse.json({ ok: false, error: "Internal server error." }, { status: 500 });
	}
}
