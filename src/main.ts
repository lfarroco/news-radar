

import axios from 'axios';
import cheerio from 'cheerio';
import fs from "fs"

const url = 'https://old.reddit.com/r/programming/.rss';

const response = await axios(url)

const rss = response.data;
const $ = cheerio.load(rss);

const entries = $('entry').toArray();

const output: { [x: string]: { title: string, link: string, published: string }[] } = {}

entries.forEach(entry => {

  const title = $(entry).find('title').text();

  const link = $(entry).find('link').attr('href');

  const published = $(entry).find('published').text();

  const date = new Date(published)

  const formattedDate = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate() + 1}`

  if (!output[formattedDate]) {
    output[formattedDate] = []
  }

  output[formattedDate].push({ title, link, published })

});

Object.entries(output).forEach(([date, items]) => {

  const fileName = `./data/${date}.json`;

  fs.readFile(fileName, (err, fileContent) => {

    if (err) {
      console.log("handling err")
      write(fileName, items)
      return
    } else {
      const fileData = JSON.parse(fileContent.toString())

      const newItems = []

      for (let i = 0; i < items.length; i++) {

        if (fileData.find((item: { link: string; }) => item.link === items[i].link)) {
          continue
        }

        newItems.push(items[i])

      }

      const newData = [...fileData, ...newItems]

      write(fileName, newData)
    }


  });

})

function write(fileName: string, items: { title: string; link: string; published: string; }[]) {
  fs.writeFile(fileName, JSON.stringify(items), (err) => {
    if (err) {
      console.error(err);
    }
  });
}



