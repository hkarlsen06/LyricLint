/**
 * The bounded history window: complete recent exchanges up to
 * `HISTORY_WINDOW_CHARS`, plus the question being asked. Older messages stay
 * on screen with a divider saying they were not included as model context —
 * `firstIncludedIndex` is where that divider goes.
 */
import type {
	AssistantMessageRecord,
	AssistantToolCallRecord,
	AssistantToolTurnRecord
} from '$lib/persistence/types.js';
import {
	HISTORY_WINDOW_CHARS,
	MAX_LINK_SUMMARIES,
	MAX_LINK_SUMMARY_CHARS,
	type AssistantLinkActionOutcome,
	type WireMessageV2,
	type WireToolResult
} from './types.js';
import { composeSectionLinks } from './link-actions.js';

export type WireMessage = Extract<WireMessageV2, { content: string }>;

export interface BoundedHistory {
	/** What the backend receives, oldest first, question last. */
	messages: WireMessage[];
	/** Index into the *source* history of the oldest message sent as context;
	 * `history.length` when no prior exchange was included. Everything before
	 * this index draws under the "not included as context" divider. */
	firstIncludedIndex: number;
}

function wireToolCall(call: AssistantToolCallRecord) {
	if (call.name === 'read_scribe') {
		return { callId: call.callId, name: call.name, arguments: '{}' };
	}
	if (call.name === 'propose_edits') {
		return {
			callId: call.callId,
			name: call.name,
			arguments: JSON.stringify({
				proposals: call.proposals.map(({ id, anchor, replacement, note, applyTo }) => ({
					id,
					anchor,
					replacement,
					note,
					applyTo: applyTo ?? 'linked_sections'
				}))
			})
		};
	}
	if (call.name === 'show_lyrics') {
		return {
			callId: call.callId,
			name: call.name,
			arguments: JSON.stringify({
				references: call.references.map(({ id, anchor, note }) => ({ id, anchor, note }))
			})
		};
	}
	return {
		callId: call.callId,
		name: call.name,
		arguments: JSON.stringify({
			actions: call.actions.map(({ id, action, headers, note }) => ({
				id,
				action,
				headers,
				note
			}))
		})
	};
}

/**
 * What a failure says to the model, as against what the card says to the
 * visitor. The record keeps the terse reason the card renders; the model needs
 * the repair, because the anchor it will otherwise send again is the one that
 * has just failed — which is exactly what it did, twice, burning the rounds
 * that would have covered the recovery. `ambiguous` in particular is nearly
 * always a stale line number rather than a badly chosen quote, so the sentence
 * names re-reading as the way out.
 */
const FAILURE_GUIDANCE: Record<string, string> = {
	ambiguous:
		"ambiguous: the quoted text appears more than once and no line matched one copy. The 'scribe has moved since you read it — call read_scribe again for fresh line numbers before re-proposing. The same anchor sent again will fail the same way.",
	'not-found':
		"not-found: the quoted text is not in the 'scribe as written. Read the 'scribe again and quote it exactly, prefix omitted.",
	'apply-failed': "apply-failed: the 'scribe changed before the edit could be applied."
};

function outcomeReason(reason: string): string {
	return FAILURE_GUIDANCE[reason] ?? reason;
}

