/** @format */
import Image from "next/image";

export default function EcoLabelLogo({ imageName, name }) {
	if (!imageName) return null;

	return (
		<Image
			src={`/images/ecolabels/resizedVersions/${imageName}`}
			alt={name ? `${name} logo` : "Ecolabel logo"}
			width={128}
			height={128}
			loading="lazy"
			className="eco-logo"
		/>
	);
}
