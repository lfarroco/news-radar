import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runCli } from "../src/cli.ts";

Deno.test("main cli: returns zero when pipeline succeeds", async () => {
	const code = await runCli(() => Promise.resolve(), () => { });
	assertEquals(code, 0);
});

Deno.test("main cli: returns non-zero when pipeline fails", async () => {
	const code = await runCli(() => Promise.reject(new Error("publisher build failed")), () => { });
	assertEquals(code, 1);
});
