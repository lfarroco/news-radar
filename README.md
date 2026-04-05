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

3 -
[Revalance filter](https://github.com/lfarroco/news-radar/blob/main/src/candidates.ts)\
Picks "pending" items and asks the AI to identify what are the most relevant
ones according to the target audience. Items are marked as "approved".

4 - Scrapper\
Articles marked as "approved" are scraped. The resulting content is stored in
the database.

5 - Writer\
Asks the AI to write a summary about the scraped article. The writer can also
enrich drafts with additional online context (via Tavily) when needed.

6 - Publisher\
Processed items are published to a static website using Lume.

### Workflow:

The possible status transitions for each article:

scan -> create articles with status=pending

candidates -> submit status=pending articles to relevance check

approved ? either yes -> (status=approved) or no -> (status=rejected)

with approved: -> try scraping

scraped ? either yes -> (status=scraped) or no -> (status=error-scraping)

with each scraped: -> write -> (status=published)

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
