# News Radar

This is an experiment on using AI to generate news articles.

The system collects programming news from multiple sources, selects the relevant
items and summarizes them.

You can add your own sources and adjust the prompts to make it write accordingly
to your own editorial policy and biases.

Create your local env file:

```sh
cp .env.example .env
```

Then edit `.env` and add your Groq key.

```
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
```

### How it works:

The system performs the following steps:

1 - Scanner\
Runs the source scout agent, refreshes source notes from configured official
topic sources, resolves RSS/Atom feeds from known/discovered source URLs, and
ingests fresh story candidates into
`candidates` with `status = pending`.

2 - Editor\
Scores each pending candidate for developer relevance (0-10), gathers
additional research context by parsing official source pages (Cheerio + selector logic), updates per-topic
knowledge notes, and creates prioritized `article_tasks`.

3 - Writer\
Picks highest-priority pending tasks, reads candidate + editor notes + topic
knowledge notes, optionally scrapes source pages, and generates a 300-500 word
article with the LLM. Output is saved in `articles`.

4 - Reviewer\
Runs a final quality pass over newly generated articles and can improve title
and body before publish artifacts are built.

5 - Publisher\
Processed items are published to a static website using Lume.

### Workflow

The runtime pipeline is a fixed graph:

`scanner -> editor -> writer -> reviewer -> publisher`

Simple ASCII flowchart (linear execution order):

```text
[Start: connect DB + seed topics]
              |
              v
[Scanner: discover sources + ingest candidates as pending]
              |
              v
[Editor: score/research + set candidate statuses + create tasks]
              |
              v
[Writer: claim task + write article + update task/candidate statuses]
              |
              v
[Reviewer: optionally improve title/body of written articles]
              |
              v
[Publisher: run deno task build to generate _site]
              |
              v
[End: success or pipeline error if site build fails]
```

Notes:

- The scanner inserts candidates as `pending` and may skip discovered sources
	that are outside the topic's official-source allowlist.
- The editor only creates a task after setting the candidate to `researched`.
- The writer is the step that inserts into `articles` and marks the candidate as
	`published`.
- The reviewer does not change candidate or task status; it only updates the
	generated article when it decides improvements are needed.
- The publisher does not publish an article record to the database. It rebuilds
	the static site from the database, and a failed site build is reported as a
	pipeline error.

### Status model

Candidate statuses (`candidates.status`):

- `pending`: newly ingested and waiting for editor evaluation.
- `researched`: passed editor checks, enriched with notes, and eligible for writer.
- `published`: article was generated and persisted.
- `rejected`: filtered out by policy/relevance or writer safety checks.
- `editor-error`: editor step failed unexpectedly.
- `writer-error`: writer step failed unexpectedly.

Article task statuses (`article_tasks.status`):

- `pending`: task queued and claimable by writer.
- `in_progress`: atomically claimed by writer and currently being processed.
- `completed`: writer successfully finished task and article insertion path.
- `failed`: writer processing failed (retryable through operational commands).

Implemented transition paths:

- Candidate: `pending -> researched|rejected|editor-error`, `researched -> published|writer-error|rejected`, `editor-error -> pending`, `writer-error -> researched`.
- Article task: `pending -> in_progress`, `in_progress -> completed|failed`, `failed -> pending`.

### Running

Running `make run` scans sources, evaluates candidates, queues article tasks,
generates articles, and then rebuilds the static site.
If topic profiles are missing in the database, they are bootstrapped automatically
from `src/topics/profiles.ts` on startup.

Running `make build-pages` will use the updated db to generate the static
website under `_site`

The `_site` directory is a generated build artifact and should not be committed
to git. Rebuild it from the database and templates when you need to publish or
serve the site.

### Cloudflare Pages

This project is not a pure static source tree. The published `_site` output is
generated at build time by Lume, and that build reads articles and topics from
Postgres.

For Cloudflare Pages:

