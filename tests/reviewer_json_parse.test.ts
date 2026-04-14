import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractJsonFromLlmText } from "../src/json-utils.ts";

Deno.test("reviewer JSON extraction tolerates control chars outside JSON strings", () => {
	const verticalTab = String.fromCharCode(0x0b);
	const raw = [
		"{",
		'  "hasSufficientContent": true,',
		`  ${verticalTab}\"needsImprovement\": false,`,
		'  "reviewSummary": "No changes required",',
		'  "improvedTitle": "Title",',
		'  "improvedContent": "Content"',
		"}",
	].join("\n");

	const parsed = extractJsonFromLlmText(raw) as {
		hasSufficientContent: boolean;
		needsImprovement: boolean;
		reviewSummary: string;
		improvedTitle: string;
		improvedContent: string;
	};

	assertEquals(parsed.hasSufficientContent, true);
	assertEquals(parsed.needsImprovement, false);
	assertEquals(parsed.improvedTitle, "Title");
});
