import { z } from "zod";

const configSchema = z.object({
	OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
	DATABASE_URL: z.string().optional(),
	LANGCHAIN_API_KEY: z.string().optional(),
	LANGCHAIN_TRACING_V2: z.enum(["true", "false"]).optional(),
	LANGCHAIN_PROJECT: z.string().optional().default("news-radar"),
	TAVILY_API_KEY: z.string().optional(),
	OPENAI_MODEL: z.string().optional().default("gpt-4o-mini"),
	DB_HOST: z.string().optional().default("postgres"),
	DB_PORT: z.string().optional().default("5432"),
	DB_USER: z.string().optional().default("root"),
	DB_PASSWORD: z.string().optional().default("root"),
	DB_NAME: z.string().optional().default("root"),
});

export type Config = z.infer<typeof configSchema>;

export const loadConfig = (): Config => {
	const raw = {
		OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY"),
		DATABASE_URL: Deno.env.get("DATABASE_URL"),
		LANGCHAIN_API_KEY: Deno.env.get("LANGCHAIN_API_KEY"),
		LANGCHAIN_TRACING_V2: Deno.env.get("LANGCHAIN_TRACING_V2"),
		LANGCHAIN_PROJECT: Deno.env.get("LANGCHAIN_PROJECT"),
		TAVILY_API_KEY: Deno.env.get("TAVILY_API_KEY"),
		OPENAI_MODEL: Deno.env.get("OPENAI_MODEL"),
		DB_HOST: Deno.env.get("DB_HOST"),
		DB_PORT: Deno.env.get("DB_PORT"),
		DB_USER: Deno.env.get("DB_USER"),
		DB_PASSWORD: Deno.env.get("DB_PASSWORD"),
		DB_NAME: Deno.env.get("DB_NAME"),
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


