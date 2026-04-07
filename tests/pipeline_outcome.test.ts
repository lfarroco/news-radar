import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hasPipelineErrors } from "../src/pipeline/outcome.ts";

Deno.test("pipeline outcome: returns true when graph has errors", () => {
	assertEquals(hasPipelineErrors([{ node: "publisher", message: "build failed" }]), true);
});

Deno.test("pipeline outcome: returns false when graph has no errors", () => {
	assertEquals(hasPipelineErrors([]), false);
	assertEquals(hasPipelineErrors(undefined), false);
});
