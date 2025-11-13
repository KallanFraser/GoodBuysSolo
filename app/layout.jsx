/** @format */
import "../styles/globals.css";

import NavigationBar from "../components/NavigationBar";
import Footer from "../components/Footer";

export default function RootLayout({ children }) {
	return (
		<html>
			<body>
				<div className="app-bg-shell">
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
