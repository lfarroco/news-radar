export const hasPipelineErrors = (
	errors: Array<{ node: string; message: string; articleId?: number }> | undefined,
): boolean => (errors?.length ?? 0) > 0;
