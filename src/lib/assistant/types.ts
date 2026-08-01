/**
 * The rules-assistant contract, shared by the API client, the persistence
 * records, and the conversation UI. Mirrors the Worker's schema in
 * `services/rules-assistant/src/schema.ts`; the Worker validates, the browser
 * trusts only rule ids it can resolve against its own shipped corpus.
 */

export type AssistantAnswerScope = 'reviewed' | 'mixed' | 'general' | 'not-covered';

export interface AssistantAnswerBlock {
	/** 'general' is broader language guidance and never carries rule citations. */
	kind: 'prose' | 'example' | 'general';
	text: string;
	/** Validated rule ids whose compact canonical attachment follows this block. */
	ruleIds: string[];
	/** Reviewed source ids cited beyond the rules' own citations. */
	sourceIds: string[];
}

export interface StructuredAssistantAnswer {
	scope: AssistantAnswerScope;
	blocks: AssistantAnswerBlock[];
}

export interface AssistantQuota {
	browserRemaining: number;
	ipRemaining: number;
	resetsAt: string;
}

export interface AnswerResponse {
	requestId: string;
	assistant: StructuredAssistantAnswer;
	quota: AssistantQuota;
}

export type AssistantErrorCode =
	| 'invalid_request'
	| 'challenge_required'
	| 'challenge_failed'
	| 'request_in_progress'
	| 'rate_limited'
	| 'daily_limit_reached'
	| 'spend_limit_reached'
	| 'invalid_answer'
	| 'provider_error'
	| 'service_disabled'
	| 'offline'
	| 'not-configured';

export class AssistantError extends Error {
	readonly code: AssistantErrorCode;

	constructor(code: AssistantErrorCode, message?: string) {
		super(message ?? code);
		this.code = code;
	}
}

/** Complete recent exchanges sent to the backend, at most this many characters. */
export const HISTORY_WINDOW_CHARS = 24_000;

/** Matches the Worker's `maxQuestionChars`. */
export const MAX_QUESTION_CHARS = 2000;
