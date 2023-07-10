import { Client } from "./deps.ts";

export let client: Client;

export const connect = async (hostname: string, port: number) => {
  client = new Client({
    user: "root",
    hostname,
    password: 'root',
    database: "root",
    port,
  });

  await client.connect();
}
