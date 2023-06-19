import axios, { AxiosResponse } from 'axios';
import cheerio from 'cheerio';
import { dbClient } from './db.js';

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
  const url = `https://old.reddit.com/r/${channel}`;

  const result = await axiosReq(url);

  if (!result.ok) {
    console.log('error fetching', url);
    return;
  }

  const rss = result.response.data;
  const $ = cheerio.load(rss);

  const entries = $('.thing:not(.promoted)').toArray().slice(0, MAX_REDDIT_ITEMS);

  await entries.reduce(async (prev, entry) => {
    await prev;
    const title = $(entry).find('a.title.outbound').text();
    const link = $(entry).find('.title a').attr('href');
    const published = $(entry).find('.tagline time').attr('datetime');
    const date = new Date(published);

    const isRestricted = restrictedDomains.some((domain) =>
      link.includes(domain),
    );

    if (!title || !link || !published) {
      console.log('missing data', { title, link, published });
      return;
    }

    if (isRestricted) {
      return;
    }

    console.log('inserting', title, link, date);

    await dbClient.query(
      `INSERT INTO info 
           (title, link, source, date, status)
           VALUES
           ($1::text, $2::text, $3::varchar(32), $4::date, $5::varchar(32))
           ON CONFLICT (link) DO NOTHING;
          `,

      [title, link, 'reddit', date, 'pending'],
    );
  }, Promise.resolve());

  console.log('done processing', channel);
};
