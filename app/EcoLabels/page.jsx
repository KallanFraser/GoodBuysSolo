/** @format */
"use client";

import { useEffect, useState } from "react";
import EcoLabelLogo from "../../components/EcoLabelLogo";
import "../../styles/eco-labels.css";

export default function EcoLabels() {
	const [labels, setLabels] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");
	const [activeCategory, setActiveCategory] = useState("All");

	useEffect(() => {
		const loadLabels = async () => {
			try {
				const res = await fetch("/data/labels.json");
				if (!res.ok) {
					throw new Error("Failed to load labels.json");
				}
				const json = await res.json();
				setLabels(Array.isArray(json) ? json : []);
			} catch (err) {
				console.error("[EcoLabels] Error loading labels:", err);
				setError("Could not load eco labels. Try refreshing the page.");
			} finally {
				setIsLoading(false);
			}
		};

		loadLabels();
	}, []);

	// ---------------- CATEGORIES ----------------
	const categorySet = new Set();
	for (const label of labels) {
		if (label && label.category) {
			categorySet.add(label.category);
		}
	}
	const categories = ["All", ...Array.from(categorySet).sort()];

	const filteredLabels = activeCategory === "All" ? labels : labels.filter((label) => label.category === activeCategory);

	// ---------------- RENDER ----------------
	return (
		<main id="eco-labels">
			<div className="eco-labels-inner">
				<section className="eco-hero">
					<p className="eco-pill">Eco Labels Directory</p>
					<h1 className="eco-title">
						Understand every badge
						<br />
						on every product.
					</h1>
					<p className="eco-lede">
						Browse the major ecolabels we track in GoodBuys — see what they stand for, which domains they cover, and how
						rigorous they are.
					</p>

					{error && <p className="eco-error">{error}</p>}

					{!isLoading && labels.length > 0 && (
						<div className="eco-filters">
							{categories.map((cat) => (
								<button
									key={cat}
									type="button"
									className={"eco-filter-chip" + (activeCategory === cat ? " eco-filter-chip-active" : "")}
									onClick={() => setActiveCategory(cat)}
								>
									<span className="eco-filter-label">{cat}</span>
								</button>
							))}
						</div>
					)}
				</section>

				<section className="eco-grid-section">
					{isLoading ?
						<div className="eco-grid eco-grid-skeleton">
							{Array.from({ length: 6 }).map((_, idx) => (
								<div key={idx} className="eco-card eco-card-skeleton">
									<div className="eco-logo-skeleton" />
									<div className="eco-lines-skeleton">
										<div className="eco-line-skeleton long" />
										<div className="eco-line-skeleton" />
										<div className="eco-line-skeleton short" />
									</div>
								</div>
							))}
						</div>
					: filteredLabels.length === 0 ?
						<p className="eco-empty">
							No labels in this category yet. Try switching to{" "}
							<button type="button" className="eco-empty-reset" onClick={() => setActiveCategory("All")}>
								All
							</button>
							.
						</p>
					:	<div className="eco-grid">
							{filteredLabels.map((label) => {
								// --- RIGOR LOGIC ---
								const rigorScore = typeof label.rigor_score === "number" ? label.rigor_score : null;
								const rigorReason = label.reason_for_rigor_score || "";

								let rigorBand = "";
								let rigorLabel = "";

								if (rigorScore !== null) {
									if (rigorScore >= 8) {
										rigorBand = "high";
										rigorLabel = "High Rigor";
									} else if (rigorScore >= 6) {
										rigorBand = "medium";
										rigorLabel = "Moderate Rigor";
									} else {
										rigorBand = "low";
										rigorLabel = "Low Rigor";
									}
								}

								return (
									<article key={label.id || label.name} className="eco-card">
										{/* ---------- LOGO ---------- */}
										{label.image_name && (
											<div className="eco-logo-wrap">
												<EcoLabelLogo imageName={label.image_name} name={label.name} />
											</div>
										)}

										<div className="eco-card-body">
											<header className="eco-card-header">
												<div className="eco-card-title-block">
													<p className="eco-card-name">{label.name}</p>
													{label.category && (
														<span className="eco-card-category">{label.category}</span>
													)}
												</div>

												{/* ---------- RIGOR SCORE ---------- */}
												{rigorScore !== null && (
													<div className={`eco-rigor-row rigor-${rigorBand}`}>
														<span className="eco-rigor-dot" />
														<div className="eco-rigor-text">
															<span className="eco-rigor-score">
																{rigorScore}
																<span className="eco-rigor-max">/10</span>
															</span>
															<span className="eco-rigor-level">{rigorLabel}</span>
														</div>

														{/* CUSTOM TOOLTIP POPUP */}
														{rigorReason && (
															<div className="eco-rigor-tooltip">
																<div className="eco-tooltip-arrow" />
																<strong className="eco-tooltip-title">
																	Why this score?
																</strong>
																<p className="eco-tooltip-text">{rigorReason}</p>
															</div>
														)}
													</div>
												)}
											</header>

											{label.description && <p className="eco-card-description">{label.description}</p>}

											<footer className="eco-card-footer">
												{label.source_url && (
													<a
														href={label.source_url}
														target="_blank"
														rel="noopener noreferrer"
														className="eco-card-link"
													>
														<span>View Standard</span>
														<span className="eco-card-link-arrow">↗</span>
													</a>
												)}
											</footer>
										</div>
									</article>
								);
							})}
						</div>
					}
				</section>
			</div>
		</main>
	);
}
