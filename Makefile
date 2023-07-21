lume-buld:
	deno task lume

lume-serve:
	deno task lume --serve

docker-build:
	docker build . -t radar-server

docker-run:
	docker run -p 8080:8080 radar-server

docker-compose:
	docker-compose up --abort-on-container-exit

clear-db:
	docker rm news-radar_postgres_1

open-db:
	docker exec -it news-radar_postgres_1 psql -U root

open-docker:
	docker exec -it news-radar_app_1 sh

scan:
	docker run -it --init -v $PWD:/app denoland/deno:1.10.3 run --allow-net /app/src/scanner.ts

candidates:
	docker exec news-radar_app_1 node build/src/candidates.js

scrape:
	docker exec news-radar_app_1 node build/src/scrapper.js

write:
	docker exec news-radar_app_1 node build/src/writer.js

spin:
	docker exec news-radar_app_1 node build/src/spin.js

run:
	docker exec news-radar_app_1 node build/src/scanner.js && \
	docker exec news-radar_app_1 node build/src/candidates.js && \
	docker exec news-radar_app_1 node build/src/scrapper.js && \
	docker exec news-radar_app_1 node build/src/writer.js && \
	docker exec news-radar_app_1 node build/src/publisher/publish_index.js && \
	docker exec news-radar_app_1 node build/src/publisher/publish_articles.js && \
	docker exec news-radar_app_1 node build/src/publisher/publish_categories_index.js && \
	docker exec news-radar_app_1 node build/src/publisher/publish_categories.js && \
	docker exec news-radar_app_1 node build/src/publisher/publish_archives.js && \
	git add . && \
	git commit -m "automated run" && \
	git push origin main; \

publish-index:
	docker exec news-radar_app_1 node build/src/publisher/publish_index.js

publish-articles:
	docker exec news-radar_app_1 node build/src/publisher/publish_articles.js

publish-archives:
	docker exec news-radar_app_1 node build/src/publisher/publish_archives.js

publish-categories-index:
	docker exec news-radar_app_1 node build/src/publisher/publish_categories_index.js

publish-categories:
	docker exec news-radar_app_1 node build/src/publisher/publish_categories.js

publish:
	docker exec news-radar_app_1 node build/src/publisher/publish_index.js && \
	docker exec news-radar_app_1 node build/src/publisher/publish_articles.js && \
	docker exec news-radar_app_1 node build/src/publisher/publish_categories_index.js && \
	docker exec news-radar_app_1 node build/src/publisher/publish_categories.js && \
	docker exec news-radar_app_1 node build/src/publisher/publish_archives.js

blogger:
	docker exec news-radar_app_1 node build/src/blogger.js

stats:
	docker exec -it news-radar_postgres_1 psql -U root -c "SELECT COUNT(status), status from info GROUP BY status;"

retry-scrape:
	docker exec -it news-radar_postgres_1 psql -U root -c "UPDATE info SET status = 'approved' WHERE status = 'error-scraping';"

dump-db:
	docker exec -it news-radar_postgres_1 pg_dump --schema-only -U root > seed.sql

dump-csv:
	docker exec -it news-radar_postgres_1 psql -U root -c "\copy (SELECT * FROM article_topic) TO '/tmp/at.csv' DELIMITER ',' CSV HEADER;"

query:
	docker exec -it news-radar_postgres_1 psql -U root -c "$(query)"


# adds an item to the db
insert:
	docker exec -it news-radar_postgres_1 psql -U root -c "INSERT INTO info (title, link, date, status, source) VALUES ('$(url)', '$(url)', '$(shell date)', 'pending', 'manual'); INSERT INTO article_topic (article_id, topic_id) VALUES ((SELECT id FROM info WHERE link = '$(url)'), (SELECT id FROM topics WHERE name = '$(topic)'));"


# receives an id and rejects it
# usage: make reject id=1
reject:
	docker exec -it news-radar_postgres_1 psql -U root -c "UPDATE info SET status = 'rejected' WHERE id = '$(id)';"

#receives an article id and category name and adds it to the article_topic table
category:
	docker exec -it news-radar_postgres_1 psql -U root -c "INSERT INTO article_topic (article_id, topic_id) VALUES ('$(article_id)', (SELECT id FROM topics WHERE name = '$(category)'));"

remove-category:
	docker exec -it news-radar_postgres_1 psql -U root -c "DELETE FROM article_topic WHERE article_id = '$(article_id)' AND topic_id = (SELECT id FROM topics WHERE name = '$(category)');"

list-articles:
	docker exec -it news-radar_postgres_1 psql -U root -c "SELECT id, title, source, status, created_at FROM info ORDER BY created_at DESC LIMIT 20;"

