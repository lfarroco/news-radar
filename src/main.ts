import { connect } from "./db.ts";
import scanner from "./scanner.ts";
import candidates from "./candidates.ts";


export default async (hostname = "localhost", port = 15432) => {

	await connect(hostname, port)

	await scanner()

	await candidates()

}