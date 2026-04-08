import { StateGraph, END } from "@langchain/langgraph";
import { logger } from "../logger.ts";
import { PipelineAnnotation } from "./state.ts";
import type { PipelineState } from "./state.ts";

export type NodeResult = Promise<Partial<PipelineState>>;
export type PipelineNode = (state: PipelineState) => NodeResult;

export type PipelineNodes = {
	scanner: PipelineNode;
	editor: PipelineNode;
	writer: PipelineNode;
	reviewer: PipelineNode;
	publisher: PipelineNode;
};

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

export const buildGraphWithNodes = (nodes: PipelineNodes) => {
	const graph = new StateGraph(PipelineAnnotation)
		.addNode("scanner", withNodeLogging("scanner", nodes.scanner))
		.addNode("editor", withNodeLogging("editor", nodes.editor))
		.addNode("writer", withNodeLogging("writer", nodes.writer))
		.addNode("reviewer", withNodeLogging("reviewer", nodes.reviewer))
		.addNode("publisher", withNodeLogging("publisher", nodes.publisher))
		.addEdge("__start__", "scanner")
		.addEdge("scanner", "editor")
		.addEdge("editor", "writer")
		.addEdge("writer", "reviewer")
		.addEdge("reviewer", "publisher")
		.addEdge("publisher", END);

	return graph.compile();
};
