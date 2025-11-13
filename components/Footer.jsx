/** @format */
"use client";

import Link from "next/link";
import "../styles/footer.css";

export default function Footer() {
	const year = new Date().getFullYear();

	return (
		<footer id="footer">
			<div className="footer-left">
				<span className="footer-brand">GoodBuys</span>
				<span className="footer-copy">© {year}</span>
			</div>

			<nav className="footer-links">
				<Link href="/EcoLabels" className="navigation-bar-button">
					View All Eco Labels
				</Link>
				<Link href="/TermsOfUse" className="navigation-bar-button">
					Terms of Use
				</Link>
				<Link href="/PrivacyPolicy" className="navigation-bar-button">
					Privacy Policy
				</Link>
			</nav>
		</footer>
	);
}
