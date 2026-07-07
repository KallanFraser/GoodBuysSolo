/** @format */

export const RIGOR_WEIGHTS = {
	verification_quality: 0.5,
	standard_scope: 0.3,
	governance_trust: 0.2,
};

export const RIGOR_DIMENSIONS = [
	{ key: "verification_quality", label: "Verification Quality", weight: RIGOR_WEIGHTS.verification_quality },
	{ key: "standard_scope", label: "Standard Scope", weight: RIGOR_WEIGHTS.standard_scope },
	{ key: "governance_trust", label: "Governance & Trust", weight: RIGOR_WEIGHTS.governance_trust },
];

/**
 * Rigor Score = (verification_quality * 0.50) + (standard_scope * 0.30) + (governance_trust * 0.20)
 * Returns a float rounded to 1 decimal place, or null when breakdown data is missing.
 */
export function calculateRigorScore(label) {
	const breakdown = label?.rigor_breakdown;
	if (!breakdown) {
		return typeof label?.rigor_score === "number" ? label.rigor_score : null;
	}

	const verification = breakdown.verification_quality?.score;
	const scope = breakdown.standard_scope?.score;
	const governance = breakdown.governance_trust?.score;

	if (
		typeof verification !== "number" ||
		typeof scope !== "number" ||
		typeof governance !== "number"
	) {
		return null;
	}

	const raw =
		verification * RIGOR_WEIGHTS.verification_quality +
		scope * RIGOR_WEIGHTS.standard_scope +
		governance * RIGOR_WEIGHTS.governance_trust;

	return Math.round(raw * 10) / 10;
}

export function getRigorBand(score) {
	if (score === null || score === undefined) {
		return { band: "", label: "" };
	}

	if (score >= 8) {
		return { band: "high", label: "High Rigor" };
	}

	if (score >= 6) {
		return { band: "medium", label: "Moderate Rigor" };
	}

	return { band: "low", label: "Low Rigor" };
}

export function formatRigorScore(score) {
	if (score === null || score === undefined) {
		return null;
	}

	return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
