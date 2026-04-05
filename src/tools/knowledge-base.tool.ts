import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getTopicProfile } from "../db/queries.ts";

export const knowledgeBaseTool = new DynamicStructuredTool({
	name: "get_topic_profile",
	description:
		"Returns the knowledge base profile for a topic slug, including official sources, editorial notes, and search terms.",
	schema: z.object({
		slug: z.string().describe("Topic slug, e.g. 'rust' or 'python'"),
	}),
	func: async ({ slug }) => {
		const profile = await getTopicProfile(slug);
		if (!profile) return `No profile found for topic '${slug}'.`;
		return JSON.stringify(profile, null, 2);
	},
});
