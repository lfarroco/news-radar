import lume from "lume/mod.ts";

const site = lume({
	src: "./src/site",
	dest: "./_site",
	// location: new URL("https://example.com")
});

site.copy("ads.txt");
site.copy("logo.png");
site.copy("styles.css");
site.copy("favicon-32x32.png");

export default site;
