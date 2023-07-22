lume-buld:
	deno task lume

serve:
	deno task lume --serve

run:
	docker-compose up --abort-on-container-exit

open-db:
	docker exec -it news-radar_postgres_1 psql -U root

stats:
	docker exec -it news-radar_postgres_1 psql -U root -c "SELECT COUNT(status), status from info GROUP BY status;"

retry-scrape:
	docker exec -it news-radar_postgres_1 psql -U root -c "UPDATE info SET status = 'approved' WHERE status = 'error-scraping';"

dump-schema:
	docker exec -it news-radar_postgres_1 pg_dump --schema-only -U root > seed.sql

dump-db:
	docker exec -it news-radar_postgres_1 pg_dump -U root > dbdump.sql

query:
	docker exec -it news-radar_postgres_1 psql -U root -c "$(query)"

# manually adds an item to the db
insert:
	docker exec -it news-radar_postgres_1 psql -U root -c "INSERT INTO info (title, link, date, status, source) VALUES ('$(url)', '$(url)', '$(shell date)', 'pending', 'manual'); INSERT INTO article_topic (article_id, topic_id) VALUES ((SELECT id FROM info WHERE link = '$(url)'), (SELECT id FROM topics WHERE name = '$(topic)'));"

# receives an id and rejects it
# usage: make reject id=1
reject:
	docker exec -it news-radar_postgres_1 psql -U root -c "UPDATE info SET status = 'rejected' WHERE id = '$(id)';"

#receives an article id and category name and adds it to the article_topic table
category:
	docker exec -it news-radar_postgres_1 psql -U root -c "INSERT INTO article_topic (article_id, topic_id) VALUES ('$(article_id)', (SELECT id FROM topics WHERE slug = '$(name)'));"

remove-category:
	docker exec -it news-radar_postgres_1 psql -U root -c "DELETE FROM article_topic WHERE article_id = '$(article_id)' AND topic_id = (SELECT id FROM topics WHERE slug = '$(name)');"

list-latest-articles:
	docker exec -it news-radar_postgres_1 psql -U root -c "SELECT id, title, source, status, created_at FROM info ORDER BY created_at DESC LIMIT 20;"

