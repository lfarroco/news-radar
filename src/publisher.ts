import { connect } from "./db.ts"
import { loadConfig } from "./config.ts";
import lume from "lume/mod.ts";

const config = loadConfig();

await connect(config.DB_HOST, Number(config.DB_PORT));

const site = lume({
	src: "./src/site",
	dest: "./_site",
});

site.copy("logo.png");
site.copy("styles.css");
site.copy("favicon-32x32.png");
site.copy("robots.txt");
site.copy("_redirects");

export default site