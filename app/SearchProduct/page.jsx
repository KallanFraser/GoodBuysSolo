"use client";

import { useState } from "react";
import { searchProducts } from "../../services/searchService";
import EcoLabelLogo from "../../components/EcoLabelLogo";
import { calculateRigorScore, formatRigorScore } from "../../lib/rigorScore";
import "../../styles/product-search.css";

export default function ProductSearch() {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState([]);
	const [isLoading, setIsLoading] = useState(false);
	const [hasSearched, setHasSearched] = useState(false);
	const [showAlternatives, setShowAlternatives] = useState(false);

	const handleSearch = async (e) => {
		e.preventDefault();
		if (!query.trim()) return;

		setIsLoading(true);
		setHasSearched(true);
		setShowAlternatives(false); // Reset toggle on new search
		setResults([]);

		try {
			const products = await searchProducts(query);
			setResults(products);
		} catch (err) {
			console.error("Search failed:", err);
		} finally {
			setIsLoading(false);
		}
	};

	// --- LOGIC: FIND THE BEST MATCH ---
	// We prefer the first product that actually has Eco Data.
	// If no one has eco data, we just show the first result (index 0).
	const heroIndex = results.findIndex((p) => p.eco_data) !== -1 ? results.findIndex((p) => p.eco_data) : 0;

	const heroProduct = results[heroIndex];
	const alternatives = results.filter((_, idx) => idx !== heroIndex);

	return (
		<main id="product-search">
			<div className="search-inner">
				{/* --- HEADER --- */}
				<section className="search-hero">
					<p className="search-pill">Product Search</p>
					<h1 className="search-title">Find Better Products</h1>
					<p className="search-lede">Search for any item. We'll highlight the best eco-friendly match.</p>

					<form onSubmit={handleSearch} className="search-form">
						<input
							type="text"
							className="search-input"
							placeholder="e.g. 'Patagonia Jacket' or 'Levis Jeans'"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
						<button type="submit" className="search-btn">
							Search
						</button>
					</form>
				</section>

				{/* --- RESULTS SECTION --- */}
				<section className="search-results-section">
					{/* LOADING STATE */}
					{isLoading && (
						<div className="search-loading">
							<div className="search-spinner"></div>
							<p>Analyzing brands for eco-compliance...</p>
						</div>
					)}

					{/* HERO RESULT (The "Best" Match) */}
					{!isLoading && heroProduct && (
						<div className="hero-section">
							<div className="section-label">Top Match</div>
							<HeroProductCard product={heroProduct} />
						</div>
					)}

					{/* ALTERNATIVES TOGGLE */}
					{!isLoading && alternatives.length > 0 && (
						<div className="alternatives-wrapper">
							{!showAlternatives ?
								<button className="show-alternatives-btn" onClick={() => setShowAlternatives(true)}>
									Not what you're looking for? View {alternatives.length} other results ↓
								</button>
							:	<div className="alternatives-grid-container">
									<div className="section-label">Alternatives</div>
									<div className="search-grid">
										{alternatives.map((product, idx) => (
											<ProductCard key={idx} product={product} />
										))}
									</div>
								</div>
							}
						</div>
					)}

					{/* EMPTY STATE */}
					{!isLoading && hasSearched && results.length === 0 && (
						<div className="search-empty">
							<p>No results found for "{query}".</p>
							<span className="search-empty-sub">Try a simpler search term.</span>
						</div>
					)}
				</section>
			</div>
		</main>
	);
}

// --- COMPONENT: PRODUCT IMAGE HANDLER ---
function ProductImage({ src, alt, size = "small" }) {
	const [imgError, setImgError] = useState(!src);

	if (imgError) {
		const letter = alt ? alt.charAt(0).toUpperCase() : "?";
		return <div className={`product-thumb-placeholder ${size}`}>{letter}</div>;
	}
	return <img src={src} alt={alt} className={`product-thumb ${size}`} onError={() => setImgError(true)} />;
}

// --- COMPONENT: HERO CARD (Large, detailed) ---
function HeroProductCard({ product }) {
	const hasEcoData = product.eco_data && product.eco_data.labels && product.eco_data.labels.length > 0;

	return (
		<a href={product.link} target="_blank" rel="noopener noreferrer" className={`hero-card ${hasEcoData ? "verified" : ""}`}>
			<div className="hero-content">
				<div className="hero-image-col">
					<ProductImage src={product.thumbnail} alt={product.title} size="large" />
				</div>

				<div className="hero-info-col">
					<div className="hero-header">
						<h2 className="hero-title">{product.title}</h2>
						<span className="hero-domain">{product.domain || "Web Result"}</span>
					</div>

					<div className="hero-eco-body">
						{hasEcoData ?
							<>
								<div className="hero-verified-badge">
									<span className="verified-icon">✓</span>
									<div>
										<strong>Verified Sustainable Brand</strong>
										<span className="verified-sub">Matched: {product.eco_data.company_name}</span>
									</div>
								</div>

								<p className="hero-explainer">
									This product is from a brand that holds{" "}
									<strong>{product.eco_data.labels.length} verified eco-labels</strong> in our database.
								</p>

								<div className="hero-labels-list">
									{product.eco_data.labels.map((label) => (
										<div key={label.id} className="hero-label-row">
											<div className="hero-label-icon">
												<EcoLabelLogo imageName={label.image_name} name={label.name} />
											</div>
											<div className="hero-label-text">
												<span className="name">{label.name}</span>
												<span className="score">
													Rigor: {formatRigorScore(calculateRigorScore(label))}/10
												</span>
											</div>
										</div>
									))}
								</div>
							</>
						:	<div className="hero-no-data">
								<p>⚠️ We found this product, but we don't have verified eco-data for this seller yet.</p>
							</div>
						}
					</div>
				</div>
			</div>

			<div className="hero-cta">View Product ↗</div>
		</a>
	);
}

// --- COMPONENT: STANDARD CARD (Small) ---
function ProductCard({ product }) {
	const hasEcoData = product.eco_data && product.eco_data.labels && product.eco_data.labels.length > 0;

	return (
		<a href={product.link} target="_blank" rel="noopener noreferrer" className={`product-card ${hasEcoData ? "verified" : ""}`}>
			<div className="product-header">
				<ProductImage src={product.thumbnail} alt={product.title} size="small" />
				<div className="product-info">
					<h3 className="product-title">{product.title}</h3>
					<div className="product-meta">
						<span className="product-domain">{product.domain}</span>
					</div>
				</div>
			</div>

			<div className="product-eco-section">
				{hasEcoData ?
					<div className="product-labels-grid">
						{product.eco_data.labels.slice(0, 4).map((label) => (
							<div
								key={label.id}
								className="label-chip"
								title={`${label.name} (${formatRigorScore(calculateRigorScore(label))}/10)`}
							>
								<div className="label-icon-wrap">
									<EcoLabelLogo imageName={label.image_name} name={label.name} />
								</div>
							</div>
						))}
						{product.eco_data.labels.length > 4 && <span className="label-more">+{product.eco_data.labels.length - 4}</span>}
					</div>
				:	<div className="product-no-data">No eco-data found.</div>}
			</div>
		</a>
	);
}
