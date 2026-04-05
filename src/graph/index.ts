import { StateGraph, END } from "@langchain/langgraph";
import { PipelineAnnotation } from "./state.ts";
import { scannerNode } from "../nodes/scanner.node.ts";
import { researcherNode } from "../nodes/researcher.node.ts";
import { plannerNode } from "../nodes/planner.node.ts";
import { scraperNode } from "../nodes/scraper.node.ts";
import { writerNode } from "../nodes/writer.node.ts";
import { editorNode, editorRouter } from "../nodes/editor.node.ts";
import { publisherNode } from "../nodes/publisher.node.ts";

const plannerRouter = (state: typeof PipelineAnnotation.State) =>
	state.plannedArticles.length > 0 ? "scraper" : END;

export const buildGraph = () => {
	const graph = new StateGraph(PipelineAnnotation)
		.addNode("scanner", scannerNode)
		.addNode("researcher", researcherNode)
		.addNode("planner", plannerNode)
		.addNode("scraper", scraperNode)
		.addNode("writer", writerNode)
		.addNode("editor", editorNode)
		.addNode("publisher", publisherNode)
		.addEdge("__start__", "scanner")
		.addEdge("scanner", "researcher")
		.addEdge("researcher", "planner")
		.addConditionalEdges("planner", plannerRouter, {
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
