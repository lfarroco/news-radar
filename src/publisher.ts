import lume from "lume/mod.ts";

export default () => {

	const site = lume({
		src: "./src/site",
		dest: "./_site",
	});

	site.copy("logo.png");
	site.copy("styles.css");
	site.copy("favicon-32x32.png");
	site.copy("robots.txt");
}
