import { reddit } from './reddit.js';
import { rss } from './rss.js';
import { dbClient } from './db.js';

await dbClient.connect();

await rss('https://mshibanami.github.io/GitHubTrendingRSS/weekly/all.xml', [])
await rss('https://blog.python.org/feeds/posts/default?alt=rss', ["Python"]);
await rss('https://nodejs.org/en/feed/blog.xml', ["Node.js"]);
await rss('https://blog.rust-lang.org/feed.xml', ["Rust"]);
await rss('https://blog.rust-lang.org/inside-rust/feed.xml', ["Rust"]);
await rss('https://devblogs.microsoft.com/typescript/feed/', ["TypeScript"]);
await rss('https://hnrss.org/frontpage', []);
await rss('https://blog.golang.org/feed.atom', ["Go"]);
await rss('https://github.com/reduxjs/redux/releases.atom', ["Redux", "JavaScript"]);
await rss('https://github.com/facebook/react/releases.atom', ["React", "JavaScript"]);

await reddit();

console.log('scan finished');

process.exit(0);
