import scanner from './scanner.ts';
import candidates from './candidates.ts';
import scrapper from './scrapper.ts';
import writer from './writer.ts';
import publisher from './publisher/publisher.ts';

const main = async () => {
  await scanner();
  await candidates();
  await scrapper();
  await writer();
  await publisher();
};

main();
