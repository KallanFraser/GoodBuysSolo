"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function RouteFadeOverlay() {
	const pathname = usePathname();
	const [hidden, setHidden] = useState(false);

	useEffect(() => {
		// on every route change:
		// 1) show black instantly
		// 2) then fade it out
		setHidden(false);

		const t = setTimeout(() => {
			setHidden(true);
		}, 50); // small delay so browser actually paints black first

		return () => clearTimeout(t);
	}, [pathname]);

	return <div className={`route-fade-overlay ${hidden ? "route-fade-overlay--hidden" : ""}`} />;
}