function wireToolResult(
	call: AssistantToolCallRecord,
	grantedDraftText: string,
	sectionLinks: string[]
): WireToolResult | undefined {
	if (call.name === 'read_scribe') {
		if (!call.outcome) return undefined;
		return call.outcome === 'granted'
			? {
					callId: call.callId,
					name: call.name,
					result: {
						status: 'granted',
						draftText: grantedDraftText,
						...(sectionLinks.length > 0 ? { sectionLinks } : {})
					}
				}
			: { callId: call.callId, name: call.name, result: { status: 'denied' } };
	}
	const outcomesFor = (
		records: Array<{
			id: string;
			status: 'pending' | 'applied' | 'rejected' | 'failed';
			reason?: string;
		}>
	) => {
		if (records.some((record) => record.status === 'pending')) return undefined;
		return records.map((record) => {
			if (record.status === 'pending') {
				throw new Error('A pending tool action cannot be serialized as an outcome.');
			}
			return record.status === 'failed'
				? {
						id: record.id,
						status: record.status,
						...(record.reason ? { reason: outcomeReason(record.reason) } : {})
					}
				: { id: record.id, status: record.status };
		});
	};
	if (call.name === 'propose_edits') {
		const outcomes = outcomesFor(call.proposals);
		return outcomes ? { callId: call.callId, name: call.name, result: { outcomes } } : undefined;
	}
	if (call.name === 'show_lyrics') {
		// References resolve when the call arrives and are never pending, so a
		// live turn holding one is always serializable.
		return {
			callId: call.callId,
			name: call.name,
			result: {
				outcomes: call.references.map((reference) =>
					reference.status === 'failed'
						? {
								id: reference.id,
								status: reference.status,
								...(reference.reason ? { reason: outcomeReason(reference.reason) } : {})
							}
						: { id: reference.id, status: reference.status }
				)
			}
		};
	}
	const outcomes = outcomesFor(call.actions);
	return outcomes
		? {
				callId: call.callId,
				name: call.name,
				result: { outcomes: outcomes as AssistantLinkActionOutcome[] }
			}
		: undefined;
}

/**
 * Rebuild the private live suffix from the pending record. Tool traffic is
 * deliberately absent from `boundedHistory`, so it can never leak into a
 * later settled exchange.
 */
export function liveToolSuffix(
	toolTurns: AssistantToolTurnRecord[] | undefined,
	grantedDraftText: string,
	storedSectionLinks: Array<{ lines: number[] }> = []
): WireMessageV2[] {
	if (!toolTurns?.length) return [];
	const sectionLinks = composeSectionLinks(grantedDraftText, storedSectionLinks)
		.filter((summary) => summary.length <= MAX_LINK_SUMMARY_CHARS)
		.slice(0, MAX_LINK_SUMMARIES);
	const messages: WireMessageV2[] = [];
	for (const turn of toolTurns) {
		if (!turn.providerItems) throw new Error('A live tool turn is missing its provider items.');
		const results = turn.calls.map((call) => wireToolResult(call, grantedDraftText, sectionLinks));
		if (results.some((result) => !result)) {
			throw new Error('A live tool turn still has unresolved calls.');
		}
		messages.push({
			role: 'assistant',
			toolCalls: turn.calls.map(wireToolCall),
			providerItems: turn.providerItems
		});
		messages.push({ role: 'tool', results: results as WireToolResult[] });
	}
	return messages;
}

function wireContent(message: AssistantMessageRecord): string {
	return message.content;
}

/**
 * `history` is the settled conversation (no pending placeholder), `question`
 * the text being asked now. Only complete exchanges — a user turn and the
 * assistant answer it got — count as context; failed and interrupted turns are
 * skipped, because resending a question that got no answer as though it had
 * one misleads the model about its own transcript.
 */
export function boundedHistory(
	history: AssistantMessageRecord[],
	question: string
): BoundedHistory {
	const usable: Array<{ index: number; pair: WireMessage[] }> = [];
	for (let i = 0; i + 1 < history.length; i++) {
		const user = history[i]!;
		const assistant = history[i + 1]!;
		if (user.role === 'user' && assistant.role === 'assistant' && assistant.status === 'complete') {
			usable.push({
				index: i,
				pair: [
					{ role: 'user', content: wireContent(user) },
					{ role: 'assistant', content: wireContent(assistant) }
				]
			});
			i += 1;
		}
	}

	let budget = HISTORY_WINDOW_CHARS;
	const kept: Array<{ index: number; pair: WireMessage[] }> = [];
	for (let i = usable.length - 1; i >= 0; i--) {
		const exchange = usable[i]!;
		const cost = exchange.pair.reduce((sum, message) => sum + message.content.length, 0);
		if (cost > budget) break;
		budget -= cost;
		kept.unshift(exchange);
	}

	return {
		messages: [...kept.flatMap((exchange) => exchange.pair), { role: 'user', content: question }],
		firstIncludedIndex: kept[0]?.index ?? history.length
	};
}
