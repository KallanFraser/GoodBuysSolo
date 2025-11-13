/** @format */
"use client";

import { useEffect, useState } from "react";
import "../../styles/search.css";

export default function Search() {
	const [searchValue, setSearchValue] = useState("");
	const [companies, setCompanies] = useState([]); // from company-labels.json
	const [labelsById, setLabelsById] = useState({}); // id -> label metadata from labels.json
	const [suggestions, setSuggestions] = useState([]);
	const [selectedCompany, setSelectedCompany] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");

	// --------------------------- LOAD DATA ---------------------------
	useEffect(() => {
		const loadData = async () => {
			try {
				const [companiesRes, labelsRes] = await Promise.all([fetch("/data/company-labels.json"), fetch("/data/labels.json")]);

				if (!companiesRes.ok || !labelsRes.ok) {
					throw new Error("Failed to load data.");
				}

				const companiesJson = await companiesRes.json();
				const labelsJson = await labelsRes.json();

				setCompanies(Array.isArray(companiesJson) ? companiesJson : []);

				const map = {};
				if (Array.isArray(labelsJson)) {
					for (const label of labelsJson) {
						if (label && label.id) {
							map[label.id] = label;
						}
					}
				}
				setLabelsById(map);
			} catch (err) {
				console.error("[Search] Error loading JSON:", err);
				setError("Could not load search data. Try refreshing the page.");
			} finally {
				setIsLoading(false);
			}
		};

		loadData();
	}, []);

	// --------------------------- SUGGESTIONS ---------------------------
	const recomputeSuggestions = (value) => {
		const term = value.trim().toLowerCase();

		if (!term || !Array.isArray(companies) || companies.length === 0) {
			setSuggestions([]);
			return;
		}

		const matches = companies
			.filter((c) => c.company && c.company.toLowerCase().includes(term))
			.sort((a, b) => {
				const aName = a.company.toLowerCase();
				const bName = b.company.toLowerCase();
				const aStarts = aName.startsWith(term);
				const bStarts = bName.startsWith(term);

				if (aStarts && !bStarts) return -1;
				if (!aStarts && bStarts) return 1;
				return aName.localeCompare(bName);
			})
			.slice(0, 5);

		setSuggestions(matches);
	};

	const handleChange = (e) => {
		const value = e.target.value;
		setSearchValue(value);
		recomputeSuggestions(value);
	};

	// --------------------------- SELECTION ---------------------------
	const selectCompany = (entry) => {
		if (!entry) return;
		setSelectedCompany(entry);
		setSearchValue(entry.company || "");
		setSuggestions([]);
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		const term = searchValue.trim().toLowerCase();
		if (!term) return;

		// Try exact match first
		const exact = companies.find((c) => c.company && c.company.toLowerCase() === term);

		if (exact) {
			selectCompany(exact);
			return;
		}

		// Otherwise, pick the first suggestion if any
		if (suggestions.length > 0) {
			selectCompany(suggestions[0]);
		}
	};

	// --------------------------- DERIVED LABELS ---------------------------
	let ecoLabels = [];
	if (selectedCompany && Array.isArray(selectedCompany.labels)) {
		ecoLabels = selectedCompany.labels.map((id) => {
			const meta = labelsById[id];
			if (meta) return meta;

			// fallback if label is not in labels.json
			return {
				id,
				name: id,
				category: "Unknown",
				description: "No extra information available yet.",
			};
		});
	}

	// --------------------------- RENDER ---------------------------
	return (
		<main id="search">
			<div className="search-inner">
				<section className="search-hero">
					<p className="search-pill">Search GoodBuys</p>
					<h1 className="search-title">
						Find the ethics
						<br />
						behind any brand.
					</h1>
					<p className="search-lede">
						Type a company name to see which ecolabels are associated with it — and what those labels actually mean.
					</p>

					<form className="search-form" onSubmit={handleSubmit}>
						<div className="search-input-shell">
							{/* Label kept for a11y but visually hidden */}
							<label className="search-label" htmlFor="search-input">
								Search for a company
							</label>
							<input
								id="search-input"
								type="text"
								autoComplete="off"
								className="search-input"
								value={searchValue}
								onChange={handleChange}
								placeholder={isLoading ? "Loading dataset..." : "e.g. Adidas, Amazon, Patagonia"}
								disabled={isLoading}
							/>
							<button type="submit" className="search-submit" aria-label="Search">
								<span className="search-submit-label">Search</span>
								<span className="search-submit-icon">↵</span>
							</button>
						</div>
					</form>

					{/* Suggestions - dropdown attached under the bar */}
					{!isLoading && searchValue.trim() && suggestions.length > 0 && (
						<ul className="search-suggestions" aria-label="Search suggestions">
							{suggestions.map((entry) => (
								<li key={entry.company} className="search-suggestion-item">
									<button type="button" className="search-suggestion-button" onClick={() => selectCompany(entry)}>
										<span className="search-suggestion-company">{entry.company}</span>
										{Array.isArray(entry.labels) && entry.labels.length > 0 && (
											<span className="search-suggestion-label-count">
												{entry.labels.length} ecolabel
												{entry.labels.length === 1 ? "" : "s"}
											</span>
										)}
									</button>
								</li>
							))}
						</ul>
					)}

					{/* No match state */}
					{!isLoading && searchValue.trim() && suggestions.length === 0 && !selectedCompany && (
						<p className="search-no-results">No matches yet. Try a shorter or slightly different company name.</p>
					)}

					{error && <p className="search-error">{error}</p>}
				</section>

				<section className="search-results">
					{selectedCompany ? (
						<article className="search-result-card">
							<header className="search-result-header">
								<p className="search-company-kicker">Company</p>
								<h2 className="search-company-name">{selectedCompany.company}</h2>
								<p className="search-company-label-count">
									{ecoLabels.length === 0 && "No associated ecolabels found in this dataset."}
									{ecoLabels.length === 1 && "1 associated ecolabel in this dataset."}
									{ecoLabels.length > 1 && `${ecoLabels.length} associated ecolabels in this dataset.`}
								</p>
							</header>

							{ecoLabels.length > 0 && (
								<div className="search-labels-grid">
									{ecoLabels.map((label) => {
										const imagePath = label.image_name ? `/images/ecolabels/${label.image_name}` : null;

										return (
											<div key={label.id} className="search-label-card">
												{imagePath && (
													<div className="search-label-logo-wrap">
														<img
															src={imagePath}
															alt={label.name ? `${label.name} logo` : "Ecolabel logo"}
															className="search-label-logo"
															loading="lazy"
														/>
													</div>
												)}
												<div className="search-label-body">
													<div className="search-label-header">
														<p className="search-label-name">{label.name}</p>
														{label.category && (
															<span className="search-label-category">
																{label.category}
															</span>
														)}
													</div>
													{label.description && (
														<p className="search-label-description">{label.description}</p>
													)}
													{typeof label.rigor_score === "number" && (
														<p className="search-label-rigor">
															Rigor score: {label.rigor_score}
															<span className="search-label-rigor-max"> / 10</span>
														</p>
													)}
												</div>
											</div>
										);
									})}
								</div>
							)}
						</article>
					) : (
						<div className="search-placeholder">
							<p>
								Type at least a few letters of a company name to preview matches. Select one to see its associated
								ecolabels and what they cover.
							</p>
						</div>
					)}
				</section>
			</div>
		</main>
	);
}
