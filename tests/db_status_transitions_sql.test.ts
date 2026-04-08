import {
	assertMatch,
	assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
	COMPLETE_ARTICLE_TASK_SQL,
	RETRY_FAILED_WRITER_TASKS_SQL,
	SET_CANDIDATE_STATUS_SQL,
} from "../src/db/queries.ts";

Deno.test("candidate status SQL: updates status with safe metadata coalescing", () => {
	assertMatch(SET_CANDIDATE_STATUS_SQL, /UPDATE\s+candidates/i);
	assertStringIncludes(SET_CANDIDATE_STATUS_SQL, "status = $1");
	assertMatch(SET_CANDIDATE_STATUS_SQL, /relevance_score\s*=\s*COALESCE\(\$3,\s*relevance_score\)/i);
	assertMatch(SET_CANDIDATE_STATUS_SQL, /research_notes\s*=\s*COALESCE\(\$4,\s*research_notes\)/i);
	assertMatch(SET_CANDIDATE_STATUS_SQL, /updated_at\s*=\s*now\(\)/i);
	assertStringIncludes(SET_CANDIDATE_STATUS_SQL, "WHERE id = $2");
});

Deno.test("article task completion SQL: updates status and updated_at", () => {
	assertMatch(COMPLETE_ARTICLE_TASK_SQL, /UPDATE\s+article_tasks/i);
	assertStringIncludes(COMPLETE_ARTICLE_TASK_SQL, "status = $2");
	assertMatch(COMPLETE_ARTICLE_TASK_SQL, /updated_at\s*=\s*now\(\)/i);
	assertStringIncludes(COMPLETE_ARTICLE_TASK_SQL, "WHERE id = $1");
});

Deno.test("writer retry SQL: safely requeues failed tasks and aligned candidates", () => {
	assertMatch(RETRY_FAILED_WRITER_TASKS_SQL, /WITH\s+reset_tasks/i);
	assertMatch(RETRY_FAILED_WRITER_TASKS_SQL, /UPDATE\s+article_tasks/i);
	assertMatch(RETRY_FAILED_WRITER_TASKS_SQL, /status\s*=\s*'pending'/i);
	assertMatch(RETRY_FAILED_WRITER_TASKS_SQL, /picked_at\s*=\s*NULL/i);
	assertMatch(RETRY_FAILED_WRITER_TASKS_SQL, /at\.status\s*=\s*'failed'/i);
	assertMatch(RETRY_FAILED_WRITER_TASKS_SQL, /c\.status\s*=\s*'writer-error'/i);
	assertMatch(RETRY_FAILED_WRITER_TASKS_SQL, /UPDATE\s+candidates/i);
	assertMatch(RETRY_FAILED_WRITER_TASKS_SQL, /status\s*=\s*'researched'/i);
	assertMatch(RETRY_FAILED_WRITER_TASKS_SQL, /SELECT\s+COUNT\(\*\)::int\s+FROM\s+reset_tasks/i);
});
