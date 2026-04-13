import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeArticleBody } from "../src/utils.ts";

Deno.test("normalizeArticleBody preserves content with existing blank-line paragraphs", () => {
	const input = "First sentence. Second sentence.\n\nThird sentence. Fourth sentence.";
	assertEquals(normalizeArticleBody(input), input);
});

Deno.test("normalizeArticleBody splits single-blob prose into paragraphs", () => {
	const input =
		"A major runtime release is now available. It introduces a new package resolver that improves cold-start performance. The team also changed default compiler flags to reduce binary size. Several ecosystem maintainers confirmed compatibility in early testing. There is one breaking change around configuration field names. Migration steps are documented in the release notes.";
	const output = normalizeArticleBody(input);

	assertEquals(output.includes("\n\n"), true);
	assertEquals(output.startsWith("A major runtime release is now available."), true);
});

Deno.test("normalizeArticleBody preserves markdown list formatting", () => {
	const input = "- First item\n- Second item\n- Third item";
	assertEquals(normalizeArticleBody(input), input);
});

Deno.test("normalizeArticleBody preserves fenced code blocks", () => {
	const input = [
		"Use this endpoint to verify service health:",
		"",
		"```ts",
		"const res = await fetch('/api/health');",
		"const status = await res.json();",
		"console.log(status.ok);",
		"```",
		"",
		"This should return quickly even under moderate load.",
	].join("\n");

	assertEquals(normalizeArticleBody(input), input);
});
