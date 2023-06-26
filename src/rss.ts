import axios, { AxiosResponse } from 'axios';
import { dbClient } from './db.js';
import Parser from 'rss-parser';

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
];

const axiosReq = async (
  url: string,
): Promise<
  { ok: false; err: string } | { ok: true; response: AxiosResponse<any, any> }
> =>
  new Promise(async (resolve) => {
    try {
      const response = await axios(url);
      resolve({ ok: true, response });
    } catch (err) {
      resolve({ ok: false, err });
    }
  });

export const rss = async (url: string, topics: string[], hasContent = false): Promise<void> => {
  console.log('processing rss ', url);

  const result = await axiosReq(url);

  if (!result.ok) {
    console.log('error fetching', url);
    return;
  }

  let parser = new Parser();

  let feed = await parser.parseURL(url).catch((err) => {

    console.log('error parsing', url);
    console.log(err);

  });

  if(!feed) {
    console.log("skipping feed", url);
    return;
  }

  const ops = feed.items.map(async (item) => {
    const title = item.title;
    const link = item.link;
    const date = item.pubDate ? new Date(item.pubDate) : new Date();
    const description = item.content;

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
    console.table({ title, link, date:  date.toString() , isRecent });

    await dbClient.query(
      `INSERT INTO info 
           (title, link, source, date, status, original)
           VALUES
           ($1::text, $2::text, $3::text, $4::date, $5::text, $6::text)
           ON CONFLICT (link) DO NOTHING;
          `,

      [title, link, url, date, 'pending', hasContent ? description : ''],
    );

    const ops = topics.map(async (topic) => {

      await dbClient.query(
        `INSERT INTO topics (name) VALUES ($1::text) ON CONFLICT (name) DO NOTHING;`,
        [topic],
      );

      await dbClient.query(
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
