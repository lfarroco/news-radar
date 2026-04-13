import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildGraphWithNodes } from "../src/graph/build.ts";
import { hasPipelineErrors } from "../src/pipeline/outcome.ts";

Deno.test({
	name: "workflow graph: executes scanner->editor->writer->creative-writer->reviewer->publisher transitions",
	sanitizeOps: false,
	sanitizeResources: false,
}, async () => {
	const order: string[] = [];

	const graph = buildGraphWithNodes({
		scanner: () => {
			order.push("scanner");
			return Promise.resolve({
				pendingCandidates: [
					{
						id: 1,
						topic_id: 1,
						topic_name: "TypeScript",
						topic_slug: "typescript",
						title: "TypeScript 6.0 Released",
						url: "https://example.com/ts-6",
						snippet: "Release notes",
						source: "https://example.com",
						discovered_at: new Date(),
						status: "pending",
						relevance_score: null,
						research_notes: null,
					},
				],
				metrics: { scanned: 1, reviewed: 0, tasksCreated: 0, written: 0 },
			});
		},
		editor: (state) => {
			order.push("editor");
			assertEquals(state.pendingCandidates.length, 1);
			return Promise.resolve({
				queuedTasks: [
					{
						id: 1,
						candidate_id: 1,
						topic_id: 1,
						topic_slug: "typescript",
						topic_name: "TypeScript",
						candidate_title: "TypeScript 6.0 Released",
						candidate_url: "https://example.com/ts-6",
						candidate_snippet: "Release notes",
						editor_notes: "high-signal update",
						priority: 900,
						status: "pending",
						created_at: new Date(),
					},
				],
				metrics: { scanned: 1, reviewed: 1, tasksCreated: 1, written: 0 },
			});
		},
		writer: (state) => {
			order.push("writer");
			assertEquals(state.queuedTasks.length, 1);
			return Promise.resolve({
				publishedArticles: [
					{
						id: 1,
						task_id: 1,
						topic_id: 1,
						title: "TypeScript 6.0 Ships New Defaults",
						body: "Body",
						slug: "typescript-6-ships-new-defaults",
						url: "/articles/2026/04/07/typescript-6-ships-new-defaults/",
						published_at: new Date(),
						author_agent_version: "test",
					},
				],
				metrics: { scanned: 1, reviewed: 1, tasksCreated: 1, written: 1 },
			});
		},
		creativeWriter: (state) => {
			order.push("creative-writer");
			return Promise.resolve({
				publishedArticles: state.publishedArticles,
			});
		},
		reviewer: (state) => {
			order.push("reviewer");
			assertEquals(state.publishedArticles.length, 1);
			return Promise.resolve({
				publishedArticles: state.publishedArticles.map((a) => ({
					...a,
					title: `${a.title} (Reviewed)`,
				})),
			});
		},
		publisher: (state) => {
			order.push("publisher");
			assertEquals(state.publishedArticles[0].title.endsWith("(Reviewed)"), true);
			return Promise.resolve({});
		},
	});

	const result = await graph.invoke({});

	assertEquals(order, ["scanner", "editor", "writer", "creative-writer", "reviewer", "publisher"]);
	assertEquals(result.metrics, { scanned: 1, reviewed: 1, tasksCreated: 1, written: 1 });
	assertEquals(result.publishedArticles.length, 1);
	assertEquals(result.publishedArticles[0].title.endsWith("(Reviewed)"), true);
});

Deno.test({
	name: "workflow graph: publisher failure is reported in pipeline errors",
	sanitizeOps: false,
	sanitizeResources: false,
}, async () => {
	const graph = buildGraphWithNodes({
		scanner: () => Promise.resolve({}),
		editor: () => Promise.resolve({}),
		writer: () => Promise.resolve({}),
		creativeWriter: () => Promise.resolve({}),
		reviewer: () => Promise.resolve({}),
		publisher: () => Promise.resolve({
			errors: [{ node: "publisher", message: "lume build failed" }],
		}),
	});

	const result = await graph.invoke({});

	assertEquals(hasPipelineErrors(result.errors), true);
	assertEquals(result.errors?.[0]?.node, "publisher");
});
