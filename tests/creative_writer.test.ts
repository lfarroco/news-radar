import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { PipelineState } from "../src/graph/state.ts";
import type { GeneratedArticle } from "../src/models.ts";

// ── gap detection logic (extracted for testability) ────────────────────────

const getCoveredTopicIds = (state: Pick<PipelineState, "publishedArticles">): Set<number> => {
	const covered = new Set<number>();
	for (const article of state.publishedArticles) {
		covered.add(article.topic_id);
	}
	return covered;
};

type TopicRow = { id: number; slug: string; name: string };

const findUncoveredTopics = (
	allTopics: TopicRow[],
	publishedArticles: GeneratedArticle[],
): TopicRow[] => {
	const covered = getCoveredTopicIds({ publishedArticles });
	return allTopics.filter((t) => !covered.has(t.id));
};

// ── tests ──────────────────────────────────────────────────────────────────

const ALL_TOPICS: TopicRow[] = [
	{ id: 1, slug: "python", name: "Python" },
	{ id: 2, slug: "rust", name: "Rust" },
	{ id: 3, slug: "typescript", name: "TypeScript" },
	{ id: 4, slug: "go", name: "Go" },
];

const makeArticle = (topicId: number): GeneratedArticle => ({
	id: topicId * 100,
	task_id: topicId * 10,
	topic_id: topicId,
	title: `Article for topic ${topicId}`,
	body: "Body text",
	slug: `article-topic-${topicId}`,
	url: `/articles/2026/04/13/article-topic-${topicId}/`,
	published_at: new Date(),
	author_agent_version: "test",
});

Deno.test("creative-writer gap: all topics uncovered when no articles published", () => {
	const uncovered = findUncoveredTopics(ALL_TOPICS, []);
	assertEquals(uncovered.length, 4);
	assertEquals(uncovered.map((t) => t.slug), ["python", "rust", "typescript", "go"]);
});

Deno.test("creative-writer gap: one topic covered leaves three uncovered", () => {
	const published = [makeArticle(2)]; // rust covered
	const uncovered = findUncoveredTopics(ALL_TOPICS, published);
	assertEquals(uncovered.length, 3);
	assertEquals(uncovered.map((t) => t.slug), ["python", "typescript", "go"]);
});

Deno.test("creative-writer gap: all topics covered means zero uncovered", () => {
	const published = ALL_TOPICS.map((t) => makeArticle(t.id));
	const uncovered = findUncoveredTopics(ALL_TOPICS, published);
	assertEquals(uncovered.length, 0);
});

Deno.test("creative-writer gap: multiple articles for same topic count as one coverage", () => {
	const published = [makeArticle(1), { ...makeArticle(1), id: 101, task_id: 11 }];
	const uncovered = findUncoveredTopics(ALL_TOPICS, published);
	assertEquals(uncovered.length, 3);
});

Deno.test("creative-writer gap: handles empty topic list", () => {
	const uncovered = findUncoveredTopics([], [makeArticle(1)]);
	assertEquals(uncovered.length, 0);
});
