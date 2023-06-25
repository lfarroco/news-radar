
const {google} = require('googleapis');

import { config } from 'dotenv';
config();

// Each API may support multiple versions. With this sample, we're getting
// v3 of the blogger API, and using an API key to authenticate.
const blogger = google.blogger({
  version: 'v3',
  auth: process.env.BLOGGER_KEY
});

const params = {
  blogId: '2717877600688481984'
};

// get the blog details
blogger.blogs.get(params, (err, res) => {
  if (err) {
    console.error(err);
    throw err;
  }
  console.log(`The blog url is ${res.data.url}`);
});


