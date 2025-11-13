"use client";

import { useEffect, useState } from "react";

export default function PageFadeOverlay() {
	const [hidden, setHidden] = useState(false);

	useEffect(() => {
		// let the page render black first, then fade away
		const t = setTimeout(() => {
			setHidden(true);
		}, 30); // 30ms is enough

		return () => clearTimeout(t);
	}, []);

	return <div className={`page-fade-overlay ${hidden ? "page-fade-overlay--hidden" : ""}`} />;
}
