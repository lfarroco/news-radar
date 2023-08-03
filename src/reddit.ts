import { cheerio } from './deps.ts';
import { client } from './db.ts';

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
) => {

  try {
    const request = await fetch(url);

    const response = await request.text();

    return {
      ok: true,
      response
    }
  } catch (err) {
    return {
      ok: false,
      err
    }


  }
}

export const reddit = async (channel: string, topic: string) => {
  console.log('processing channel', channel);
  const url = `https://old.reddit.com/r/${channel}/top/?sort=top&t=week`;

  const result = await axiosReq(url);

  if (!result.ok) {
    console.log('error fetching', url);
    return;
  }

  const $ = cheerio.load(result.response);

  const entries = $('.thing:not(.promoted)').toArray();

  const ops = entries.map(async (entry: any) => {
    const title = topic + " - " + $(entry).find('a.title.outbound').text();
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

    console.table({ title, link, date: date.toDateString() });

    await client.queryArray(
      `INSERT INTO info 
           (title, link, source, date, status)
           VALUES
           ($1, $2, $3, $4, $5)
           ON CONFLICT (link) DO NOTHING;
          `,

      [title, link, `reddit-${channel}`, date, 'pending'],
    );
    await client.queryArray(
      `INSERT INTO topics (name) VALUES ($1) ON CONFLICT (name, slug) DO NOTHING;`,
      [topic],
    );

    await client.queryArray(
      `INSERT INTO article_topic (article_id, topic_id) VALUES ((
          SELECT id FROM info WHERE link = $1
        ), (
          SELECT id FROM topics WHERE name = $2
        ))
        ON CONFLICT (article_id, topic_id) DO NOTHING;`,
      [link, topic],
    );
  });

  await Promise.all(ops);

  console.log('done processing', channel);
};
