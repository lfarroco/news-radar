import { scannerNode } from "../nodes/scanner.node.ts";
import { writerNode } from "../nodes/writer.node.ts";
import { creativeWriterNode } from "../nodes/creative-writer.node.ts";
import { editorNode } from "../nodes/editor.node.ts";
import { reviewerNode } from "../nodes/reviewer.node.ts";
import { publisherNode } from "../nodes/publisher.node.ts";
import { buildGraphWithNodes } from "./build.ts";

export const buildGraph = () => {
	return buildGraphWithNodes({
		scanner: scannerNode,
		editor: editorNode,
		writer: writerNode,
		creativeWriter: creativeWriterNode,
		reviewer: reviewerNode,
		publisher: publisherNode,
	});
};
