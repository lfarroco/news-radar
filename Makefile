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

publish:
	docker exec news-radar_app_1 node build/src/publisher.js

dump-db:
	docker exec -it news-radar_postgres_1 pg_dump -U root -t info > seed.sql

