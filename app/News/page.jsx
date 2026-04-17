/** @format */
"use client";

import { useEffect, useState } from "react";
import EcoLabelLogo from "../../components/EcoLabelLogo";
import "../../styles/news.css";

export default function News() {
	const [articles, setArticles] = useState([]);
	const [labelsMap, setLabelsMap] = useState(new Map());
	const [outletNames, setOutletNames] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		const load = async () => {
			try {
				const [newsRes, labelsRes] = await Promise.all([
					fetch("/data/news-preview.json"),
					fetch("/data/labels.json"),
				]);
				if (!newsRes.ok) throw new Error("Failed to load news-preview.json");
				if (!labelsRes.ok) throw new Error("Failed to load labels.json");

				const [news, labels] = await Promise.all([newsRes.json(), labelsRes.json()]);

				setLabelsMap(new Map(labels.map((l) => [l.id, l])));
				setArticles(Array.isArray(news) ? news : []);
				setOutletNames(
					Array.from(
						new Set((Array.isArray(news) ? news : []).map((a) => a.outletName).filter(Boolean)),
					).sort(),
				);
			} catch (err) {
				console.error("[News] Error loading:", err);
				setError("Could not load the news feed. Try refreshing the page.");
			} finally {
				setIsLoading(false);
			}
		};

		load();
	}, []);

	const matched = articles
		.filter((a) => Array.isArray(a.matches) && a.matches.length > 0)
		.sort((a, b) => {
			const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
			const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
			return tb - ta;
		});

	return (
		<main id="news">
			<div className="news-inner">
				<section className="news-hero">
					<p className="news-pill">Ecolabel News</p>
					<h1 className="news-title">
						What the world is saying
						<br />
						about the labels we track.
					</h1>
					<p className="news-lede">
						Automatically surfaced articles from sustainability outlets that mention an ecolabel in our registry.
					</p>

					{outletNames.length > 0 && (
						<p className="news-sourced">
							Articles sourced from {outletNames.join(", ")} — updated daily
						</p>
					)}

					{error && <p className="news-error">{error}</p>}
				</section>

				<section className="news-feed-section">
					{isLoading ?
						<div className="news-feed news-feed-skeleton">
							{Array.from({ length: 3 }).map((_, idx) => (
								<div key={idx} className="news-card news-card-skeleton">
									<div className="news-skeleton-meta" />
									<div className="news-skeleton-title" />
									<div className="news-skeleton-line long" />
									<div className="news-skeleton-line" />
									<div className="news-skeleton-line short" />
								</div>
							))}
						</div>
					: matched.length === 0 ?
						<p className="news-empty">
							No matched articles yet. The news fetcher runs periodically and new articles will appear
							here as outlets publish stories that mention an ecolabel in our registry.
						</p>
					:	<div className="news-feed">
							{matched.map((article, idx) => (
								<ArticleCard
									key={article.url || article.guid || idx}
									article={article}
									labelsMap={labelsMap}
								/>
							))}
						</div>
					}
				</section>
			</div>
		</main>
	);
}

function ArticleCard({ article, labelsMap }) {
	const { title, summary, url, publishedAt, outletName, matches } = article;

	const excerpt = summary && summary.length > 220 ? summary.slice(0, 220).trim() + "…" : summary || "";
	const dateText = formatDate(publishedAt);

	// Dedupe matches by labelId — the matcher can surface the same label from
	// multiple tiers (e.g. title + summary). We only want one tag per label.
	const uniqueLabelIds = [];
	const seen = new Set();
	for (const m of matches) {
		if (seen.has(m.labelId)) continue;
		seen.add(m.labelId);
		uniqueLabelIds.push(m.labelId);
	}

	return (
		<article className="news-card">
			<div className="news-card-meta">
				<span className="news-card-outlet">{outletName}</span>
				{dateText && <span className="news-card-date">{dateText}</span>}
			</div>

			<h2 className="news-card-title">
				<a href={url} target="_blank" rel="noopener noreferrer" className="news-card-link">
					{title}
				</a>
			</h2>

			{excerpt && <p className="news-card-excerpt">{excerpt}</p>}

			{uniqueLabelIds.length > 0 && (
				<div className="news-card-tags">
					{uniqueLabelIds.map((labelId) => {
						const label = labelsMap.get(labelId);
						const name = label?.name || labelId;
						return (
							<span key={labelId} className="news-tag">
								{label?.image_name && (
									<span className="news-tag-logo">
										<EcoLabelLogo imageName={label.image_name} name={name} />
									</span>
								)}
								<span className="news-tag-name">{name}</span>
							</span>
						);
					})}
				</div>
			)}
		</article>
	);
}

function formatDate(iso) {
	if (!iso) return "";
	const d = new Date(iso);
	if (!Number.isFinite(d.getTime())) return "";
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
