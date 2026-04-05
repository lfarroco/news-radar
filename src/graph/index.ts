import { StateGraph, END } from "@langchain/langgraph";
import { PipelineAnnotation } from "./state.ts";
import { scannerNode } from "../nodes/scanner.node.ts";
import { writerNode } from "../nodes/writer.node.ts";
import { editorNode } from "../nodes/editor.node.ts";
import { publisherNode } from "../nodes/publisher.node.ts";

export const buildGraph = () => {
	const graph = new StateGraph(PipelineAnnotation)
		.addNode("scanner", scannerNode)
		.addNode("editor", editorNode)
		.addNode("writer", writerNode)
		.addNode("publisher", publisherNode)
		.addEdge("__start__", "scanner")
		.addEdge("scanner", "editor")
		.addEdge("editor", "writer")
		.addEdge("publisher", END);

	graph.addEdge("writer", "publisher");

	return graph.compile();
};
