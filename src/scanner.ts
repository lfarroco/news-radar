import { reddit } from './reddit.js';

[
  // general subs
  'programming',
  // "functionalprogramming",
  // "webdev",
  // "gamedev",
  // "compsci",

  // // languages
  // "javascript",
  // "haskell",
  // "rust",
  // "python",
  // "golang",
  // "java",
  // "csharp",
  // "kotlin",
  // "php",
  // "csharp",
  // "purescript",

  // // frameworks
  // "reactjs",
  // "vuejs",
  // "angular",
  // "elm",
  // "flutter",
  // "svelte",
  // "emberjs",
  // "nextjs",
  // "gatsbyjs",
  // "nuxtjs",
  // "reactnative",
].reduce(
  (promise, channel) => promise.then(() => reddit(channel)),
  Promise.resolve(null),
);
