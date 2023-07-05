import { write } from './openai.ts';
import { batch } from './utils.ts';
import { dbClient } from './db.ts';

const MAX_INPUT_TEXT_LENGTH = 3000;
const pickArticlesToWrite = async (): Promise<
  { id: number; title: string; original: string }[]
> => {
  const result = await dbClient
    .from('info')
    .select('*')
    .eq('status', 'scraped');
  return result.data;
};

const writer = async (item) => {
  const { id, title, content } = await write(
    item.id,
    item.title,
    item.original.substring(0, MAX_INPUT_TEXT_LENGTH),
  );

  const article = JSON.stringify({
    title,
    article: content,
  });

  await dbClient
    .from('info')
    .update({ status: 'published', article })
    .eq('id', id);

  console.log(`wrote article "${title}"...`);
};

export default async () => {
  const items = await pickArticlesToWrite();

  console.log(
    'articles to write:',
    items.map((item) => item.title),
  );

  await batch(items, 3, writer);

  console.log('done');
};
