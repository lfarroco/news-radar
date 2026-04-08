import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
	connect,
	getTopicsList,
	getTopicArticles,
	getLatestArticles,
	setTopicNoteActiveState,
	client as db,
} from "./db.ts";
import { loadConfig } from "./config.ts";
import { logger } from "./logger.ts";
import { allTopics } from "./topics/profiles.ts";

const config = loadConfig();

// Connect to database
await connect(config.DB_HOST, Number(config.DB_PORT));

// Task status tracking
const taskStatus: Record<string, { status: string; startTime: number; message: string; output?: string; error?: string }> = {};

const cors = (headers: HeadersInit = {}) => ({
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
	...headers,
});

const toSlug = (value: string): string =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

const getErrorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

type TopicProfileResponse = {
	topic_id: number;
	name: string;
	slug: string;
	article_count: number;
	description: string | null;
	officialSources: Array<{ label: string; url: string }>;
	communityForums: Array<{ label: string; url: string }>;
	rssFeedUrls: string[];
	redditSubreddits: string[];
	researchQueries: string[];
	editorialNotes: string | null;
};

const createEmptyTopicProfile = () => ({
	description: "",
	officialSources: [],
	communityForums: [],
	rssFeedUrls: [],
	redditSubreddits: [],
	researchQueries: [],
	editorialNotes: "",
});

const sanitizeString = (value: unknown): string =>
	typeof value === "string" ? value.trim() : "";

const sanitizeStringList = (value: unknown): string[] =>
	Array.isArray(value)
		? value
			.map((item) => sanitizeString(item))
			.filter(Boolean)
		: [];

const sanitizeSourceList = (value: unknown): Array<{ label: string; url: string }> => {
	if (!Array.isArray(value)) return [];

	return value
		.map((item) => {
			if (!item || typeof item !== "object") return null;
			const source = item as { label?: unknown; url?: unknown };
			const url = sanitizeString(source.url);
			if (!url) return null;
			const label = sanitizeString(source.label) || url;
			return { label, url };
		})
		.filter((item): item is { label: string; url: string } => item !== null);
};

