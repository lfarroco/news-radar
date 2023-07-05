import { dbClient } from './db.ts';
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
  'reddit.com',
  'redditmedia.com',
  'reddituploads.com',
  'redd.it',
  'i.redd.it',
];


export const rss = async (
  url: string,
  topics: string[],
  hasContent = false,
): Promise<void> => {
  console.log('processing rss ', url);

  let parser = new Parser();

  let feed = await parser.parseURL(url).catch((err) => {
    console.log('error parsing', url);
    console.log(err);
  });

  if (!feed) {
    console.log('skipping feed', url);
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
    console.table({ title, link, date: date.toString(), isRecent });

    await dbClient.from('info').insert({
      title,
      link,
      source: url,
      date,
      status: 'pending',
      original: hasContent ? description : '',
    });

    const ops = topics.map(async (topic) => {

      await dbClient.from('topics').upsert({
        name: topic,
      })

      const articleId = await dbClient.from('info').select('id').eq('link', link)
      const topicId = await dbClient.from('topics').select('id').eq('name', topic)
      await dbClient.from('article_topic').upsert({
        article_id: articleId ,
        topic_id: topicId,
      });

    });

    await Promise.all(ops);
  });

  await Promise.all(ops);

  console.log('done processing', url);
};
