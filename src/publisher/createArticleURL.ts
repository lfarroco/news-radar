export function createArticleURL(id: number, date: Date) {
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const datePath = `articles/${year}/${month}/${day}`;
	return {
		publicDatePath: `./public/${datePath}`,
		datePath,
		path: `${datePath}/${id}.html`,
		publicPath: `./public/${datePath}/${id}.html`,
	};
}
