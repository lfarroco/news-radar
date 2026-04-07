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
Runs the source scout agent, discovers topic sources dynamically, resolves
RSS/Atom feeds from discovered URLs, and ingests fresh story candidates into
`candidates` with `status = pending`.

2 - Editor\
Scores each pending candidate for developer relevance (0-10), gathers
additional research context by parsing official source pages (Cheerio + selector logic), updates per-topic
knowledge notes, and creates prioritized `article_tasks`.

3 - Writer\
Picks highest-priority pending tasks, reads candidate + editor notes + topic
knowledge notes, optionally scrapes source pages, and generates a 300-500 word
article with the LLM. Output is saved in `articles`.

4 - Publisher\
Processed items are published to a static website using Lume.

### Workflow:

The possible status transitions for each candidate/task:

scan -> create candidates with status=pending

editor -> relevance score + research

candidate relevant ? yes -> (status=researched + task created) / no -> (status=rejected)

writer claims task -> article_tasks.status=in_progress

writer success -> article_tasks.status=completed + candidates.status=published + row in articles

writer failure -> article_tasks.status=failed + candidates.status=writer-error

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

Running `sh cron.sh` will scan, rebuild the site locally, and refresh the local
database dump. It runs every hour.
