import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getTopicProfile, searchTopicNotes } from "../db/queries.ts";

export const knowledgeBaseTool = new DynamicStructuredTool({
	name: "get_topic_knowledge",
	description:
		"Returns topic profile metadata plus latest active concise knowledge notes for a topic slug. Notes are short memory facts for reference and should not be treated as full source text.",
	schema: z.object({
		slug: z.string().describe("Topic slug, e.g. 'rust' or 'python'"),
		query: z.string().optional().describe("Optional search query to filter notes"),
	}),
	func: async ({ slug, query }) => {
		const profile = await getTopicProfile(slug);
		const notes = await searchTopicNotes(slug, query ?? "", 10);

		if (!profile && notes.length === 0) {
			return `No topic knowledge found for '${slug}'.`;
		}

		return JSON.stringify({ profile, notes }, null, 2);
	},
});
