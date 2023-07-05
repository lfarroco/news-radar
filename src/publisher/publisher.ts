import publishIndex from "./publish_index.ts";
import publishArticles from "./publish_articles.ts";
import publishCategories from "./publish_categories.ts";
import publishCategoriesIndex from "./publish_categories_index.ts";
import publishArchives from "./publish_archives.ts";

export default async () => {
  await publishIndex();
  await publishArticles();
  await publishCategories();
  await publishCategoriesIndex();
  await publishArchives();
}
