# News Radar

This is an experiment on using AI to generate news articles.

The system collects programming news from multiple sources, selects the relevant
items and summarizes them.

You can add your own sources and adjust the prompts to make it write accordingly
to your own editorial policy and biases.

You need to create a `.env` file with your OpenAI key, in this format

```
OPENAI_API_KEY=sk-...
```

### How it works:

The system performs the following steps:

1 - Scanner\
Collects top items from the source URLs. Results are stored in a database and
each item is marked as "pending".

2 -
[Revalance filter](https://github.com/lfarroco/news-radar/blob/main/src/candidates.ts)\
Picks "pending" items and asks the AI to identify what are the most relevant
ones according to the target audience. Items are marked as "approved".

3 - Scrapper\
Articles marked as "approved" are scraped. The resulting content is stored in
the database.

4 - [Writer](https://github.com/lfarroco/news-radar/blob/main/src/writer.ts)\
Asks the AI write a summary about the scraped article.

5 - Publisher\
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

Running `make build-pages` will use the updated db to generate the static
website under `_site`

Running `make serve` will build the static website and serve it at port `3000`.

Running `sh cron.sh` will scan and write website files. It runs every hour.
