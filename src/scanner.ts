import { rss } from './rss.js';
import { dbClient } from './db.js';

await dbClient.connect();

const subreddit = async (sub: string, topic: string) =>
  rss(
    `https://old.reddit.com/r/${sub}/top.rss?sort=top&t=week`,
    [topic],
    false,
  );

const githubRelease = async (repo: string, topics: string[]) =>
  rss(`https://github.com/${repo}/releases.atom`, topics, true);

await Promise.all([
  rss('https://www.smashingmagazine.com/feed/', []),
  rss('https://hnrss.org/newest?points=1000', []),
  rss('https://blog.python.org/feeds/posts/default?alt=rss', ['Python'], true),
  rss('https://nodejs.org/en/feed/blog.xml', ['Node.js']),
  rss('https://blog.rust-lang.org/feed.xml', ['Rust'], true),
  rss('https://blog.rust-lang.org/inside-rust/feed.xml', ['Rust'], true),
  rss('https://devblogs.microsoft.com/typescript/feed/', ['TypeScript'], true),
  rss('https://blog.golang.org/feed.atom', ['Go'], true),

  githubRelease('reduxjs/redux', ['Redux', 'JavaScript']),
  githubRelease('facebook/react', ['React', 'JavaScript']),
  githubRelease('angular/angular', ['Angular', 'TypeScript']),
  githubRelease('denoland/deno', ['Deno', 'TypeScript']),
  githubRelease('rust-lang/rust', ['Rust']),
  githubRelease('rust-lang/rust', ['Rust']),

  subreddit('python', 'Python'),
  subreddit('javascript', 'JavaScript'),
  subreddit('haskell', 'Haskell'),
  subreddit('rust', 'Rust'),
  subreddit('golang', 'Go'),
  subreddit('java', 'Java'),
  subreddit('csharp', 'C#'),
  subreddit('kotlin', 'Kotlin'),
  subreddit('php', 'PHP'),
  subreddit('ruby', 'Ruby'),
  subreddit('elixir', 'Elixir'),
  subreddit('purescript', 'PureScript'),
  subreddit('clojure', 'Clojure'),
  subreddit('typescript', 'TypeScript'),
  subreddit('reactjs', 'React'),
  subreddit('angular', 'Angular'),
]);

console.log('scan finished');

process.exit(0);
