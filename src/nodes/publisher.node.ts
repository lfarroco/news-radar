import { logger } from "../logger.ts";
import type { PipelineState } from "../graph/state.ts";

// The publisher node triggers the Lume static site build.
// It delegates to deno task build so the site/ templates drive the output.
export const publisherNode = async (
	state: PipelineState,
): Promise<Partial<PipelineState>> => {
	const startedAt = Date.now();
	logger.info(
		{ written: state.publishedArticles.length },
		"publisher: starting site build",
	);

	const cmd = new Deno.Command("deno", {
		args: ["task", "build"],
		stdout: "piped",
		stderr: "piped",
	});

	const { success, stdout, stderr } = await cmd.output();
	const stdoutText = new TextDecoder().decode(stdout);
	const stderrText = new TextDecoder().decode(stderr);

	if (!success) {
		logger.error(
			{ stderr: stderrText, stdout: stdoutText, durationMs: Date.now() - startedAt },
			"publisher: lume build failed",
		);
		return {
			errors: [{ node: "publisher", message: stderrText || stdoutText }],
		};
	}

	logger.info(
		{
			durationMs: Date.now() - startedAt,
			stdoutChars: stdoutText.length,
		},
		"publisher: site built successfully",
	);

	if (stdoutText.trim().length > 0) {
		logger.debug({ output: stdoutText }, "publisher: build output");
	}

	if (stderrText.trim().length > 0) {
		logger.warn({ output: stderrText }, "publisher: build stderr output");
	}

	return {};
};
