import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
	enforceQuotesForCopiedText,
	filterOfficialTopicSourceUrls,
	findVerbatimSentenceMatches,
	isOfficialSourceUrl,
	isOfficialTopicSourceUrl,
} from "../src/editorial-policy.ts";
import type { TopicProfile } from "../src/topics/types.ts";

const rustProfile: TopicProfile = {
	name: "Rust",
	slug: "rust",
	description: "",
	officialSources: [
		{ label: "Rust Blog", url: "https://blog.rust-lang.org" },
		{ label: "Rust Releases", url: "https://github.com/rust-lang/rust/releases" },
	],
	communityForums: [],
	rssFeedUrls: [],
	redditSubreddits: [],
	researchQueries: [],
	editorialNotes: "",
};
Deno.test("editorial policy: official source match allows child paths under official base", () => {
	assertEquals(
		isOfficialSourceUrl(
			"https://github.com/rust-lang/rust/releases/tag/1.89.0",
			["https://github.com/rust-lang/rust/releases"],
		),
		true,
	);
});

Deno.test("editorial policy: official source match rejects unrelated custom domains", () => {
	assertEquals(
		isOfficialTopicSourceUrl(
			rustProfile,
			"https://fasterthanli.me/articles/some-rust-post",
		),
		false,
	);
});

Deno.test("editorial policy: official source match rejects sibling product blog on same host", () => {
	const typescriptProfile: TopicProfile = {
		name: "TypeScript",
		slug: "typescript",
		description: "",
		officialSources: [
			{ label: "TypeScript Blog", url: "https://devblogs.microsoft.com/typescript/" },
		],
		communityForums: [],
		rssFeedUrls: [],
		redditSubreddits: [],
		researchQueries: [],
		editorialNotes: "",
	};

	assertEquals(
		isOfficialTopicSourceUrl(
			typescriptProfile,
			"https://devblogs.microsoft.com/dotnet/another-post",
		),
		false,
	);
});

Deno.test("editorial policy: detects verbatim sentence overlap", () => {
	const source = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu. Another unique sentence follows for test coverage.";
	const content = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu. This is original commentary.";

	const matches = findVerbatimSentenceMatches(content, source, 8);
	assertEquals(matches.length, 1);
});

Deno.test("editorial policy: wraps copied text in quotes", () => {
	const source = "The release introduces incremental compilation for large monorepos with up to fifty percent faster rebuilds.";
	const content = "The release introduces incremental compilation for large monorepos with up to fifty percent faster rebuilds. Teams should test migration paths.";

	const guarded = enforceQuotesForCopiedText(content, source);

	assertEquals(guarded.copiedSentenceCount, 1);
	assertEquals(
		guarded.content.includes("\"The release introduces incremental compilation for large monorepos with up to fifty percent faster rebuilds.\""),
		true,
	);
});

Deno.test("editorial policy: filters references to official topic source URLs", () => {
	const filtered = filterOfficialTopicSourceUrls(rustProfile, [
		"https://github.com/rust-lang/rust/releases/tag/1.89.0",
		"https://docs.github.com/get-started/accessibility/keyboard-shortcuts",
	]);

	assertEquals(filtered, ["https://github.com/rust-lang/rust/releases/tag/1.89.0"]);
});

Deno.test("editorial policy: deduplicates official topic source URLs", () => {
	const filtered = filterOfficialTopicSourceUrls(rustProfile, [
		"https://blog.rust-lang.org/2026/04/08/release",
		"https://blog.rust-lang.org/2026/04/08/release",
	]);

	assertEquals(filtered, ["https://blog.rust-lang.org/2026/04/08/release"]);
});
