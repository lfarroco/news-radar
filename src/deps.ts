import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { parseFeed } from "https://deno.land/x/rss/mod.ts";
import * as cheerio from "npm:cheerio@1.0.0-rc.12";
import { slug } from "https://deno.land/x/slug/mod.ts";

export { Client, parseFeed, cheerio, slug }
