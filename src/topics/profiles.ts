import type { TopicProfile } from "./types.ts";

export const python: TopicProfile = {
	name: "Python",
	slug: "python",
	description:
		"Python is a high-level general-purpose programming language known for its readability and large ecosystem. Relevant for web backends (Django, Flask, FastAPI), data science, ML/AI tooling, and scripting.",
	officialSources: [
		{ label: "Python Blog", url: "https://blog.python.org" },
		{ label: "Python Changelog", url: "https://docs.python.org/3/whatsnew/" },
		{ label: "PEPs Index", url: "https://peps.python.org/" },
	],
	communityForums: [
		{ label: "r/Python", url: "https://reddit.com/r/Python" },
		{
			label: "Python Discourse",
			url: "https://discuss.python.org",
		},
	],
	rssFeedUrls: [
		"https://blog.python.org/feeds/posts/default?alt=rss",
	],
	redditSubreddits: ["Python"],
	researchQueries: [
		"Python release",
		"Python PEP accepted",
		"Python stdlib update",
		"CPython",
	],
	editorialNotes:
		"Focus on language releases, accepted PEPs, and major library milestones. Avoid 'how to use Python' tutorials and job posts.",
};

export const rust: TopicProfile = {
	name: "Rust",
	slug: "rust",
	description:
		"Rust is a systems programming language emphasising memory safety without a garbage collector. Widely used for CLI tools, WebAssembly, embedded systems, and increasingly in web backends.",
	officialSources: [
		{ label: "Rust Blog", url: "https://blog.rust-lang.org" },
		{
			label: "Inside Rust Blog",
			url: "https://blog.rust-lang.org/inside-rust/",
		},
		{ label: "Rust Releases", url: "https://github.com/rust-lang/rust/releases" },
	],
	communityForums: [
		{ label: "r/rust", url: "https://reddit.com/r/rust" },
		{ label: "Rust Users Forum", url: "https://users.rust-lang.org" },
		{ label: "Rust Internals Forum", url: "https://internals.rust-lang.org" },
	],
	rssFeedUrls: [
		"https://blog.rust-lang.org/feed.xml",
		"https://blog.rust-lang.org/inside-rust/feed.xml",
	],
	redditSubreddits: ["rust"],
	researchQueries: [
		"Rust release",
		"Rust RFC merged",
		"Rust edition",
		"Cargo crate release",
	],
	editorialNotes:
		"Cover language releases, stabilised features, and major crate releases. Skip patch-only releases (e.g. 1.x.1) unless they fix a critical issue.",
};

export const typescript: TopicProfile = {
	name: "TypeScript",
	slug: "typescript",
	description:
		"TypeScript is a strongly typed superset of JavaScript developed by Microsoft. Used across frontend and backend JavaScript development.",
	officialSources: [
		{
			label: "TypeScript Blog",
			url: "https://devblogs.microsoft.com/typescript/",
		},
		{
			label: "TypeScript Releases",
			url: "https://github.com/microsoft/TypeScript/releases",
		},
	],
	communityForums: [
		{ label: "r/typescript", url: "https://reddit.com/r/typescript" },
	],
	rssFeedUrls: [
		"https://devblogs.microsoft.com/typescript/feed/",
	],
	redditSubreddits: ["typescript"],
	researchQueries: [
		"TypeScript release",
		"TypeScript new feature",
		"tsc update",
	],
	editorialNotes:
		"Focus on typed language features, compiler improvements, and ecosystem tools (ts-node, esbuild, etc.). Avoid basic TypeScript tutorials.",
};

export const golang: TopicProfile = {
	name: "Go",
	slug: "go",
	description:
		"Go (Golang) is a statically typed, compiled language by Google, popular for cloud-native services, CLIs, and microservices.",
	officialSources: [
		{ label: "Go Blog", url: "https://go.dev/blog/" },
		{ label: "Go Release Notes", url: "https://go.dev/doc/devel/release" },
	],
	communityForums: [
		{ label: "r/golang", url: "https://reddit.com/r/golang" },
		{ label: "Gophers Slack", url: "https://gophers.slack.com" },
	],
	rssFeedUrls: [
		"https://blog.golang.org/feed.atom",
	],
	redditSubreddits: ["golang"],
	researchQueries: [
		"Go release",
		"Golang update",
		"Go standard library",
		"Go module",
	],
	editorialNotes:
		"Prioritise language releases, standard library additions, and toolchain improvements. Avoid beginner tutorials.",
};

