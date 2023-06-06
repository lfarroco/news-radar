import pg from 'pg';
import { priority } from './openai.js';

const dbClient = new pg.Client({
  password: 'root',
  user: 'root',
  host: 'postgres',
});

export const filterCandidates = async (): Promise<
  { id: number; title: string }[]
> =>
  new Promise(async (resolve) => {
    await dbClient.connect();

    dbClient
      .query('SELECT * from info WHERE status = $1::varchar(32) LIMIT 10;', ['pending'])
      .then((result: { rows: any[] }) => {
        resolve(result.rows);
      });
  });

const items = await filterCandidates();

const titles = items
  .map((item: any) => `(${item.id}) - ${item.title}`)
  .join('\n');

const result = await priority(titles);

const parsed: { id: number; topics: string[] }[] = JSON.parse(result);

parsed.forEach((item) => {
  const topics = JSON.stringify(item.topics);
  console.log(`updating item ${item.id} with topics ${topics}`);
  dbClient.query(
    'UPDATE info SET status = $1::varchar(32), topics = $2::varchar(32) WHERE id = $3::int;',
    ['approved', topics, item.id],
  );
});

//reject the rest

items.forEach((item: any) => {
  const found = parsed.find((p) => p.id === item.id);

  if (!found) {
    console.log(`rejecting item ${item.id}`);
    dbClient.query(
      'UPDATE info SET status = $1::varchar(32) WHERE id = $2::int;',
      ['rejected', item.id],
    );
  }
});
