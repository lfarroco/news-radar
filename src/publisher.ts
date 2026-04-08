import { connect } from "./db.ts"
import { loadConfig } from "./config.ts";
import lume from "lume/mod.ts";

const config = loadConfig();

await connect(config.DB_HOST, Number(config.DB_PORT));

const site = lume({
	src: "./src/site",
	dest: "./_site",
});

site.process([".html", ".xml"], (page) => {
	const pageUrl = typeof page.data.url === "string" ? page.data.url : "";
	if (!/\/topics\/[^/]+\/feed(?:\.xml|\/)$/i.test(pageUrl)) {
		return;
	}

	if (/\/topics\/[^/]+\/feed\/$/i.test(pageUrl)) {
		page.data.url = pageUrl.replace(/\/feed\/$/i, "/feed.xml");
		page.data.prettyUrls = false;
	}

	if (!page.content) {
		return;
	}

	const content = page.content.toString();
	if (content.startsWith("<!DOCTYPE html>\n<?xml")) {
		page.content = content.replace("<!DOCTYPE html>\n", "");
	}
});

site.copy("logo.png");
site.copy("styles.css");
site.copy("favicon-32x32.png");
site.copy("robots.txt");
site.copy("_redirects");

export default site