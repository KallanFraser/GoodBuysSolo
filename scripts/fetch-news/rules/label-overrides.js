/** @format */

// Editorial overrides for the news matcher's label classification.
//
// The matcher auto-classifies each label alias into one of three buckets
// (SAFE / AMBIGUOUS / ACRONYM) based on the alias's shape:
//   - All-caps letters/digits → ACRONYM (case-sensitive match only)
//   - Contains a DANGER_WORD → AMBIGUOUS (canonical-only match in prose)
//   - Else → SAFE (padded-substring match, case-insensitive)
//
// When the automation's judgement is wrong for a specific label, override it
// here. The override applies to ALL aliases of the labelled label.
//
// Keep this file small. Overrides are editorial judgement — every one should
// be traceable to a specific false-positive or false-negative incident.

// Labels whose entire alias set should be treated as ACRONYM (case-sensitive
// match in prose). Use when auto-detection misses an all-caps label or when
// we specifically want the stricter treatment.
export const FORCE_ACRONYM = new Set([
	// (empty at launch — add as issues surface)
]);

// Labels whose entire alias set should be treated as AMBIGUOUS (canonical-only
// match in prose, aliases suppressed). Use when a label's name happens to
// collide with common prose even though DANGER_WORDS didn't flag it.
export const FORCE_AMBIGUOUS = new Set([
	// (empty at launch — add as issues surface)
]);

// Labels whose entire alias set should be treated as SAFE (regular padded
// substring match). Use sparingly to promote a label that automation flagged
// too strictly — only when the full canonical is distinctive enough that
// substring matching won't collide with prose.
export const FORCE_SAFE = new Set([
	// (empty at launch — add as issues surface)
]);

// Extra aliases for specific labels. Auto-derivation (parenthetical + slash
// splitting) handles the common cases; use this only when an outlet uses a
// name form that auto-derivation doesn't produce.
export const LABEL_ALIASES = {
	// labelId: [ "Alias 1", "Alias 2" ]
};
