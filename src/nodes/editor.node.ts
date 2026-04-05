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
import { compactText } from "../utils.ts";

const RELEVANCE_THRESHOLD = 7;
const MAX_CANDIDATES_PER_RUN = 30;

const relevanceSchema = z.object({
	score: z.number().min(0).max(10),
	rationale: z.string(),
});

const relevancePrompt = ChatPromptTemplate.fromMessages([
	[
		"system",
		`You are the editor for a developer news site. Score only substantive technical news (7-10).

Knowledge base policy:
- The topic knowledge base is for concise facts and durable reference notes only.
- Do not rely on or store full article text, long excerpts, or transcript-like content in knowledge notes.

SCORE 9-10 (PUBLISH):
- Security vulnerabilities, CVEs, patches with impact
- Major version releases (1.0, 2.0, major.0)
- Breaking changes affecting many developers
- Significant new features in major tools/frameworks
- Critical bug fixes for widespread issues

SCORE 7-8 (BORDERLINE):
- Minor version features (.x releases)
- Ecosystem tool updates (bundlers, linters, CI/CD)
- Standards/RFC approvals

SCORE 0-6 (REJECT):
- Random tips, tutorials, "how-to" articles
- Listicles ("5 patterns", "10 ways", "best practices")
- Career advice, job posts, "learn X" articles
- Opinion pieces without technical substance
- Fundraising, company news, sponsorships
- Podcast/newsletter announcements
- Beginner guides
- Duplicate/old news`,
	],
	[
		"human",
		`Topic: {topic}
Title: {title}
Snippet: {snippet}
Source: {source}

Only score 7+ if this is substantive breaking news or a major update.`,
	],
]);

const summarizeResearch = (sources: ResearchSource[]): string => {
	if (sources.length === 0) {
		return "No additional sources found during editor research.";
	}

	return sources
		.slice(0, 3)
		.map((source, idx) => {
			const snippet = compactText(source.content, 140);
			return [
				`Source ${idx + 1}: ${source.title}`,
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
				[
					`Candidate: ${candidate.title}`,
					`Editorial score: ${relevance.score}/10`,
					`Rationale: ${compactText(relevance.rationale, 120)}`,
					`Research: ${compactText(researchNotes, 180)}`,
				].join("\n"),
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
