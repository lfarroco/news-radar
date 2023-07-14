import lume from "lume/mod.ts";


const json = {
	pagesExtensions: [".page.json"],
};

const site = lume({}, { json });

site.copy("assets");
site.copy("ads.txt");

export default site;
