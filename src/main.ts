import { reddit } from './reddit.js';

[
  // general subs
  'programming',
  'webdev',
  'gamedev',
  'devops',

  // languages
  'javascript',
  'haskell',
  'rust',
  'typescript',
  'python',
  'golang',
  'java',
  'csharp',
  'kotlin',
  'php',
  'purescript',

  // frameworks
  'reactjs',
  'vuejs',
  'angular',
  'flutter',

  // databases
  'postgresql',
  'mysql',
  'mongodb',
  'redis',

  // cloud
  'aws',
  'azure',
  'gcp',


].reduce(
  (promise, channel) => promise.then(() => reddit(channel)),
  Promise.resolve(null),
);
