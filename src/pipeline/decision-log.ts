type DecisionLogLevel = "info" | "warn" | "error";

type DecisionLog = {
	info: (obj: unknown, msg?: string) => void;
	warn: (obj: unknown, msg?: string) => void;
	error: (obj: unknown, msg?: string) => void;
};

type DecisionFields = {
	topic?: string;
	title?: string;
	url?: string;
	category?: string;
	reason?: string;
	[key: string]: unknown;
};

const quoteIfNeeded = (value: string): string => {
	const escaped = value.replaceAll('"', "'").trim();
	return `"${escaped}"`;
};

const toField = (key: string, value: unknown): string | null => {
	if (value === undefined || value === null) return null;
	if (typeof value === "string") {
		const normalized = value.trim();
		if (normalized.length === 0) return null;
		return `${key}=${quoteIfNeeded(normalized)}`;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return `${key}=${String(value)}`;
	}
	return `${key}=${quoteIfNeeded(JSON.stringify(value))}`;
};

export const formatDecisionFields = (fields: DecisionFields): string => {
	return Object.entries(fields)
		.map(([key, value]) => toField(key, value))
		.filter((entry): entry is string => entry !== null)
		.join(" ");
};

export const logDecision = (
	logger: DecisionLog,
	level: DecisionLogLevel,
	stage: string,
	action: string,
	fields: DecisionFields,
	bindings: unknown = fields,
): void => {
	const details = formatDecisionFields(fields);
	const message = details.length > 0 ? `${stage}: ${action} ${details}` : `${stage}: ${action}`;
	logger[level](bindings, message);
};