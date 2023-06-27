import { rss } from './rss.js';
import { dbClient } from './db.js';
import { batch } from './utils.js';

await dbClient.connect();

const subreddit = (sub: string, topic: string, threshold: number) => async () =>
  rss(
    `https://reddit.0qz.fun/r/${sub}.json?scoreLimit=${threshold}`,
    [topic],
    true,
  );

const githubRelease = (repo: string, topics: string[]) => async () =>
  rss(`https://github.com/${repo}/releases.atom`, topics, true);

const feed =
  (url: string, topics: string[], hasContent = false) =>
  async () =>
    rss(url, topics, hasContent);

const sources = [
  feed('https://jamesg.blog/openai.xml', ['OpenAI', 'ChatGPT']),
  feed('https://hnrss.org/newest?points=1000', []),
  feed('https://blog.python.org/feeds/posts/default?alt=rss', ['Python'], true),
  feed('https://nodejs.org/en/feed/blog.xml', ['Node.js']),
  feed('https://blog.rust-lang.org/feed.xml', ['Rust'], true),
  feed('https://blog.rust-lang.org/inside-rust/feed.xml', ['Rust'], true),
  feed('https://devblogs.microsoft.com/typescript/feed/', ['TypeScript'], true),
  feed('https://blog.golang.org/feed.atom', ['Go'], true),

  githubRelease('reduxjs/redux', ['Redux', 'JavaScript']),
  githubRelease('facebook/react', ['React', 'JavaScript']),
  githubRelease('angular/angular', ['Angular', 'TypeScript']),
  githubRelease('denoland/deno', ['Deno', 'TypeScript']),
  githubRelease('rust-lang/rust', ['Rust']),
  githubRelease('rust-lang/rust', ['Rust']),

  subreddit('python', 'Python', 50),
  subreddit('haskell', 'Haskell', 50),
  subreddit('rust', 'Rust', 200),
  subreddit('golang', 'Go', 100),
  subreddit('java', 'Java', 50),
  subreddit('kotlin', 'Kotlin', 20),
  subreddit('swift', 'Swift', 50),
  subreddit('scala', 'Scala', 50),
  subreddit('cpp', 'C++', 100),
  subreddit('php', 'PHP', 50),
  subreddit('ruby', 'Ruby', 50),
  subreddit('elixir', 'Elixir', 40),
  subreddit('purescript', 'PureScript', 10),
  subreddit('clojure', 'Clojure', 40),
  subreddit('typescript', 'TypeScript', 30),
  subreddit('reactjs', 'React', 200),
  subreddit('angular', 'Angular', 10),
  subreddit('node', 'Node.js', 50),
  subreddit('deno', 'Deno', 10),
  subreddit('django', 'Django', 30),
  subreddit('flask', 'Flask', 20),
];

await batch(sources, 5, (fn) => fn());

console.log('scan finished');

process.exit(0);
