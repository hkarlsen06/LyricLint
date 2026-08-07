/**
 * The rules-assistant contract, shared by the API client, the persistence
 * records, and the conversation UI. Mirrors the Worker's schema in
 * `services/rules-assistant/src/schema.ts`; the Worker validates, the browser
 * trusts only rule ids it can resolve against its own shipped corpus.
 */

import type { TextEdit } from '$lib/core/types.js';

export type AssistantAnswerScope = 'reviewed' | 'mixed' | 'general' | 'not-covered' | 'draft-work';

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

/** The browser-executed capabilities the v2 assistant protocol exposes. */
export type AssistantToolName = 'read_scribe' | 'propose_edits' | 'manage_links' | 'show_lyrics';

/** An exact-text anchor emitted by the model instead of fragile document offsets. */
export interface AssistantProposalAnchor {
	exact: string;
	before: string;
	after: string;
	/** 1-based line `exact` begins on, from the numbered draft the model read.
	 * Null where the model could not name one; absent on proposals stored before
	 * the draft was numbered. */
	line?: number | null;
}

/** How one proposal interacts with any section links at its anchor. */
export type AssistantProposalApplyTarget = 'linked_sections' | 'this_section_only';

/** One minimal edit the assistant offers for explicit review. */
export interface AssistantProposal {
	id: string;
	anchor: AssistantProposalAnchor;
	replacement: string;
	note: string;
	/**
	 * Whether normal section-link propagation applies. Absent only on proposals
	 * stored before the scope was part of the tool contract; those retain the
	 * original `linked_sections` behaviour.
	 */
	applyTo?: AssistantProposalApplyTarget;
}

/**
 * One place in the 'scribe the assistant points at without proposing anything.
 * A proposal minus its replacement: the same anchor, and a note saying why the
 * place is being shown.
 */
export interface AssistantReference {
	id: string;
	anchor: AssistantProposalAnchor;
	note: string;
}

/**
 * A reference resolves when its call arrives and is never pending: there is no
 * decision to park a turn on. 'shown' is the record of the card drawing with a
 * live place behind it; hovering re-resolves against the text as it stands.
 */
export type AssistantReferenceRecord = AssistantReference &
	(
		| { status: 'shown'; reason?: never }
		| { status: 'failed'; reason?: AssistantAnchorFailureReason }
	);

/** The compact result returned to the model for one reference. */
export type AssistantReferenceOutcome =
	| { id: string; status: 'shown'; reason?: never }
	| { id: string; status: 'failed'; reason?: AssistantAnchorFailureReason };

/** One header address in a model-authored section-link action. */
export interface AssistantLinkHeader {
	/** The exact full header line, compared after trimming only its line edges. */
	text: string;
	/** Its 1-based occurrence among otherwise identical header lines. */
	occurrence: number;
}

/** One explicitly reviewable link or unlink operation. */
export interface AssistantLinkAction {
	id: string;
	action: 'link' | 'unlink';
	headers: AssistantLinkHeader[];
	note: string;
}

export type AssistantLinkFailureReason =
	'not-found' | 'not-linkable' | 'already-linked' | 'not-linked' | 'apply-failed';

/** The states retained while the user reviews a section-link operation. */
export type AssistantLinkActionRecord = AssistantLinkAction &
	(
		| { status: 'pending'; reason?: never }
		| { status: 'applied'; reason?: never }
		| { status: 'rejected'; reason?: never }
		| { status: 'failed'; reason?: AssistantLinkFailureReason }
	);

export type AssistantLinkActionOutcome =
	| { id: string; status: 'applied' | 'rejected'; reason?: never }
	| { id: string; status: 'failed'; reason?: AssistantLinkFailureReason };

/** The only two ways an exact-text anchor can fail to identify one range. */
export type AssistantAnchorFailureReason = 'not-found' | 'ambiguous';

/** A proposal resolved against the current draft and ready to preview or apply. */
export interface ResolvedAssistantProposal extends AssistantProposal {
	from: number;
	to: number;
	edits: TextEdit[];
}

