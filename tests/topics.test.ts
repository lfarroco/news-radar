import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { allTopics, python, rust, typescript } from "../src/topics/profiles.ts";
import type { TopicProfile } from "../src/topics/types.ts";

Deno.test("topic profiles: all have required fields", () => {
	for (const topic of allTopics) {
		assertExists(topic.name, `${topic.slug}: missing name`);
		assertExists(topic.slug, `missing slug`);
		assertExists(topic.description, `${topic.slug}: missing description`);
		assertExists(topic.editorialNotes, `${topic.slug}: missing editorialNotes`);
	}
});

Deno.test("topic profiles: slugs are lowercase with no spaces", () => {
	for (const topic of allTopics) {
		assertEquals(
			topic.slug,
			topic.slug.toLowerCase(),
			`${topic.slug}: slug must be lowercase`,
		);
		assertEquals(
			topic.slug.includes(" "),
			false,
			`${topic.slug}: slug must not contain spaces`,
		);
	}
});

Deno.test("topic profiles: python has official sources", () => {
	assertEquals(python.officialSources.length > 0, true);
	assertEquals(
		python.officialSources.every((s) => s.url.startsWith("https://")),
		true,
	);
});

Deno.test("topic profiles: rust has RSS feeds", () => {
	assertEquals(rust.rssFeedUrls.length > 0, true);
});

Deno.test("topic profiles: typescript has reddit subreddits", () => {
	assertEquals(typescript.redditSubreddits.length > 0, true);
});

Deno.test("topic profiles: all official source urls are valid", () => {
	for (const topic of allTopics) {
		for (const src of topic.officialSources) {
			assertExists(src.label, `${topic.slug}: officialSource missing label`);
			const url = new URL(src.url); // throws if invalid
			assertExists(url.hostname);
		}
	}
});

Deno.test("topic profiles: allTopics has no duplicate slugs", () => {
	const slugs = allTopics.map((t: TopicProfile) => t.slug);
	const unique = new Set(slugs);
	assertEquals(unique.size, slugs.length, "duplicate topic slugs found");
});
