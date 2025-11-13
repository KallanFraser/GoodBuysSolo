/** @format */
"use client";

import Image from "next/image";
import "../../styles/publications.css";

export default function Publications() {
	return (
		<main id="publications">
			<div className="publications-inner">
				<section className="publications-hero">
					<p className="publications-pill">Publications</p>
					<h1 className="publications-title">
						Research behind
						<br />
						conscientious consumerism.
					</h1>
					<p className="publications-lede">
						GoodBuys began as a research-backed project focused on making ethical, sustainable shopping the default — not a
						niche hobby.
					</p>
				</section>

				<section className="publications-grid">
					<article className="publication-card">
						<div className="publication-card-header">
							<div className="publication-logo-wrap">
								<Image
									src="/images/ghtcLogo.jpg"
									alt="IEEE GHTC logo"
									fill
									sizes="96px"
									className="publication-logo"
								/>
							</div>

							<div className="publication-meta">
								<p className="publication-kicker">GoodBuys</p>
								<h2 className="publication-heading">
									A social justice app for ethical, sustainable consumer choices
								</h2>
								<p className="publication-venue">2020 IEEE Global Humanitarian Technology Conference (GHTC)</p>
								<ul className="publication-tags">
									<li>Ethical tech</li>
									<li>Conscientious consumerism</li>
									<li>UN SDG 12</li>
								</ul>
							</div>
						</div>

						<div className="publication-body">
							<h3 className="publication-subheading">Abstract</h3>
							<p>
								In an economic system that prioritizes profit, humanitarian and ecological ethics are often treated as
								a drag on productivity. Making conscientious consumerism the norm is critical for holding companies
								accountable and making the world more equitable.
							</p>
							<p>
								Although many consumers are willing to pay more for ethically produced goods, they are usually unaware
								of the ethical scoring of the products they buy. GoodBuys is a social justice mobile application that
								allows users to scan consumer goods&rsquo; barcodes to see how ethically those products were produced.
								The app shows which ecolabels a product or its producer has obtained, and what obtaining — or lacking
								— each of those labels entails.
							</p>
							<p>
								Because this information can steer consumers toward or away from specific products, producers, and
								distributors, large-scale adoption of GoodBuys and similar technologies can support the United Nations
								Sustainable Development Goal 12:{" "}
								<span className="pub-emphasis">
									&quot;Ensure sustainable consumption and production patterns&quot;
								</span>{" "}
								— especially target 12.6, which focuses on encouraging companies, especially large and transnational
								ones, to adopt sustainable practices and integrate sustainability information into their reporting.
							</p>
						</div>

						<div className="publication-details">
							<h3 className="publication-subheading">Publication details</h3>
							<div className="publication-details-grid">
								<div className="pub-detail">
									<span className="pub-label">Conference</span>
									<span className="pub-value">2020 IEEE Global Humanitarian Technology Conference (GHTC)</span>
								</div>
								<div className="pub-detail">
									<span className="pub-label">Conference dates</span>
									<span className="pub-value">29 Oct 2020 – 01 Nov 2020</span>
								</div>
								<div className="pub-detail">
									<span className="pub-label">Location</span>
									<span className="pub-value">Seattle, WA, USA</span>
								</div>
								<div className="pub-detail">
									<span className="pub-label">Date added to IEEE Xplore</span>
									<span className="pub-value">08 Feb 2021</span>
								</div>
								<div className="pub-detail">
									<span className="pub-label">DOI</span>
									<span className="pub-value">10.1109/GHTC46280.2020.9342917</span>
								</div>
								<div className="pub-detail">
									<span className="pub-label">Print on Demand ISSN</span>
									<span className="pub-value">2377-6919</span>
								</div>
							</div>
						</div>

						<div className="publication-footer">
							<a
								className="publication-link"
								href="https://ieeexplore.ieee.org/document/9342917"
								target="_blank"
								rel="noreferrer"
							>
								View paper on IEEE Xplore
								<span className="publication-link-arrow">↗</span>
							</a>

							<div className="publication-footnote">
								<span className="pub-pill">Conference paper · 2020</span>
							</div>
						</div>
					</article>
				</section>
			</div>
		</main>
	);
}
