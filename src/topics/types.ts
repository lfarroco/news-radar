export type TopicProfile = {
	name: string;
	slug: string;
	description: string;
	officialSources: { label: string; url: string }[];
	communityForums: { label: string; url: string }[];
	rssFeedUrls: string[];
	redditSubreddits: string[];
	researchQueries: string[];
	editorialNotes: string;
};
