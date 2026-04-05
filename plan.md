# News Radar — Modernization Plan

## Current State Analysis

The project is a Deno/TypeScript automated news pipeline built ~2 years ago with:

- **Runtime**: Deno + TypeScript *(kept)*
- **AI**: Raw `fetch` calls to OpenAI (`gpt-3.5-turbo`) with string-templated prompts and fragile `JSON.parse` responses
- **Pipeline**: Hard-coded sequential execution: `scanner → candidates → scrapper → writer → publisher`
- **Infrastructure**: PostgreSQL + Docker + cron.sh + Lume static site generator
- **Dependencies**: Deno CDN imports (`deno.land/x/...`, `esm.sh/...`), no lockfile integrity

### Core Weaknesses

1. No retry logic or structured error recovery — one bad LLM response crashes the batch
2. Monolithic prompt strings with no reuse or testability
3. No observability — can't trace which LLM calls produced which articles
4. No parallelism at the pipeline level; batching is hand-rolled
5. Pipeline is a single sequential script — no branching, no human-in-the-loop hooks
6. Scraper has no JS rendering fallback (many modern pages need it)
7. Articles have no enrichment step — just a raw scrape → summarize pass
8. `gpt-3.5-turbo` is outdated; structured output is done with fragile JSON prompting

---

## Proposed Architecture

Replace the linear script with a **LangGraph state machine** where each node is a focused sub-agent with dedicated tools. Migrate runtime from Deno to **Node.js 22 + TypeScript** to access the full LangChain.js / LangGraph.js ecosystem.

```
[Orchestrator Graph]
       │
       ▼
[Scanner Agent]──────────────────────────────────────────────┐
  tools: RssTool, RedditTool                                  │
       │                                                      │
       ▼                                                  each article
[Relevance Filter Agent]                                      │
  tools: none (structured LLM call)                           │
       │ approved                                             │
       ▼                                                      │
[Research Agent]  ◄───────────────────────────────────────────┘
  tools: ScraperTool, TavilySearchTool
       │
       ▼
[Writer Agent]
  tools: none (structured LLM output via Zod)
       │
       ▼
[Editor Agent]  (new)
  tools: none — reviews and improves draft
       │
       ▼
[Publisher Agent]
  tools: DbTool, LumePublishTool
```

---

## Tasks

### 1 — Introduce LangChain.js

**Packages** (via Deno `npm:` specifiers): `npm:@langchain/core`, `npm:@langchain/openai`, `npm:@langchain/langgraph`, `npm:@langchain/community`, `npm:zod`

- [x] Add `npm:` import map entries to `deno.json` for `@langchain/core`, `@langchain/openai`, `@langchain/langgraph`, `@langchain/community`, `zod`, `pino`
- [x] Create `src/llm.ts` — exports `makeLlm(temperature)`, `systemUserPrompt()`, `relevanceOutputSchema`, `articleOutputSchema` (Zod), and related types
- [x] Upgrade model to `gpt-4o-mini`; use `withStructuredOutput()` for all LLM calls (replaces fragile `JSON.parse`)
- [x] Document `LANGCHAIN_TRACING_V2`, `LANGCHAIN_PROJECT`, `LANGCHAIN_API_KEY` env vars

---

### 2 — LangGraph pipeline

Replace the sequential `scanner → candidates → scrapper → writer` script with a LangGraph `StateGraph`.

- [x] Define a shared `PipelineState` type in `src/graph/state.ts` using LangGraph `Annotation.Root` with fields: `pendingArticles`, `approvedArticles`, `scrapedArticles`, `writtenArticles`, `errors`, `writerRetries`
- [x] Create `src/graph/index.ts` — compile and export `buildGraph()` returning the compiled `StateGraph`
- [x] Implement graph nodes (one file per node under `src/nodes/`):
  - [x] `scanner.node.ts` — fetches RSS/Reddit via tools, returns pending articles
  - [x] `filter.node.ts` — calls relevance agent in batches of 20, splits approved/rejected
  - [x] `scraper.node.ts` — scrapes URLs concurrently (concurrency=5)
  - [x] `writer.node.ts` — writes structured article drafts with `withStructuredOutput`, concurrency=3
  - [x] `editor.node.ts` — reviews draft, routes to publisher or back to writer (max 2 retries)
  - [x] `publisher.node.ts` — persists to DB and triggers `deno task build`
- [x] Define conditional edges: filter→scraper (approved), editor→writer (needs_revision + retries<2), editor→publisher
- [x] Rewrite `src/main.ts` to call `buildGraph().invoke({})`

---

### 3 — Sub-agent tooling

Convert imperative helper functions into proper LangChain `DynamicStructuredTool` tools with Zod input schemas so agents can decide when and how to call them.

- [x] `RssTool` — wraps `rss.ts`, input: `z.object({ url: z.string(), topics: z.array(z.string()) })`
- [x] `RedditTool` — wraps `reddit.ts`, input: `z.object({ subreddit: z.string(), topic: z.string() })`
- [x] `ScraperTool` — wraps `scrapper.ts` with a `scrapeUrl()` pure function export for testing
- [x] `KnowledgeBaseTool` — fetches topic profile from DB by slug
- [ ] `TavilySearchTool` — from `@langchain/community/tools/tavily_search` for the research node
- [ ] Bind tools to research agent via `llm.bindTools([...])`

---

### 4 — Observability and reliability

