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
			{ name: "JavaScript", slug: "javascript", feedUrl: "/topics/javascript/feed.xml", articles: javascript, },
			{ name: "Python", slug: "python", feedUrl: "/topics/python/feed.xml", articles: python, },
			{ name: "React", slug: "react", feedUrl: "/topics/react/feed.xml", articles: react, },
			{ name: "TypeScript", slug: "typescript", feedUrl: "/topics/typescript/feed.xml", articles: typescript, },
			{ name: "Rust", slug: "rust", feedUrl: "/topics/rust/feed.xml", articles: rust, },
			{ name: "Go", slug: "go", feedUrl: "/topics/go/feed.xml", articles: go, },
			{ name: "Node.js", slug: "node.js", feedUrl: "/topics/node.js/feed.xml", articles: node, },
			{ name: "Deno", slug: "deno", feedUrl: "/topics/deno/feed.xml", articles: deno, },
			{ name: "Ruby", slug: "ruby", feedUrl: "/topics/ruby/feed.xml", articles: ruby, },
		]

	};

}
