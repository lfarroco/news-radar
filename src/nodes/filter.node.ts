import { ChatPromptTemplate } from "@langchain/core/prompts";
import { makeLlm, relevanceOutputSchema } from "../llm.ts";
import { setArticleStatus } from "../db/queries.ts";
import { logger } from "../logger.ts";
import { Article } from "../models.ts";
import type { PipelineState } from "../graph/state.ts";

const BATCH_SIZE = 20;

const SYSTEM = `
You are an editor for a magazine called "Dev Radar" focused on programming languages, frameworks, and related tooling.
You will be given a list of article IDs and titles. Return only the IDs of articles that are relevant to our audience.

We publish articles about:
- Programming language releases and features
- Updates to popular libraries, frameworks, and tools
- New libraries, frameworks, and developer tools
- Algorithms and data structures

We do NOT publish:
- Company funding/acquisition news
- Politics or community drama
- Generic programming advice
- "How to print hello world" tutorials
- Job posts
- Small patch-only releases
- Podcast announcements
`.trim();

const HUMAN = `Here are the articles to evaluate:\n{items}`;

const prompt = ChatPromptTemplate.fromMessages([
	["system", SYSTEM],
	["human", HUMAN],
]);

const runRelevanceCheck = async (batch: Article[]): Promise<Article[]> => {
	const items = batch
		.map((a) => `(${a.id}) - ${a.title}`)
		.join("\n");

	const llm = makeLlm(0).withStructuredOutput(relevanceOutputSchema);
	const chain = prompt.pipe(llm);

	let selected: number[] = [];
	try {
		const result = await chain.invoke({ items });
		selected = result.selected;
	} catch (err) {
		logger.error({ err }, "filter: LLM call failed for batch");
		return [];
	}

	const selectedSet = new Set(selected);

	await Promise.all(
		batch.map((article) => {
			const status = selectedSet.has(article.id) ? "approved" : "rejected";
			return setArticleStatus(article.id, status);
		}),
	);

	return batch.filter((a) => selectedSet.has(a.id));
};

export const filterNode = async (
	state: PipelineState,
): Promise<Partial<PipelineState>> => {
	logger.info({ count: state.pendingArticles.length }, "filter: starting");

	const batches: Article[][] = [];
	for (let i = 0; i < state.pendingArticles.length; i += BATCH_SIZE) {
		batches.push(state.pendingArticles.slice(i, i + BATCH_SIZE));
	}

	const approved: Article[] = [];
	for (const batch of batches) {
		const result = await runRelevanceCheck(batch);
		approved.push(...result);
	}

	logger.info({ approved: approved.length }, "filter: finished");
	return { approvedArticles: approved };
};
