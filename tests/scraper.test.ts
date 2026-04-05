import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { scrapeUrl } from "../src/tools/scraper.tool.ts";

// Lightweight unit tests for scrapeUrl that mock fetch.

const makeHtmlResponse = (html: string) =>
	new Response(html, { status: 200, headers: { "content-type": "text/html" } });

Deno.test("scrapeUrl: returns extracted text from headings and paragraphs", async () => {
	const original = globalThis.fetch;
	globalThis.fetch = () =>
		Promise.resolve(
			makeHtmlResponse(
				`<html><body><h1>Hello World</h1><p>Some content here.</p><footer><p>Footer text</p></footer></body></html>`,
			),
		) as unknown as ReturnType<typeof fetch>;

	const result = await scrapeUrl("https://example.com");
	assertEquals(result.ok, true);
	if (result.ok) {
		assertMatch(result.content, /Hello World/);
		assertMatch(result.content, /Some content here/);
	}

	globalThis.fetch = original;
});

Deno.test("scrapeUrl: returns error on network failure", async () => {
	const original = globalThis.fetch;
	globalThis.fetch = () => Promise.reject(new Error("network failure")) as unknown as ReturnType<typeof fetch>;

	const result = await scrapeUrl("https://example.com");
	assertEquals(result.ok, false);

	globalThis.fetch = original;
});

Deno.test("scrapeUrl: collapses multiple whitespace", async () => {
	const original = globalThis.fetch;
	globalThis.fetch = () =>
		Promise.resolve(
			makeHtmlResponse(`<html><body><p>Line one   with   spaces</p></body></html>`),
		) as unknown as ReturnType<typeof fetch>;

	const result = await scrapeUrl("https://example.com");
	assertEquals(result.ok, true);
	if (result.ok) {
		assertEquals(result.content.includes("   "), false);
	}

	globalThis.fetch = original;
});
