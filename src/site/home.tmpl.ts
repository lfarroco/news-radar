import { getLatestArticles, getLatestArticlesByTopic } from "../db.ts";

export const layout = "home.njk";

export default async function* () {

	const latest = await getLatestArticles();

	const javascript = await getLatestArticlesByTopic('javascript');
	const python = await getLatestArticlesByTopic('python');
	const deno = await getLatestArticlesByTopic('deno');
	const react = await getLatestArticlesByTopic('react');
	const typescript = await getLatestArticlesByTopic('typescript');
	const rust = await getLatestArticlesByTopic('rust');
	const go = await getLatestArticlesByTopic('go');
	const node = await getLatestArticlesByTopic('node.js');
	const ruby = await getLatestArticlesByTopic('ruby');

	yield {
		url: `/`,
		latest,
		topics: [
			{ name: "JavaScript", slug: "javascript", articles: javascript, },
			{ name: "Python", slug: "python", articles: python, },
			{ name: "React", slug: "react", articles: react, },
			{ name: "TypeScript", slug: "typescript", articles: typescript, },
			{ name: "Rust", slug: "rust", articles: rust, },
			{ name: "Go", slug: "go", articles: go, },
			{ name: "Node.js", slug: "node.js", articles: node, },
			{ name: "Deno", slug: "deno", articles: deno, },
			{ name: "Ruby", slug: "ruby", articles: ruby, },
		]

	};

}
