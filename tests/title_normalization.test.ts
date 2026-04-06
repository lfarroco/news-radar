import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stripLeadingTopicLabel } from "../src/utils.ts";

Deno.test("stripLeadingTopicLabel removes matching topic prefix", () => {
	assertEquals(
		stripLeadingTopicLabel("Go - Porting Go's strings package to C", "Go"),
		"Porting Go's strings package to C",
	);
});

Deno.test("stripLeadingTopicLabel preserves titles without matching prefix", () => {
	assertEquals(
		stripLeadingTopicLabel("Porting Go's strings package to C", "Go"),
		"Porting Go's strings package to C",
	);
});

Deno.test("stripLeadingTopicLabel handles dotted topic names", () => {
	assertEquals(
		stripLeadingTopicLabel(
			"Node.js - LogicStamp Context: an AST-based context compiler for TypeScript",
			"Node.js",
		),
		"LogicStamp Context: an AST-based context compiler for TypeScript",
	);
});

Deno.test("stripLeadingTopicLabel ignores unrelated prefixes", () => {
	assertEquals(
		stripLeadingTopicLabel("Security - Go patch fixes parser panic", "Go"),
		"Security - Go patch fixes parser panic",
	);
});