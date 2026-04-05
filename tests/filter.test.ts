import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { z } from "zod";

// Unit tests for the filter and writer node output schemas.
// LLM calls are not made; we test the Zod contracts that withStructuredOutput enforces.

const relevanceOutputSchema = z.object({
	selected: z.array(z.number()),
});

Deno.test("filter: structured output parses selected IDs", async () => {
	// FakeListChatModel returns this as the raw content; withStructuredOutput
	// will parse JSON tool calls or content — here we test schema binding directly.
	const schema = relevanceOutputSchema;
	const parsed = schema.parse({ selected: [1, 3] });
	assertEquals(parsed.selected, [1, 3]);
});

Deno.test("filter: empty selected list is valid", () => {
	const schema = relevanceOutputSchema;
	const parsed = schema.parse({ selected: [] });
	assertEquals(parsed.selected, []);
});

Deno.test("filter: selected must be numbers", () => {
	const schema = relevanceOutputSchema;
	let threw = false;
	try {
		schema.parse({ selected: ["one", "two"] });
	} catch {
		threw = true;
	}
	assertEquals(threw, true);
});

Deno.test("filter: article output schema validates correctly", () => {
	const articleSchema = z.object({
		title: z.string(),
		content: z.string(),
		categories: z.array(z.string()),
	});

	const valid = {
		title: "Rust 2.0 Released",
		content: "The Rust team announced...",
		categories: ["Rust", "Systems Programming"],
	};

	const result = articleSchema.safeParse(valid);
	assertEquals(result.success, true);
	if (result.success) {
		assertExists(result.data.title);
		assertEquals(result.data.categories.length, 2);
	}
});

Deno.test("filter: article output schema rejects missing fields", () => {
	const articleSchema = z.object({
		title: z.string(),
		content: z.string(),
		categories: z.array(z.string()),
	});

	const result = articleSchema.safeParse({ title: "Only title" });
	assertEquals(result.success, false);
});
