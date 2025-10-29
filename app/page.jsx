/** @format */

"use client";

import { useEffect, useRef, useState } from "react";
import {
	findProductByName,
	getManufacturerLabels,
	getProductLabels,
	mergeUniqueLabels,
	roughEthicsScore,
	suggestProducts,
} from "./lib/data";
import Image from "next/image";
import { logoPathForLabel } from "./lib/logo";

export default function Home() {
	const [query, setQuery] = useState("");
	const [result, setResult] = useState(null);
	const [error, setError] = useState("");
	const [suggestions, setSuggestions] = useState([]);
	const [activeIdx, setActiveIdx] = useState(-1);
	const listRef = useRef(null);
	const inputRef = useRef(null);

	useEffect(() => {
		setError("");
		// live suggestions (case-insensitive), limit 5
		const s = suggestProducts(query, 5);
		setSuggestions(s);
		setActiveIdx(s.length ? 0 : -1);
	}, [query]);

	function runSearch(product) {
		const target = product || findProductByName(query);
		if (!target) {
			setResult(null);
			setError("No match. Try a different product name.");
			console.log("[runSearch] no product for", query);
			return;
		}

		const { manufacturerName, labels: mLabels } = getManufacturerLabels(target.manufacturer_id);
		const pLabels = getProductLabels(target.id);
		const merged = mergeUniqueLabels(pLabels, mLabels);

		const payload = {
			productName: target.name,
			productId: target.id,
			manufacturerId: target.manufacturer_id,
			manufacturerName,
			productLabels: pLabels,
			manufacturerLabels: mLabels,
			mergedLabels: merged,
			mergedScore: roughEthicsScore(merged),
		};

		console.log("[runSearch] payload:", payload);
		setResult(payload);
	}

	function handleSubmit(e) {
		e.preventDefault();
		if (activeIdx >= 0 && suggestions[activeIdx]) {
			const chosen = suggestions[activeIdx];
			setQuery(chosen.name);
			setSuggestions([]);
			setActiveIdx(-1);
			runSearch(chosen);
			return;
		}
		runSearch(null);
	}

	function chooseSuggestion(idx) {
		const chosen = suggestions[idx];
		if (!chosen) return;
		setQuery(chosen.name);
		setSuggestions([]);
		setActiveIdx(-1);
		runSearch(chosen);
	}

	function onKeyDown(e) {
		if (!suggestions.length) return;

		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIdx((i) => Math.max(i - 1, 0));
		} else if (e.key === "Enter") {
			if (activeIdx >= 0) {
				e.preventDefault();
				chooseSuggestion(activeIdx);
			}
		} else if (e.key === "Escape") {
			setSuggestions([]);
			setActiveIdx(-1);
		}
	}

	return (
		<main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
			<h1 style={{ marginBottom: 8 }}>GoodBuys (MVP)</h1>
			<p style={{ marginBottom: 24 }}>Type a product → see product + manufacturer labels.</p>

			<form onSubmit={handleSubmit} style={{ position: "relative", marginBottom: 16 }}>
				<div style={{ display: "flex", gap: 8 }}>
					<input
						ref={inputRef}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={onKeyDown}
						placeholder="e.g. Patagonia Down Sweater"
						autoComplete="off"
						style={{ flex: 1, padding: 12, borderRadius: 8, border: "1px solid #444" }}
					/>
					<button type="submit" style={{ padding: "12px 16px", borderRadius: 8 }}>
						Search
					</button>
				</div>

				{/* Suggestions dropdown */}
				{suggestions.length > 0 && (
					<ul
						ref={listRef}
						style={{
							position: "absolute",
							zIndex: 20,
							top: 48,
							left: 0,
							right: 92 /* leave space for button */,
							background: "#111",
							border: "1px solid #333",
							borderRadius: 8,
							margin: 0,
							padding: 6,
							listStyle: "none",
							maxHeight: 260,
							overflowY: "auto",
							boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
						}}
						role="listbox"
						aria-label="Product suggestions"
					>
						{suggestions.map((s, i) => (
							<li
								key={s.id}
								role="option"
								aria-selected={i === activeIdx}
								onMouseEnter={() => setActiveIdx(i)}
								onMouseDown={(e) => {
									e.preventDefault();
								}} // keep input focus
								onClick={() => chooseSuggestion(i)}
								style={{
									padding: "10px 12px",
									borderRadius: 6,
									cursor: "pointer",
									background: i === activeIdx ? "#1b1b1b" : "transparent",
									display: "flex",
									justifyContent: "space-between",
									gap: 12,
								}}
							>
								<span>{s.name}</span>
								<span style={{ color: "#888", fontSize: 12 }}>{s.manufacturer_id}</span>
							</li>
						))}
					</ul>
				)}
			</form>

			{error && <div style={{ color: "tomato", marginBottom: 16 }}>{error}</div>}

			{result && (
				<section>
					<h2 style={{ marginBottom: 4 }}>{result.productName}</h2>
					<p style={{ marginTop: 0, color: "#888" }}>
						Manufacturer: <strong>{result.manufacturerName}</strong>
					</p>

					{result.mergedScore != null && (
						<div
							style={{
								margin: "12px 0",
								padding: 8,
								border: "1px dashed #555",
								borderRadius: 8,
							}}
						>
							Overall (product ⊕ manufacturer) score: <strong>{result.mergedScore}/10</strong>
						</div>
					)}

					<div style={{ display: "grid", gap: 16 }}>
						<LabelBlock
							title="Product-specific labels"
							labels={result.productLabels}
							emptyText="No product-level labels on file."
						/>
						<LabelBlock
							title="Manufacturer-wide labels"
							labels={result.manufacturerLabels}
							emptyText="No manufacturer labels on file."
						/>
						<LabelBlock
							title="All applicable labels (deduped)"
							labels={result.mergedLabels}
							emptyText="No labels found."
						/>
					</div>
				</section>
			)}

			<footer style={{ marginTop: 32, color: "#888" }}>
				<small>Demo data. Replace mappings as you validate real certifications.</small>
			</footer>
		</main>
	);
}

function LabelBlock({ title, labels, emptyText }) {
	return (
		<section>
			<h3 style={{ margin: "8px 0" }}>{title}</h3>
			{!labels || labels.length === 0 ? (
				<p style={{ color: "#aaa" }}>{emptyText}</p>
			) : (
				<ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
					{labels.map((label) => {
						const src = logoPathForLabel(label.id);
						return (
							<li
								key={label.id}
								style={{ border: "1px solid #333", borderRadius: 10, padding: 12 }}
							>
								<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
									<div
										style={{
											width: 44,
											height: 44,
											position: "relative",
											flex: "0 0 44px",
										}}
									>
										<Image
											src={src}
											alt={`${label.name} logo`}
											fill
											sizes="44px"
											style={{ objectFit: "contain" }}
										/>
									</div>
									<div style={{ flex: 1 }}>
										<div
											style={{
												display: "flex",
												justifyContent: "space-between",
												gap: 8,
											}}
										>
											<div>
												<strong>{label.name}</strong>{" "}
												<span style={{ color: "#aaa" }}>({label.category})</span>
											</div>
											<span title="Rigor (demo)">Rigor: {label.rigor_score}/10</span>
										</div>
										<p style={{ margin: "6px 0 10px 0" }}>{label.description}</p>
										<a href={label.source_url} target="_blank" rel="noreferrer">
											Learn more
										</a>
									</div>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
