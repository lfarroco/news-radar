serve:
	docker-compose run --rm --service-ports app deno task serve

run:
	docker-compose run --rm app deno run -A src/main.ts

selectors:
	docker-compose run --rm app deno task selector-backfill -- --limit 25

test:
	docker-compose run --rm app deno task test

scout:
	docker-compose run --rm app deno task scout

selector-backfill:
	docker-compose run --rm app deno task selector-backfill

run-db:
	docker-compose run postgres

open-db:
	docker exec -it news-radar-db-1 psql -U root

build-pages:
	docker-compose run --rm app deno task build

deploy-pages-local:
	./scripts/deploy-pages-local.sh

stats:
	docker exec news-radar-db-1 psql -U root -c "SELECT COUNT(*), status FROM candidates GROUP BY status ORDER BY status;"

source-selector-stats:
	docker exec news-radar-db-1 psql -U root -c "SELECT COUNT(*) AS total_rows, COUNT(*) FILTER (WHERE feed_url IS NULL AND index_item_selector IS NULL AND index_title_selector IS NULL AND index_link_selector IS NULL) AS url_only_rows, COUNT(*) FILTER (WHERE feed_url IS NOT NULL) AS feed_backed_rows, COUNT(*) FILTER (WHERE index_item_selector IS NOT NULL AND index_title_selector IS NOT NULL AND index_link_selector IS NOT NULL) AS selector_backed_rows, COUNT(*) FILTER (WHERE source_type = 'unknown') AS unknown_type_rows FROM source_selectors;"

retry-writer-errors:
	docker exec news-radar-db-1 psql -U root -c "WITH reset_tasks AS (UPDATE article_tasks at SET status = 'pending', picked_at = NULL, updated_at = now() FROM candidates c WHERE at.candidate_id = c.id AND at.status = 'failed' AND c.status = 'writer-error' RETURNING at.candidate_id), reset_candidates AS (UPDATE candidates c SET status = 'researched', updated_at = now() WHERE c.id IN (SELECT candidate_id FROM reset_tasks) RETURNING c.id) SELECT (SELECT COUNT(*)::int FROM reset_tasks) AS tasks_reset, (SELECT COUNT(*)::int FROM reset_candidates) AS candidates_reset;"

retry-editor-errors:
	docker exec news-radar-db-1 psql -U root -c "UPDATE candidates SET status = 'pending', updated_at = now() WHERE status = 'editor-error';"

dump-schema:
	docker exec news-radar-db-1 pg_dump --schema-only -U root > seed.sql

dump-db:
	docker exec news-radar-db-1 pg_dump -U root > dbdump.sql

restore-db-dump:
	cat dbdump.sql | docker exec news-radar-db-1 psql -U root root

query:
	docker exec -it news-radar-db-1 psql -U root -c "$(query)"

# manually adds an item to the db
insert:
	docker exec -it news-radar-db-1 psql -U root -c "INSERT INTO candidates (topic_id, title, url, snippet, source, discovered_at, status) VALUES ((SELECT id FROM topics WHERE slug = '$(topic)'), '$(title)', '$(url)', 'manually inserted', 'manual', now(), 'pending') ON CONFLICT (topic_id, url) DO UPDATE SET updated_at = now();"

# receives an id and rejects it
# usage: make reject id=1
reject:
	docker exec news-radar-db-1 psql -U root -c "UPDATE candidates SET status = 'rejected', updated_at = now() WHERE id = '$(id)';"

list-candidates:
	docker exec news-radar-db-1 psql -U root -c "SELECT c.id, t.slug AS topic, c.title, c.status, c.discovered_at FROM candidates c INNER JOIN topics t ON t.id = c.topic_id ORDER BY c.discovered_at DESC LIMIT 30;"

list-tasks:
	docker exec news-radar-db-1 psql -U root -c "SELECT id, candidate_id, priority, status, created_at, picked_at FROM article_tasks ORDER BY created_at DESC LIMIT 30;"

list-latest-articles:
	docker exec news-radar-db-1 psql -U root -c "SELECT a.id, t.slug AS topic, a.title, a.published_at FROM articles a INNER JOIN topics t ON t.id = a.topic_id ORDER BY a.published_at DESC LIMIT 20;"

clean-db:
	docker exec news-radar-db-1 psql -U root -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
	cat seed.sql | docker exec -i news-radar-db-1 psql -U root

