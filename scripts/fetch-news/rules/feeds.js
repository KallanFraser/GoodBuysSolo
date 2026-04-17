/** @format */

// Feed registry. Each entry: { id, name, url }.
// id = stable slug used in output records and host-stats; must be unique.
// Add new feeds by appending; don't reorder (id is the stable key, not position).

const FEEDS = [
	{ id: "edie", name: "Edie", url: "https://www.edie.net/feed/" },
	{ id: "triplepundit", name: "Triple Pundit", url: "https://www.triplepundit.com/feed/" },
	{ id: "trellis", name: "Trellis", url: "https://trellis.net/feed/" },
	{ id: "grist", name: "Grist", url: "https://grist.org/feed/" },
	{ id: "sustainablebrands", name: "Sustainable Brands", url: "https://sustainablebrands.com/rss/" },
];

export default FEEDS;
