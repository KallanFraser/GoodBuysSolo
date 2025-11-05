import fetch from "node-fetch";

export async function allowedByRobots(origin, UA) {
	try {
		const url = new URL("/robots.txt", origin).toString();
		const r = await fetch(url, { headers: { "User-Agent": UA } });
		if (!r.ok) return true; // be conservative but not blocked
		const text = await r.text();
		// Ultra-basic: If a blanket Disallow: / exists for all, skip.
		if (/User-agent:\s*\*\s*[\s\S]*?Disallow:\s*\/\s*$/im.test(text)) return false;
		return true;
	} catch {
		return true;
	}
}
