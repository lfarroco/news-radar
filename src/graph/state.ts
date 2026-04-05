import { Annotation } from "@langchain/langgraph";
import { Article, ArticlePlan } from "../models.ts";
import type { ResearchSource } from "../tools/tavily.tool.ts";

export const PipelineAnnotation = Annotation.Root({
	pendingArticles: Annotation<Article[]>({
		reducer: (_a, b) => b,
		default: () => [],
	}),
	approvedArticles: Annotation<Article[]>({
		reducer: (_a, b) => b,
		default: () => [],
	}),
	plannedArticles: Annotation<ArticlePlan[]>({
		reducer: (_a, b) => b,
		default: () => [],
	}),
	scrapedArticles: Annotation<Article[]>({
		reducer: (_a, b) => b,
		default: () => [],
	}),
	topicResearch: Annotation<Record<string, ResearchSource[]>>({
		reducer: (a, b) => ({ ...a, ...b }),
		default: () => ({}),
	}),
	writtenArticles: Annotation<Article[]>({
		reducer: (_a, b) => b,
		default: () => [],
	}),
	errors: Annotation<{ node: string; message: string; articleId?: number }[]>({
		reducer: (a, b) => [...a, ...b],
		default: () => [],
	}),
	writerRetries: Annotation<number>({
		reducer: (_a, b) => b,
		default: () => 0,
	}),
});

export type PipelineState = typeof PipelineAnnotation.State;
