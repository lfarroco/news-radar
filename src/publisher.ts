import { lume } from "./deps.ts";
import { connect } from "./db.ts"

await connect("postgres", 5432)

const site = lume({
	src: "./src/site",
	dest: "./_site",
});

site.copy("logo.png");
site.copy("styles.css");
site.copy("favicon-32x32.png");
site.copy("robots.txt");

export default site