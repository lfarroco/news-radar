import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { makeLlm } from "../llm.ts";
import {
	addTopicNote,
	createArticleTask,
	getPendingCandidates,
	hasOpenTaskForCandidate,
	setCandidateStatus,
} from "../db/queries.ts";
import { logger } from "../logger.ts";
import type { Candidate } from "../models.ts";
import type { PipelineState } from "../graph/state.ts";
import {
	searchOnlineSources,
	type ResearchSource,
} from "../tools/tavily.tool.ts";

const RELEVANCE_THRESHOLD = 5;
const MAX_CANDIDATES_PER_RUN = 30;

const relevanceSchema = z.object({
	score: z.number().min(0).max(10),
	rationale: z.string(),
});

const relevancePrompt = ChatPromptTemplate.fromMessages([
	[
		"system",
		`You are the editor agent for a developer news publication.
Score relevance from 0-10.
Criteria:
- Security fix, major releases, runtime/compiler changes: high
- Tooling/platform updates with clear developer impact: medium-high
- Minor patch updates or generic announcements: low-medium
- Non-technical or community drama: low`,
	],
	[
		"human",
		`Topic: {topic}
Title: {title}
Snippet: {snippet}
Source: {source}
Return score and concise rationale.`,
	],
]);

const summarizeResearch = (sources: ResearchSource[]): string => {
	if (sources.length === 0) {
		return "No additional sources found during editor research.";
	}

	return sources
		.slice(0, 4)
		.map((source, idx) => {
			const snippet = source.content.slice(0, 220);
			return [
				`Source ${idx + 1}: ${source.title}`,
				`URL: ${source.url}`,
				`Snippet: ${snippet}`,
			].join("\n");
		})
		.join("\n\n");
};

const computePriority = (candidate: Candidate, score: number): number => {
	const ageHours = (Date.now() - new Date(candidate.discovered_at).getTime()) / 3_600_000;
	const recencyBoost = Math.max(0, 72 - ageHours);
	return Math.round(score * 100 + recencyBoost);
};

const buildTaskNotes = (
	candidate: Candidate,
	score: number,
	rationale: string,
	researchNotes: string,
): string => {
	return [
		`Candidate title: ${candidate.title}`,
		`Candidate URL: ${candidate.url}`,
		`Relevance score: ${score}/10`,
		`Editor rationale: ${rationale}`,
		"Research notes:",
		researchNotes,
	].join("\n\n");
};

export const editorNode = async (
	state: PipelineState,
): Promise<Partial<PipelineState>> => {
	const candidates = state.pendingCandidates.length > 0
		? state.pendingCandidates.slice(0, MAX_CANDIDATES_PER_RUN)
		: await getPendingCandidates(MAX_CANDIDATES_PER_RUN);

	if (candidates.length === 0) {
		logger.info("editor: no pending candidates");
		return {};
	}

	logger.info({ count: candidates.length }, "editor: reviewing candidates");

	const llm = makeLlm(0).withStructuredOutput(relevanceSchema);
	const chain = relevancePrompt.pipe(llm);

	let reviewed = 0;
	let tasksCreated = 0;

	for (const candidate of candidates) {
		reviewed++;
		try {
			const relevance = await chain.invoke({
				topic: candidate.topic_name,
				title: candidate.title,
				snippet: candidate.snippet || "(empty)",
				source: candidate.source,
			});

			if (relevance.score < RELEVANCE_THRESHOLD) {
				await setCandidateStatus(candidate.id, "rejected", relevance.score);
				continue;
			}

			const researchQuery = `${candidate.topic_name} ${candidate.title} official announcement changelog security`;
			const sources = await searchOnlineSources(researchQuery, 4);
			const researchNotes = summarizeResearch(sources);
			const taskNotes = buildTaskNotes(
				candidate,
				relevance.score,
				relevance.rationale,
				researchNotes,
			);
			const priority = computePriority(candidate, relevance.score);

			await setCandidateStatus(candidate.id, "researched", relevance.score, researchNotes);

			const alreadyQueued = await hasOpenTaskForCandidate(candidate.id);
			if (!alreadyQueued) {
				await createArticleTask(candidate.id, taskNotes, priority);
				tasksCreated++;
			}

			await addTopicNote(
				candidate.topic_slug,
				"fact",
				`${candidate.title} (${candidate.url})\n\n${researchNotes}`,
				candidate.url,
				"editor-agent",
			);
		} catch (err) {
			logger.error({ err, candidateId: candidate.id }, "editor: failed candidate review");
			await setCandidateStatus(candidate.id, "editor-error");
		}
	}

	logger.info({ reviewed, tasksCreated }, "editor: finished");

	return {
		metrics: {
			...(state.metrics ?? { scanned: 0, reviewed: 0, tasksCreated: 0, written: 0 }),
			reviewed,
			tasksCreated,
			written: state.metrics?.written ?? 0,
			scanned: state.metrics?.scanned ?? candidates.length,
		},
	};
};
