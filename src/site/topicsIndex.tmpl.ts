import { getTopicsList } from "../db.ts";
import { slugify } from "../utils.ts";

export const layout = "topicsIndex.njk";

export default async function* () {
	const topics = await getTopicsList();

	yield {
		url: `/topics/`,
		topics: topics.map(t => ({
			...t,
			url: `/topics/${t.slug}/`,
		}))
	}
}

