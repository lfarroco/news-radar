import { reddit } from './reddit.js';
import { rss } from './rss.js';
import { dbClient } from './db.js';

await dbClient.connect();

await rss('https://blog.python.org/feeds/posts/default?alt=rss');
await rss('https://nodejs.org/en/feed/blog.xml');
await rss('https://blog.rust-lang.org/feed.xml');
await rss('https://blog.rust-lang.org/inside-rust/feed.xml');
await rss('https://devblogs.microsoft.com/typescript/feed/');
await rss('https://hnrss.org/frontpage');
await rss('https://blog.golang.org/feed.atom');
await rss('https://github.com/reduxjs/redux/releases.atom')

await reddit();

console.log('scan finished');

process.exit(0);
