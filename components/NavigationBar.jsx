"use client";

import { useState } from "react";
import Link from "next/link";
import "../styles/navigation-bar.css";

export default function NavigationBar() {
	const [isOpen, setIsOpen] = useState(false);

	const handleToggle = () => {
		setIsOpen((prev) => !prev);
	};

	const handleClose = () => {
		setIsOpen(false);
	};

	return (
		<header id="navigation-bar">
			<Link href="/" className="nav-logo" onClick={handleClose}>
				<img src="/images/GoodBuysLogo.png" alt="GoodBuys logo" />
				<span className="nav-logo-text">GoodBuys</span>
			</Link>

			{/* Mobile menu button */}
			<button
				type="button"
				className={`nav-toggle ${isOpen ? "nav-toggle-open" : ""}`}
				onClick={handleToggle}
				aria-label="Toggle navigation"
			>
				<span />
				<span />
				<span />
			</button>

			<nav className={`nav-links ${isOpen ? "nav-links-open" : ""}`} aria-hidden={!isOpen}>
				<Link href="/Search" className="navigation-bar-button" onClick={handleClose}>
					Search
				</Link>
				<Link href="/About" className="navigation-bar-button" onClick={handleClose}>
					About
				</Link>
				<Link href="/OurTeam" className="navigation-bar-button" onClick={handleClose}>
					Our Team
				</Link>
				<Link href="/ContactUs" className="navigation-bar-button" onClick={handleClose}>
					Contact Us
				</Link>
				<Link href="/Publications" className="navigation-bar-button" onClick={handleClose}>
					Publications
				</Link>
			</nav>
		</header>
	);
}
