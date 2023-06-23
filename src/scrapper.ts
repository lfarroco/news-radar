import axios, { AxiosResponse } from 'axios';
import pg from 'pg';
import cheerio from 'cheerio';
import { batch, sleep } from './utils.js';

const dbClient = new pg.Client({
  password: 'root',
  user: 'root',
  host: 'postgres',
});

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

export const articleScrapper = (url: string): Promise<string> =>
  new Promise(async (resolve) => {
    console.log('processing url', url);

    const result = await axiosReq(url);

    if (!result.ok) {
      console.log('error fetching', url);
      resolve(null);
      return;
    }

    const $ = cheerio.load(result.response.data);

    const text = $('h1, h2, h3, h4, h5, p')
      .not('header, nav, navbar, footer')
      .text();

    // remove multiple line brakes and do general cleaning to the string
    const textCleaned = text.replace(/\n\s*\n/g, '\n').replace(/\s\s+/g, ' ');

    resolve(textCleaned);
  });

export async function scrapper() {
  console.log('scrapper started:');

  console.log('connecting to db...');
  await dbClient.connect();
  console.log('db connected');

  const articles = await dbClient.query(`SELECT * from info WHERE status = 'approved';`);

  console.log(
    'articles',
    articles.rows.map((a) => a.title),
  );

  const urls:string[][] = articles.rows.map((item: any) => ([item.link, item.original]));

  await batch(urls, 1, async (args:string[]) => {

    const [link, original] = args

    if(!!original){
      await dbClient.query(
        'UPDATE info SET status = $1::text WHERE link = $2::text;',
        ['scraped', link],
      );
      return;
    }

    const article = await articleScrapper(link);

    await sleep(1000);

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
