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

Running `make serve` will build the static website and serve it at port `3000`.

Running `sh cron.sh` will scan, rebuild the site locally, and refresh the local
database dump. It runs every hour.
