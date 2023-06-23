import axios, { AxiosResponse } from 'axios';
import { dbClient } from './db.js';
import cheerio from 'cheerio';
import {batch} from './utils.js';

const MAX_REDDIT_ITEMS = 5;
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
  '/r/',
  'imgur.com',
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

const channels = [
  // general subs
  'programming',
  // "functionalprogramming",
  // "webdev",
  // "gamedev",
  // "compsci",

  // // languages
  'javascript',
  'haskell',
  'rust',
  'python',
  'golang',
  'java',
  'csharp',
  "kotlin",
  'php',
  'ruby',
  'elixir',
  'csharp',
  'purescript',
  'clojure',
  'typescript',

  // // frameworks
  'reactjs',
  // "vuejs", // using blackout protest posts
  'angular',
  // "flutter",
  // "svelte",
  // "emberjs",
  // "nextjs",
  // "gatsbyjs",
  // "nuxtjs",
  // "reactnative",
];
//.map((channel) => reddit(channel));
//

export const channelReader = async (channel: string): Promise<void> => {

  console.log('processing channel', channel);
  const url = `https://old.reddit.com/r/${channel}/top.rss?sort=top&t=week`;

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
    const rawDate = new Date($(entry).find('published').text());
    const date = `${rawDate.getFullYear()}-${rawDate.getMonth() + 1}-${rawDate.getDate() + 1}`

    //max age= 1 month
    const isRecent = (Date.now() - rawDate.getTime()) / 1000 / 60 / 60 / 24 < 30;

    console.table({ title, link, date });

    const isRestricted = restrictedDomains.some((domain) =>
      link.includes(domain),
    );

    if (isRestricted || !isRecent) {
      return;
    }

    console.log('inserting', { title, link, date });

    await dbClient.query(
      `INSERT INTO info 
           (title, link, source, date, status)
           VALUES
           ($1::text, $2::text, $3::text, $4::date, $5::text)
           ON CONFLICT (link) DO NOTHING;
          `,

      [title, link, `reddit-${channel}`, date, 'pending'],
    );
  });

  await Promise.all(ops);

  console.log('done processing', channel);
};

export const reddit =  async()=> await batch(channels, 1, channelReader);
