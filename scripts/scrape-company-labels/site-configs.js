/**
 * Per-site precision selectors (keyed by hostname).
 * If present, we’ll prefer these selectors for company names and skip the generic heuristics.
 *
 * Example:
 *   "examplelabel.org": {
 *     listSelector: ".members-list",
 *     itemSelector: ".members-list li",
 *     nameSelector: ".member-name"
 *   }
 */
export default {
	// "examplelabel.org": { listSelector: "", itemSelector: "", nameSelector: "" },
};
