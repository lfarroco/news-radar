import { client } from "../db.ts";
import { filterOfficialTopicSourceUrls } from "../editorial-policy.ts";
import { Article } from "../models.ts";
import { allTopics } from "../topics/profiles.ts";
import { stripLeadingTopicLabel } from "../utils.ts";

export const layout = "article.njk";

type ArticleReference = {
  url: string;
  label: string;
};

const URL_REGEX = /https?:\/\/[^\s)"'<>]+/g;

const extractUrls = (value: string | null | undefined): string[] => {
  if (!value) return [];
  return value.match(URL_REGEX) ?? [];
};

const toReferenceLabel = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const normalizeTopicKey = (value: string): string =>
  (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getTopicProfile = (topicSlug: string) => {
  const normalized = normalizeTopicKey(topicSlug);
  if (!normalized) return undefined;
  return allTopics.find((profile) => normalizeTopicKey(profile.slug) === normalized);
};

const buildReferences = (
  primaryUrl: string,
  editorNotes: string | null,
  topicSlug: string,
): ArticleReference[] => {
  const topicProfile = getTopicProfile(topicSlug);
  const uniqueUrls = filterOfficialTopicSourceUrls(topicProfile, [
    primaryUrl,
    ...extractUrls(editorNotes),
  ]);
  return uniqueUrls.map((url) => ({
    url,
    label: toReferenceLabel(url),
  }));
};

export default async function* () {
  const { rows } = await client.queryObject<Article & {
    url: string;
    link: string;
    topic_slug: string;
    topic_name: string;
    editor_notes: string;
  }>(`
    SELECT
      a.id,
      a.title AS article_title,
      a.body AS article_content,
      a.slug,
      a.url,
      a.published_at AS date,
      t.slug AS topic_slug,
      t.name AS topic_name,
      c.title,
      c.url AS link,
      c.source,
      at.editor_notes,
      'published'::text AS status,
      ''::text AS topics,
      ''::text AS original,
      ''::text AS article
    FROM articles a
    INNER JOIN topics t ON t.id = a.topic_id
    INNER JOIN article_tasks at ON at.id = a.task_id
    INNER JOIN candidates c ON c.id = at.candidate_id
    WHERE a.is_published = true
    ORDER BY a.published_at DESC;
  `);

  for (const row of rows) {
    const date = new Date(row.date as unknown as string).toISOString().split('T')[0].replace(/-/g, '/');
    const references = buildReferences(row.link, row.editor_notes, row.topic_slug);

    yield {
      ...row,
      url: row.url,
      title: stripLeadingTopicLabel(row.article_title, row.topic_name),
      content: row.article_content,
      date,
      formattedDate: date,
      references,
    };
  }
}