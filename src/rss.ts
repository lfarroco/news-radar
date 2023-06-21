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
  'reddit.com',
  'redd.it',
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

export const rss = async (url: string): Promise<void> => {
  console.log('processing rss ', url);

  const result = await axiosReq(url);

  if (!result.ok) {
    console.log('error fetching', url);
    return;
  }

  let parser = new Parser();

  let feed = await parser.parseURL(url);

  const ops = feed.items.map(async (item) => {

    const title = item.title;
    const link = item.link;
    const date = new Date(item.pubDate);

    const age = Date.now() - date.getTime();

    // max age is 1 month

    const isRecent = age < 1000 * 60 * 60 * 24 * 30;

    const isRestricted = restrictedDomains.some((domain) =>
      link.includes(domain),
    );

    if (isRestricted || !isRecent) {
      return;
    }

    console.log("Inserting: ");
    console.table({ title, link, date, isRecent });

    await dbClient.query(
      `INSERT INTO info 
           (title, link, source, date, status)
           VALUES
           ($1::text, $2::text, $3::varchar(32), $4::date, $5::varchar(32))
           ON CONFLICT (link) DO NOTHING;
          `,

      [title, link, url, date, 'pending'],
    );
  });

  await Promise.all(ops);

  console.log('done processing', url);
};
