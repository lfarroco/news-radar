import { connect } from "./db.ts";
import scanner from "./scanner.ts";
import candidates from "./candidates.ts";
import scrapper from "./scrapper.ts";
import writer from "./writer.ts";

export default async (hostname = "localhost", port = 15432) => {

	await connect(hostname, port)

	await scanner()

	await candidates()

	await scrapper()

	await writer()

}