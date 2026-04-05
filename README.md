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
TAVILY_API_KEY=tvly_...
```

### How it works:

The system performs the following steps:

1 - Scanner\
Collects top items from the source URLs. Results are stored in a database and
each item is marked as "pending".

2 - Researcher\
Looks up additional web sources for detected topics (when `TAVILY_API_KEY` is configured),
so downstream steps have extra context.

3 - Planner\
Uses the scanned items (plus researcher context) to plan what the publication
should write in this run. A plan can combine multiple scanned items into one
original article idea. This means the pipeline can scan 5+ items and still
choose to publish only 2-3 synthesized articles.

4 - Scraper\
Fetches full content for source items selected by the planner.

5 - Writer\
Writes original articles from the planner's instructions. Each article may use
multiple scraped sources plus additional online context (via Tavily) when
available.

6 - Publisher\
Processed items are published to a static website using Lume.

### Workflow:

The possible status transitions for each article:

scan -> create articles with status=pending

planner -> submit status=pending articles to editorial planning

selected as source ? either yes -> (status=approved) or no -> (status=rejected)

with approved: -> scrape selected source items

scraped ? either yes -> (status=scraped) or no -> (status=error-scraping)

writer publishes the primary source row -> (status=published)

additional source rows used only as references -> (status=reference-only)

### Running

Running `make run` will scan the sources and write the news into the database.
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
