import axios, { AxiosResponse } from 'axios';
import cheerio from 'cheerio';
import pg from 'pg';

const dbClient = new pg.Client({
  password: 'root',
  user: 'root',
  host: 'postgres',
});

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
  new Promise((resolve) => {
    return axios(url)
      .then((response) => {
        resolve({ ok: true, response });
      })
      .catch((err) => {
        resolve({ ok: false, err });
      });
  });

export const reddit = (channel: string) =>
  new Promise(async (resolve) => {
    await dbClient.connect();

    console.log('processing channel', channel);
    const url = `https://old.reddit.com/r/${channel}`;

    const result = await axiosReq(url);

    if (!result.ok) {
      console.log('error fetching', url);
      resolve(null);
      return;
    }

    const rss = result.response.data;
    const $ = cheerio.load(rss);

    const entries = $('.thing:not(.promoted)').toArray();

    entries.map((entry) => new Promise(async (done) => {
      const title = $(entry).find('a.title.outbound').text();
      const link = $(entry).find('.title a').attr('href');
      const published = $(entry).find('.tagline time').attr('datetime');
      const date = new Date(published);

      const isRestricted = restrictedDomains.some((domain) =>
        link.includes(domain),
      );

      if (isRestricted) {
        return;
      }

      console.log('inserting', title, link, date);

      await dbClient
        .query(
          `INSERT INTO info 
           (title, link, source, date, status)
           VALUES
           ($1::text, $2::text, $3::varchar(32), $4::date, $5::varchar(32))
           ON CONFLICT (link) DO NOTHING;
          `,

          [title, link, 'reddit', date, 'pending'],
        )

      done(null);
    }));

    await Promise.all(entries);

    console.log('done processing', channel);

    resolve(null);

  });
