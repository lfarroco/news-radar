import { StateGraph, END } from "@langchain/langgraph";
import { PipelineAnnotation } from "./state.ts";
import { scannerNode } from "../nodes/scanner.node.ts";
import { filterNode } from "../nodes/filter.node.ts";
import { scraperNode } from "../nodes/scraper.node.ts";
import { writerNode } from "../nodes/writer.node.ts";
import { editorNode, editorRouter } from "../nodes/editor.node.ts";
import { publisherNode } from "../nodes/publisher.node.ts";

const filterRouter = (state: typeof PipelineAnnotation.State) =>
	state.approvedArticles.length > 0 ? "scraper" : END;

export const buildGraph = () => {
	const graph = new StateGraph(PipelineAnnotation)
		.addNode("scanner", scannerNode)
		.addNode("filter", filterNode)
		.addNode("scraper", scraperNode)
		.addNode("writer", writerNode)
		.addNode("editor", editorNode)
		.addNode("publisher", publisherNode)
		.addEdge("__start__", "scanner")
		.addEdge("scanner", "filter")
		.addConditionalEdges("filter", filterRouter, {
			scraper: "scraper",
			[END]: END,
		})
		.addEdge("scraper", "writer")
		.addEdge("writer", "editor")
		.addConditionalEdges("editor", editorRouter, {
			writer: "writer",
			publisher: "publisher",
		})
		.addEdge("publisher", END);

	return graph.compile();
};
