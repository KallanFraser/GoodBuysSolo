/** @format */
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

// 🔒 Store submissions OUTSIDE /public so they aren't directly downloadable
const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATH = path.join(DATA_DIR, "formEntries.json");

// Very basic in-memory rate limiting (per server instance)
const RATE_WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5;
const ipBuckets = new Map();

/**
 * Extract a somewhat-reliable client IP from common proxy headers.
 */
function getClientIp(req) {
	const xff = req.headers.get("x-forwarded-for");
	if (xff) return xff.split(",")[0].trim();
	const realIp = req.headers.get("x-real-ip");
	if (realIp) return realIp.trim();
	return "unknown";
}

/**
 * Very simple rate-limit bucket per IP.
 */
function isRateLimited(ip) {
	const now = Date.now();
	const bucket = ipBuckets.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS };

	if (now > bucket.resetAt) {
		// Reset window
		bucket.count = 0;
		bucket.resetAt = now + RATE_WINDOW_MS;
	}

	bucket.count += 1;
	ipBuckets.set(ip, bucket);

	return bucket.count > MAX_REQUESTS_PER_WINDOW;
}

/**
 * Basic email sanity check (not perfect on purpose, we just want obvious garbage out)
 */
function isValidEmail(email) {
	if (typeof email !== "string") return false;
	const trimmed = email.trim();
	if (trimmed.length > 320) return false;
	// Super basic pattern, enough for a contact form
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Normalize + cap strings.
 */
function sanitizeString(value, maxLen) {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	if (!trimmed) return "";
	return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

/**
 * Lock this route to your domains only (set CONTACT_FORM_ALLOWED_ORIGINS env var).
 * Example: CONTACT_FORM_ALLOWED_ORIGINS=https://goodbuys.app,https://www.goodbuys.app
 */
function isOriginAllowed(req) {
	const origin = req.headers.get("origin") || "";
	const raw = process.env.CONTACT_FORM_ALLOWED_ORIGINS || "";
	const allowed = raw
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean);

	if (allowed.length === 0) {
		// If you don't set env, we don't block by origin.
		return true;
	}

	return allowed.includes(origin);
}

export async function POST(request) {
	try {
		// ---- Method + Origin + Content-Type checks -----------------
		if (!isOriginAllowed(request)) {
			return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
		}

		const contentType = request.headers.get("content-type") || "";
		if (!contentType.toLowerCase().includes("application/json")) {
			return NextResponse.json({ ok: false, error: "Unsupported content type." }, { status: 415 });
		}

		const ip = getClientIp(request);
		if (isRateLimited(ip)) {
			return NextResponse.json({ ok: false, error: "Too many requests. Please try again later." }, { status: 429 });
		}

		// ---- Body parsing + validation -----------------------------
		let body;
		try {
			body = await request.json();
		} catch {
			return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
		}

		const rawName = body?.name;
		const rawEmail = body?.email;
		const rawMessage = body?.message;

		const name = sanitizeString(rawName, 100);
		const email = sanitizeString(rawEmail, 320);
		const message = sanitizeString(rawMessage, 5000); // stop people from dumping novels

		if (!name || !email || !message) {
			return NextResponse.json({ ok: false, error: "Missing or invalid required fields." }, { status: 400 });
		}

		if (!isValidEmail(email)) {
			return NextResponse.json({ ok: false, error: "Invalid email format." }, { status: 400 });
		}

		// ---- File I/O ----------------------------------------------
		// Ensure directory exists (data/ instead of public/)
		await fs.mkdir(DATA_DIR, { recursive: true });

		let entries = [];
		try {
			const existingRaw = await fs.readFile(FILE_PATH, "utf-8");
			const parsed = JSON.parse(existingRaw);
			if (Array.isArray(parsed)) {
				entries = parsed;
			}
		} catch (err) {
			if (err.code !== "ENOENT") {
				// Don't leak details to client
				console.error("[contact-api] Error reading formEntries.json:", err);
			}
		}

		const newEntry = {
			id: Date.now(),
			name,
			email,
			message,
			createdAt: new Date().toISOString(),
			ip: ip !== "unknown" ? ip : undefined, // keep if you want abuse tracking, or drop if you don't
		};

		entries.push(newEntry);

		// Write out prettified JSON; you could switch to newline-delimited for huge logs
		await fs.writeFile(FILE_PATH, JSON.stringify(entries, null, 2), "utf-8");

		return NextResponse.json({ ok: true }, { status: 200 });
	} catch (err) {
		console.error("[contact-api] Unexpected error:", err);
		return NextResponse.json({ ok: false, error: "Internal server error." }, { status: 500 });
	}
}
