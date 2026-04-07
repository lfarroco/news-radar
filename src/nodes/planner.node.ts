import { ChatPromptTemplate } from "@langchain/core/prompts";
import { makeLlm, plannerOutputSchema } from "../llm.ts";
import { setCandidateStatus } from "../db/queries.ts";
import { logger } from "../logger.ts";
import { Candidate, ArticlePlan } from "../models.ts";
import type { PipelineState } from "../graph/state.ts";
import type { ResearchSource } from "../tools/research.tool.ts";

const MAX_CANDIDATES = 40;
const MAX_PLANS = 6;

const SYSTEM = `
You are the planning editor of "Dev Radar".
You receive a list of scanned source items and must propose fewer, higher-value original article plans.

Rules:
- Return 1 to ${MAX_PLANS} plans when useful. Return 0 plans only if all sources are irrelevant.
- Plans may combine multiple source items.
- sourceArticleIds must contain only IDs from the provided input.
- primarySourceId must be one of sourceArticleIds.
- Prefer technically deep, high-signal stories for developers.
- Avoid hype, funding news, politics, or generic advice.
`.trim();

const HUMAN = `
Scanned source items:
{items}

Additional online context grouped by topic:
{researchContext}
`;

const prompt = ChatPromptTemplate.fromMessages([
	["system", SYSTEM],
	["human", HUMAN],
]);

const buildItemsText = (articles: Candidate[]): string =>
	articles
		.map((article) => {
			const date = article.discovered_at instanceof Date
				? article.discovered_at.toISOString().split("T")[0]
				: String(article.discovered_at);
			return [
				`ID: ${article.id}`,
				`Title: ${article.title}`,
				`Source: ${article.source}`,
				`Date: ${date}`,
			].join("\n");
		})
		.join("\n\n");

const buildResearchContext = (
	topicResearch: Record<string, ResearchSource[]>,
): string => {
	const topics = Object.keys(topicResearch);
	if (topics.length === 0) return "No extra research context available.";

	return topics
		.slice(0, 12)
		.map((topic) => {
			const snippets = (topicResearch[topic] ?? [])
				.slice(0, 2)
				.map((source) => `- ${source.title}: ${source.content.substring(0, 160)}`)
				.join("\n");
			return `Topic: ${topic}\n${snippets || "- No sources"}`;
		})
		.join("\n\n");
};

const normalizePlans = (
	plans: Array<Omit<ArticlePlan, "id">>,
	availableById: Map<number, Candidate>,
): ArticlePlan[] => {
	const out: ArticlePlan[] = [];

	for (const [idx, plan] of plans.entries()) {
		const sourceIds = [...new Set(plan.sourceArticleIds)]
			.filter((id) => availableById.has(id));
		if (sourceIds.length === 0) continue;

		const primarySourceId = sourceIds.includes(plan.primarySourceId)
			? plan.primarySourceId
			: sourceIds[0];

		out.push({
			id: `plan-${idx + 1}-${primarySourceId}`,
			title: plan.title.trim(),
			angle: plan.angle.trim(),
			sourceArticleIds: sourceIds,
			primarySourceId,
			topicHints: [...new Set(plan.topicHints.map((topic) => topic.trim()).filter(Boolean))],
		});
	}

	return out;
};

const buildFallbackPlans = (articles: Candidate[]): ArticlePlan[] =>
	articles.slice(0, 3).map((article, idx) => ({
		id: `fallback-${idx + 1}-${article.id}`,
		title: article.title,
		angle: "Summarize key technical changes and developer impact.",
		sourceArticleIds: [article.id],
		primarySourceId: article.id,
		topicHints: [],
	}));

export const plannerNode = async (
	state: PipelineState,
): Promise<Partial<PipelineState>> => {
	const candidates = [...state.pendingCandidates]
		.sort((a, b) => +new Date(b.discovered_at) - +new Date(a.discovered_at))
		.slice(0, MAX_CANDIDATES);

	if (candidates.length === 0) {
		logger.info("planner: no pending items, skipping");
		return {};
	}

	logger.info({ candidates: candidates.length }, "planner: starting");

	const llm = makeLlm(0.1).withStructuredOutput(plannerOutputSchema);
	const chain = prompt.pipe(llm);

	const availableById = new Map(candidates.map((article) => [article.id, article]));

	let plans: ArticlePlan[] = [];
	try {
		const raw = await chain.invoke({
			items: buildItemsText(candidates),
			researchContext: buildResearchContext(state.topicResearch ?? {}),
		});
		plans = normalizePlans(raw.plans, availableById).slice(0, MAX_PLANS);
	} catch (err) {
		logger.error({ err }, "planner: LLM planning failed");
	}

	if (plans.length === 0) {
		plans = buildFallbackPlans(candidates);
	}

	const selectedIds = new Set(plans.flatMap((plan) => plan.sourceArticleIds));
	const selectedArticles = candidates.filter((article) => selectedIds.has(article.id));

	await Promise.all(
		candidates.map((article) =>
			setCandidateStatus(article.id, selectedIds.has(article.id) ? "approved" : "rejected")
		),
	);

	logger.info(
		{ plans: plans.length, selectedSources: selectedArticles.length },
		"planner: finished",
	);

	return {
		plannedArticles: plans,
		approvedArticles: selectedArticles,
	};
};
