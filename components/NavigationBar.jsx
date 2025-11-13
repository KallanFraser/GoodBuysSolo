/** @format */
"use client";

import Link from "next/link";
import "../styles/navigation-bar.css";

export default function NavigationBar() {
	return (
		<header id="navigation-bar">
			<Link href="/" className="nav-logo">
				<img src="/images/GoodBuysLogo.png" alt="GoodBuys logo" />
				<span className="nav-logo-text">GoodBuys</span>
			</Link>

			<nav className="nav-links">
				<Link href="/Search" className="navigation-bar-button">
					Search
				</Link>
				<Link href="/About" className="navigation-bar-button">
					About
				</Link>
				<Link href="/OurTeam" className="navigation-bar-button">
					Our Team
				</Link>
				<Link href="/ContactUs" className="navigation-bar-button">
					Contact Us
				</Link>
				<Link href="/Publications" className="navigation-bar-button">
					Publications
				</Link>
			</nav>
		</header>
	);
}
