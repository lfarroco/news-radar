const sanitizeJsonStrings = (text: string): string =>
	text.replace(
		/"(?:[^"\\]|\\.)*"/g,
		(match) =>
			// deno-lint-ignore no-control-regex
			match.replace(/[\x00-\x1f]/g, (ch) => {
				if (ch === "\n") return "\\n";
				if (ch === "\r") return "\\r";
				if (ch === "\t") return "\\t";
				return `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
			}),
	);

const sanitizeInvalidJsonControls = (text: string): string =>
	// deno-lint-ignore no-control-regex
	text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ");

const parseJsonWithSanitization = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		const sanitizedStrings = sanitizeJsonStrings(text);
		try {
			return JSON.parse(sanitizedStrings);
		} catch {
			return JSON.parse(sanitizeInvalidJsonControls(sanitizedStrings));
		}
	}
};

export const extractJsonFromLlmText = (text: string): unknown => {
	const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
	if (fenceMatch) {
		return parseJsonWithSanitization(fenceMatch[1].trim());
	}

	const braceMatch = text.match(/\{[\s\S]*\}/);
	if (braceMatch) {
		return parseJsonWithSanitization(braceMatch[0]);
	}

	return parseJsonWithSanitization(text);
};