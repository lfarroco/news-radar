export function createArticleURL(id: number, date: Date) {
	const formattedDate = date.toISOString().split('T')[0].replace(/-/g, '/');
	const datePath = `articles/${formattedDate}`;
	return {
		publicDatePath: `./public/${datePath}`,
		datePath,
		path: `${datePath}/${id}.html`,
		publicPath: `./public/${datePath}/${id}.html`,
	};
}
