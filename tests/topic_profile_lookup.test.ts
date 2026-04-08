import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { TopicProfile } from "../src/topics/types.ts";
import { findTopicProfile } from "../src/topics/runtime.ts";

const nodeProfile: TopicProfile = {
	name: "Node.js",
	slug: "node-js",
	description: "",
	officialSources: [{ label: "Node Releases", url: "https://github.com/nodejs/node/releases" }],
	communityForums: [],
	rssFeedUrls: [],
	redditSubreddits: [],
	researchQueries: [],
	editorialNotes: "",
};

const profiles: TopicProfile[] = [nodeProfile];

Deno.test("topic profile lookup: matches exact slug", () => {
	const found = findTopicProfile(profiles, { slug: "node-js" });
	assertEquals(found?.slug, "node-js");
});

Deno.test("topic profile lookup: matches normalized slug variant", () => {
	const found = findTopicProfile(profiles, { slug: "node.js" });
	assertEquals(found?.slug, "node-js");
});

Deno.test("topic profile lookup: falls back to topic name", () => {
	const found = findTopicProfile(profiles, { slug: "nodejs-runtime", name: "Node.js" });
	assertEquals(found?.slug, "node-js");
});
