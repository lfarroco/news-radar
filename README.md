
# News Radar

Steps:

1 - Scanner
Collects top items in a given URL
Results are stored in a database and each item is marked as "pending"

2 - Filter candidates
Picks "pending" items asks chatgpt to identify what 
are the most relevant ones according to the target audience

3 - Article Scrapper
Picks relevant items that were not digested yet and scrapes the article content
The content is stored in the dataabase

4 - Writer
Feeds chatgpt with the article content and ask it to write a new version

5 - Publisher
Processed items are published to a static website

Ideas:
- if an article is too big to be sent to chatgpt, use a summarizer to reduce the size or use a slice of the article (it should be able to understand the context with just the initial chunk)