const sanitizeTopicProfileInput = (value: unknown) => {
	const profile = value && typeof value === "object" ? value as Record<string, unknown> : {};

	return {
		description: sanitizeString(profile.description),
		officialSources: sanitizeSourceList(profile.officialSources),
		communityForums: sanitizeSourceList(profile.communityForums),
		rssFeedUrls: sanitizeStringList(profile.rssFeedUrls),
		redditSubreddits: sanitizeStringList(profile.redditSubreddits).map((subreddit) =>
			subreddit.replace(/^r\//i, "").trim()
		).filter(Boolean),
		researchQueries: sanitizeStringList(profile.researchQueries),
		editorialNotes: sanitizeString(profile.editorialNotes),
	};
};

const findDefaultTopicProfile = (name: string, slug: string) => {
	const slugKey = toSlug(slug);
	const nameKey = toSlug(name);
	return allTopics.find((topic) => toSlug(topic.slug) === slugKey || toSlug(topic.name) === nameKey) ?? null;
};

const mergeTopicProfileFallback = (profile: TopicProfileResponse): TopicProfileResponse => {
	const fallback = findDefaultTopicProfile(profile.name, profile.slug);

	return {
		...profile,
		description: profile.description?.trim() || fallback?.description || null,
		officialSources: Array.isArray(profile.officialSources) && profile.officialSources.length > 0
			? profile.officialSources
			: (fallback?.officialSources ?? []),
		communityForums: Array.isArray(profile.communityForums) && profile.communityForums.length > 0
			? profile.communityForums
			: (fallback?.communityForums ?? []),
		rssFeedUrls: Array.isArray(profile.rssFeedUrls) && profile.rssFeedUrls.length > 0
			? profile.rssFeedUrls
			: (fallback?.rssFeedUrls ?? []),
		redditSubreddits: Array.isArray(profile.redditSubreddits) && profile.redditSubreddits.length > 0
			? profile.redditSubreddits
			: (fallback?.redditSubreddits ?? []),
		researchQueries: Array.isArray(profile.researchQueries) && profile.researchQueries.length > 0
			? profile.researchQueries
			: (fallback?.researchQueries ?? []),
		editorialNotes: profile.editorialNotes?.trim() || fallback?.editorialNotes || null,
	};
};

async function handleRequest(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const pathname = url.pathname;

	// Handle CORS preflight
	if (req.method === "OPTIONS") {
		return new Response(null, { headers: cors() });
	}

	const headers = cors({ "Content-Type": "application/json" });

	try {
		// API Routes
		if (pathname === "/api/status" && req.method === "GET") {
			return new Response(JSON.stringify({
				status: "running",
				message: "Backoffice API is running",
				time: new Date().toISOString(),
				database: "connected",
				port: config.API_PORT
			}), { headers });
		}

		if (pathname === "/api/tasks/status" && req.method === "GET") {
			return new Response(JSON.stringify(taskStatus), { headers });
		}

		if (pathname === "/api/topics" && req.method === "GET") {
			const topics = await getTopicsList();
			return new Response(JSON.stringify(topics), { headers });
		}

		if (pathname === "/api/topics" && req.method === "POST") {
			const data = await req.json();
			const name = (data?.name ?? "").trim();
			const rawSlug = (data?.slug ?? "").trim();
			const slug = toSlug(rawSlug || name);

			if (!name) {
				return new Response(JSON.stringify({ error: "Topic name is required" }), {
					status: 400,
					headers,
				});
			}

			if (!slug) {
				return new Response(JSON.stringify({ error: "A valid slug is required" }), {
					status: 400,
					headers,
				});
			}

			const existing = await db.queryObject<{ id: number }>(
				`SELECT id FROM topics WHERE slug = $1 LIMIT 1`,
				[slug],
			);

			if (existing.rows.length > 0) {
				return new Response(JSON.stringify({ error: "Topic slug already exists" }), {
					status: 409,
					headers,
				});
			}

			const defaultProfile = findDefaultTopicProfile(name, slug);
			const initialProfile = defaultProfile ?? createEmptyTopicProfile();

			const created = await db.queryObject<{
				topic_id: number;
				name: string;
				slug: string;
				article_count: number;
			}>(
				`INSERT INTO topics (name, slug, profile)
				 VALUES ($1, $2, $3::jsonb)
				 RETURNING id AS topic_id, name, slug, 0::int AS article_count`,
				[name, slug, JSON.stringify(initialProfile)],
			);

			return new Response(JSON.stringify(created.rows[0]), {
				status: 201,
				headers,
			});
		}

		if (pathname.match(/^\/api\/topics\/\d+$/) && req.method === "GET") {
			const topicId = Number(pathname.split("/")[3]);
			const result = await db.queryObject<TopicProfileResponse>(
				`SELECT
					t.id AS topic_id,
					t.name,
					t.slug,
					COUNT(a.id)::int AS article_count,
					t.profile->>'description' AS description,
					COALESCE((t.profile->'officialSources')::jsonb, '[]'::jsonb) AS "officialSources",
					COALESCE((t.profile->'communityForums')::jsonb, '[]'::jsonb) AS "communityForums",
					COALESCE((t.profile->'rssFeedUrls')::jsonb, '[]'::jsonb) AS "rssFeedUrls",
					COALESCE((t.profile->'redditSubreddits')::jsonb, '[]'::jsonb) AS "redditSubreddits",
					COALESCE((t.profile->'researchQueries')::jsonb, '[]'::jsonb) AS "researchQueries",
					t.profile->>'editorialNotes' AS "editorialNotes"
				 FROM topics t
				 LEFT JOIN articles a ON a.topic_id = t.id
				 WHERE t.id = $1
				 GROUP BY t.id, t.name, t.slug, t.profile`,
				[topicId],
			);

			if (!result.rows[0]) {
				return new Response(JSON.stringify({ error: "Topic not found" }), {
					status: 404,
					headers,
				});
			}

			return new Response(JSON.stringify(mergeTopicProfileFallback(result.rows[0])), { headers });
		}

		if (pathname.match(/^\/api\/topics\/\d+$/) && req.method === "PUT") {
			const topicId = Number(pathname.split("/")[3]);
			const data = await req.json();
			const name = (data?.name ?? "").trim();
			const rawSlug = (data?.slug ?? "").trim();
			const slug = toSlug(rawSlug || name);
			const hasProfilePayload = data && typeof data === "object" && "profile" in data;

			if (!name) {
				return new Response(JSON.stringify({ error: "Topic name is required" }), {
					status: 400,
					headers,
				});
			}

			if (!slug) {
				return new Response(JSON.stringify({ error: "A valid slug is required" }), {
					status: 400,
					headers,
				});
			}

			const existing = await db.queryObject<{ id: number }>(
				`SELECT id FROM topics WHERE slug = $1 AND id <> $2 LIMIT 1`,
				[slug, topicId],
			);

			if (existing.rows.length > 0) {
				return new Response(JSON.stringify({ error: "Topic slug already exists" }), {
					status: 409,
					headers,
				});
			}

			const profilePayload = sanitizeTopicProfileInput(data?.profile);
			const updated = await db.queryObject<{
				topic_id: number;
				name: string;
				slug: string;
			}>(
				hasProfilePayload
					? `UPDATE topics
					   SET name = $1,
					       slug = $2,
					       profile = (COALESCE(profile, '{}'::jsonb) || $3::jsonb)
					   WHERE id = $4
					   RETURNING id AS topic_id, name, slug`
					: `UPDATE topics
					   SET name = $1, slug = $2
					   WHERE id = $3
					   RETURNING id AS topic_id, name, slug`,
				hasProfilePayload
					? [name, slug, JSON.stringify(profilePayload), topicId]
					: [name, slug, topicId],
			);

			if (!updated.rows[0]) {
				return new Response(JSON.stringify({ error: "Topic not found" }), {
					status: 404,
					headers,
				});
			}

			return new Response(JSON.stringify(updated.rows[0]), { headers });
		}

		if (pathname.match(/^\/api\/topics\/\d+\/articles$/) && req.method === "GET") {
			const topicId = Number(pathname.split("/")[3]);
			const articles = await getTopicArticles(topicId);
			return new Response(JSON.stringify(articles), { headers });
		}

		if (pathname.match(/^\/api\/topics\/\d+\/knowledge-base$/) && req.method === "GET") {
			const topicId = Number(pathname.split("/")[3]);
			const notes = await db.queryObject<{
				id: number;
				note_type: string;
				content: string;
				source_url: string | null;
				added_by_agent: string;
				updated_at: Date;
			}>(
				`SELECT
					n.id,
					n.note_type,
					LEFT(n.content, 420) AS content,
					n.source_url,
					n.added_by_agent,
					n.updated_at
				 FROM topic_notes n
				 WHERE n.topic_id = $1
				   AND n.is_active = true
				 ORDER BY n.updated_at DESC
				 LIMIT 50`,
				[topicId],
			);

			return new Response(JSON.stringify(notes.rows), { headers });
		}

		if (pathname.match(/^\/api\/topic-notes\/\d+\/ignore$/) && req.method === "POST") {
			const noteId = Number(pathname.split("/")[3]);
			const updated = await setTopicNoteActiveState(noteId, false);

			if (!updated) {
				return new Response(JSON.stringify({ error: "Knowledge base note not found" }), {
					status: 404,
					headers,
				});
			}

			return new Response(JSON.stringify({ success: true, noteId }), { headers });
		}

		if (pathname === "/api/articles" && req.method === "GET") {
			const articles = await getLatestArticles();
			return new Response(JSON.stringify(articles), { headers });
		}

		if (pathname.match(/^\/api\/articles\/\d+$/) && req.method === "GET") {
			const articleId = Number(pathname.split("/")[3]);
			const articles = await getLatestArticles();
			const article = articles.find((a) => a.id === articleId);
			if (!article) {
				return new Response(JSON.stringify({ error: "Article not found" }), {
					status: 404,
					headers,
				});
			}
			return new Response(JSON.stringify(article), { headers });
		}

		if (pathname.match(/^\/api\/articles\/\d+$/) && req.method === "PUT") {
			const articleId = Number(pathname.split("/")[3]);
			const data = await req.json();
			const title = (data?.title ?? "").trim();
			const body = data?.body ?? "";
			const slug = (data?.slug ?? "").trim();

			if (!title) {
				return new Response(JSON.stringify({ error: "Article title is required" }), {
					status: 400,
					headers,
				});
			}

			// Update article in database
			const result = await db.queryObject<{ id: number }>(
				`UPDATE articles 
				 SET title = $1, body = $2, slug = $3
				 WHERE id = $4
				 RETURNING id`,
				[title, body, slug, articleId]
			);

			if (!result.rows[0]) {
				return new Response(JSON.stringify({ error: "Article not found" }), {
					status: 404,
					headers,
				});
			}

			return new Response(JSON.stringify({ success: true, id: result.rows[0].id }), {
				headers,
			});
		}

		// Task endpoints
		if (pathname === "/api/tasks/run" && req.method === "POST") {
			// Start the news radar pipeline
			logger.info("Task: Starting pipeline");
			taskStatus.run = { status: "running", startTime: Date.now(), message: "Pipeline is running..." };
			const command = new Deno.Command("bash", {
				args: ["-c", "cd /usr/src/app && deno task run"],
				stdout: "piped",
				stderr: "piped",
			});

			const child = command.spawn();

			// Log output in background without blocking
			(async () => {
				try {
					const output = await child.output();
					const out = new TextDecoder().decode(output.stdout);
					const err = new TextDecoder().decode(output.stderr);
					if (output.success) {
						logger.info("Task: Pipeline completed successfully");
						taskStatus.run = { status: "completed", startTime: Date.now(), message: "Pipeline completed" };
					} else {
						logger.error({ stdout: out, stderr: err }, "Task: Pipeline failed");
						taskStatus.run = { status: "failed", startTime: Date.now(), message: "Pipeline failed", error: err };
					}
				} catch (e) {
					logger.error(e, "Task: Pipeline error");
					taskStatus.run = { status: "error", startTime: Date.now(), message: "Pipeline error", error: String(e) };
				}
			})();

			return new Response(JSON.stringify({ status: "started", message: "Pipeline started in background" }), {
				headers,
			});
		}

		if (pathname === "/api/tasks/compile" && req.method === "POST") {
			// Compile the website
			logger.info("Task: Starting compile");
			taskStatus.compile = { status: "running", startTime: Date.now(), message: "Compiling website..." };
			const command = new Deno.Command("bash", {
				args: ["-c", "cd /usr/src/app && deno task build"],
				stdout: "piped",
				stderr: "piped",
			});

			try {
				const output = await command.output();
				const out = new TextDecoder().decode(output.stdout);
				const err = new TextDecoder().decode(output.stderr);

				if (output.success) {
					logger.info("Task: Compile completed successfully");
					taskStatus.compile = { status: "completed", startTime: Date.now(), message: "Website compiled successfully", output: out };
					return new Response(
						JSON.stringify({
							status: "completed",
							message: "Website compiled successfully",
							output: out,
						}),
						{ headers }
					);
				} else {
					logger.error({ stdout: out, stderr: err }, "Task: Compile failed");
					taskStatus.compile = { status: "failed", startTime: Date.now(), message: "Failed to compile website", error: err };
					return new Response(
						JSON.stringify({
							status: "failed",
							message: "Failed to compile website",
							error: err,
						}),
						{ status: 500, headers }
					);
				}
			} catch (error) {
				logger.error(error, "Task: Compile error");
				const message = getErrorMessage(error);
				taskStatus.compile = { status: "error", startTime: Date.now(), message: "Error running compile", error: message };
				return new Response(
					JSON.stringify({
						status: "failed",
						message: "Error running compile",
						error: message,
					}),
					{ status: 500, headers }
				);
			}
		}

		if (pathname === "/api/tasks/scout" && req.method === "POST") {
			// Run source scout
			logger.info("Task: Starting scout");
			taskStatus.scout = { status: "running", startTime: Date.now(), message: "Scout is running..." };
			const command = new Deno.Command("bash", {
				args: ["-c", "cd /usr/src/app && deno task scout"],
				stdout: "piped",
				stderr: "piped",
			});

			const child = command.spawn();

			// Log output in background without blocking
			(async () => {
				try {
					const output = await child.output();
					const out = new TextDecoder().decode(output.stdout);
					const err = new TextDecoder().decode(output.stderr);
					if (output.success) {
						logger.info("Task: Scout completed successfully");
						taskStatus.scout = { status: "completed", startTime: Date.now(), message: "Scout completed" };
					} else {
						logger.error({ stdout: out, stderr: err }, "Task: Scout failed");
						taskStatus.scout = { status: "failed", startTime: Date.now(), message: "Scout failed", error: err };
					}
				} catch (e) {
					logger.error(e, "Task: Scout error");
					taskStatus.scout = { status: "error", startTime: Date.now(), message: "Scout error", error: String(e) };
				}
			})();

			return new Response(JSON.stringify({ status: "started", message: "Scout started in background" }), {
				headers,
			});
		}

		// Status endpoint
		if (pathname === "/api/status" && req.method === "GET") {
			return new Response(JSON.stringify({
				status: "running",
				message: "Backoffice API is running",
				time: new Date().toISOString(),
				database: "connected",
				port: config.API_PORT
			}), { headers });
		}

		// Serve backoffice UI and route-based deep links
		const isBackofficeRoute =
			pathname === "/" ||
			pathname === "/backoffice" ||
			/^\/(topics|articles)(\/(new|\d+))?\/?$/.test(pathname);

		if (isBackofficeRoute) {
			const ui = await Deno.readTextFile(
				new URL("./site/backoffice.html", import.meta.url).pathname
			);
			return new Response(ui, {
				headers: { ...cors(), "Content-Type": "text/html" },
			});
		}

		if (pathname === "/app.js") {
			const js = await Deno.readTextFile(
				new URL("./site/backoffice.js", import.meta.url).pathname
			);
			return new Response(js, {
				headers: { ...cors(), "Content-Type": "application/javascript" },
			});
		}

		if (pathname === "/styles.css") {
			const css = await Deno.readTextFile(
				new URL("./site/backoffice.css", import.meta.url).pathname
			);
			return new Response(css, {
				headers: { ...cors(), "Content-Type": "text/css" },
			});
		}

		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers,
		});
	} catch (error) {
		logger.error(error, "API error");
		return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
			status: 500,
			headers,
		});
	}
}

const port = Number(config.API_PORT || "8000");
logger.info(`Backoffice API starting on port ${port}`);
serve(handleRequest, { port });
