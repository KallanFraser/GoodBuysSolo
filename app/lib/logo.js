/** @format */

export function logoPathForLabel(labelId) {
	// convention: /public/images/{id}.svg
	// Note: /public is web root, so we refer to /images/* at runtime
	return `/images/${labelId}.svg`;
}
