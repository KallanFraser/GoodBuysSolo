"use client";

import "../../styles/about-us.css";

export default function About() {
	return (
		<main id="about">
			<div className="about-inner">
				<section className="about-hero">
					<p className="about-pill">About GoodBuys</p>
					<h1 className="about-title">
						See the ethics
						<br />
						behind every purchase.
					</h1>
					<p className="about-lede">
						GoodBuys is a social justice app that helps you scan everyday products and understand how they impact people and
						the planet.
					</p>
				</section>

				<section className="about-grid">
					<article className="about-card">
						<h2 className="about-heading">What is GoodBuys?</h2>
						<p>
							GoodBuys lets you scan consumer goods to get an ethics score on how that product was made. We pull in data
							on how companies source their labor and what their carbon footprint looks like, then roll that into a simple
							signal you can actually use while shopping.
						</p>
						<p>
							Brands that meet our bar for being ethical and humane earn a
							<span className="inline-leaf"> GoodBuys certification leaf</span>, so you can spot better options at a
							glance.
						</p>
					</article>

					<article className="about-card">
						<h2 className="about-heading">Our Mission</h2>
						<p>
							We want ethical and sustainable companies to actually get credit for doing the right thing — and to grow
							because of it. When those brands win, it pushes everyone else to raise their standards on working
							conditions, pay, and environmental impact.
						</p>
						<p>
							Our goal is simple: make it normal to factor ethics into everyday shopping without adding a ton of friction
							to your life.
						</p>
					</article>

					<article className="about-card about-card-wide">
						<h2 className="about-heading">Why this matters</h2>
						<p>
							Most garment workers face inhumane conditions — unsafe buildings, no ventilation, toxic chemicals, and
							shifts up to 16 hours a day for a fraction of a living wage. On top of that, an estimated
							<span className="about-emphasis"> 250 million</span> workers are children between the ages of 5 and 14.
						</p>
						<p>
							Most people actually want to buy ethical, sustainable products. They just don’t have time to dig through
							greenwashing and marketing copy while they’re standing in an aisle or checking out online. GoodBuys is
							designed to be the least intrusive, most efficient way to make a better call in a few seconds.
						</p>
						<p>
							If we make conscientious consumerism the default, companies lose the ability to hide bad behavior behind a
							nice label.
						</p>
					</article>
				</section>

				<section className="about-footer-strip">
					<ul className="about-stats">
						<li>
							<span className="stat-number">1 scan</span>
							<span className="stat-label">to reveal the story</span>
						</li>
						<li>
							<span className="stat-number">Ethics · Labor · Carbon</span>
							<span className="stat-label">all in one score</span>
						</li>
						<li>
							<span className="stat-number">You</span>
							<span className="stat-label">vote with every purchase</span>
						</li>
					</ul>
				</section>
			</div>
		</main>
	);
}
