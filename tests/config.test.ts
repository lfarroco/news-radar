import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadConfig } from "../src/config.ts";

Deno.test("config: loads successfully when GROQ_API_KEY is set", () => {
	const original = Deno.env.get("GROQ_API_KEY");
	Deno.env.set("GROQ_API_KEY", "gsk_test_key");

	const cfg = loadConfig();
	assertEquals(cfg.GROQ_API_KEY, "gsk_test_key");
	assertEquals(cfg.GROQ_MODEL, "llama-3.3-70b-versatile"); // default
	assertEquals(cfg.LANGCHAIN_PROJECT, "news-radar"); // default

	if (original) Deno.env.set("GROQ_API_KEY", original);
	else Deno.env.delete("GROQ_API_KEY");
});

Deno.test("config: throws when GROQ_API_KEY is missing", () => {
	const original = Deno.env.get("GROQ_API_KEY");
	Deno.env.delete("GROQ_API_KEY");

	let threw = false;
	try {
		loadConfig();
	} catch (err) {
		threw = true;
		assertStringIncludes(
			(err as Error).message,
			"GROQ_API_KEY",
		);
	}
	assertEquals(threw, true, "should have thrown");

	if (original) Deno.env.set("GROQ_API_KEY", original);
});

Deno.test("config: respects GROQ_MODEL override", () => {
	Deno.env.set("GROQ_API_KEY", "gsk_test");
	Deno.env.set("GROQ_MODEL", "llama-3.1-8b-instant");

	const cfg = loadConfig();
	assertEquals(cfg.GROQ_MODEL, "llama-3.1-8b-instant");

	Deno.env.delete("GROQ_MODEL");
	Deno.env.delete("GROQ_API_KEY");
});
