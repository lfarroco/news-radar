import { Client } from "../deps.ts";
import {
    Article,
    ArticleTask,
    Candidate,
    GeneratedArticle,
    TopicNote,
} from "../models.ts";
import type { ArticleTaskStatus, CandidateStatus } from "../statuses.ts";
import { TopicProfile } from "../topics/types.ts";
import { compactText, stripLeadingTopicLabel } from "../utils.ts";
import { logger } from "../logger.ts";

const TOPIC_NOTE_TYPE_MAX_LENGTH = 48;
const TOPIC_NOTE_CONTENT_MAX_LENGTH = 280;

export type TopicNoteWriteResult = {
    id: number;
    action: "inserted" | "updated";
};

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

		CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_notes_unique_source
			ON topic_notes(topic_id, note_type, source_url)
			WHERE source_url IS NOT NULL;
	`);

    // Additive migrations: safe to re-run on existing databases
    await client.queryArray(`
		ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
		ALTER TABLE topics ADD COLUMN IF NOT EXISTS last_scouted_at TIMESTAMPTZ;

        CREATE TABLE IF NOT EXISTS runs (
            id SERIAL PRIMARY KEY,
            task_key TEXT NOT NULL,
            status TEXT NOT NULL,
            triggered_by TEXT NOT NULL DEFAULT 'backoffice',
            command TEXT NOT NULL,
            args JSONB NOT NULL DEFAULT '[]'::jsonb,
            started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            finished_at TIMESTAMPTZ,
            exit_code INTEGER,
            logs TEXT NOT NULL DEFAULT '',
            error TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_runs_started_at
            ON runs(started_at DESC);

		CREATE TABLE IF NOT EXISTS source_selectors (
			id SERIAL PRIMARY KEY,
			source_url TEXT NOT NULL UNIQUE,
			topic_slug TEXT NOT NULL,
			source_type TEXT NOT NULL DEFAULT 'unknown',
			feed_url TEXT,
			index_item_selector TEXT,
			index_title_selector TEXT,
			index_link_selector TEXT,
			index_date_selector TEXT,
			detail_title_selector TEXT,
			detail_content_selector TEXT,
			detail_date_selector TEXT,
			needs_reindex BOOLEAN NOT NULL DEFAULT false,
			last_indexed_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		);

		CREATE INDEX IF NOT EXISTS idx_source_selectors_topic_slug
			ON source_selectors(topic_slug);
	`);

    await client.queryArray(`
		UPDATE topics
		SET profile = (profile - 'tavilySearchTerms') || jsonb_build_object('researchQueries', COALESCE(profile->'tavilySearchTerms', '[]'::jsonb))
		WHERE profile ? 'tavilySearchTerms'
			AND NOT (profile ? 'researchQueries');
	`);
};

export const connect = async (hostname: string, port: number) => {
    logger.info({ hostname, port }, "db: connecting");
    client = new Client({
        user: "root",
        hostname,
        password: "root",
        database: "root",
        port,
    });
    await client.connect();
    await ensureSchema();
    logger.info("db: connected and schema ensured");
};

// ── article reads ──────────────────────────────────────────────────────────

export const getLatestArticles = async (): Promise<Article[]> => {
    const { rows } = await client.queryObject<Article & { date: Date; topic_name: string }>(`
		SELECT
			a.id,
			a.title AS article_title,
			a.body AS article_content,
			a.slug,
			a.url,
			a.published_at AS date,
			a.is_published,
			tp.name AS topic_name,
			c.title,
			c.url AS link,
			c.source,
			'published'::text AS status,
			''::text AS topics,
			''::text AS original,
			''::text AS article
		FROM articles a
		INNER JOIN topics tp ON tp.id = a.topic_id
		INNER JOIN article_tasks t ON t.id = a.task_id
		INNER JOIN candidates c ON c.id = t.candidate_id
        WHERE a.is_published = true
		ORDER BY a.published_at DESC
		LIMIT 200`);

    return rows.map((r) => ({
        ...r,
        article_title: stripLeadingTopicLabel(r.article_title, r.topic_name),
        formattedDate: r.date.toISOString().split("T")[0].replace(/-/g, "/"),
        title: stripLeadingTopicLabel(r.article_title, r.topic_name),
    }));
};

export const getLatestArticlesByTopic = async (
    topic: string,
): Promise<Article[]> => {
    const { rows } = await client.queryObject<Article & { date: Date; topic_name: string }>(`
		SELECT
			a.title AS article_title,
			a.body AS article_content,
			a.published_at AS date,
			a.slug,
			a.url,
			topics.name AS topic_name,
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
            AND a.is_published = true
		ORDER BY a.published_at DESC
		LIMIT 5`, [topic]);

    return rows.map((row) => ({
        ...row,
        article_title: stripLeadingTopicLabel(row.article_title, row.topic_name),
        formattedDate: row.date.toISOString().split("T")[0].replace(/-/g, "/"),
        title: stripLeadingTopicLabel(row.article_title, row.topic_name),
        article: row.article_content,
    }));
};

export const getTopicsList = async () => {
    const { rows } = await client.queryObject<{
        topic_id: number;
        name: string;
        article_count: number;
        slug: string;
        icon: string;
    }>(`
		SELECT
			topics.id as topic_id,
			topics.slug,
			topics.name,
            COALESCE(topics.profile->>'icon', '📰') AS icon,
			count(a.id)::int as article_count
		FROM topics
        LEFT JOIN articles a ON a.topic_id = topics.id AND a.is_published = true
        GROUP BY topics.id, topics.name, topics.slug, topics.profile
        HAVING count(a.id) > 0
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
        topic_name: string;
    }>(`
    SELECT
      a.id::text as id,
      a.url,
      a.slug,
      a.title as article_title,
      a.body as article_content,
      a.published_at as date,
      t.name as topic_name
    FROM articles a
    INNER JOIN topics t ON t.id = a.topic_id
        WHERE a.topic_id = $1
            AND a.is_published = true
    ORDER BY a.published_at DESC`, [topicId]);
    return rows.map((row) => ({
        ...row,
        article_title: stripLeadingTopicLabel(row.article_title, row.topic_name),
    }));
};

