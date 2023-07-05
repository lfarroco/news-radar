import cheerio from 'cheerio';
import { dbClient } from './db.ts';

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

export const reddit = async (channel: string, topic: string) => {
  console.log('processing channel', channel);
  const url = `https://old.reddit.com/r/${channel}/top/?sort=top&t=week`;

  //using deno
  const result = await fetch(url);

  const body = await result.text();

  const $ = cheerio.load(body);

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

    await dbClient.from('info').upsert({
      title,
      link,
      source: `reddit-${channel}`,
      date,
      status: 'pending',
    });

    await dbClient.from('topics').upsert({
      name: topic,
    });

    const articleId = await dbClient.from('info').select('id').eq('link', link);
    const topicId = await dbClient
      .from('topics')
      .select('id')
      .eq('name', topic);

    await dbClient.from('article_topic').upsert({
      article_id: articleId,
      topic_id: topicId,
    });
  });

  await Promise.all(ops);

  console.log('done processing', channel);
};
