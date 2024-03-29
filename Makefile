serve:
	docker-compose run --rm --service-ports app task serve

run:
	docker-compose run --rm app deno run -A src/main.ts

run-db:
	docker-compose run postgres

open-db:
	docker exec -it news-radar_postgres_1 psql -U root

build-pages:
	docker-compose run --rm app deno task build

stats:
	docker exec news-radar_postgres_1 psql -U root -c "SELECT COUNT(status), status from info GROUP BY status;"

retry-scrape:
	docker exec news-radar_postgres_1 psql -U root -c "UPDATE info SET status = 'approved' WHERE status = 'error-scraping';"

dump-schema:
	docker exec news-radar_postgres_1 pg_dump --schema-only -U root > seed.sql

dump-db:
	docker exec news-radar_postgres_1 pg_dump -U root > dbdump.sql

restore-db-dump:
	cat dbdump.sql | docker exec news-radar_postgres_1 psql -U root root

query:
	docker exec -it news-radar_postgres_1 psql -U root -c "$(query)"

# manually adds an item to the db
insert:
	docker exec -it news-radar_postgres_1 psql -U root -c "INSERT INTO info (title, link, date, status, source) VALUES ('$(url)', '$(url)', '$(shell date)', 'pending', 'manual'); INSERT INTO article_topic (article_id, topic_id) VALUES ((SELECT id FROM info WHERE link = '$(url)'), (SELECT id FROM topics WHERE name = '$(topic)'));"

# receives an id and rejects it
# usage: make reject id=1
reject:
	docker exec news-radar_postgres_1 psql -U root -c "UPDATE info SET status = 'rejected' WHERE id = '$(id)';"

#receives an article id and category name and adds it to the article_topic table
category:
	docker exec news-radar_postgres_1 psql -U root -c "INSERT INTO article_topic (article_id, topic_id) VALUES ('$(article_id)', (SELECT id FROM topics WHERE slug = '$(name)'));"

remove-category:
	docker exec news-radar_postgres_1 psql -U root -c "DELETE FROM article_topic WHERE article_id = '$(article_id)' AND topic_id = (SELECT id FROM topics WHERE slug = '$(name)');"

list-latest-articles:
	docker exec news-radar_postgres_1 psql -U root -c "SELECT id, title, source, status, created_at FROM info ORDER BY created_at DESC LIMIT 20;"

