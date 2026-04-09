import pino from "pino";

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

type AppLogger = {
	trace: (obj?: unknown, msg?: string) => void;
	debug: (obj?: unknown, msg?: string) => void;
	info: (obj?: unknown, msg?: string) => void;
	warn: (obj?: unknown, msg?: string) => void;
	error: (obj?: unknown, msg?: string) => void;
	fatal: (obj?: unknown, msg?: string) => void;
	child: (_bindings: Record<string, unknown>) => AppLogger;
};

const LEVEL_ORDER: Record<LogLevel, number> = {
	trace: 10,
	debug: 20,
	info: 30,
	warn: 40,
	error: 50,
	fatal: 60,
};

const normalizeLevel = (value: string | undefined): LogLevel => {
	const normalized = (value ?? "info").toLowerCase();
	switch (normalized) {
		case "trace":
		case "debug":
		case "info":
		case "warn":
		case "error":
		case "fatal":
			return normalized as LogLevel;
		default:
			return "info";
	}
};

const extractMessage = (obj?: unknown, msg?: string): string => {
	if (typeof msg === "string" && msg.length > 0) return msg;
	if (typeof obj === "string" && obj.length > 0) return obj;
	if (obj instanceof Error) return obj.message;
	if (obj && typeof obj === "object") {
		const objectMsg = (obj as { msg?: unknown }).msg;
		if (typeof objectMsg === "string" && objectMsg.length > 0) return objectMsg;
	}
	return "";
};

const createMessageOnlyLogger = (): AppLogger => {
	const minLevel = normalizeLevel(Deno.env.get("LOG_LEVEL"));

	const shouldLog = (level: LogLevel): boolean => {
		return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
	};

	const log = (level: LogLevel, obj?: unknown, msg?: string) => {
		if (!shouldLog(level)) return;
		const message = extractMessage(obj, msg);
		if (!message) return;
		if (level === "error" || level === "fatal") {
			console.error(message);
			return;
		}
		if (level === "warn") {
			console.warn(message);
			return;
		}
		console.log(message);
	};

	const loggerInstance: AppLogger = {
		trace: (obj?: unknown, msg?: string) => log("trace", obj, msg),
		debug: (obj?: unknown, msg?: string) => log("debug", obj, msg),
		info: (obj?: unknown, msg?: string) => log("info", obj, msg),
		warn: (obj?: unknown, msg?: string) => log("warn", obj, msg),
		error: (obj?: unknown, msg?: string) => log("error", obj, msg),
		fatal: (obj?: unknown, msg?: string) => log("fatal", obj, msg),
		child: (_bindings: Record<string, unknown>) => loggerInstance,
	};

	return loggerInstance;
};

const useMessageOnlyLogs = Deno.env.get("LOG_MSG_ONLY") !== "false";

export const logger: AppLogger = useMessageOnlyLogs
	? createMessageOnlyLogger()
	: pino({
		level: Deno.env.get("LOG_LEVEL") ?? "info",
		transport:
			Deno.env.get("LOG_PRETTY") === "true"
				? { target: "pino-pretty", options: { colorize: true } }
				: undefined,
	});
