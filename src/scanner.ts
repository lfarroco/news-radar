import { rss } from './rss.js';
import { dbClient } from './db.js';
import { batch } from './utils.js';
import axios from 'axios';
import { reddit } from './reddit.js';

await dbClient.connect();

const subreddit = (sub: string, topic: string) => async () => {
  await reddit(sub, topic);
};

const githubRelease = (repo: string, topics: string[]) => async () =>
  rss(`https://github.com/${repo}/releases.atom`, topics, true);

const feed =
  (url: string, topics: string[], hasContent = false) =>
  async () =>
    rss(url, topics, hasContent);

const sources = [
  feed('https://jamesg.blog/openai.xml', ['OpenAI', 'ChatGPT']),
  feed('https://hnrss.org/newest?points=500', []),
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

  // private
  //subreddit('python', 'Python', 50),
  // read-only
  // subreddit('haskell', 'Haskell', 50),
  subreddit('rust', 'Rust'),
  subreddit('golang', 'Go'),
  subreddit('java', 'Java'),
  subreddit('kotlin', 'Kotlin'),
  subreddit('swift', 'Swift'),
  subreddit('scala', 'Scala'),
  subreddit('cpp', 'C++'),
  subreddit('php', 'PHP'),
  subreddit('ruby', 'Ruby'),
  subreddit('elixir', 'Elixir'),
  subreddit('purescript', 'PureScript'),
  subreddit('clojure', 'Clojure'),
  subreddit('typescript', 'TypeScript'),
  subreddit('reactjs', 'React'),
  subreddit('angular', 'Angular'),
  subreddit('node', 'Node.js'),
  subreddit('deno', 'Deno'),
  subreddit('django', 'Django'),
  subreddit('flask', 'Flask'),
];

await batch(sources, 5, (fn) => fn());

console.log('scan finished');

process.exit(0);
