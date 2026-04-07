import { z } from "zod";

const configSchema = z.object({
	GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required"),
	DATABASE_URL: z.string().optional(),
	LANGCHAIN_API_KEY: z.string().optional(),
	LANGCHAIN_TRACING_V2: z.enum(["true", "false"]).optional(),
	LANGCHAIN_PROJECT: z.string().optional().default("news-radar"),
	GROQ_MODEL: z.string().optional().default("llama-3.3-70b-versatile"),
	DB_HOST: z.string().optional().default("postgres"),
	DB_PORT: z.string().optional().default("5432"),
	DB_USER: z.string().optional().default("root"),
	DB_PASSWORD: z.string().optional().default("root"),
	DB_NAME: z.string().optional().default("root"),
	API_PORT: z.string().optional().default("8000"),
	PROJECT_ROOT: z.string().optional().default("/usr/src/app"),
});

export type Config = z.infer<typeof configSchema>;

export const loadConfig = (): Config => {
	const raw = {
		GROQ_API_KEY: Deno.env.get("GROQ_API_KEY"),
		DATABASE_URL: Deno.env.get("DATABASE_URL"),
		LANGCHAIN_API_KEY: Deno.env.get("LANGCHAIN_API_KEY"),
		LANGCHAIN_TRACING_V2: Deno.env.get("LANGCHAIN_TRACING_V2"),
		LANGCHAIN_PROJECT: Deno.env.get("LANGCHAIN_PROJECT"),
		GROQ_MODEL: Deno.env.get("GROQ_MODEL"),
		DB_HOST: Deno.env.get("DB_HOST"),
		DB_PORT: Deno.env.get("DB_PORT"),
		DB_USER: Deno.env.get("DB_USER"),
		DB_PASSWORD: Deno.env.get("DB_PASSWORD"),
		DB_NAME: Deno.env.get("DB_NAME"),
		API_PORT: Deno.env.get("API_PORT"),
		PROJECT_ROOT: Deno.env.get("PROJECT_ROOT"),
	};

	const result = configSchema.safeParse(raw);

	if (!result.success) {
		const issues = result.error.issues
			.map((i) => `  - ${i.path.join(".")}: ${i.message}`)
			.join("\n");
		throw new Error(`Invalid configuration:\n${issues}`);
	}

	return result.data;
};


