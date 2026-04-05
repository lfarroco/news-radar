import { Client } from "../deps.ts";
import {
	Article,
	ArticleTask,
	Candidate,
	GeneratedArticle,
	TopicNote,
} from "../models.ts";
import { TopicProfile } from "../topics/types.ts";
import { compactText } from "../utils.ts";

const TOPIC_NOTE_TYPE_MAX_LENGTH = 48;
const TOPIC_NOTE_CONTENT_MAX_LENGTH = 420;

const sanitizeTopicNote = (noteType: string, content: string) => ({
	noteType: compactText((noteType ?? "note").trim(), TOPIC_NOTE_TYPE_MAX_LENGTH) || "note",
	content:
		compactText((content ?? "").trim(), TOPIC_NOTE_CONTENT_MAX_LENGTH) ||
		"No details provided.",
});

// ── connection ─────────────────────────────────────────────────────────────

export let client: Client;

const ensureSchema = async () => {
	await client.queryArray(`
		CREATE TABLE IF NOT EXISTS topics (
			id SERIAL PRIMARY KEY,
			name VARCHAR(128),
			slug TEXT UNIQUE,
			profile JSONB,
			last_crawl_time TIMESTAMPTZ,
			config JSONB DEFAULT '{}'::jsonb
		);

		CREATE TABLE IF NOT EXISTS candidates (
			id SERIAL PRIMARY KEY,
			topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
			title TEXT NOT NULL,
			url TEXT NOT NULL,
			snippet TEXT DEFAULT '',
			source TEXT NOT NULL,
			discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			status TEXT NOT NULL DEFAULT 'pending',
			relevance_score NUMERIC,
			research_notes TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			CONSTRAINT candidates_topic_url_key UNIQUE (topic_id, url)
		);

		CREATE INDEX IF NOT EXISTS idx_candidates_status_discovered_at
			ON candidates(status, discovered_at DESC);

		CREATE TABLE IF NOT EXISTS article_tasks (
			id SERIAL PRIMARY KEY,
			candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
			editor_notes TEXT NOT NULL,
			priority INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'pending',
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			picked_at TIMESTAMPTZ
		);

		CREATE INDEX IF NOT EXISTS idx_article_tasks_status_priority
			ON article_tasks(status, priority DESC, created_at ASC);

		CREATE TABLE IF NOT EXISTS articles (
			id SERIAL PRIMARY KEY,
			task_id INTEGER NOT NULL UNIQUE REFERENCES article_tasks(id) ON DELETE CASCADE,
			topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
			title TEXT NOT NULL,
			body TEXT NOT NULL,
			slug TEXT NOT NULL,
			url TEXT NOT NULL,
			published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			author_agent_version TEXT NOT NULL
		);

		CREATE INDEX IF NOT EXISTS idx_articles_published_at
			ON articles(published_at DESC);

		CREATE INDEX IF NOT EXISTS idx_articles_topic_published
			ON articles(topic_id, published_at DESC);

		CREATE TABLE IF NOT EXISTS topic_notes (
			id SERIAL PRIMARY KEY,
			topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
			note_type TEXT NOT NULL,
			content TEXT NOT NULL,
			source_url TEXT,
			added_by_agent TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			is_active BOOLEAN NOT NULL DEFAULT true
		);

		CREATE INDEX IF NOT EXISTS idx_topic_notes_topic_active
			ON topic_notes(topic_id, is_active, updated_at DESC);
	`);
};

export const connect = async (hostname: string, port: number) => {
	console.log(`Connecting to ${hostname}:${port}`);
	client = new Client({
		user: "root",
		hostname,
		password: "root",
		database: "root",
		port,
	});
	await client.connect();
	await ensureSchema();
};

// ── article reads ──────────────────────────────────────────────────────────

export const getLatestArticles = async (): Promise<Article[]> => {
	const { rows } = await client.queryObject<Article & { date: Date }>(`
		SELECT
			a.id,
			a.title AS article_title,
			a.body AS article_content,
			a.slug,
			a.url,
			a.published_at AS date,
			c.title,
			c.url AS link,
			c.source,
			'published'::text AS status,
			''::text AS topics,
			''::text AS original,
			''::text AS article
		FROM articles a
		INNER JOIN article_tasks t ON t.id = a.task_id
		INNER JOIN candidates c ON c.id = t.candidate_id
		ORDER BY a.published_at DESC
		LIMIT 20`);

	return rows.map((r) => ({
		...r,
		formattedDate: r.date.toISOString().split("T")[0].replace(/-/g, "/"),
		title: r.article_title,
	}));
};

