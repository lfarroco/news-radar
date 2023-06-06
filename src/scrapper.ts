import axios, { AxiosResponse } from 'axios';
import pg from 'pg';
import cheerio from 'cheerio';

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

    const text = $('h1, h2, h3, h4, h5, p, main')
      .not('header, nav, navbar, footer')
      .text();

    // remove multiple line brakes and do general cleaning to the string
    const textCleaned = text.replace(/\n\s*\n/g, '\n').replace(/\s\s+/g, ' ');

    resolve(textCleaned);
  });

await scrapper();

export async function scrapper() {
  console.log('scrapper started:');

  console.log('connecting to db...');
  await dbClient.connect();
  console.log('db connected');

  const articles = await dbClient.query(
    'SELECT * from info WHERE status = $1::varchar(32) LIMIT 10;',
    ['approved'],
  );

  console.log('articles', articles);

  const urls = articles.rows.map((item: any) => item.link);

  // only resolve when all promises are resolved
  const texts = await Promise.all(
    urls.map(async (link: string) => {
      const article = await articleScrapper(link);

      return { link, article };
    }),
  );

  texts.forEach(({ link, article }) => {
    // if the article is too small, mark as failed to scrape
    if (article.length < 1000) {
      console.log('article too small:', link);
      dbClient.query(
        'UPDATE info SET status = $1::varchar(32) WHERE link = $2::varchar(512);',
        ['failed-too-small', link],
      );
    }
    // cancel if too big
    else if (article.length > 20000) {
      console.log('article too big:', link);
      dbClient.query(
        'UPDATE info SET status = $1::varchar(32) WHERE link = $2::varchar(512);',
        ['failed-too-big', link],
      );
    } else {
      //store the result
      console.log('article scraped:', link);
      dbClient.query(
        'UPDATE info SET status = $1::varchar(32), original = $2::text WHERE link = $3::varchar(512);',
        ['scraped', article, link],
      );
    }
  });
}
