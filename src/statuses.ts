export const CANDIDATE_STATUSES = [
	"pending",
	"researched",
	"published",
	"rejected",
	"editor-error",
	"writer-error",
] as const;

export type CandidateStatus = typeof CANDIDATE_STATUSES[number];

export const ARTICLE_TASK_STATUSES = [
	"pending",
	"in_progress",
	"completed",
	"failed",
] as const;

export type ArticleTaskStatus = typeof ARTICLE_TASK_STATUSES[number];

// Documented state transitions as implemented by scanner/editor/writer.
export const CANDIDATE_STATUS_TRANSITIONS: ReadonlyArray<readonly [CandidateStatus, CandidateStatus]> = [
	["pending", "researched"],
	["pending", "rejected"],
	["pending", "editor-error"],
	["researched", "published"],
	["researched", "writer-error"],
	["researched", "rejected"],
	["editor-error", "pending"],
	["writer-error", "researched"],
];

export const ARTICLE_TASK_STATUS_TRANSITIONS: ReadonlyArray<
	readonly [ArticleTaskStatus, ArticleTaskStatus]
> = [
	["pending", "in_progress"],
	["in_progress", "completed"],
	["in_progress", "failed"],
	["failed", "pending"],
];