/** The render-time result of resolving one proposal against the current draft. */
export type AssistantProposalResolution =
	| { ok: true; proposal: ResolvedAssistantProposal }
	| { ok: false; proposal: AssistantProposal; reason: AssistantAnchorFailureReason };

/** The states retained on a proposal while the user reviews a tool turn. */
export type AssistantProposalRecord = AssistantProposal &
	(
		| { status: 'pending'; reason?: never }
		| { status: 'applied'; reason?: never }
		| { status: 'rejected'; reason?: never }
		| { status: 'failed'; reason?: string }
	);

/** The compact result returned to the model after a proposal is acknowledged. */
export type AssistantProposalOutcome =
	| { id: string; status: 'applied' | 'rejected'; reason?: never }
	| { id: string; status: 'failed'; reason?: string };

/** A raw function call round-tripped through a live v2 assistant turn. */
export interface WireToolCall {
	callId: string;
	name: AssistantToolName;
	/** Provider arguments remain opaque until the Worker validates them. */
	arguments: string;
}

export type WireToolResult =
	| {
			callId: string;
			name: 'read_scribe';
			result:
				{ status: 'granted'; draftText: string; sectionLinks?: string[] } | { status: 'denied' };
	  }
	| {
			callId: string;
			name: 'propose_edits';
			result: { outcomes: AssistantProposalOutcome[] };
	  }
	| {
			callId: string;
			name: 'manage_links';
			result: { outcomes: AssistantLinkActionOutcome[] };
	  }
	| {
			callId: string;
			name: 'show_lyrics';
			result: { outcomes: AssistantReferenceOutcome[] };
	  };

/**
 * A v2 conversation message. Settled history uses content messages; tool calls,
 * encrypted provider state, and tool results exist only in the live suffix.
 */
export type WireMessageV2 =
	| { role: 'user'; content: string }
	| { role: 'assistant'; content: string }
	| { role: 'assistant'; toolCalls: WireToolCall[]; providerItems: string }
	| { role: 'tool'; results: WireToolResult[] };

/** Calls in a streamed response have already had their arguments validated. */
export type AssistantToolCall =
	| { callId: string; name: 'read_scribe'; input: Record<string, never> }
	| {
			callId: string;
			name: 'propose_edits';
			input: { proposals: AssistantProposal[] };
	  }
	| {
			callId: string;
			name: 'manage_links';
			input: { actions: AssistantLinkAction[] };
	  }
	| {
			callId: string;
			name: 'show_lyrics';
			input: { references: AssistantReference[] };
	  };

/** The final structured answer returned by one model turn. */
export type AnswerTurnResponse = AnswerResponse & { kind: 'answer' };

/** A model turn paused while its browser-executed calls are resolved. */
export interface ToolCallsTurnResponse {
	kind: 'tool_calls';
	calls: AssistantToolCall[];
	providerItems: string;
	quota: AssistantQuota;
}

/** One POST ends either in an answer or in calls the browser must execute. */
export type TurnResponse = AnswerTurnResponse | ToolCallsTurnResponse;

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

/** Maximum browser-executed tool rounds within one logical user turn. */
export const MAX_TOOL_ROUNDS = 4;

/** Maximum proposals accepted in one `propose_edits` call. */
export const MAX_PROPOSALS = 8;

/** Maximum references accepted in one `show_lyrics` call. */
export const MAX_REFERENCES = 8;

/** Maximum operations accepted in one `manage_links` call. */
export const MAX_LINK_ACTIONS = 8;

/** Maximum addressed headers in one link operation. */
export const MAX_LINK_HEADERS = 12;

/** Maximum current link descriptions sent with a granted draft read. */
export const MAX_LINK_SUMMARIES = 64;

/** Maximum length of one current link description. */
export const MAX_LINK_SUMMARY_CHARS = 200;

/** Maximum draft text exposed by a granted `read_scribe` call. */
export const MAX_DRAFT_CHARS = 30_000;
