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
			{ name: "JavaScript", slug: "javascript", feedUrl: "/topics/javascript/feed/", articles: javascript, },
			{ name: "Python", slug: "python", feedUrl: "/topics/python/feed/", articles: python, },
			{ name: "React", slug: "react", feedUrl: "/topics/react/feed/", articles: react, },
			{ name: "TypeScript", slug: "typescript", feedUrl: "/topics/typescript/feed/", articles: typescript, },
			{ name: "Rust", slug: "rust", feedUrl: "/topics/rust/feed/", articles: rust, },
			{ name: "Go", slug: "go", feedUrl: "/topics/go/feed/", articles: go, },
			{ name: "Node.js", slug: "node.js", feedUrl: "/topics/node.js/feed/", articles: node, },
			{ name: "Deno", slug: "deno", feedUrl: "/topics/deno/feed/", articles: deno, },
			{ name: "Ruby", slug: "ruby", feedUrl: "/topics/ruby/feed/", articles: ruby, },
		]

	};

}