export const getLatestArticlesByTopic = async (
	topic: string,
): Promise<Article[]> => {
	const { rows } = await client.queryObject<Article & { date: Date }>(`
		SELECT
			a.title AS article_title,
			a.body AS article_content,
			a.published_at AS date,
			a.slug,
			a.url,
			c.title,
			c.url AS link,
			c.source,
			'published'::text AS status,
			''::text AS topics,
			''::text AS original,
			''::text AS article
		FROM articles a
		INNER JOIN topics ON topics.id = a.topic_id
		INNER JOIN article_tasks t ON t.id = a.task_id
		INNER JOIN candidates c ON c.id = t.candidate_id
		WHERE topics.slug = $1
		ORDER BY a.published_at DESC
		LIMIT 5`, [topic]);

	return rows.map((row) => ({
		...row,
		formattedDate: row.date.toISOString().split("T")[0].replace(/-/g, "/"),
		title: row.article_title,
		article: row.article_content,
	}));
};

export const getTopicsList = async () => {
	const { rows } = await client.queryObject<{
		topic_id: number;
		name: string;
		article_count: number;
		slug: string;
	}>(`
		SELECT
			topics.id as topic_id,
			topics.slug,
			topics.name,
			count(a.id)::int as article_count
		FROM topics
		LEFT JOIN articles a ON a.topic_id = topics.id
		GROUP BY topics.id, topics.name, topics.slug
    ORDER BY article_count DESC`);
	return rows;
};

export const getTopicArticles = async (topicId: number) => {
	const { rows } = await client.queryObject<{
		id: string;
		url: string;
		article_title: string;
		article_content: string;
		slug: string;
		date: Date;
	}>(`
    SELECT
      a.id::text as id,
      a.url,
      a.slug,
      a.title as article_title,
      a.body as article_content,
      a.published_at as date
    FROM articles a
    WHERE a.topic_id = $1
    ORDER BY a.published_at DESC`, [topicId]);
	return rows;
};

// ── pipeline reads ─────────────────────────────────────────────────────────

export const getPendingCandidates = async (limit = 40): Promise<Candidate[]> => {
	const { rows } = await client.queryObject<Candidate>(`
    SELECT
      c.id,
      c.topic_id,
      t.name AS topic_name,
      t.slug AS topic_slug,
      c.title,
      c.url,
      c.snippet,
      c.source,
      c.discovered_at,
      c.status,
      c.relevance_score,
      c.research_notes
    FROM candidates c
    INNER JOIN topics t ON t.id = c.topic_id
    WHERE c.status = 'pending'
    ORDER BY c.discovered_at DESC
    LIMIT $1`, [limit]);
	return rows;
};

// ── article writes ─────────────────────────────────────────────────────────

export const insertCandidate = async (
	title: string,
	url: string,
	snippet: string,
	source: string,
	discoveredAt: Date,
	topicSlug: string,
	topicName?: string,
) => {
	if (topicName) {
		await upsertTopic(topicName, topicSlug);
	}

	await client.queryArray(
		`INSERT INTO candidates (topic_id, title, url, snippet, source, discovered_at, status)
     VALUES ((SELECT id FROM topics WHERE slug = $1), $2, $3, $4, $5, $6, 'pending')
     ON CONFLICT (topic_id, url)
     DO UPDATE SET
       snippet = EXCLUDED.snippet,
       discovered_at = GREATEST(candidates.discovered_at, EXCLUDED.discovered_at),
       updated_at = now();`,
		[topicSlug, title, url, snippet, source, discoveredAt],
	);
};

export const setCandidateStatus = (
	id: number,
	status: string,
	relevanceScore?: number,
	researchNotes?: string,
) =>
	client.queryArray(
		`UPDATE candidates
     SET
       status = $1,
       relevance_score = COALESCE($3, relevance_score),
       research_notes = COALESCE($4, research_notes),
       updated_at = now()
     WHERE id = $2;`,
		[status, id, relevanceScore ?? null, researchNotes ?? null],
	);

export const hasOpenTaskForCandidate = async (candidateId: number): Promise<boolean> => {
	const { rows } = await client.queryObject<{ exists: boolean }>(
		`SELECT EXISTS(
       SELECT 1 FROM article_tasks
       WHERE candidate_id = $1
         AND status IN ('pending', 'in_progress')
     ) AS exists;`,
		[candidateId],
	);
	return rows[0]?.exists ?? false;
};

export const createArticleTask = (
	candidateId: number,
	editorNotes: string,
	priority: number,
) =>
	client.queryArray(
		`INSERT INTO article_tasks (candidate_id, editor_notes, priority, status)
     VALUES ($1, $2, $3, 'pending');`,
		[candidateId, editorNotes, priority],
	);

export const claimNextPendingArticleTask = async (): Promise<ArticleTask | null> => {
	const { rows: [nextTask] } = await client.queryObject<{
		id: number;
		candidate_id: number;
	}>(`
    SELECT id, candidate_id
    FROM article_tasks
    WHERE status = 'pending'
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `);

	if (!nextTask) return null;

	await client.queryArray(
		`UPDATE article_tasks
     SET status = 'in_progress', picked_at = now(), updated_at = now()
     WHERE id = $1;`,
		[nextTask.id],
	);

	const { rows } = await client.queryObject<ArticleTask>(`
    SELECT
      at.id,
      at.candidate_id,
      c.topic_id,
      t.slug AS topic_slug,
      t.name AS topic_name,
      c.title AS candidate_title,
      c.url AS candidate_url,
      c.snippet AS candidate_snippet,
      at.editor_notes,
      at.priority,
      at.status,
      at.created_at
    FROM article_tasks at
    INNER JOIN candidates c ON c.id = at.candidate_id
    INNER JOIN topics t ON t.id = c.topic_id
    WHERE at.id = $1;
  `,
		[nextTask.id],
	);

	return rows[0] ?? null;
};

