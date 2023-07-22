import { connect } from "./db.ts";
import scanner from "./scanner.ts";
import candidates from "./candidates.ts";
import scrapper from "./scrapper.ts";
import writer from "./writer.ts";
import lume from "./lume.ts"

await connect("postgres", 5432)

await scanner()

await candidates()

await scrapper()

await writer()

await lume()