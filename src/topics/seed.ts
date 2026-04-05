import {
	connect,
	getAllTopicProfiles,
	upsertTopic,
	upsertTopicProfile,
} from "../db/queries.ts";
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

export const ensureTopicsSeeded = async () => {
	const existing = await getAllTopicProfiles();
	if (existing.length > 0) {
		console.log(`Topic profiles already present (${existing.length}). Skipping seed.`);
		return;
	}

	await seedTopics();
};

// run directly: deno run -A src/topics/seed.ts
if (import.meta.main) {
	await connect(config.DB_HOST, Number(config.DB_PORT));
	await seedTopics();
	Deno.exit(0);
}
