import { reddit } from './reddit.js';

const operations = [
  // general subs
  'programming',
  // "functionalprogramming",
  // "webdev",
  // "gamedev",
  // "compsci",

  // // languages
   "javascript",
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
].map( (channel) =>  reddit(channel))

await Promise.all(operations)

process.exit(0)
