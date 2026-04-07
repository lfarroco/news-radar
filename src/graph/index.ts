import { StateGraph, END } from "@langchain/langgraph";
import { PipelineAnnotation } from "./state.ts";
import { scannerNode } from "../nodes/scanner.node.ts";
import { writerNode } from "../nodes/writer.node.ts";
import { editorNode } from "../nodes/editor.node.ts";
import { reviewerNode } from "../nodes/reviewer.node.ts";
import { publisherNode } from "../nodes/publisher.node.ts";
import { logger } from "../logger.ts";
import type { PipelineState } from "./state.ts";

type NodeResult = Promise<Partial<PipelineState>>;
type PipelineNode = (state: PipelineState) => NodeResult;

const summarizeState = (state: Partial<PipelineState> | PipelineState) => ({
	pendingCandidates: state.pendingCandidates?.length ?? 0,
	queuedTasks: state.queuedTasks?.length ?? 0,
	publishedArticles: state.publishedArticles?.length ?? 0,
	errors: state.errors?.length ?? 0,
	metrics: state.metrics,
});

const withNodeLogging = (nodeName: string, node: PipelineNode): PipelineNode => {
	return async (state: PipelineState): NodeResult => {
		const startedAt = Date.now();
		logger.info({ node: nodeName, input: summarizeState(state) }, "pipeline node: start");

		try {
			const nextState = await node(state);
			logger.info(
				{
					node: nodeName,
					durationMs: Date.now() - startedAt,
					output: summarizeState(nextState),
				},
				"pipeline node: complete",
			);
			return nextState;
		} catch (err) {
			logger.error(
				{ node: nodeName, err, durationMs: Date.now() - startedAt },
				"pipeline node: failed",
			);
			throw err;
		}
	};
};

export const buildGraph = () => {
	const graph = new StateGraph(PipelineAnnotation)
		.addNode("scanner", withNodeLogging("scanner", scannerNode))
		.addNode("editor", withNodeLogging("editor", editorNode))
		.addNode("writer", withNodeLogging("writer", writerNode))
		.addNode("reviewer", withNodeLogging("reviewer", reviewerNode))
		.addNode("publisher", withNodeLogging("publisher", publisherNode))
		.addEdge("__start__", "scanner")
		.addEdge("scanner", "editor")
		.addEdge("editor", "writer")
		.addEdge("writer", "reviewer")
		.addEdge("reviewer", "publisher")
		.addEdge("publisher", END);

	return graph.compile();
};
