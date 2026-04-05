import { logger } from "../logger.ts";
import type { PipelineState } from "./state.ts";

// The publisher node triggers the Lume static site build.
// It delegates to deno task build so the site/ templates drive the output.
export const publisherNode = async (
	state: PipelineState,
): Promise<Partial<PipelineState>> => {
	logger.info({ written: state.writtenArticles.length }, "publisher: starting site build");

	const cmd = new Deno.Command("deno", {
		args: ["task", "build"],
		stdout: "piped",
		stderr: "piped",
	});

	const { success, stderr } = await cmd.output();

	if (!success) {
		const message = new TextDecoder().decode(stderr);
		logger.error({ message }, "publisher: lume build failed");
		return {
			errors: [{ node: "publisher", message }],
		};
	}

	logger.info("publisher: site built successfully");
	return {};
};
