import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadConfig } from "../src/config.ts";

Deno.test("config: loads successfully when OPENAI_API_KEY is set", () => {
	const original = Deno.env.get("OPENAI_API_KEY");
	Deno.env.set("OPENAI_API_KEY", "sk-test-key");

	const cfg = loadConfig();
	assertEquals(cfg.OPENAI_API_KEY, "sk-test-key");
	assertEquals(cfg.OPENAI_MODEL, "gpt-4o-mini"); // default
	assertEquals(cfg.LANGCHAIN_PROJECT, "news-radar"); // default

	if (original) Deno.env.set("OPENAI_API_KEY", original);
	else Deno.env.delete("OPENAI_API_KEY");
});

Deno.test("config: throws when OPENAI_API_KEY is missing", () => {
	const original = Deno.env.get("OPENAI_API_KEY");
	Deno.env.delete("OPENAI_API_KEY");

	let threw = false;
	try {
		loadConfig();
	} catch (err) {
		threw = true;
		assertStringIncludes(
			(err as Error).message,
			"OPENAI_API_KEY",
		);
	}
	assertEquals(threw, true, "should have thrown");

	if (original) Deno.env.set("OPENAI_API_KEY", original);
});

Deno.test("config: respects OPENAI_MODEL override", () => {
	Deno.env.set("OPENAI_API_KEY", "sk-test");
	Deno.env.set("OPENAI_MODEL", "gpt-4o");

	const cfg = loadConfig();
	assertEquals(cfg.OPENAI_MODEL, "gpt-4o");

	Deno.env.delete("OPENAI_MODEL");
});