export const nodejs: TopicProfile = {
	name: "Node.js",
	slug: "node-js",
	description:
		"Node.js is a JavaScript runtime built on Chrome's V8 engine. The dominant platform for server-side JavaScript.",
	officialSources: [
		{ label: "Node.js Blog", url: "https://nodejs.org/en/blog/" },
		{
			label: "Node.js Releases",
			url: "https://github.com/nodejs/node/releases",
		},
	],
	communityForums: [
		{ label: "r/node", url: "https://reddit.com/r/node" },
	],
	rssFeedUrls: [
		"https://nodejs.org/en/feed/blog.xml",
	],
	redditSubreddits: ["node"],
	researchQueries: [
		"Node.js release",
		"Node.js LTS",
		"npm package",
		"Node.js security",
	],
	editorialNotes:
		"Cover LTS promotions, security releases, and major runtime features. Track npm ecosystem when a package crosses 10M weekly downloads.",
};

export const react: TopicProfile = {
	name: "React",
	slug: "react",
	description:
		"React is a declarative UI library by Meta. The most widely used frontend library in the JavaScript ecosystem.",
	officialSources: [
		{ label: "React Blog", url: "https://react.dev/blog" },
		{
			label: "React Releases",
			url: "https://github.com/facebook/react/releases",
		},
	],
	communityForums: [
		{ label: "r/reactjs", url: "https://reddit.com/r/reactjs" },
	],
	rssFeedUrls: [],
	redditSubreddits: ["reactjs"],
	researchQueries: [
		"React release",
		"React Server Components",
		"React hook",
		"Next.js release",
	],
	editorialNotes:
		"Focus on React core releases, RSC adoption, and major ecosystem tools (Next.js, Remix, Vite). Avoid component library comparisons.",
};

export const deno: TopicProfile = {
	name: "Deno",
	slug: "deno",
	description:
		"Deno is a secure JavaScript/TypeScript runtime built on V8 and Rust, developed by Ryan Dahl as the successor to Node.js.",
	officialSources: [
		{ label: "Deno Blog", url: "https://deno.com/blog" },
		{
			label: "Deno Releases",
			url: "https://github.com/denoland/deno/releases",
		},
	],
	communityForums: [
		{ label: "r/Deno", url: "https://reddit.com/r/Deno" },
		{ label: "Deno Discord", url: "https://discord.gg/deno" },
	],
	rssFeedUrls: [],
	redditSubreddits: ["deno"],
	researchQueries: [
		"Deno release",
		"Deno Deploy",
		"JSR package",
		"Deno 2",
	],
	editorialNotes:
		"Cover Deno runtime releases, Deno Deploy updates, and JSR registry milestones.",
};

export const angular: TopicProfile = {
	name: "Angular",
	slug: "angular",
	description:
		"Angular is a TypeScript-based frontend framework by Google for building single-page applications.",
	officialSources: [
		{ label: "Angular Blog", url: "https://blog.angular.io" },
		{
			label: "Angular Releases",
			url: "https://github.com/angular/angular/releases",
		},
	],
	communityForums: [
		{ label: "r/angular", url: "https://reddit.com/r/Angular2" },
	],
	rssFeedUrls: [],
	redditSubreddits: ["angular"],
	researchQueries: [
		"Angular release",
		"Angular signals",
		"Angular SSR",
	],
	editorialNotes:
		"Focus on major version releases and significant new APIs. Avoid minor patch notes unless they fix critical bugs.",
};

export const allTopics: TopicProfile[] = [
	python,
	rust,
	typescript,
	golang,
	nodejs,
	react,
	deno,
	angular,
];
