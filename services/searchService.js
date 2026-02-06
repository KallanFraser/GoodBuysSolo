/**
 * SEARCH SERVICE
 * Calls our internal Next.js API route which scrapes DuckDuckGo.
 */

export const searchProducts = async (query) => {
	try {
		// Call our own internal API route
		const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);

		if (!response.ok) {
			throw new Error(`Search failed: ${response.statusText}`);
		}

		const data = await response.json();
		return data.results || [];
	} catch (error) {
		console.error("[SearchService] Error:", error);
		return [];
	}
};
