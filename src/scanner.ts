import { reddit } from './reddit.js';
import { rss } from './rss.js';
import { dbClient } from './db.js';

await dbClient.connect();

// await rss('https://mshibanami.github.io/GitHubTrendingRSS/monthly/all.xml', ['GitHub'], true)
// await rss('https://dev.to/feed/tag/javascript', ['JavaScript'], true);
await rss('https://hnrss.org/newest?points=1000', []);
await rss('https://blog.python.org/feeds/posts/default?alt=rss', ["Python"], true);
await rss('https://nodejs.org/en/feed/blog.xml', ["Node.js"]);
await rss('https://blog.rust-lang.org/feed.xml', ["Rust"], true);
await rss('https://blog.rust-lang.org/inside-rust/feed.xml', ["Rust"], true);
await rss('https://devblogs.microsoft.com/typescript/feed/', ["TypeScript"], true);
await rss('https://blog.golang.org/feed.atom', ["Go"], true);
await rss('https://github.com/reduxjs/redux/releases.atom', ["Redux", "JavaScript"], true);
await rss('https://github.com/facebook/react/releases.atom', ["React", "JavaScript"], true);

await reddit();

console.log('scan finished');

process.exit(0);
