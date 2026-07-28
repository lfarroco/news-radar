const toJsonControlEscape = (ch: string): string => {
	if (ch === "\n") return "\\n";
	if (ch === "\r") return "\\r";
	if (ch === "\t") return "\\t";
	return `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
};

const sanitizeJsonControlsStateful = (text: string): string => {
	let out = "";
	let inString = false;
	let escaping = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];

		if (inString) {
			if (escaping) {
				out += ch;
				escaping = false;
				continue;
			}

			if (ch === "\\") {
				out += ch;
				escaping = true;
				continue;
			}

			if (ch === '"') {
				out += ch;
				inString = false;
				continue;
			}

			const code = ch.charCodeAt(0);
			if (code <= 0x1f) {
				out += toJsonControlEscape(ch);
				continue;
			}

			out += ch;
			continue;
		}

		if (ch === '"') {
			out += ch;
			inString = true;
			continue;
		}

		const code = ch.charCodeAt(0);
		const isIllegalOutsideString = code <= 0x1f && ch !== "\n" && ch !== "\r" && ch !== "\t";
		out += isIllegalOutsideString ? " " : ch;
	}

	return out;
};

const parseJsonWithSanitization = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return JSON.parse(sanitizeJsonControlsStateful(text));
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