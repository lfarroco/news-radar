# News Radar

This is an experiment on using AI to generate news articles.

### Steps:

1 - Scanner Collects top items in a given URL Results are stored in a database
and each item is marked as "pending"

2 - Filter candidates Picks "pending" items asks chatgpt to identify what are
the most relevant ones according to the target audience

3 - Article Scrapper Picks relevant items that were not digested yet and scrapes
the article content The content is stored in the dataabase

4 - Writer Feeds chatgpt with the article content and ask it to write a new
version

5 - Publisher Processed items are published to a static website using Lume

### Workflow:

scan -> create articles with status=pending

candidates -> submit status=pending articles to relevance check

approved ? -> yes -> (status=approved) -> no -> (status=rejected)

with approved: -> try scraping

scraped ? -> yes -> (status=scraped) -> no -> (status=error-scraping)

with scraped: -> write -> (status=published)

### Running

Running `make run` will perform the following steps:

- start database container
- start deno container and use it to:
  - scan and write news
  - run static website generator, place generated files under `_site`
- exit containers
