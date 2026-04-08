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
				{ name: "JavaScript", icon: "🟨", slug: "javascript", feedUrl: "/topics/javascript/feed.xml", articles: javascript, },
				{ name: "Python", icon: "🐍", slug: "python", feedUrl: "/topics/python/feed.xml", articles: python, },
				{ name: "React", icon: "⚛️", slug: "react", feedUrl: "/topics/react/feed.xml", articles: react, },
				{ name: "TypeScript", icon: "🔷", slug: "typescript", feedUrl: "/topics/typescript/feed.xml", articles: typescript, },
				{ name: "Rust", icon: "🦀", slug: "rust", feedUrl: "/topics/rust/feed.xml", articles: rust, },
				{ name: "Go", icon: "🐹", slug: "go", feedUrl: "/topics/go/feed.xml", articles: go, },
				{ name: "Node.js", icon: "🟢", slug: "node.js", feedUrl: "/topics/node.js/feed.xml", articles: node, },
				{ name: "Deno", icon: "🦕", slug: "deno", feedUrl: "/topics/deno/feed.xml", articles: deno, },
				{ name: "Ruby", icon: "💎", slug: "ruby", feedUrl: "/topics/ruby/feed.xml", articles: ruby, },
		]

	};

}
