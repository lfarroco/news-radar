

import axios from 'axios';
import cheerio from 'cheerio';
import fs from "fs"

export async function reddit(channel: string) {
	console.log("processing channel", channel)
	const url = `https://old.reddit.com/r/${channel}/.rss`;

	const response = await axios(url);

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

		const fileName = `./data/reddit-${channel}/${date}.json`;

		fs.readFile(fileName, (err, fileContent) => {

			if (err) {
				if (err.code == "ENOENT") {
					console.log("creating dir", `./data/reddit-${channel}`)
					fs.mkdirSync(`./data/reddit-${channel}`, { recursive: true })
				} else {
					console.log(err)
					return
				}

				write(fileName, items)
				return
			} else {
				console.log("file exists", fileName)
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

}

function write(fileName: string, items: { title: string; link: string; published: string; }[]) {
	fs.writeFile(fileName, JSON.stringify(items), (err) => {
		if (err) {
			console.error("Error saving file: ", err);
		}
	});
}