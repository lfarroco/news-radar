import cheerio from 'cheerio';
import { batch } from './utils.ts';
import { dbClient } from './db.ts';

export const articleScrapper = async (url: string) => {
  console.log('processing url', url);

  const result = await fetch(url);

  const responseText = await result.text();

  const $ = cheerio.load(responseText);

  const text = $('h1, h2, h3, h4, h5, p')
    .not('header, nav, navbar, footer')
    .text();

  // remove multiple line brakes and do general cleaning to the string
  return text.replace(/\n\s*\n/g, '\n').replace(/\s\s+/g, ' ');
};

export default async function scrapper() {
  console.log('scrapper started:');

  const articles = await dbClient
    .from('info')
    .select('*')
    .eq('status', 'approved');

  console.log(
    'articles',
    articles.data.map((a) => a.title),
  );

  const urls: string[][] = articles.data.map((item: any) => item.link);

  await batch(urls, 5, async (link: string) => {
    const original = await articleScrapper(link);

    console.log('article scraped:', link);

    if (!original) {
      await dbClient
        .from('info')
        .update({ status: 'error-scraping' })
        .eq('link', link);
    } else {
      await dbClient
        .from('info')
        .update({ status: 'scraped', original })
        .eq('link', link);
    }
  });
}
