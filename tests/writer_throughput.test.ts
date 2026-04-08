import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeWriterTaskBudget } from "../src/pipeline/throughput.ts";

Deno.test("writer throughput: increases budget when backlog is high", () => {
    const budget = computeWriterTaskBudget(3, {
        pendingTasks: 55,
        failedLast24h: 1,
        completedLast24h: 15,
    });

    assertEquals(budget, 7);
});

Deno.test("writer throughput: reduces budget when failure rate is elevated", () => {
    const budget = computeWriterTaskBudget(4, {
        pendingTasks: 10,
        failedLast24h: 6,
        completedLast24h: 6,
    });

    assertEquals(budget, 2);
});

Deno.test("writer throughput: never goes below one", () => {
    const budget = computeWriterTaskBudget(1, {
        pendingTasks: 0,
        failedLast24h: 10,
        completedLast24h: 0,
    });

    assertEquals(budget, 1);
});
