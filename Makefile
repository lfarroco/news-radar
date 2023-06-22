docker-build:
	docker build . -t radar-server

docker-run:
	docker run -p 8080:8080 radar-server

docker-compose:
	docker-compose up --build

clear-db:
	docker rm news-radar_postgres_1

open-db:
	docker exec -it news-radar_postgres_1 psql -U root

open-docker:
	docker exec -it news-radar_app_1 sh

scan:
	docker exec news-radar_app_1 node build/src/scanner.js

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
	git add . && \
	git commit -m "automated run" && \
	git push origin main

publish-index:
	docker exec news-radar_app_1 node build/src/publisher/publish_index.js

publish-articles:
	docker exec news-radar_app_1 node build/src/publisher/publish_articles.js

publish-categories-index:
	docker exec news-radar_app_1 node build/src/publisher/publish_categories_index.js

publish-categories:
	docker exec news-radar_app_1 node build/src/publisher/publish_categories.js

publish:
	docker exec news-radar_app_1 node build/src/publisher/publish_index.js && \
	docker exec news-radar_app_1 node build/src/publisher/publish_articles.js && \
	docker exec news-radar_app_1 node build/src/publisher/publish_categories_index.js && \
	docker exec news-radar_app_1 node build/src/publisher/publish_categories.js

stats:
	docker exec -it news-radar_postgres_1 psql -U root -c "SELECT COUNT(status), status from info GROUP BY status;"

retry-scrape:
	docker exec -it news-radar_postgres_1 psql -U root -c "UPDATE info SET status = 'approved' WHERE status = 'error-scraping';"

dump-db:
	docker exec -it news-radar_postgres_1 pg_dump -U root > seed.sql

dump-csv:
	docker exec -it news-radar_postgres_1 psql -U root -c "\copy (SELECT * FROM article_topic) TO '/tmp/at.csv' DELIMITER ',' CSV HEADER;"

# receives an id and rejects it
# usage: make reject id=1
reject:
	docker exec -it news-radar_postgres_1 psql -U root -c "UPDATE info SET status = 'rejected' WHERE id = '$(id)';"

#receives an article id and category name and adds it to the article_topic table
category:
	docker exec -it news-radar_postgres_1 psql -U root -c "INSERT INTO article_topic (article_id, topic_id) VALUES ('$(article_id)', (SELECT id FROM topics WHERE name = '$(category)'));"

remove-category:
	docker exec -it news-radar_postgres_1 psql -U root -c "DELETE FROM article_topic WHERE article_id = '$(article_id)' AND topic_id = (SELECT id FROM topics WHERE name = '$(category)');"

