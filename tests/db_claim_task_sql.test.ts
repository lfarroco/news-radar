import {
	assertMatch,
	assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CLAIM_NEXT_PENDING_TASK_SQL } from "../src/db/queries.ts";

Deno.test("claim task SQL: uses atomic CTE claim flow", () => {
	assertMatch(CLAIM_NEXT_PENDING_TASK_SQL, /WITH\s+next_task/i);
	assertMatch(CLAIM_NEXT_PENDING_TASK_SQL, /FOR\s+UPDATE\s+SKIP\s+LOCKED/i);
	assertMatch(CLAIM_NEXT_PENDING_TASK_SQL, /UPDATE\s+article_tasks/i);
	assertMatch(CLAIM_NEXT_PENDING_TASK_SQL, /RETURNING\s+at\.id/i);
	assertStringIncludes(CLAIM_NEXT_PENDING_TASK_SQL, "FROM claimed");
});

Deno.test("claim task SQL: enforces single-row concurrent-safe selection", () => {
	assertMatch(CLAIM_NEXT_PENDING_TASK_SQL, /WHERE\s+status\s*=\s*'pending'/i);
	assertMatch(CLAIM_NEXT_PENDING_TASK_SQL, /ORDER\s+BY\s+priority\s+DESC,\s*created_at\s+ASC/i);
	assertMatch(CLAIM_NEXT_PENDING_TASK_SQL, /LIMIT\s+1/i);
	assertMatch(CLAIM_NEXT_PENDING_TASK_SQL, /FROM\s+next_task\s+nt/i);
	assertMatch(CLAIM_NEXT_PENDING_TASK_SQL, /WHERE\s+at\.id\s*=\s*nt\.id/i);
});
