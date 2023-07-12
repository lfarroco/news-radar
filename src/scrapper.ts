import { cheerio } from './deps.ts';
import { batch } from './utils.ts';
import { client } from './db.ts';
import { Article } from './models.ts';

const req = async (
  url: string,
): Promise<
  { ok: false; err: string } | { ok: true; response: string }
> => {
  try {
    const response = await fetch(url);
    const text = await response.text();
    return ({ ok: true, response: text });
  } catch (err) {
    return ({ ok: false, err });
  }
};

export const articleScrapper = async (url: string): Promise<string | null> => {
  console.log('processing url', url);

  const result = await req(url);

  if (!result.ok) {
    console.log('error fetching', url);
    return null
  }

  const $ = cheerio.load(result.response);

  const text = $('h1, h2, h3, h4, h5, p')
    .not('header, nav, navbar, footer')
    .text();

  // remove multiple line brakes and do general cleaning to the string
  return text.replace(/\n\s*\n/g, '\n').replace(/\s\s+/g, ' ');

}

export default async () => {
  console.log('scrapper started:');

  const { rows: articles }: { rows: Article[] } = await client.queryObject(
    `SELECT * from info WHERE status = 'approved';`,
  );

  console.log(
    'articles',
    articles.map((a) => a.title),
  );

  const urls = articles.map((item) =>
    item.link,
  );

  await batch(urls, 5, async (link: string) => {

    const article = await articleScrapper(link);

    console.log('article scraped:', link);

    if (!article) {
      await client.queryArray(
        'UPDATE info SET status = $1  WHERE link = $2;',
        ['error-scraping', link],
      );
    } else {
      await client.queryArray(
        'UPDATE info SET status = $1, original = $2 WHERE link = $3;',
        ['scraped', article, link],
      );
    }
  });

  console.log('scrapper finished');
}

