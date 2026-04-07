import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
	deactivateTopicNotesByIds,
	getTopicProfile,
	searchTopicNotes,
} from "../db/queries.ts";

export const knowledgeBaseTool = new DynamicStructuredTool({
	name: "get_topic_knowledge",
	description:
		"Manage topic knowledge notes. Supports searching active concise notes and deactivating irrelevant notes (by IDs or query match). Use only for compact facts, never full article text.",
	schema: z.object({
		action: z.enum(["search", "deactivate_notes", "deactivate_matching"]).default("search")
			.describe("Operation to perform"),
		slug: z.string().describe("Topic slug, e.g. 'rust' or 'python'"),
		query: z.string().optional().describe("Optional search query to filter notes"),
		noteIds: z.array(z.number().int().positive()).optional()
			.describe("Knowledge note IDs to deactivate when action='deactivate_notes'"),
		reason: z.string().optional().describe("Short reason for cleanup/deactivation"),
		maxToDeactivate: z.number().int().min(1).max(10).optional()
			.describe("Maximum matched notes to deactivate when action='deactivate_matching'"),
	}),
	func: async ({ action, slug, query, noteIds, reason, maxToDeactivate }) => {
		if (action === "deactivate_notes") {
			const cleanedIds = [...new Set(noteIds ?? [])].slice(0, 20);
			if (cleanedIds.length === 0) {
				return "No note IDs provided for deactivation.";
			}

			const deactivatedIds = await deactivateTopicNotesByIds(slug, cleanedIds);
			return JSON.stringify({
				action,
				slug,
				reason: reason ?? "No reason provided.",
				requestedIds: cleanedIds,
				deactivatedIds,
				deactivatedCount: deactivatedIds.length,
			}, null, 2);
		}

		if (action === "deactivate_matching") {
			const matchQuery = (query ?? "").trim();
			if (!matchQuery) {
				return "A non-empty query is required for deactivate_matching.";
			}

			const matches = await searchTopicNotes(slug, matchQuery, maxToDeactivate ?? 3);
			const idsToDeactivate = matches.map((note) => note.id);
			const deactivatedIds = await deactivateTopicNotesByIds(slug, idsToDeactivate);

			return JSON.stringify({
				action,
				slug,
				query: matchQuery,
				reason: reason ?? "No reason provided.",
				matchedIds: idsToDeactivate,
				deactivatedIds,
				deactivatedCount: deactivatedIds.length,
			}, null, 2);
		}

		const profile = await getTopicProfile(slug);
		const notes = await searchTopicNotes(slug, query ?? "", 10);

		if (!profile && notes.length === 0) {
			return `No topic knowledge found for '${slug}'.`;
		}

		return JSON.stringify({ action: "search", profile, notes }, null, 2);
	},
});