- [x] Enable LangSmith tracing: set `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_PROJECT=news-radar`
- [ ] Add LangChain `InMemoryCache` (or Redis cache) to avoid redundant LLM calls on reruns
- [x] Replace hand-rolled `batch()` utility with LangGraph's built-in map-reduce pattern (`Send` API) for parallel article processing
- [x] Add structured logging (replace `console.log` with `pino`) — `src/logger.ts` using `npm:pino@^9`
- [x] Add per-node error boundaries in the graph — failed nodes write to `state.errors` and continue

---

### 5 — Database layer modernization

- [x] Keep `deno.land/x/postgres` driver; upgrade to latest version
- [x] Extract all raw SQL strings into a dedicated `src/db/queries.ts` module (typed wrappers)
- [x] Add a `retries` counter column on the `info` table to track re-processing attempts
- [x] Add a `model_used` column to track which LLM version generated each article
- [x] Add `profile` JSONB column to the `topics` table (for Task 6)

---

### 6 — Topic knowledge base

Each tracked topic gets a structured profile that agents can load as context when scanning, filtering, and writing. This replaces the current approach of passing bare topic name strings.

- [x] Create `src/topics/` directory with one file per topic (e.g. `src/topics/python.ts`)
- [x] Define a `TopicProfile` type:
  ```ts
  type TopicProfile = {
    name: string;          // "Python"
    slug: string;          // "python"
    description: string;   // short editorial definition used in LLM prompts
    officialSources: { label: string; url: string }[];   // official blog, changelog, etc.
    communityForums: { label: string; url: string }[];   // subreddits, Discord, mailing lists
    rssFeedUrls: string[]; // canonical feeds to poll (moves feed list out of scanner.ts)
    redditSubreddits: string[];
    tavilySearchTerms: string[];  // hints for the Research Agent
    editorialNotes: string;       // e.g. "avoid patch releases < x.y.1, focus on stdlib changes"
  };
  ```
- [ ] Migrate the hard-coded `sources` array in `scanner.ts` into individual topic profiles — the Scanner Agent reads topic profiles instead of a flat list
- [x] Migrate the hard-coded `sources` array in `scanner.ts` into individual topic profiles — the Scanner Agent reads topic profiles instead of a flat list
- [x] Store topic profiles in the DB (`topics` table, `profile` JSONB column) so they can be updated at runtime without a code deploy
- [x] Add a `KnowledgeBaseTool` (`DynamicStructuredTool`) that the Research and Writer agents can call to fetch the profile for a given topic slug
- [x] Inject relevant `editorialNotes` and `description` from the topic profile into the Writer and Filter agent prompts to improve consistency
- [x] Add a seed script `src/topics/seed.ts` that upserts all profiles into the DB on first run

---

### 7 — Source expansion

Using the new agent/tool architecture, expand sources cheaply:

- [ ] Add Hacker News official API tool (replace the RSS workaround)
- [ ] Add GitHub Trending scraper tool
- [ ] Re-enable Reddit subreddits (currently commented out) via the RedditTool
- [ ] Add topic-aware filtering hints per source to improve relevance signal (use `tavilySearchTerms` from topic profile)

---

### 8 — Testing

- [x] Use Deno's built-in test runner (`deno test`) — tasks configured in `deno.json`
- [x] Add unit tests for Zod output schema contracts (`tests/filter.test.ts`)
- [x] Add unit tests for scraper tool (`tests/scraper.test.ts`) with mocked fetch
- [x] Add unit tests for `TopicProfile` data integrity (`tests/topics.test.ts`)
- [x] Add unit tests for config validation (`tests/config.test.ts`)
- [ ] Add integration test that runs the full graph against a test DB with fixture RSS data

---

### 9 — Environment and configuration

- [x] Consolidate all environment variables into a validated config module (`src/config.ts`) using `zod` + `Deno.env` — no dotenv needed in Deno
- [x] Required vars: `OPENAI_API_KEY`, `DATABASE_URL`, `LANGCHAIN_API_KEY`, `TAVILY_API_KEY`
- [ ] Update `docker-compose.yml` to include healthcheck on postgres before starting the pipeline

---

## Implementation Order

1. **Task 1** — LangChain.js wiring + Deno npm: imports (unblocks everything)
2. **Task 3** — Build tools (required by agents)
3. **Tasks 2 + 5** — LangGraph pipeline + DB layer (can be developed in parallel)
4. **Task 6** — Topic knowledge base (feeds into scanner, filter, writer, and research agents)
5. **Task 4** — Observability (add after graph is running)
6. **Tasks 7 + 8 + 9** — Source expansion, tests, config cleanup

---

## Key Dependencies (new)

All added via Deno `npm:` specifiers in `deno.json` imports map:

```json
{
  "imports": {
    "@langchain/core": "npm:@langchain/core@^0.3",
    "@langchain/openai": "npm:@langchain/openai@^0.3",
    "@langchain/langgraph": "npm:@langchain/langgraph@^0.2",
    "@langchain/community": "npm:@langchain/community@^0.3",
    "zod": "npm:zod@^3",
    "pino": "npm:pino@^9"
  }
}
```

Existing Deno dependencies kept:
- `deno.land/x/postgres` — postgres driver
- `deno.land/x/rss` — RSS parsing
- `npm:cheerio@1.0.0-rc.12` — HTML scraping (switched from `esm.sh/cheerio` to avoid `undici@7 → node:sqlite` incompatibility)
- `deno.land/x/slug` — slugification
