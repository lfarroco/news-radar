import axios, { AxiosResponse } from 'axios';
import cheerio from 'cheerio';
import { dbClient } from './db.js';

const restrictedDomains = [
  'youtube.com',
  'youtu.be',
  'twitter.com',
  'instagram.com',
  'facebook.com',
  'tiktok.com',
  'tiktok',
  'v.redd.it',
  'vimeo.com',
  'gfycat.com',
  'streamable.com',
  'reddit.com',
  'redd.it',
  '/r/',
];

const axiosReq = async (
  url: string,
): Promise<
  { ok: false; err: string } | { ok: true; response: AxiosResponse<any, any> }
> =>
  new Promise((resolve) => {
    return axios(url)
      .then((response) => {
        resolve({ ok: true, response });
      })
      .catch((err) => {
        resolve({ ok: false, err });
      });
  });

export const reddit = async (channel: string, topic: string) => {
  console.log('processing channel', channel);
  const url = `https://old.reddit.com/r/${channel}/top/?sort=top&t=week`;

  const result = await axiosReq(url);

  if (!result.ok) {
    console.log('error fetching', url);
    return;
  }

  const rss = result.response.data;
  const $ = cheerio.load(rss);

  const entries = $('.thing:not(.promoted)').toArray();

  const ops = entries.map(async (entry) => {
    const title = $(entry).find('a.title.outbound').text();
    const link = $(entry).find('.title a').attr('href');
    const published = $(entry).find('.tagline time').attr('datetime');
    const date = new Date(published);

    const isRestricted = restrictedDomains.some((domain) =>
      link.includes(domain),
    );

    if (isRestricted || !title) {
      return;
    }

    const age = (Date.now() - date.getTime()) / 1000 / 60 / 60 / 24;

    const maxAge = 3;

    if (age > maxAge) {
      return;
    }

    console.table({ title, link, date });

    await dbClient.query(
      `INSERT INTO info 
           (title, link, source, date, status)
           VALUES
           ($1::text, $2::text, $3::varchar(32), $4::date, $5::varchar(32))
           ON CONFLICT (link) DO NOTHING;
          `,

      [title, link, `reddit-channel`, date, 'pending'],
    );
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

  console.log('done processing', channel);
};
