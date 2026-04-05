
export type Article = {
  id: number;
  title: string;
  link: string;
  status: string;
  source: string;
  topics: string // json
  original: string;
  article: string;
  date: Date;
  slug: string;
  article_title: string;
  article_content: string
  url: string;
};

export type ArticlePlan = {
  id: string;
  title: string;
  angle: string;
  sourceArticleIds: number[];
  primarySourceId: number;
  topicHints: string[];
};

export type Candidate = {
  id: number;
  topic_id: number;
  topic_name: string;
  topic_slug: string;
  title: string;
  url: string;
  snippet: string;
  source: string;
  discovered_at: Date;
  status: string;
  relevance_score: number | null;
  research_notes: string | null;
};

export type ArticleTask = {
  id: number;
  candidate_id: number;
  topic_id: number;
  topic_slug: string;
  topic_name: string;
  candidate_title: string;
  candidate_url: string;
  candidate_snippet: string;
  editor_notes: string;
  priority: number;
  status: string;
  created_at: Date;
};

export type GeneratedArticle = {
  id: number;
  task_id: number;
  topic_id: number;
  title: string;
  body: string;
  slug: string;
  url: string;
  published_at: Date;
  author_agent_version: string;
};

export type TopicNote = {
  id: number;
  topic_id: number;
  note_type: string;
  content: string;
  source_url: string | null;
  added_by_agent: string;
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
};


