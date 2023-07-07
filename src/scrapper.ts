import axios, { AxiosResponse } from 'axios';
import cheerio from 'cheerio';
import { batch } from './utils.js';
import { dbClient } from './db.js';
import { Article } from './models.js';

const axiosReq = async (
  url: string,
): Promise<
  { ok: false; err: string } | { ok: true; response: AxiosResponse<any, any> }
> => {
  try {
    const response = await axios(url);
    return ({ ok: true, response });
  } catch (err) {
    return ({ ok: false, err });
  }
};

export const articleScrapper = async (url: string): Promise<string | null> => {
  console.log('processing url', url);

  const result = await axiosReq(url);

  if (!result.ok) {
    console.log('error fetching', url);
    return null
  }

  const $ = cheerio.load(result.response.data);

  const text = $('h1, h2, h3, h4, h5, p')
    .not('header, nav, navbar, footer')
    .text();

  // remove multiple line brakes and do general cleaning to the string
  return text.replace(/\n\s*\n/g, '\n').replace(/\s\s+/g, ' ');

}

export async function scrapper() {
  console.log('scrapper started:');

  console.log('connecting to db...');
  await dbClient.connect();
  console.log('db connected');

  const { rows: articles }: { rows: Article[] } = await dbClient.query(
    `SELECT * from info WHERE status = 'approved';`,
  );

  console.log(
    'articles',
    articles.map((a) => a.title),
  );

  const urls = articles.map((item: any) =>
    item.link,
  );

  await batch(urls, 5, async (link: string) => {

    const article = await articleScrapper(link);

    console.log('article scraped:', link);

    if (!article) {
      await dbClient.query(
        'UPDATE info SET status = $1::text  WHERE link = $2::text;',
        ['error-scraping', link],
      );
    } else {
      await dbClient.query(
        'UPDATE info SET status = $1::text, original = $2::text WHERE link = $3::text;',
        ['scraped', article, link],
      );
    }
  });
}

await scrapper();

console.log('scrapper finished');

process.exit(0);
