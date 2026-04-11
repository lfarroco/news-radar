import {
	assertEquals,
	assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseSelectorBackfillArgs } from "../src/selector-backfill.args.ts";

Deno.test("selector backfill args: defaults to full backfill batch", () => {
	assertEquals(parseSelectorBackfillArgs([]), { limit: 100, topicSlug: undefined });
});

Deno.test("selector backfill args: parses long flags with separate values", () => {
	assertEquals(parseSelectorBackfillArgs(["--limit", "25", "--topic", "python"]), {
		limit: 25,
		topicSlug: "python",
	});
});

Deno.test("selector backfill args: parses equals-style flags", () => {
	assertEquals(parseSelectorBackfillArgs(["--topic=react", "--limit=7"]), {
		limit: 7,
		topicSlug: "react",
	});
});

Deno.test("selector backfill args: ignores deno passthrough separator", () => {
	assertEquals(parseSelectorBackfillArgs(["--", "--limit", "25"]), {
		limit: 25,
		topicSlug: undefined,
	});
});

Deno.test("selector backfill args: rejects invalid limit", () => {
	assertThrows(() => parseSelectorBackfillArgs(["--limit", "0"]), Error, "Invalid --limit value");
});

Deno.test("selector backfill args: rejects unknown flags", () => {
	assertThrows(() => parseSelectorBackfillArgs(["--dry-run"]), Error, "Unknown argument");
});