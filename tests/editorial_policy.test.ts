import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
	enforceQuotesForCopiedText,
	findVerbatimSentenceMatches,
	isLikelyPersonalBlogCandidate,
} from "../src/editorial-policy.ts";

Deno.test("editorial policy: flags likely personal blog hosts", () => {
	assertEquals(
		isLikelyPersonalBlogCandidate({
			url: "https://dev.to/janedoe/awesome-trick",
			title: "A quick trick",
			snippet: "",
			source: "reddit-typescript",
		}),
		true,
	);
});

Deno.test("editorial policy: does not flag common official release sources", () => {
	assertEquals(
		isLikelyPersonalBlogCandidate({
			url: "https://go.dev/doc/devel/release",
			title: "Go 1.25 release",
			snippet: "Release notes and migration details",
			source: "https://go.dev/blog/feed.atom",
		}),
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
