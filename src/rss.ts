import { client } from './db.ts';
import { parseFeed } from './deps.ts';
import { slugify } from './utils.ts';

const restrictedDomains = [
  'youtube.com',
  'youtu.be',
  'instagram.com',
  'facebook.com',
  'tiktok.com',
  'tiktok',
  'v.redd.it',
  'vimeo.com',
  'gfycat.com',
  'streamable.com',
  'news.ycombinator',
  'reddit.com',
  'redditmedia.com',
  'reddituploads.com',
  'redd.it',
  'i.redd.it',
];

export const rss = async (url: string, topics: string[], hasContent = false): Promise<void> => {
  console.log('processing rss ', url);

  const response = await fetch(url);
  const xml = await response.text();

  const feed = await parseFeed(xml);

  const ops = feed.entries.map(async (item: any) => {

    const title: string = (topics.toString()) + " - " + item.title.value;
    const link: string = item.links[0].href;
    const date: Date = item.published ? item.published : item.updated ? item.updated : new Date();
    const description: string | null = item.content?.value;


    if (!title || !link) {
      throw new Error("missing info: ", item)
    }

    const age = Date.now() - date.getTime();

    // max age is 3 days
    const isRecent = age < 1000 * 60 * 60 * 24 * 1;

    const isRestricted = restrictedDomains.some((domain) =>
      link.includes(domain),
    );

    if (isRestricted || !isRecent) {
      return;
    }

    console.log('Inserting: ');
    console.table({ title, link, date: date.toString() });

    await client.queryArray(
      `INSERT INTO info 
           (title, link, source, date, status, original)
           VALUES
           ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (link) DO NOTHING;
          `,

      [
        title,
        link,
        url,  // source
        date,
        'pending',  // status
        hasContent ? description : '' // original
      ],
    );

    const ops = topics.map(async (topic) => {

      await client.queryArray(
        `INSERT INTO topics (name, slug) VALUES ($1::text, $2::text) ON CONFLICT (slug) DO NOTHING;`,
        [topic, slugify(topic)],
      );

      await client.queryArray(
        `INSERT INTO article_topic (article_id, topic_id) VALUES ((
          SELECT id FROM info WHERE link = $1::text
        ), (
          SELECT id FROM topics WHERE name = $2::text
        ))
        ON CONFLICT (article_id, topic_id) DO NOTHING;`,
        [link, topic],
      );
    });

    await Promise.all(ops);
  });

  await Promise.all(ops);

  console.log('done processing', url);
};
