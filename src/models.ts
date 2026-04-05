
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


