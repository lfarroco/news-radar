import { google } from 'googleapis';
import { config } from 'dotenv';
import { authenticate } from '@google-cloud/local-auth';
import * as path from 'path';
import { fileURLToPath } from 'url';

config();

// Each API may support multiple versions. With this sample, we're getting
// v3 of the blogger API, and using an API key to authenticate.
const blogger = google.blogger('v3');

const dirname = path.dirname(fileURLToPath(import.meta.url));

const auth = await authenticate({
  keyfilePath: path.join(dirname, '../../blogger-secret.json'),
  scopes: 'https://www.googleapis.com/auth/blogger',
});
google.options({ auth });

console.log('Tokens:', auth.credentials);

const publish = async () => {
  const res = await blogger.posts.insert({
    blogId: '2717877600688481984',
    requestBody: {
      title: 'second post',
      content:
        'testttt',
    },
  });

  console.log(res.data);
  return res.data;
};

await publish();
