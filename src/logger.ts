import pino from "pino";

export const logger = pino({
	level: Deno.env.get("LOG_LEVEL") ?? "info",
	transport:
		Deno.env.get("LOG_PRETTY") === "true"
			? { target: "pino-pretty", options: { colorize: true } }
			: undefined,
});
