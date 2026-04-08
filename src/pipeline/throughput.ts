export type WriterQueueHealth = {
    pendingTasks: number;
    failedLast24h: number;
    completedLast24h: number;
};

const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

export const computeWriterTaskBudget = (
    baseMaxTasks: number,
    health: WriterQueueHealth,
): number => {
    const safeBase = Math.max(1, Math.trunc(baseMaxTasks));
    const pending = Math.max(0, Math.trunc(health.pendingTasks));
    const failed = Math.max(0, Math.trunc(health.failedLast24h));
    const completed = Math.max(0, Math.trunc(health.completedLast24h));

    let budget = safeBase;

    if (pending >= 50) {
        budget += 4;
    } else if (pending >= 20) {
        budget += 2;
    }

    const totalRecentAttempts = failed + completed;
    const recentFailureRate = totalRecentAttempts > 0 ? failed / totalRecentAttempts : 0;

    if (recentFailureRate >= 0.5) {
        budget -= 2;
    } else if (recentFailureRate >= 0.3) {
        budget -= 1;
    }

    return clamp(budget, 1, 12);
};