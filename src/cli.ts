export const runCli = async (
	run: () => Promise<void>,
	logError: (err: unknown) => void,
): Promise<number> => {
	try {
		await run();
		return 0;
	} catch (err) {
		logError(err);
		return 1;
	}
};