# News Radar — Modernization Plan

## Current State Analysis

The project is a Deno/TypeScript automated news pipeline built ~2 years ago with:

- **Runtime**: Deno + TypeScript
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

### 1 — Runtime migration: Deno → Node.js 22

**Why**: LangGraph.js and the full LangChain.js ecosystem have first-class Node.js support; Deno compatibility lags.

- [ ] Replace `deno.json` with `package.json` using `"type": "module"`
- [ ] Replace `deno.land/x/postgres` → `pg` + `drizzle-orm` (typed queries, migrations)
- [ ] Replace `deno.land/x/rss` → `rss-parser`
- [ ] Replace `esm.sh/cheerio` → `cheerio` (npm)
- [ ] Replace `deno.land/x/slug` → `slugify` (npm)
- [ ] Replace `deno.land/x/dotenv` → `dotenv`
- [ ] Update `Dockerfile` to use `node:22-slim`
- [ ] Update `Makefile` and `cron.sh` accordingly
- [ ] Migrate `tsconfig.json` (target `ES2022`, `module: NodeNext`)

---

### 2 — Introduce LangChain.js

**Packages**: `@langchain/core`, `@langchain/openai`, `langchain`

- [ ] Replace `src/openai.ts` raw fetch calls with `ChatOpenAI` from `@langchain/openai`
- [ ] Upgrade model from `gpt-3.5-turbo` to `gpt-4o-mini` (better quality, lower cost)
- [ ] Replace string-interpolated prompts with `ChatPromptTemplate.fromMessages()`
- [ ] Replace `JSON.parse(result)` brittle parsing with `withStructuredOutput(zodSchema)` for all LLM calls:
  - `candidates.ts` → `z.object({ selected: z.array(z.number()) })`
  - `writer.ts` → `z.object({ title: z.string(), content: z.string(), categories: z.array(z.string()) })`
- [ ] Add `@langchain/community` for built-in tool integrations (Tavily, Cheerio loader)
- [ ] Configure LangSmith tracing via `LANGCHAIN_API_KEY` env var for observability

---

### 3 — Implement LangGraph pipeline

**Package**: `@langchain/langgraph`

Replace the procedural `main.ts` script with a compiled state graph.

- [ ] Define a shared `PipelineState` type (LangGraph `Annotation` object):
  ```ts
  // fields: pendingArticles, approvedArticles,
  //         scrapedArticles, writtenArticles, errors
  ```
- [ ] Create `src/graph/index.ts` — compile and export the `StateGraph`
- [ ] Implement graph nodes (one file per node under `src/nodes/`):
  - `scanner.node.ts` — fetches RSS/Reddit, inserts into DB, returns pending articles
  - `filter.node.ts` — calls relevance agent, splits into approved/rejected
  - `scraper.node.ts` — scrapes URLs in parallel using LangChain `Document` loaders
  - `research.node.ts` — *(new)* enriches each article with Tavily web search
  - `writer.node.ts` — writes structured article drafts
  - `editor.node.ts` — *(new)* reviews draft, requests revision if quality is low
  - `publisher.node.ts` — persists to DB and triggers Lume build
- [ ] Define conditional edges:
  - After filter: `approved → scraper`, `rejected → end`
  - After scraper: `ok → research`, `error → error_handler`
  - After editor: `approved → publisher`, `needs_revision → writer` (max 2 retries)
- [ ] Replace `cron.sh` loop with a single `node src/graph/index.ts` invocation

---

### 4 — Sub-agent tooling

Convert imperative helper functions into proper LangChain `DynamicStructuredTool` tools with Zod input schemas so agents can decide when and how to call them.

- [ ] `RssTool` — wraps `rss.ts`, input: `z.object({ url: z.string(), topics: z.array(z.string()) })`
- [ ] `RedditTool` — wraps `reddit.ts`, input: `z.object({ subreddit: z.string(), topic: z.string() })`
- [ ] `ScraperTool` — wraps `scrapper.ts` using `@langchain/community/document_loaders/web/cheerio`
- [ ] `TavilySearchTool` — from `@langchain/community/tools/tavily_search` for the research node
- [ ] `DbWriteTool` — wraps all `client.queryArray` write operations with a typed interface
- [ ] Bind tools to their respective agents via `llm.bindTools([...])`

---

### 5 — Observability and reliability

- [ ] Enable LangSmith tracing: set `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_PROJECT=news-radar`
- [ ] Add LangChain `InMemoryCache` (or Redis cache) to avoid redundant LLM calls on reruns
- [ ] Replace hand-rolled `batch()` utility with LangGraph's built-in map-reduce pattern (`Send` API) for parallel article processing
- [ ] Add structured logging (replace `console.log` with `pino`)
- [ ] Add per-node error boundaries in the graph — failed nodes should write to `state.errors` and continue rather than crashing the whole run

---

### 6 — Database layer modernization

- [ ] Replace raw `pg` query strings with **Drizzle ORM** schema definitions in `src/db/schema.ts`
- [ ] Add a proper migration system (`drizzle-kit`) — replace `seed.sql`
- [ ] Add a `retries` counter column on the `info` table to track re-processing attempts
- [ ] Add a `model_used` column to track which LLM version generated each article

---

### 7 — Source expansion

Using the new agent/tool architecture, expand sources cheaply:

- [ ] Add Hacker News official API tool (replace the RSS workaround)
- [ ] Add GitHub Trending scraper tool
- [ ] Re-enable Reddit subreddits (currently commented out) via the RedditTool
- [ ] Add topic-aware filtering hints per source to improve relevance signal

---

### 8 — Testing

- [ ] Update `__tests__/main.test.ts` test runner from Deno to **Vitest**
- [ ] Add unit tests for each graph node using `LangChain FakeListChatModel` to mock LLM responses
- [ ] Add integration test that runs the full graph against a test DB with fixture RSS data

---

### 9 — Environment and configuration

- [ ] Consolidate all environment variables into a validated config module (`zod` + `dotenv`) at startup
- [ ] Required vars: `OPENAI_API_KEY`, `DATABASE_URL`, `LANGCHAIN_API_KEY`, `TAVILY_API_KEY`
- [ ] Update `docker-compose.yml` to include healthcheck on postgres before starting the pipeline

---

## Implementation Order

1. **Tasks 1 + 2** — Runtime + LangChain wiring (unblocks everything)
2. **Task 4** — Build tools (required by agents)
3. **Task 3** — LangGraph pipeline (core architectural change)
4. **Task 6** — DB layer (can be done in parallel with 3)
5. **Task 5** — Observability (add after graph is running)
6. **Tasks 7 + 8 + 9** — Expansion, tests, config cleanup

---

## Key Dependencies (new)

```json
{
  "@langchain/core": "^0.3",
  "@langchain/openai": "^0.3",
  "@langchain/langgraph": "^0.2",
  "@langchain/community": "^0.3",
  "langchain": "^0.3",
  "drizzle-orm": "^0.33",
  "drizzle-kit": "^0.24",
  "pg": "^8",
  "zod": "^3",
  "rss-parser": "^3",
  "cheerio": "^1",
  "slugify": "^1",
  "pino": "^9",
  "dotenv": "^16",
  "vitest": "^2"
}
```
