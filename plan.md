
# News Radar Improvement Plan

## P0 - Reliability and Correctness

- [ ] Make article task claiming atomic in `claimNextPendingArticleTask`
	- [ ] Use one transaction (or one `UPDATE ... RETURNING`) to avoid claim races
	- [ ] Add test coverage for concurrent task claiming behavior
- [ ] Fail pipeline run with non-zero exit when terminal graph errors exist
	- [ ] Update `src/main.ts` to throw/exit when `result.errors` is non-empty
	- [ ] Confirm `make run` returns non-zero on publisher/build failure
- [ ] Harden status transitions for idempotency and recovery
	- [ ] Ensure failed tasks can be safely retried
	- [ ] Document all valid candidate/task statuses in code + README

## P1 - Workflow Alignment and Cleanup

- [ ] Remove or archive legacy workflow modules that still target old schema
	- [ ] Review and migrate/remove: `src/writer.ts`, `src/candidates.ts`, `src/rss.ts`, `src/scrapper.ts`
	- [ ] Keep only one canonical pipeline path (graph-based)
- [ ] Fix operational command drift in `Makefile`
	- [ ] Replace old `info`/`article_topic` SQL with `candidates`/`article_tasks`/`articles`
	- [ ] Add safe helper targets for modern schema (retry failed task, list queue depth, etc.)
- [ ] Update documentation to match actual runtime behavior
	- [ ] Clarify source-scout behavior (discovery vs official-source refresh)
	- [ ] Keep status transition table in README aligned with implemented nodes

## P1 - Testing and Quality Gates

- [ ] Expand automated tests to cover workflow behavior
	- [ ] Graph integration test: scanner -> editor -> writer -> reviewer -> publisher
	- [ ] DB transition tests for candidate and article task state changes
	- [ ] Publisher failure test verifies run is marked failed
- [ ] Resolve stale/untracked test harness issues
	- [ ] Remove or migrate `__tests__/main.test.ts` (Jest-style) to Deno test format
	- [ ] Ensure CI/test command executes all intended tests consistently

## P2 - Throughput and Cost Controls

- [ ] Make per-run limits configurable via env
	- [ ] `MAX_CANDIDATES_PER_RUN`, `MAX_TASKS_PER_RUN`, scout interval
	- [ ] Add sane defaults + docs
- [ ] Add queue-aware tuning
	- [ ] Increase writer throughput when backlog/age grows
	- [ ] Reduce throughput when error rate spikes
- [ ] Revisit source scout interval (`SOURCE_SCOUT_INTERVAL_HOURS`)
	- [ ] Set production-safe default cadence
	- [ ] Add telemetry for scout hit rate and useful-source yield

## P2 - Environment and Deployment Consistency

- [ ] Normalize working directory assumptions
	- [ ] Align Dockerfile `WORKDIR` with compose/config expectations
	- [ ] Verify local, compose, and deploy scripts all use consistent paths
- [ ] Make cron strategy production-safe
	- [ ] Replace long-running `while true` loop with scheduler-friendly one-shot command
	- [ ] Add explicit exit/alert behavior for failed runs

## P3 - Product/UX Backlog

- [ ] Add icon to each topic

## Definition of Done

- [ ] `make run` and `make build-pages` are reliable and fail fast on real errors
- [ ] No legacy code path can mutate production data accidentally
- [ ] Docs, commands, and schema are aligned
- [ ] Tests cover critical workflow transitions and failure modes