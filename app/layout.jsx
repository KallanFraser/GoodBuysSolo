/** @format */
import "../styles/globals.css";

import Image from "next/image";
import NavigationBar from "../components/NavigationBar";
import Footer from "../components/Footer";

// Global SEO metadata for the GoodBuys app
export const metadata = {
	title: {
		default: "GoodBuys – Decode Eco Labels & Spot Greenwashing",
		template: "%s | GoodBuys",
	},
	description: "GoodBuys helps you decode eco labels, see which brands sit behind them, and spot greenwashing before you buy.",
	keywords: [
		"GoodBuys",
		"eco labels",
		"sustainability",
		"ethical brands",
		"greenwashing",
		"product labels",
		"environment",
		"responsible shopping",
	],
	icons: {
		icon: "/images/GoodBOysLogo.png",
		shortcut: "/images/GoodBOysLogo.png",
		apple: "/images/GoodBOysLogo.png",
	},
	openGraph: {
		title: "GoodBuys – Decode Eco Labels & Spot Greenwashing",
		description:
			"Search eco labels, explore verified certifications, and trace which companies are actually walking the talk on sustainability.",
		siteName: "GoodBuys",
		type: "website",
		images: [
			{
				url: "/images/GoodBOysLogo.png",
				alt: "GoodBuys logo",
			},
		],
	},
	twitter: {
		card: "summary",
		title: "GoodBuys – Decode Eco Labels & Spot Greenwashing",
		description: "GoodBuys helps you decode eco labels and see which brands truly stand behind sustainability claims.",
		images: ["/images/GoodBOysLogo.png"],
	},
	robots: {
		index: true,
		follow: true,
	},
	alternates: {
		canonical: "/",
	},
};

export default function RootLayout({ children }) {
	return (
		<html lang="en">
			<body>
				<div className="app-bg-shell">
					{/* Actual background image, optimized by Next */}
					<div className="app-bg">
						<Image
							src="/images/BackgroundBlurry.jpg" // keep your 4K source
							alt=""
							fill
							priority
							sizes="100vw" // "this always spans viewport width"
							className="app-bg-image"
						/>
					</div>

					<div className="app-bg-overlay" />
					<div className="app-content">
						<NavigationBar />
						{children}
						<Footer />
					</div>
				</div>
			</body>
		</html>
	);
}
