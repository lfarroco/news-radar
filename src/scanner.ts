import { reddit } from './reddit.js';
import { rss } from './rss.js';
import { dbClient } from './db.js';

await dbClient.connect();

await rss('https://blog.python.org/feeds/posts/default?alt=rss');
await rss('https://nodejs.org/en/feed/blog.xml');
await rss('https://blog.rust-lang.org/feed.xml');
await rss('https://blog.rust-lang.org/inside-rust/feed.xml');

await reddit();

console.log('processing channels...');

process.exit(0);
