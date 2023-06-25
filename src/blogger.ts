import { google } from 'googleapis';
import { config } from 'dotenv';

config();

// Each API may support multiple versions. With this sample, we're getting
// v3 of the blogger API, and using an API key to authenticate.
const blogger = google.blogger({
  version: 'v3',
  auth: process.env.BLOGGER_KEY,
});

const publish = async () =>
  blogger.posts.insert({
    blogId: '2717877600688481984',
    requestBody: {
      title: 'Hello from the googleapis npm module!',
      content:
        'Visit https://github.com/google/google-api-nodejs-client to learn more!',
    },
  });

await publish();
