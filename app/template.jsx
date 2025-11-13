"use client";

import { useEffect, useState } from "react";

export default function RootTemplate({ children }) {
	const [hidden, setHidden] = useState(false);

	useEffect(() => {
		// this runs EVERY time you navigate to a new route
		const t = setTimeout(() => {
			setHidden(true); // trigger fade-out
		}, 40); // tiny delay so black frame actually paints

		return () => clearTimeout(t);
	}, []);

	return (
		<>
			<div className={`route-fade-overlay ${hidden ? "route-fade-overlay--hidden" : ""}`} />
			{children}
		</>
	);
}