export const getRecentPublishedArticleTitles = async (
    limit = 12,
    topicSlug?: string,
): Promise<string[]> => {
    const { rows } = await client.queryObject<{
        article_title: string;
        topic_name: string;
    }>(`
    SELECT
      a.title AS article_title,
      t.name AS topic_name
    FROM articles a
    INNER JOIN topics t ON t.id = a.topic_id
    WHERE a.is_published = true
      AND ($1::text IS NULL OR t.slug = $1)
    ORDER BY a.published_at DESC
    LIMIT $2`, [topicSlug ?? null, limit]);

    const seen = new Set<string>();
    const titles: string[] = [];

    for (const row of rows) {
        const normalized = stripLeadingTopicLabel(row.article_title, row.topic_name).trim();
        if (!normalized) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        titles.push(normalized);
    }

    return titles;
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

export const SET_CANDIDATE_STATUS_SQL = `UPDATE candidates
	 SET
		 status = $1,
		 relevance_score = COALESCE($3, relevance_score),
		 research_notes = COALESCE($4, research_notes),
		 updated_at = now()
	 WHERE id = $2;`;

export const setCandidateStatus = (
    id: number,
    status: CandidateStatus,
    relevanceScore?: number,
    researchNotes?: string,
) =>
    client.queryArray(
        SET_CANDIDATE_STATUS_SQL,
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

export const CLAIM_NEXT_PENDING_TASK_SQL = `
	WITH next_task AS (
		SELECT id
		FROM article_tasks
		WHERE status = 'pending'
		ORDER BY priority DESC, created_at ASC
		FOR UPDATE SKIP LOCKED
		LIMIT 1
	), claimed AS (
		UPDATE article_tasks at
		SET status = 'in_progress', picked_at = now(), updated_at = now()
		FROM next_task nt
		WHERE at.id = nt.id
		RETURNING at.id
	)
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
	FROM claimed cl
	INNER JOIN article_tasks at ON at.id = cl.id
	INNER JOIN candidates c ON c.id = at.candidate_id
	INNER JOIN topics t ON t.id = c.topic_id;
`;

export const claimNextPendingArticleTask = async (): Promise<ArticleTask | null> => {
    const { rows } = await client.queryObject<ArticleTask>(CLAIM_NEXT_PENDING_TASK_SQL);

    return rows[0] ?? null;
};

export const COMPLETE_ARTICLE_TASK_SQL = `UPDATE article_tasks
   SET status = $2, updated_at = now()
   WHERE id = $1;`;

export const completeArticleTask = (
    taskId: number,
    status: Extract<ArticleTaskStatus, "completed" | "failed">,
) =>
    client.queryArray(
        COMPLETE_ARTICLE_TASK_SQL,
        [taskId, status],
    );

export const RETRY_FAILED_WRITER_TASKS_SQL = `
    WITH reset_tasks AS (
        UPDATE article_tasks at
        SET status = 'pending', picked_at = NULL, updated_at = now()
        FROM candidates c
        WHERE at.candidate_id = c.id
            AND at.status = 'failed'
            AND c.status = 'writer-error'
        RETURNING at.candidate_id
    ), reset_candidates AS (
        UPDATE candidates c
        SET status = 'researched', updated_at = now()
        WHERE c.id IN (SELECT candidate_id FROM reset_tasks)
        RETURNING c.id
    )
    SELECT
        (SELECT COUNT(*)::int FROM reset_tasks) AS tasks_reset,
        (SELECT COUNT(*)::int FROM reset_candidates) AS candidates_reset;
`;

export const retryFailedWriterTasks = async (): Promise<{
    tasks_reset: number;
    candidates_reset: number;
}> => {
    const { rows } = await client.queryObject<{ tasks_reset: number; candidates_reset: number }>(
        RETRY_FAILED_WRITER_TASKS_SQL,
    );

    return rows[0] ?? { tasks_reset: 0, candidates_reset: 0 };
};

export const getWriterQueueHealth = async (): Promise<{
    pendingTasks: number;
    failedLast24h: number;
    completedLast24h: number;
}> => {
    const { rows } = await client.queryObject<{
        pending_tasks: number;
        failed_last_24h: number;
        completed_last_24h: number;
    }>(`
		SELECT
			(SELECT COUNT(*)::int FROM article_tasks WHERE status = 'pending') AS pending_tasks,
			(SELECT COUNT(*)::int FROM article_tasks WHERE status = 'failed' AND updated_at >= now() - interval '24 hours') AS failed_last_24h,
			(SELECT COUNT(*)::int FROM article_tasks WHERE status = 'completed' AND updated_at >= now() - interval '24 hours') AS completed_last_24h;
	`);

    const row = rows[0];
    return {
        pendingTasks: row?.pending_tasks ?? 0,
        failedLast24h: row?.failed_last_24h ?? 0,
        completedLast24h: row?.completed_last_24h ?? 0,
    };
};

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

export type ArticleReviewContext = {
    article_id: number;
    topic_slug: string;
    topic_name: string;
    candidate_title: string;
    candidate_url: string;
    candidate_snippet: string;
    editor_notes: string;
};

export const getArticleReviewContext = async (
    articleId: number,
): Promise<ArticleReviewContext | null> => {
    const { rows } = await client.queryObject<ArticleReviewContext>(
        `SELECT
       a.id AS article_id,
       t.slug AS topic_slug,
       t.name AS topic_name,
       c.title AS candidate_title,
       c.url AS candidate_url,
       c.snippet AS candidate_snippet,
       at.editor_notes
     FROM articles a
     INNER JOIN article_tasks at ON at.id = a.task_id
     INNER JOIN candidates c ON c.id = at.candidate_id
     INNER JOIN topics t ON t.id = a.topic_id
     WHERE a.id = $1
     LIMIT 1;`,
        [articleId],
    );

    return rows[0] ?? null;
};

export const updateGeneratedArticle = (
    articleId: number,
    title: string,
    body: string,
    slug: string,
    url: string,
) =>
    client.queryArray(
        `UPDATE articles
     SET title = $2,
         body = $3,
         slug = $4,
         url = $5,
         is_published = true
     WHERE id = $1;`,
        [articleId, title, body, slug, url],
    );

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

export const addTopicNote = async (
    topicSlug: string,
    noteType: string,
    content: string,
    sourceUrl: string | null,
    addedByAgent: string,
): Promise<TopicNoteWriteResult> => {
    const sanitized = sanitizeTopicNote(noteType, content);

    if (!sourceUrl) {
        const { rows } = await client.queryObject<{ id: number }>(
            `INSERT INTO topic_notes (topic_id, note_type, content, source_url, added_by_agent)
				 VALUES ((SELECT id FROM topics WHERE slug = $1), $2, $3, $4, $5)
				 RETURNING id;`,
            [topicSlug, sanitized.noteType, sanitized.content, sourceUrl, addedByAgent],
        );

        return {
            id: rows[0].id,
            action: "inserted",
        };
    }

    const { rows } = await client.queryObject<{ id: number; inserted: boolean }>(
        `INSERT INTO topic_notes (topic_id, note_type, content, source_url, added_by_agent)
			 VALUES ((SELECT id FROM topics WHERE slug = $1), $2, $3, $4, $5)
			 ON CONFLICT (topic_id, note_type, source_url) WHERE source_url IS NOT NULL
			 DO UPDATE SET
				content = EXCLUDED.content,
				added_by_agent = EXCLUDED.added_by_agent,
				is_active = true,
				updated_at = now()
			 RETURNING id, (xmax = 0) AS inserted;`,
        [topicSlug, sanitized.noteType, sanitized.content, sourceUrl, addedByAgent],
    );

    return {
        id: rows[0].id,
        action: rows[0].inserted ? "inserted" : "updated",
    };
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

export const getIgnoredTopicSourceUrls = async (topicSlug: string): Promise<string[]> => {
    const { rows } = await client.queryObject<{ source_url: string }>(
        `SELECT DISTINCT n.source_url
			FROM topic_notes n
			INNER JOIN topics t ON t.id = n.topic_id
			WHERE t.slug = $1
				AND n.source_url IS NOT NULL
				AND n.is_active = false;`,
        [topicSlug],
    );

    return rows.map((row) => row.source_url);
};

export type ScoutTopicSource = {
    topic_slug: string;
    topic_name: string;
    source_url: string;
};

export const getActiveScoutTopicSources = async (): Promise<ScoutTopicSource[]> => {
    const { rows } = await client.queryObject<ScoutTopicSource>(
        `SELECT DISTINCT
			t.slug AS topic_slug,
			t.name AS topic_name,
			n.source_url
		FROM topic_notes n
		INNER JOIN topics t ON t.id = n.topic_id
		WHERE n.is_active = true
			AND n.source_url IS NOT NULL
			AND n.added_by_agent = 'source-scout-agent';`,
    );

    return rows;
};

export const setTopicNoteActiveState = async (
    noteId: number,
    isActive: boolean,
): Promise<boolean> => {
    const { rows } = await client.queryObject<{ id: number }>(
        `UPDATE topic_notes
			SET is_active = $2,
				updated_at = now()
			WHERE id = $1
			RETURNING id;`,
        [noteId, isActive],
    );

    return Boolean(rows[0]);
};

export const deactivateTopicNotesByIds = async (
    topicSlug: string,
    noteIds: number[],
): Promise<number[]> => {
    if (noteIds.length === 0) return [];

    const { rows } = await client.queryObject<{ id: number }>(
        `UPDATE topic_notes n
			SET is_active = false,
				updated_at = now()
			FROM topics t
			WHERE n.topic_id = t.id
				AND t.slug = $1
				AND n.id = ANY($2)
				AND n.is_active = true
			RETURNING n.id;`,
        [topicSlug, noteIds],
    );

    return rows.map((row) => row.id);
};

// ── source selectors ───────────────────────────────────────────────────────

export type SourceSelector = {
    id: number;
    source_url: string;
    topic_slug: string;
    source_type: string;
    feed_url: string | null;
    index_item_selector: string | null;
    index_title_selector: string | null;
    index_link_selector: string | null;
    index_date_selector: string | null;
    detail_title_selector: string | null;
    detail_content_selector: string | null;
    detail_date_selector: string | null;
    needs_reindex: boolean;
    last_indexed_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

export type SourceSelectorCoverageStats = {
    total_rows: number;
    url_only_rows: number;
    feed_backed_rows: number;
    selector_backed_rows: number;
    unknown_type_rows: number;
};

export const TOUCH_SOURCE_SELECTOR_SQL = `INSERT INTO source_selectors (source_url, topic_slug)
	 VALUES ($1, $2)
	 ON CONFLICT (source_url) DO UPDATE SET
		topic_slug = EXCLUDED.topic_slug,
		source_type = CASE
			WHEN source_selectors.source_type = 'unknown' AND $3 <> 'unknown' THEN $3
			ELSE source_selectors.source_type
		END,
		updated_at = now();`;

export const touchSourceSelector = async (
    sourceUrl: string,
    topicSlug: string,
    sourceType = "unknown",
): Promise<void> => {
    await client.queryArray(
        TOUCH_SOURCE_SELECTOR_SQL,
        [sourceUrl, topicSlug, sourceType],
    );
};

export const SET_SOURCE_SELECTOR_FEED_URL_SQL = `UPDATE source_selectors
	 SET
		feed_url = $2,
		source_type = CASE
			WHEN source_type = 'unknown' THEN 'feed'
			ELSE source_type
		END,
		needs_reindex = false,
		last_indexed_at = now(),
		updated_at = now()
	 WHERE source_url = $1;`;

export const setSourceSelectorFeedUrl = async (
    sourceUrl: string,
    feedUrl: string,
): Promise<void> => {
    await client.queryArray(
        SET_SOURCE_SELECTOR_FEED_URL_SQL,
        [sourceUrl, feedUrl],
    );
};

export type IndexSelectors = {
    indexItemSelector: string;
    indexTitleSelector: string;
    indexLinkSelector: string;
    indexDateSelector: string | null;
};

export const SET_SOURCE_SELECTOR_INDEX_SELECTORS_SQL = `UPDATE source_selectors
	 SET
		source_type = 'html_index',
		index_item_selector = $2,
		index_title_selector = $3,
		index_link_selector = $4,
		index_date_selector = $5,
		needs_reindex = false,
		last_indexed_at = now(),
		updated_at = now()
	 WHERE source_url = $1;`;

export const setSourceSelectorIndexSelectors = async (
    sourceUrl: string,
    selectors: IndexSelectors,
): Promise<void> => {
    await client.queryArray(
        SET_SOURCE_SELECTOR_INDEX_SELECTORS_SQL,
        [
            sourceUrl,
            selectors.indexItemSelector,
            selectors.indexTitleSelector,
            selectors.indexLinkSelector,
            selectors.indexDateSelector ?? null,
        ],
    );
};

export const MARK_SOURCE_SELECTOR_INDEXED_NOW_SQL = `UPDATE source_selectors
	 SET
		last_indexed_at = now(),
		updated_at = now()
	 WHERE source_url = $1;`;

export const markSourceSelectorIndexedNow = async (
    sourceUrl: string,
): Promise<void> => {
    await client.queryArray(
        MARK_SOURCE_SELECTOR_INDEXED_NOW_SQL,
        [sourceUrl],
    );
};

export const markSourceSelectorNeedsReindex = async (
    sourceUrl: string,
): Promise<void> => {
    await client.queryArray(
        `UPDATE source_selectors
		 SET needs_reindex = true, updated_at = now()
		 WHERE source_url = $1;`,
        [sourceUrl],
    );
};

export const getSourceSelectorsByTopicSlug = async (
    topicSlug: string,
): Promise<SourceSelector[]> => {
    const { rows } = await client.queryObject<SourceSelector>(
        `SELECT * FROM source_selectors WHERE topic_slug = $1;`,
        [topicSlug],
    );
    return rows;
};

export const GET_SOURCE_SELECTORS_NEEDING_BACKFILL_SQL = `SELECT *
		FROM source_selectors
		WHERE feed_url IS NULL
			AND (
				NULLIF(BTRIM(index_item_selector), '') IS NULL
				OR NULLIF(BTRIM(index_title_selector), '') IS NULL
				OR NULLIF(BTRIM(index_link_selector), '') IS NULL
			)
			AND ($1::text IS NULL OR topic_slug = $1)
		ORDER BY updated_at ASC, id ASC
		LIMIT $2;`;

export const getSourceSelectorsNeedingBackfill = async (
    limit = 100,
    topicSlug?: string,
): Promise<SourceSelector[]> => {
    const { rows } = await client.queryObject<SourceSelector>(
        GET_SOURCE_SELECTORS_NEEDING_BACKFILL_SQL,
        [topicSlug ?? null, limit],
    );
    return rows;
};

export const getSourceSelectorCoverageStats = async (): Promise<SourceSelectorCoverageStats> => {
    const { rows } = await client.queryObject<SourceSelectorCoverageStats>(
        GET_SOURCE_SELECTOR_COVERAGE_STATS_SQL,
    );

    return rows[0] ?? {
        total_rows: 0,
        url_only_rows: 0,
        feed_backed_rows: 0,
        selector_backed_rows: 0,
        unknown_type_rows: 0,
    };
};

export const GET_SOURCE_SELECTOR_COVERAGE_STATS_SQL = `SELECT
			COUNT(*)::int AS total_rows,
			COUNT(*) FILTER (
				WHERE feed_url IS NULL
					AND index_item_selector IS NULL
					AND index_title_selector IS NULL
					AND index_link_selector IS NULL
			)::int AS url_only_rows,
			COUNT(*) FILTER (WHERE feed_url IS NOT NULL)::int AS feed_backed_rows,
			COUNT(*) FILTER (
				WHERE index_item_selector IS NOT NULL
					AND index_title_selector IS NOT NULL
					AND index_link_selector IS NOT NULL
			)::int AS selector_backed_rows,
			COUNT(*) FILTER (WHERE source_type = 'unknown')::int AS unknown_type_rows
		FROM source_selectors;`;

export const markTopicScoutedNow = async (topicSlug: string): Promise<void> => {
    await client.queryArray(
        `UPDATE topics SET last_scouted_at = now() WHERE slug = $1;`,
        [topicSlug],
    );
};

export const getTopicLastScoutedAt = async (
    topicSlug: string,
): Promise<Date | null> => {
    const { rows } = await client.queryObject<{ last_scouted_at: Date | null }>(
        `SELECT last_scouted_at FROM topics WHERE slug = $1;`,
        [topicSlug],
    );
    return rows[0]?.last_scouted_at ?? null;
};

// ── source healthcheck ─────────────────────────────────────────────────────

export const getAllSourceSelectors = async (
    limit = 200,
    topicSlug?: string,
): Promise<SourceSelector[]> => {
    const { rows } = await client.queryObject<SourceSelector>(
        `SELECT * FROM source_selectors
         WHERE ($1::text IS NULL OR topic_slug = $1)
         ORDER BY last_indexed_at ASC NULLS FIRST, updated_at ASC
         LIMIT $2;`,
        [topicSlug ?? null, limit],
    );
    return rows;
};

export const deleteSourceSelector = async (
    sourceUrl: string,
): Promise<void> => {
    await client.queryArray(
        `DELETE FROM source_selectors WHERE source_url = $1;`,
        [sourceUrl],
    );
};

export const deactivateTopicNoteBySourceUrl = async (
    sourceUrl: string,
): Promise<void> => {
    await client.queryArray(
        `UPDATE topic_notes
         SET is_active = false, updated_at = now()
         WHERE source_url = $1 AND is_active = true;`,
        [sourceUrl],
    );
};

export const clearSourceSelectorFeedUrl = async (
    sourceUrl: string,
): Promise<void> => {
    await client.queryArray(
        `UPDATE source_selectors
         SET feed_url = NULL, needs_reindex = true, updated_at = now()
         WHERE source_url = $1;`,
        [sourceUrl],
    );
};

// ── creative writer ────────────────────────────────────────────────────────

export type TopicRow = {
    id: number;
    slug: string;
    name: string;
};

export const getAllTopics = async (): Promise<TopicRow[]> => {
    const { rows } = await client.queryObject<TopicRow>(
        `SELECT id, slug, name FROM topics ORDER BY name;`,
    );
    return rows;
};

export const insertCreativeCandidate = async (
    topicSlug: string,
    title: string,
    snippet: string,
): Promise<number> => {
    const { rows } = await client.queryObject<{ id: number }>(
        `INSERT INTO candidates (topic_id, title, url, snippet, source, discovered_at, status, relevance_score)
         VALUES (
             (SELECT id FROM topics WHERE slug = $1),
             $2,
             'creative://' || $1 || '/' || md5($2),
             $3,
             'creative-writer-agent',
             now(),
             'researched',
             10
         )
         ON CONFLICT ON CONSTRAINT candidates_topic_url_key
         DO UPDATE SET snippet = EXCLUDED.snippet
         RETURNING id;`,
        [topicSlug, title, snippet],
    );
    return rows[0].id;
};

export const insertCreativeArticleTask = async (
    candidateId: number,
    editorNotes: string,
): Promise<number> => {
    const { rows } = await client.queryObject<{ id: number }>(
        `INSERT INTO article_tasks (candidate_id, editor_notes, priority, status, picked_at)
         VALUES ($1, $2, 0, 'in_progress', now())
         RETURNING id;`,
        [candidateId, editorNotes],
    );
    return rows[0].id;
};

// ── topic pipeline status ──────────────────────────────────────────────────

export const getTopicIdsWithPendingPipeline = async (): Promise<Set<number>> => {
    const { rows } = await client.queryObject<{ topic_id: number }>(
        `SELECT DISTINCT c.topic_id
         FROM article_tasks at
         INNER JOIN candidates c ON c.id = at.candidate_id
         WHERE at.status IN ('pending', 'in_progress')
         UNION
         SELECT DISTINCT a.topic_id
         FROM articles a
         WHERE a.is_published = false;`,
    );
    return new Set(rows.map((r) => r.topic_id));
};

export const markArticleUnpublished = async (articleId: number): Promise<void> => {
    await client.queryArray(
        `UPDATE articles SET is_published = false WHERE id = $1;`,
        [articleId],
    );
};

export const getArticlesPendingReview = async (): Promise<
    Array<{ id: number; task_id: number; topic_id: number; title: string; body: string; slug: string; url: string; published_at: Date; author_agent_version: string }>
> => {
    const { rows } = await client.queryObject<{
        id: number; task_id: number; topic_id: number; title: string; body: string;
        slug: string; url: string; published_at: Date; author_agent_version: string;
    }>(
        `SELECT a.id, a.task_id, a.topic_id, a.title, a.body, a.slug, a.url,
                a.published_at, a.author_agent_version
         FROM articles a
         WHERE a.is_published = false
         ORDER BY a.id;`,
    );
    return rows;
};
