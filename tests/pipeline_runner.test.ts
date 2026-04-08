import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runPipelineWithDeps } from "../src/pipeline/runner.ts";

const makeLogger = () => ({
	infoCalls: [] as unknown[],
	errorCalls: [] as unknown[],
	info(payload: unknown) {
		this.infoCalls.push(payload);
	},
	error(payload: unknown) {
		this.errorCalls.push(payload);
	},
});

Deno.test("pipeline runner: succeeds when graph has no errors", async () => {
	const logger = makeLogger();

	await runPipelineWithDeps({
		runLogger: logger,
		startedAt: Date.now(),
		connect: () => Promise.resolve(),
		ensureTopicsSeeded: () => Promise.resolve(),
		buildGraph: () => ({
			invoke: () =>
				Promise.resolve({
					errors: [],
					publishedArticles: [{ id: 1 }],
					metrics: { written: 1 },
				}),
		}),
	});

	assertEquals(logger.errorCalls.length, 0);
	assertEquals(logger.infoCalls.length >= 2, true);
});

Deno.test("pipeline runner: throws when graph reports errors", async () => {
	const logger = makeLogger();

	await assertRejects(
		() =>
			runPipelineWithDeps({
				runLogger: logger,
				startedAt: Date.now(),
				connect: () => Promise.resolve(),
				ensureTopicsSeeded: () => Promise.resolve(),
				buildGraph: () => ({
					invoke: () =>
						Promise.resolve({
							errors: [{ node: "publisher", message: "build failed" }],
						}),
				}),
			}),
		Error,
		"pipeline completed with errors",
	);

	assertEquals(logger.errorCalls.length >= 1, true);
});
