/** @format */

"use client";

import Link from "next/link";
import "../styles/landing-page.css";

export default function Home() {
	return (
		<main id="landing-page">
			<section className="hero">
				<h1 className="hero-title">
					See what your purchases
					<br />
					actually stand for.
				</h1>

				<p className="hero-text">
					GoodBuys helps you decode eco labels and trace which brands are actually walking the talk on sustainability.
				</p>

				<div className="hero-actions">
					<Link href="/Search" className="primary-cta">
						Start searching
					</Link>
					<Link href="/EcoLabels" className="ghost-cta">
						Browse all labels
					</Link>
				</div>

				<div className="hero-tags">
					<span className="hero-tag">Verified eco labels</span>
					<span className="hero-tag">Brand transparency</span>
					<span className="hero-tag">Global coverage</span>
				</div>
			</section>
		</main>
	);
}
