import axios, { AxiosResponse } from 'axios';
import { dbClient } from './db.js';
import cheerio from 'cheerio';

const MAX_REDDIT_ITEMS = 5;
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
  new Promise(async (resolve) => {
    try {
      const response = await axios(url);
      resolve({ ok: true, response });
    } catch (err) {
      resolve({ ok: false, err });
    }
  });

export const reddit = async (channel: string): Promise<void> => {
  console.log('processing channel', channel);
  const url = `https://old.reddit.com/r/${channel}/.rss`;

  const result = await axiosReq(url);

  if (!result.ok) {
    console.log('error fetching', url);
    return;
  }

  const $ = cheerio.load(result.response.data);

  const entries = $('entry').toArray().slice(0, MAX_REDDIT_ITEMS);

  const ops = entries.map(async (entry) => {
    const title = $(entry).find('title').text();
    const link = $(entry).find('link').attr('href');
    const date = new Date($(entry).find('published').text());

    console.log('inserting', title, link, date);

    const isRestricted = restrictedDomains.some((domain) =>
      link.includes(domain),
    );

    if (isRestricted) {
      return;
    }

    console.log('inserting', { title, link, date });

    await dbClient.query(
      `INSERT INTO info 
           (title, link, source, date, status)
           VALUES
           ($1::text, $2::text, $3::varchar(32), $4::date, $5::varchar(32))
           ON CONFLICT (link) DO NOTHING;
          `,

      [title, link, 'reddit', date, 'pending'],
    );
  });

  await Promise.all(ops);

  console.log('done processing', channel);
};