1. Set the build command to `./scripts/cloudflare-build.sh`
2. Set the output directory to `_site`
3. Make sure your build environment can reach your Postgres instance
4. Add the required environment variables in Pages settings:

```sh
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
DB_HOST=<your-postgres-host>
DB_PORT=5432
DB_USER=root
DB_PASSWORD=root
DB_NAME=root
```

Important: the default local `DB_HOST=postgres` only works inside this repo's
Docker Compose network. Cloudflare Pages must use a real hostname or IP for a
reachable database.

### Local deploy to Cloudflare Pages

If your database only exists locally, use direct deploy from your machine
instead of Cloudflare's git build.

1. Authenticate once:

```sh
npx wrangler login
```

2. Build from local DB and deploy generated `_site`:

```sh
make deploy-pages-local
```

If you prefer running Wrangler directly after building, this also works:

```sh
npx wrangler pages deploy _site
```

Running `make serve` will build the static website and serve it at port `3000`.

### Testing

Canonical test command:

```sh
deno task test
```

Selector backfill command for `source_selectors` rows that still have only a URL:

```sh
deno task selector-backfill
```

Optional flags:

```sh
deno task selector-backfill -- --topic python --limit 25
```

Containerized equivalent:

```sh
make test
```

### Logging

By default, runtime logs print only the message text (for example,
`pipeline: completed successfully`) to keep console output compact.

To restore structured JSON logs, set:

```sh
LOG_MSG_ONLY=false
```

Pipeline decision log convention:

- Use the shared helper in [src/pipeline/decision-log.ts](src/pipeline/decision-log.ts) for all select/refuse/write/skip/fail decisions.
- Always include what and why in the decision fields:
    - `entity` (`candidate`, `article`, etc.)
    - `topic` or `category` when relevant
    - `title`
    - `url`
    - `reason`
- Keep stage names stable (`scanner`, `editor`, `writer`, `reviewer`, `publisher`) so operational search patterns remain consistent.

Example usage in node code:

```ts
logDecision(logger, "info", "writer", "written", {
    entity: "article",
    topic: task.topic_slug,
    title: articleTitle,
    url,
    reason: "article generated and persisted",
});
```

### Runtime limits

You can tune run throughput and scout cadence via environment variables:

- `MAX_CANDIDATES_PER_RUN` (default: `30`): maximum pending candidates editor evaluates per run.
- `MAX_TASKS_PER_RUN` (default: `10`): maximum article tasks writer attempts per run.
- `SOURCE_SCOUT_INTERVAL_HOURS` (default: `6`): minimum hours between source-scout passes per topic.

If a value is missing or invalid (non-numeric or non-positive), News Radar falls back to the default.

Queue-aware writer tuning:

- The writer starts from `MAX_TASKS_PER_RUN` and adjusts per run using queue health.
- Backlog boost: pending tasks `>= 20` adds `+2`, pending tasks `>= 50` adds `+4`.
- Error-rate guardrail: if 24h writer failure rate is `>= 30%`, budget is reduced by `1`; if `>= 50%`, reduced by `2`.
- Final per-run writer budget is clamped between `1` and `12` tasks.

Source-scout telemetry:

- Each scout run logs `queryHitRate` (`queriesWithResults / queriesAttempted`).
- Each scout run logs `usefulSourceYield` (`(sourcesInserted + sourcesUpdated) / sourcesFound`).

### Useful operational commands

```sh
make stats
make selector-backfill
make list-candidates
make list-tasks
make list-latest-articles
make retry-editor-errors
make retry-writer-errors
```

Running `sh cron.sh` performs a single scheduled run: scan pipeline, site build,
and local database dump refresh.

To run hourly, configure your scheduler to invoke it once per hour (example
crontab entry):

```sh
0 * * * * cd /path/to/news-radar && sh cron.sh >> /var/log/news-radar-cron.log 2>&1
```

If `ALERT_WEBHOOK_URL` is set, `cron.sh` sends a best-effort failure
notification payload when a step fails.
