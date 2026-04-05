import { connect, upsertTopic, upsertTopicProfile } from "../db/queries.ts";
import { allTopics } from "./profiles.ts";
import { loadConfig } from "../config.ts";
const config = loadConfig();

export const seedTopics = async () => {
	for (const profile of allTopics) {
		await upsertTopic(profile.name, profile.slug);
		await upsertTopicProfile(profile.slug, profile);
	}
	console.log(`Seeded ${allTopics.length} topic profiles.`);
};

// run directly: deno run -A src/topics/seed.ts
if (import.meta.main) {
	await connect(config.DB_HOST, Number(config.DB_PORT));
	await seedTopics();
	Deno.exit(0);
}
