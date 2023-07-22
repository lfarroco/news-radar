# News Radar

This is an experiment on using AI to generate news articles.

The system collects programming news from multiple sources, selects the relevant
items and summarizes them.

You can add your own sources and run it locally and adjust the prompts to try to
create the perfectly unbiased tech journalist!

You need to create a `.env` file with your OpenAI key, in this format

```
OPENAI_API_KEY=sk-...
```

### How it works:

The system performs the following steps:

1 - Scanner\
Collects top items in a given URL Results are stored in a database and each item
is marked as "pending"

2 -
[Revalance filter](https://github.com/lfarroco/news-radar/blob/main/src/candidates.ts)\
Picks "pending" items asks chatgpt to identify what are the most relevant ones
according to the target audience.

3 - Scrapper\
Picks relevant items that were not digested yet and scrapes the article content
The content is stored in the database

4 - [Writer](https://github.com/lfarroco/news-radar/blob/main/src/writer.ts)\
Feeds chatgpt with the article content and ask it to write a new version

5 - Publisher\
Processed items are published to a static website using Lume

### Workflow:

The possible status transitions for each article:

scan -> create articles with status=pending

candidates -> submit status=pending articles to relevance check

approved ? either yes -> (status=approved) or no -> (status=rejected)

with approved: -> try scraping

scraped ? either yes -> (status=scraped) or no -> (status=error-scraping)

with each scraped: -> write -> (status=published)

### Running

Running `make run` will perform the following steps:

- start database container
- start deno container and use it to:
  - scan and write news
  - run static website generator, place generated files under `_site`
- exit containers

Running `make serve` will build the static website and serve it at port `3000`.

Running `sh cron.sh` will run `make run` every hour and push the updated files
to the `main` remote branch.
