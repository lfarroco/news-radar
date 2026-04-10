import {
	assertEquals,
	assertMatch,
	assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
	GET_SOURCE_SELECTORS_NEEDING_BACKFILL_SQL,
	GET_SOURCE_SELECTOR_COVERAGE_STATS_SQL,
	MARK_SOURCE_SELECTOR_INDEXED_NOW_SQL,
	SET_SOURCE_SELECTOR_FEED_URL_SQL,
	SET_SOURCE_SELECTOR_INDEX_SELECTORS_SQL,
	TOUCH_SOURCE_SELECTOR_SQL,
} from "../src/db/queries.ts";

Deno.test("touch source selector SQL: backfills topic slug and upgrades unknown source type", () => {
	assertMatch(TOUCH_SOURCE_SELECTOR_SQL, /INSERT\s+INTO\s+source_selectors/i);
	assertStringIncludes(TOUCH_SOURCE_SELECTOR_SQL, "topic_slug = EXCLUDED.topic_slug");
	assertMatch(TOUCH_SOURCE_SELECTOR_SQL, /source_selectors\.source_type\s*=\s*'unknown'/i);
	assertStringIncludes(TOUCH_SOURCE_SELECTOR_SQL, "$3 <> 'unknown' THEN $3");
});

Deno.test("feed url SQL: marks selectors as feed-backed and indexed", () => {
	assertMatch(SET_SOURCE_SELECTOR_FEED_URL_SQL, /feed_url\s*=\s*\$2/i);
	assertStringIncludes(SET_SOURCE_SELECTOR_FEED_URL_SQL, "THEN 'feed'");
	assertMatch(SET_SOURCE_SELECTOR_FEED_URL_SQL, /last_indexed_at\s*=\s*now\(\)/i);
	assertMatch(SET_SOURCE_SELECTOR_FEED_URL_SQL, /needs_reindex\s*=\s*false/i);
});

Deno.test("index selector SQL: marks selectors as html_index without feed_url coupling", () => {
	assertStringIncludes(SET_SOURCE_SELECTOR_INDEX_SELECTORS_SQL, "source_type = 'html_index'");
	assertMatch(SET_SOURCE_SELECTOR_INDEX_SELECTORS_SQL, /index_item_selector\s*=\s*\$2/i);
	assertMatch(SET_SOURCE_SELECTOR_INDEX_SELECTORS_SQL, /index_link_selector\s*=\s*\$4/i);
	assertMatch(SET_SOURCE_SELECTOR_INDEX_SELECTORS_SQL, /last_indexed_at\s*=\s*now\(\)/i);
});

Deno.test("mark indexed SQL: refreshes timestamps without setting feed_url", () => {
	assertMatch(MARK_SOURCE_SELECTOR_INDEXED_NOW_SQL, /last_indexed_at\s*=\s*now\(\)/i);
	assertMatch(MARK_SOURCE_SELECTOR_INDEXED_NOW_SQL, /updated_at\s*=\s*now\(\)/i);
	assertEquals(MARK_SOURCE_SELECTOR_INDEXED_NOW_SQL.includes("feed_url"), false);
});

Deno.test("coverage stats SQL: reports url-only and enriched selector counts", () => {
	assertStringIncludes(GET_SOURCE_SELECTOR_COVERAGE_STATS_SQL, "url_only_rows");
	assertStringIncludes(GET_SOURCE_SELECTOR_COVERAGE_STATS_SQL, "feed_backed_rows");
	assertStringIncludes(GET_SOURCE_SELECTOR_COVERAGE_STATS_SQL, "selector_backed_rows");
	assertStringIncludes(GET_SOURCE_SELECTOR_COVERAGE_STATS_SQL, "unknown_type_rows");
	assertMatch(GET_SOURCE_SELECTOR_COVERAGE_STATS_SQL, /FROM\s+source_selectors/i);
});

Deno.test("backfill SQL: selects only non-feed rows missing required index selectors", () => {
	assertMatch(GET_SOURCE_SELECTORS_NEEDING_BACKFILL_SQL, /feed_url\s+IS\s+NULL/i);
	assertStringIncludes(GET_SOURCE_SELECTORS_NEEDING_BACKFILL_SQL, "NULLIF(BTRIM(index_item_selector), '') IS NULL");
	assertStringIncludes(GET_SOURCE_SELECTORS_NEEDING_BACKFILL_SQL, "NULLIF(BTRIM(index_title_selector), '') IS NULL");
	assertStringIncludes(GET_SOURCE_SELECTORS_NEEDING_BACKFILL_SQL, "NULLIF(BTRIM(index_link_selector), '') IS NULL");
	assertStringIncludes(GET_SOURCE_SELECTORS_NEEDING_BACKFILL_SQL, "($1::text IS NULL OR topic_slug = $1)");
	assertMatch(GET_SOURCE_SELECTORS_NEEDING_BACKFILL_SQL, /LIMIT\s+\$2/i);
});