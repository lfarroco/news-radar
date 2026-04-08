import { hasPipelineErrors } from "./outcome.ts";

type PipelineResult = {
	errors?: Array<{ node: string; message: string; articleId?: number }>;
	publishedArticles?: unknown[];
	metrics?: unknown;
};

type RunnerLogger = {
	info: (obj: unknown, msg?: string) => void;
	error: (obj: unknown, msg?: string) => void;
};

type GraphInvoker = {
	invoke: (state: Record<string, never>) => Promise<PipelineResult>;
};

export type PipelineRunnerDeps = {
	runLogger: RunnerLogger;
	startedAt: number;
	connect: () => Promise<void>;
	ensureTopicsSeeded: () => Promise<void>;
	buildGraph: () => GraphInvoker;
};

export const runPipelineWithDeps = async (deps: PipelineRunnerDeps): Promise<void> => {
	const {
		runLogger,
		startedAt,
		connect,
		ensureTopicsSeeded,
		buildGraph,
	} = deps;

	try {
		await connect();
		await ensureTopicsSeeded();

		runLogger.info("pipeline: starting graph");
		const graph = buildGraph();
		const result = await graph.invoke({});

		const summary = {
			durationMs: Date.now() - startedAt,
			errorCount: result.errors?.length ?? 0,
			publishedCount: result.publishedArticles?.length ?? 0,
			metrics: result.metrics,
		};

		if (hasPipelineErrors(result.errors)) {
			runLogger.error({ ...summary, errors: result.errors }, "pipeline: completed with errors");
			throw new Error("pipeline completed with errors");
		}

		runLogger.info(summary, "pipeline: completed successfully");
	} catch (err) {
		runLogger.error({ err, durationMs: Date.now() - startedAt }, "pipeline: crashed");
		throw err;
	}
};
