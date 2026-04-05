import { Annotation } from "@langchain/langgraph";
import { ArticleTask, Candidate, GeneratedArticle } from "../models.ts";

export const PipelineAnnotation = Annotation.Root({
	pendingCandidates: Annotation<Candidate[]>({
		reducer: (_a, b) => b,
		default: () => [],
	}),
	queuedTasks: Annotation<ArticleTask[]>({
		reducer: (_a, b) => b,
		default: () => [],
	}),
	publishedArticles: Annotation<GeneratedArticle[]>({
		reducer: (_a, b) => b,
		default: () => [],
	}),
	errors: Annotation<{ node: string; message: string; articleId?: number }[]>({
		reducer: (a, b) => [...a, ...b],
		default: () => [],
	}),
	metrics: Annotation<{
		scanned: number;
		reviewed: number;
		tasksCreated: number;
		written: number;
	}>({
		reducer: (_a, b) => b,
		default: () => ({ scanned: 0, reviewed: 0, tasksCreated: 0, written: 0 }),
	}),
});

export type PipelineState = typeof PipelineAnnotation.State;