export const completeArticleTask = (
	taskId: number,
	status: "completed" | "failed",
) =>
	client.queryArray(
		`UPDATE article_tasks
     SET status = $2, updated_at = now()
     WHERE id = $1;`,
		[taskId, status],
	);

export const insertGeneratedArticle = async (
	taskId: number,
	topicId: number,
	title: string,
	body: string,
	slug: string,
	url: string,
	authorAgentVersion: string,
): Promise<GeneratedArticle | null> => {
	const { rows } = await client.queryObject<GeneratedArticle>(
		`INSERT INTO articles (task_id, topic_id, title, body, slug, url, author_agent_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (task_id) DO NOTHING
     RETURNING *;`,
		[taskId, topicId, title, body, slug, url, authorAgentVersion],
	);

	return rows[0] ?? null;
};

export const markTopicCrawledNow = (topicSlug: string) =>
	client.queryArray(
		`UPDATE topics SET last_crawl_time = now() WHERE slug = $1;`,
		[topicSlug],
	);

// ── topic writes ───────────────────────────────────────────────────────────

export const upsertTopic = (name: string, slug: string) =>
	client.queryArray(
		`INSERT INTO topics (name, slug) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;`,
		[name, slug],
	);

// ── topic knowledge base ───────────────────────────────────────────────────

export const upsertTopicProfile = (slug: string, profile: TopicProfile) =>
	client.queryArray(
		`UPDATE topics SET profile = $2 WHERE slug = $1;`,
		[slug, JSON.stringify(profile)],
	);

export const getTopicProfile = async (
	slug: string,
): Promise<TopicProfile | null> => {
	const { rows } = await client.queryObject<{ profile: TopicProfile }>(
		`SELECT profile FROM topics WHERE slug = $1;`,
		[slug],
	);
	return rows[0]?.profile ?? null;
};

export const getAllTopicProfiles = async (): Promise<TopicProfile[]> => {
	const { rows } = await client.queryObject<{ profile: TopicProfile | null }>(
		`SELECT profile FROM topics WHERE profile IS NOT NULL;`,
	);

	return rows
		.map((row) => row.profile)
		.filter((profile): profile is TopicProfile => profile !== null);
};

// ── topic notes (knowledge base) ───────────────────────────────────────────

export const addTopicNote = (
	topicSlug: string,
	noteType: string,
	content: string,
	sourceUrl: string | null,
	addedByAgent: string,
) => {
	const sanitized = sanitizeTopicNote(noteType, content);

	return client.queryArray(
		`INSERT INTO topic_notes (topic_id, note_type, content, source_url, added_by_agent)
		 VALUES ((SELECT id FROM topics WHERE slug = $1), $2, $3, $4, $5);`,
		[topicSlug, sanitized.noteType, sanitized.content, sourceUrl, addedByAgent],
	);
};

export const searchTopicNotes = async (
	topicSlug: string,
	query: string,
	limit = 6,
): Promise<TopicNote[]> => {
	const { rows } = await client.queryObject<TopicNote>(
		`SELECT
				n.id,
				n.topic_id,
				n.note_type,
				LEFT(n.content, ${TOPIC_NOTE_CONTENT_MAX_LENGTH}) AS content,
				n.source_url,
				n.added_by_agent,
				n.created_at,
				n.updated_at,
				n.is_active
			FROM topic_notes n
			INNER JOIN topics t ON t.id = n.topic_id
			WHERE t.slug = $1
				AND n.is_active = true
				AND (
					n.content ILIKE $2
					OR n.note_type ILIKE $2
				)
			ORDER BY n.updated_at DESC
			LIMIT $3;`,
		[topicSlug, `%${query}%`, limit],
	);

	if (rows.length >= limit) return rows;

	const fallback = await client.queryObject<TopicNote>(
		`SELECT
				n.id,
				n.topic_id,
				n.note_type,
				LEFT(n.content, ${TOPIC_NOTE_CONTENT_MAX_LENGTH}) AS content,
				n.source_url,
				n.added_by_agent,
				n.created_at,
				n.updated_at,
				n.is_active
			FROM topic_notes n
			INNER JOIN topics t ON t.id = n.topic_id
			WHERE t.slug = $1
				AND n.is_active = true
			ORDER BY n.updated_at DESC
			LIMIT $2;`,
		[topicSlug, limit],
	);

	return fallback.rows;
};
