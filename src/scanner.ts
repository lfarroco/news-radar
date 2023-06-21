import { reddit } from './reddit.js';
import { rss } from './rss.js';
import { dbClient } from './db.js';
import { batch } from './utils.js';

await dbClient.connect();

await rss('https://blog.python.org/feeds/posts/default?alt=rss');

await rss('https://nodejs.org/en/feed/blog.xml');

const channels = [
  // general subs
  'programming',
  // "functionalprogramming",
  // "webdev",
  // "gamedev",
  // "compsci",

  // // languages
  'javascript',
  'haskell',
  'rust',
  'python',
  'golang',
  'java',
  'csharp',
  "kotlin",
  'php',
  'ruby',
  'elixir',
  'csharp',
  'purescript',

  // // frameworks
  'reactjs',
  // "vuejs", // using blackout protest posts
  'angular',
  // "flutter",
  // "svelte",
  // "emberjs",
  // "nextjs",
  // "gatsbyjs",
  // "nuxtjs",
  // "reactnative",
];
//.map((channel) => reddit(channel));
//

console.log('processing channels...');

await batch(channels, 1, reddit);

process.exit(0);
