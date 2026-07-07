/** @format */

import {
	RIGOR_DIMENSIONS,
	calculateRigorScore,
	formatRigorScore,
	getRigorBand,
} from "../lib/rigorScore";

const VARIANT_PREFIX = {
	eco: "eco",
	search: "search-label",
};

const BAND_LABELS = {
	eco: {
		high: "High Rigor",
		medium: "Moderate Rigor",
		low: "Low Rigor",
	},
	search: {
		high: "High rigor standard",
		medium: "Moderate rigor standard",
		low: "Lower rigor standard",
	},
};

export default function RigorScoreDisplay({ label, variant = "eco" }) {
	const rigorScore = calculateRigorScore(label);
	if (rigorScore === null) {
		return null;
	}

	const { band } = getRigorBand(rigorScore);
	const prefix = VARIANT_PREFIX[variant] || VARIANT_PREFIX.eco;
	const breakdown = label.rigor_breakdown;
	const levelLabel = BAND_LABELS[variant]?.[band] || BAND_LABELS.eco[band];

	return (
		<div className={`${prefix}-rigor-row rigor-${band}`}>
			<span className={`${prefix}-rigor-dot`} />
			<div className={`${prefix}-rigor-text`}>
				<span className={`${prefix}-rigor-score`}>
					{variant === "search" ? "Rigor " : ""}
					{formatRigorScore(rigorScore)}
					<span className={`${prefix}-rigor-max`}>{variant === "search" ? " / 10" : "/10"}</span>
				</span>
				<span className={`${prefix}-rigor-level`}>{levelLabel}</span>
			</div>

			{breakdown && (
				<div className={`${prefix}-rigor-tooltip`}>
					<div className={`${prefix}-tooltip-arrow`} />
					<strong className={`${prefix}-tooltip-title`}>Rigor breakdown</strong>
					<ul className={`${prefix}-tooltip-breakdown`}>
						{RIGOR_DIMENSIONS.map(({ key, label: dimensionLabel, weight }) => {
							const dimension = breakdown[key];
							if (!dimension) {
								return null;
							}

							return (
								<li key={key} className={`${prefix}-tooltip-dimension`}>
									<div className={`${prefix}-tooltip-dimension-header`}>
										<span className={`${prefix}-tooltip-dimension-name`}>{dimensionLabel}</span>
										<span className={`${prefix}-tooltip-dimension-meta`}>
											{dimension.score}/10 · {(weight * 100).toFixed(0)}%
										</span>
									</div>
									{dimension.reason && (
										<p className={`${prefix}-tooltip-dimension-reason`}>{dimension.reason}</p>
									)}
								</li>
							);
						})}
					</ul>
					<p className={`${prefix}-tooltip-total`}>
						Total: {formatRigorScore(rigorScore)}/10
					</p>
				</div>
			)}
		</div>
	);
}
