import {
	assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── arg parsing tests ──────────────────────────────────────────────────────

// Import the arg parser inline since it's embedded in source-healthcheck.ts.
// We extract the same logic here for testability.
const parseArgs = (args: string[]) => {
	let limit = 200;
	let topicSlug: string | undefined;
	let dryRun = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith("--limit=")) {
			limit = Number(arg.split("=")[1]);
		} else if (arg === "--limit" && args[i + 1]) {
			limit = Number(args[++i]);
		} else if (arg.startsWith("--topic=")) {
			topicSlug = arg.split("=")[1];
		} else if (arg === "--topic" && args[i + 1]) {
			topicSlug = args[++i];
		} else if (arg === "--dry-run") {
			dryRun = true;
		}
	}

	return { limit, topicSlug, dryRun };
};

Deno.test("healthcheck args: defaults", () => {
	assertEquals(parseArgs([]), { limit: 200, topicSlug: undefined, dryRun: false });
});

Deno.test("healthcheck args: parses all flags", () => {
	assertEquals(parseArgs(["--limit=50", "--topic=rust", "--dry-run"]), {
		limit: 50,
		topicSlug: "rust",
		dryRun: true,
	});
});

Deno.test("healthcheck args: parses separate value flags", () => {
	assertEquals(parseArgs(["--limit", "10", "--topic", "go"]), {
		limit: 10,
		topicSlug: "go",
		dryRun: false,
	});
});

Deno.test("healthcheck args: dry-run flag standalone", () => {
	assertEquals(parseArgs(["--dry-run"]).dryRun, true);
});

// ── selector validation tests ──────────────────────────────────────────────

// Import the cheerio-based validation from the node directly isn't easy
// because it pulls in DB deps. Instead we test the logic inline.
import { cheerio } from "../src/deps.ts";

type IndexSelectors = {
	indexItemSelector: string;
	indexTitleSelector: string;
	indexLinkSelector: string;
	indexDateSelector: string | null;
};

const MIN_VALID_ITEMS = 2;
const MIN_VALID_RATIO = 0.3;

const validateStoredSelectors = (
	html: string,
	selectors: IndexSelectors,
): boolean => {
	const $ = cheerio.load(html);
	const items = $(selectors.indexItemSelector);

	if (items.length < MIN_VALID_ITEMS) return false;

	let validCount = 0;
	items.each((_i: number, el: cheerio.Element) => {
		const $el = $(el);
		const title = $el.find(selectors.indexTitleSelector).first().text().trim();
		const href = $el.find(selectors.indexLinkSelector).first().attr("href") ?? "";
		if (title && href) validCount++;
	});

	return validCount / items.length >= MIN_VALID_RATIO;
};

const BLOG_HTML = `
<html><body>
<div class="posts">
  <article class="post">
    <h2><a href="/post-1">Post One</a></h2>
    <time datetime="2026-04-01">Apr 1</time>
  </article>
  <article class="post">
    <h2><a href="/post-2">Post Two</a></h2>
    <time datetime="2026-04-02">Apr 2</time>
  </article>
  <article class="post">
    <h2><a href="/post-3">Post Three</a></h2>
    <time datetime="2026-04-03">Apr 3</time>
  </article>
</div>
</body></html>`;

Deno.test("validateStoredSelectors: valid selectors return true", () => {
	const selectors: IndexSelectors = {
		indexItemSelector: "article.post",
		indexTitleSelector: "h2 a",
		indexLinkSelector: "h2 a",
		indexDateSelector: "time",
	};
	assertEquals(validateStoredSelectors(BLOG_HTML, selectors), true);
});

Deno.test("validateStoredSelectors: wrong item selector returns false", () => {
	const selectors: IndexSelectors = {
		indexItemSelector: "div.nonexistent",
		indexTitleSelector: "h2 a",
		indexLinkSelector: "h2 a",
		indexDateSelector: null,
	};
	assertEquals(validateStoredSelectors(BLOG_HTML, selectors), false);
});

Deno.test("validateStoredSelectors: wrong link selector returns false (low ratio)", () => {
	const selectors: IndexSelectors = {
		indexItemSelector: "article.post",
		indexTitleSelector: "h2 a",
		indexLinkSelector: "span.missing-link",
		indexDateSelector: null,
	};
	assertEquals(validateStoredSelectors(BLOG_HTML, selectors), false);
});

Deno.test("validateStoredSelectors: single item below minimum", () => {
	const singleItemHtml = `
	<html><body>
	  <article class="post">
	    <h2><a href="/only">Only Post</a></h2>
	  </article>
	</body></html>`;

	const selectors: IndexSelectors = {
		indexItemSelector: "article.post",
		indexTitleSelector: "h2 a",
		indexLinkSelector: "h2 a",
		indexDateSelector: null,
	};
	assertEquals(validateStoredSelectors(singleItemHtml, selectors), false);
});
