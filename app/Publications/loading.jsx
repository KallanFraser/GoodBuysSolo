/** @format */

import "../../styles/publications.css";

export default function LoadingPublications() {
	return (
		<main id="publications">
			<div className="publications-inner">
				<section className="publications-hero">
					<div className="pub-pill-skeleton pub-shimmer" />
					<div className="pub-title-skeleton pub-shimmer" />
					<div className="pub-lede-skeleton pub-shimmer" />
				</section>

				<section className="publications-grid">
					<article className="publication-card publication-card-loading">
						<div className="publication-card-header">
							<div className="publication-logo-wrap pub-shimmer" />

							<div className="publication-meta">
								<div className="pub-line-skeleton small pub-shimmer" />
								<div className="pub-line-skeleton medium pub-shimmer" />
								<div className="pub-line-skeleton tiny pub-shimmer" />
								<div className="pub-tag-row">
									<span className="pub-tag-skeleton pub-shimmer" />
									<span className="pub-tag-skeleton pub-shimmer" />
									<span className="pub-tag-skeleton pub-shimmer" />
								</div>
							</div>
						</div>

						<div className="publication-body">
							<div className="pub-line-skeleton full pub-shimmer" />
							<div className="pub-line-skeleton full pub-shimmer" />
							<div className="pub-line-skeleton long pub-shimmer" />
						</div>

						<div className="publication-details">
							<div className="pub-detail-row">
								<div className="pub-line-skeleton short pub-shimmer" />
								<div className="pub-line-skeleton medium pub-shimmer" />
							</div>
							<div className="pub-detail-row">
								<div className="pub-line-skeleton short pub-shimmer" />
								<div className="pub-line-skeleton medium pub-shimmer" />
							</div>
						</div>

						<div className="publication-footer publication-footer-loading">
							<div className="pub-button-skeleton pub-shimmer" />
							<div className="pub-pill-skeleton-small pub-shimmer" />
						</div>
					</article>
				</section>
			</div>
		</main>
	);
}
