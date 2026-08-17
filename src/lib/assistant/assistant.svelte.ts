/**
 * The one assistant conversation state, owned by the root-level host so every
 * entry point sees the same transcript and a live browser-executed tool turn.
 */
import { getContext, setContext, untrack } from 'svelte';
import { occurrenceAt, resolveAnchor, type AnchorOccurrence } from '$lib/core/text-anchors.js';
import { diffWords } from '$lib/core/word-diff.js';
import type { AtomicDocumentEdit, TextRange } from '$lib/core/types.js';
import type {
	AssistantChatRecord,
	AssistantMessageRecord,
	AssistantToolCallRecord,
	AssistantToolTurnRecord
} from '$lib/persistence/types.js';
import { currentRuleSet } from '$lib/rules/data/rule-set.js';
import { askAssistant, type AskOptions } from './api.js';
import { browserChatLocks, withChatLock, type ChatLockOutcome } from './chat-lock.js';
import { nowIso, type AssistantChatRepository } from './chat-repository.js';
import type { AssistantDraftBridge } from './draft-bridge.js';
import { boundedHistory, liveToolSuffix } from './history.js';
import { resolveLinkAction } from './link-actions.js';
import {
	clearDraftAccess,
	getDraftAccess,
	setDraftAccess,
	type DraftAccessDecision
} from './permissions.js';
import {
	AssistantError,
	MAX_DRAFT_CHARS,
	MAX_QUESTION_CHARS,
	MAX_TOOL_ROUNDS,
	type AssistantErrorCode,
	type AssistantLinkAction,
	type AssistantLinkActionRecord,
	type AssistantLinkFailureReason,
	type AssistantProposal,
	type AssistantProposalAnchor,
	type AssistantProposalRecord,
	type AssistantQuota,
	type AssistantReference,
	type AssistantReferenceRecord,
	type TurnResponse
} from './types.js';

export interface AssistantDeps {
	/** Lazy so nothing opens Dexie until the assistant is first used. */
	repository(): Promise<AssistantChatRepository>;
	ask(options: AskOptions): Promise<TurnResponse>;
	ruleSetVersion: string;
	/** The lock manager conversations are written under, supplied by the shipped
	 * wiring — see `browserChatLocks`. Absent or `null`, writes are unguarded,
	 * which is what a browser with no Web Locks gets anyway. */
	locks?: LockManager | null;
	/** Test seams for the otherwise appMetadata-backed permission decision. */
	getDraftAccess?(draftId: string): Promise<DraftAccessDecision | undefined>;
	setDraftAccess?(draftId: string, decision: DraftAccessDecision): Promise<void>;
	clearDraftAccess?(draftId: string): Promise<void>;
}

export interface AssistantFailure {
	code: AssistantErrorCode;
	message: string;
}

export interface AssistantToolSession {
	assistantMessageId: string;
	phase: 'awaiting-permission' | 'awaiting-review' | 'continuing';
}

const FAILURE_MESSAGES: Record<AssistantErrorCode, string> = {
	invalid_request: 'That question could not be sent. Shorten it and try again.',
	challenge_required: 'Quick check that you are human, then your question goes through.',
	challenge_failed: 'The check did not pass. Try it again.',
	request_in_progress: 'One question at a time — the last one is still being answered.',
	rate_limited: 'A little fast. Wait a moment and try again.',
	daily_limit_reached: 'The daily limit for this browser is used up. It resets at midnight UTC.',
	spend_limit_reached: 'The assistant has reached its daily budget. It resets at midnight UTC.',
	invalid_answer:
		'The model returned an answer that failed validation. Nothing was shown; try again.',
	provider_error: 'The model is unavailable right now. Try again in a moment.',
	service_disabled: 'The assistant is switched off right now.',
	offline: 'You are offline. The assistant needs a connection; the linter does not.',
	'not-configured': 'The assistant is not configured in this build.'
};

const TOOL_ROUND_FAILURE = `The assistant may use 'scribe tools at most ${MAX_TOOL_ROUNDS} times in one turn.`;

/** Named rather than queued: see `chat-lock.ts` on why the second tab is
 * refused. `request_in_progress` is the code for exactly this state and the
 * message is overridden because the tab it names is not this one. */
const CHAT_HELD_ELSEWHERE = 'This conversation is answering in another tab.';

function chatTitle(question: string): string {
	const line = question.trim().split('\n')[0] ?? '';
	return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line || 'New chat';
}

/**
 * The per-item records a call carries. A `show_lyrics` reference resolves the
 * moment its call arrives and is never pending, so a turn made only of
 * references acknowledges itself and the loop continues without a decision.
 */
function callRecords(
	call: Exclude<AssistantToolCallRecord, { name: 'read_scribe' }>
): Array<{ status: 'pending' | 'shown' | 'applied' | 'rejected' | 'failed' }> {
	if (call.name === 'propose_edits') return call.proposals;
	if (call.name === 'manage_links') return call.actions;
	return call.references;
}

function callsAcknowledged(calls: AssistantToolCallRecord[]): boolean {
	return calls.every((call) =>
		call.name === 'read_scribe'
			? call.outcome !== undefined
			: callRecords(call).every((record) => record.status !== 'pending')
	);
}

function phaseFor(calls: AssistantToolCallRecord[]): AssistantToolSession['phase'] {
	if (calls.some((call) => call.name === 'read_scribe' && !call.outcome)) {
		return 'awaiting-permission';
	}
	if (
		calls.some(
			(call) =>
				call.name !== 'read_scribe' &&
				callRecords(call).some((record) => record.status === 'pending')
		)
	) {
		return 'awaiting-review';
	}
	return 'continuing';
}

/**
 * The calls a restored turn is still waiting on the user for, or undefined
 * where there is nothing to wait on.
 *
 * A turn parked on an unanswered tool call is not an interrupted request: it
 * waits on a person rather than on the network, and everything its
 * continuation needs — the calls, the outcomes recorded so far, and every
 * round's `providerItems` — is on the record, so the request the decision
 * sends is byte for byte the one the lost session would have sent. A turn cut
 * off mid-stream has none of that, and is swept.
 */
function decisionPending(
	message: AssistantMessageRecord | undefined
): AssistantToolCallRecord[] | undefined {
	if (!message || message.role !== 'assistant' || message.status !== 'pending') return undefined;
	const turns = message.toolTurns;
	const latest = turns?.at(-1);
	if (!turns || !latest || callsAcknowledged(latest.calls)) return undefined;
	// `liveToolSuffix` throws on a round with no provider items, and a resume
	// that throws is a worse answer than the sweep this would spare the turn
	// from — the completing patch strips them, so only a live turn has them.
	return turns.every((turn) => turn.providerItems) ? latest.calls : undefined;
}

function linkFailure(
	bridge: AssistantDraftBridge | undefined,
	action: AssistantLinkAction
): AssistantLinkFailureReason | undefined {
	if (!bridge) return 'not-found';
	const resolution = resolveLinkAction(bridge.readText(), action);
	if (!resolution.ok) return resolution.reason;
	if (!bridge.linkableSections(resolution.headerLines)) return 'not-linkable';
	const groups = bridge.sectionLinks();
	if (action.action === 'link') {
		return groups.some((group) =>
			resolution.headerLines.every((line) => group.lines.includes(line))
		)
			? 'already-linked'
			: undefined;
	}
	return groups.some((group) => group.lines.includes(resolution.headerLines[0]!))
		? undefined
		: 'not-linked';
}

function resolveLinkForRecord(
	bridge: AssistantDraftBridge | undefined,
	action: AssistantLinkAction
): AssistantLinkActionRecord {
	const reason = linkFailure(bridge, action);
	return reason ? { ...action, status: 'failed', reason } : { ...action, status: 'pending' };
}

function resolveForRecord(
	proposal: AssistantProposal,
	document: string | undefined
): AssistantProposalRecord {
	if (document === undefined) return { ...proposal, status: 'failed', reason: 'not-found' };
	const resolution = resolveAnchor(document, proposal.anchor);
	if (!resolution.ok) return { ...proposal, status: 'failed', reason: resolution.reason };
	// Pin the copy here, while the 'scribe still looks the way the model read
	// it. Approving the earlier proposals in this same batch is what moves the
	// later ones' line numbers out from under them.
	const occurrence = occurrenceAt(document, proposal.anchor.exact, resolution.from);
	return { ...proposal, status: 'pending', ...(occurrence ? { occurrence } : {}) };
}

function resolveReferenceForRecord(
	reference: AssistantReference,
	document: string | undefined
): AssistantReferenceRecord {
	if (document === undefined) return { ...reference, status: 'failed', reason: 'not-found' };
	const resolution = resolveAnchor(document, reference.anchor);
	if (!resolution.ok) return { ...reference, status: 'failed', reason: resolution.reason };
	// A reference re-resolves on every hover, long after the proposals in the
	// same turn have moved the lines under it, so it is pinned for the same
	// reason a proposal is.
	const occurrence = occurrenceAt(document, reference.anchor.exact, resolution.from);
	return { ...reference, status: 'shown', ...(occurrence ? { occurrence } : {}) };
}

function atomicProposalEdit(
	bridge: AssistantDraftBridge,
	proposal: AssistantProposal & { occurrence?: AnchorOccurrence }
): { edit: AtomicDocumentEdit; range: TextRange } | { reason: 'not-found' | 'ambiguous' } {
	// Against the text as it stands, never the snapshot the call arrived on:
	// the visitor may have typed since. The pin recorded then is what keeps a
	// repeated line resolvable after the proposals above it have been applied.
	const resolution = resolveAnchor(bridge.readText(), proposal.anchor, proposal.occurrence);
	if (!resolution.ok) return { reason: resolution.reason };
	const edit: AtomicDocumentEdit = {
		baseRevision: bridge.revision(),
		edits: diffWords(proposal.anchor.exact, proposal.replacement).map((change) => ({
			...change,
			from: change.from + resolution.from,
			to: change.to + resolution.from
		}))
	};
	return {
		edit,
		// One link difference spans only the changed runs, not unchanged anchor
		// context that should continue to behave like shared text.
		range: editedSpan(edit) ?? { from: resolution.from, to: resolution.to }
	};
}

/**
 * The span a proposal's edits cover, from the first change's start to the
 * last one's end — which is the whole of what the card's diff is about,
 * shared context aside. Undefined where a proposal changes nothing, since
 * there is then nothing to scroll to.
 */
function editedSpan(edit: AtomicDocumentEdit): TextRange | undefined {
	if (edit.edits.length === 0) return undefined;
	return {
		from: Math.min(...edit.edits.map((one) => one.from)),
		to: Math.max(...edit.edits.map((one) => one.to))
	};
}

function withoutProviderItems(turns: AssistantToolTurnRecord[] | undefined) {
	// Rest-spread, not a field list: a listed copier silently drops whatever
	// field the record gains next (it already dropped `narration` once).
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the omitted field is the point
	return turns?.map(({ providerItems: _providerItems, ...turn }) => turn);
}

export function createAssistantState(deps: AssistantDeps) {
	let repositoryPromise: Promise<AssistantChatRepository> | undefined;
	let isOpen = $state(false);
	let ready = $state(false);
	let chats = $state<AssistantChatRecord[]>([]);
	let activeChatId = $state<string | undefined>(undefined);
	let messages = $state<AssistantMessageRecord[]>([]);
	let busy = $state(false);
	let quota = $state<AssistantQuota | undefined>(undefined);
	let failure = $state<AssistantFailure | undefined>(undefined);
	let challengePending = $state(false);
	let contextDividerIndex = $state<number | undefined>(undefined);
	// `$state.raw`, not `$state`: a proxied bridge would fail the identity
	// comparisons the unregister hand-back and the access-read guard rely on.
	let draftBridge = $state.raw<AssistantDraftBridge | undefined>(undefined);
	let draftAccessState = $state<DraftAccessDecision | undefined>(undefined);
	let toolSession = $state<AssistantToolSession | undefined>(undefined);
	let bridgeGeneration = 0;
	/** The attempt a challenge resumes. */
	let currentAttempt: { assistantMessageId: string } | undefined;

	const readAccess = deps.getDraftAccess ?? getDraftAccess;
	const writeAccess = deps.setDraftAccess ?? setDraftAccess;
	const removeAccess = deps.clearDraftAccess ?? clearDraftAccess;

	async function repository(): Promise<AssistantChatRepository> {
		repositoryPromise ??= deps.repository();
		return repositoryPromise;
	}

	/** The conversation this state is already inside. A second request for the
	 * same exclusive name would refuse itself, so a cycle that has the lock runs
	 * its inner attempt directly rather than asking for it twice. */
	let lockedChatId: string | undefined;

	/**
	 * Run a write cycle as this conversation's only writer, or report that
	 * another tab is in it. The flag is set from inside the granted callback, so
	 * it is true only while the lock genuinely is.
	 */
	async function withConversationLock<T>(
		chatId: string,
		work: () => Promise<T>
	): Promise<ChatLockOutcome<T>> {
		if (lockedChatId === chatId) return { held: true, value: await work() };
		return withChatLock(chatId, deps.locks ?? null, async () => {
			lockedChatId = chatId;
			try {
				return await work();
			} finally {
				lockedChatId = undefined;
			}
		});
	}

	function refuseHeldElsewhere(): void {
		failure = { code: 'request_in_progress', message: CHAT_HELD_ELSEWHERE };
	}

	let initializePromise: Promise<void> | undefined;

	/**
	 * A reload cannot resume the provider round a streaming answer was in the
	 * middle of, so a `pending` record in a chat about to be drawn is orphaned. A
	 * turn parked on an unanswered tool call is a different thing — it waits on
	 * the user, not on the network — so it is spared and re-seated instead.
	 *
	 * Swept one chat at a time, when that chat is loaded for display, rather than
	 * across the database at boot. The database is shared by every tab, and a
	 * global sweep is another tab's live stream marked interrupted the moment
	 * somebody opens the assistant on `/rules/`. Scoped, a chat nobody has opened
	 * is left alone, and a turn that really did die is still marked the next time
	 * anyone looks at it — which is the only moment the state is read.
	 */
	async function openChat(repo: AssistantChatRepository, chatId: string): Promise<void> {
		await repo.markPendingInterrupted(chatId, (message) => decisionPending(message) !== undefined);
		activeChatId = chatId;
		messages = await repo.messagesFor(chatId);
		restoreToolSession();
	}

	// Memoized on the in-flight promise, not on `ready` alone: `open()` and the
	// conversation surface's own `ensureLoaded()` run together on a dialog opened
	// with a question, and a second concurrent load would overwrite the messages
	// the first caller's `send()` had already appended.
	function initialize(): Promise<void> {
		initializePromise ??= (async () => {
			const repo = await repository();
			chats = await repo.listChats();
			const latest = chats[0];
			if (latest) await openChat(repo, latest.id);
			ready = true;
		})();
		return initializePromise;
	}

	/**
	 * A spared turn comes back with its prompt still drawn, and `toolSession` is
	 * what every decision control checks before it does anything — without it
	 * the Allow, Deny, Approve and Reject the transcript redraws are dead
	 * controls above a sentence saying the turn is over. Only the last message
	 * can hold one: a turn is answered or abandoned before the next question.
	 */
	function restoreToolSession(): void {
		const last = messages.at(-1);
		const calls = last ? decisionPending(last) : undefined;
		toolSession =
			last && calls ? { assistantMessageId: last.id, phase: phaseFor(calls) } : undefined;
	}

	/** Leaving a conversation abandons the decision it was waiting on; the
	 * record keeps it, so coming back re-seats the session through the same
	 * `restoreToolSession`. */
	function abandonToolSession(): void {
		toolSession = undefined;
		currentAttempt = undefined;
	}

	/** A tool turn is bound to the draft whose bridge produced it. Once that
	 * bridge changes, none of its parked decisions may be continued against the
	 * replacement draft. Keep the existing interrupted transcript state so the
	 * old controls become inert and retry remains the only recovery path. */
	function interruptToolSessionForDraftChange(): void {
		const assistantMessageId = toolSession?.assistantMessageId;
		if (!assistantMessageId) return;
		toolSession = undefined;
		currentAttempt = undefined;
		void patchMessage(assistantMessageId, { status: 'interrupted' }).catch((error) => {
			console.error('assistant_draft_switch_interrupt_failed', error);
		});
	}

	function fail(error: unknown): AssistantFailure {
		const code = error instanceof AssistantError ? error.code : 'provider_error';
		if (code !== 'challenge_required') {
			// A Turnstile challenge is routine; everything else the user only ever
			// sees as the worded FAILURE_MESSAGES entry. The cause — a client-side
			// bug, or the protocol layer's detail ("interrupted" vs "did not
			// finish" vs the worker's own error text) — is invisible everywhere
			// unless it is named here.
			console.error('assistant_turn_failed', error);
		}
		return { code, message: FAILURE_MESSAGES[code] };
	}

	async function patchMessage(
		assistantMessageId: string,
		update: Partial<AssistantMessageRecord>
	): Promise<void> {
		messages = messages.map((message) =>
			message.id === assistantMessageId ? { ...message, ...update } : message
		);
		// A patch routinely carries values read back out of `messages`, which are
		// `$state` proxies — and IndexedDB's structured clone refuses a proxy, so
		// the write dies as a DataCloneError mid-turn. Snapshot at this one choke
		// point rather than at every call site that might forget.
		await (
			await repository()
		).updateMessage(assistantMessageId, $state.snapshot(update) as Partial<AssistantMessageRecord>);
	}

	function currentMessage(assistantMessageId: string): AssistantMessageRecord | undefined {
		return messages.find((message) => message.id === assistantMessageId);
	}

	async function handleToolCalls(
		assistantMessageId: string,
		response: Extract<TurnResponse, { kind: 'tool_calls' }>
	): Promise<'continue' | 'wait' | 'failed'> {
		const message = currentMessage(assistantMessageId);
		const priorTurns = message?.toolTurns ?? [];
		quota = response.quota;
		if (priorTurns.length >= MAX_TOOL_ROUNDS) {
			failure = { code: 'invalid_answer', message: TOOL_ROUND_FAILURE };
			await patchMessage(assistantMessageId, { status: 'failed', content: TOOL_ROUND_FAILURE });
			currentAttempt = undefined;
			toolSession = undefined;
			return 'failed';
		}

		const bridge = draftBridge;
		const document = bridge?.readText();
		let storedDecision: DraftAccessDecision | undefined;
		if (response.calls.some((call) => call.name === 'read_scribe') && bridge) {
			storedDecision = await readAccess(bridge.draftId());
			draftAccessState = storedDecision;
		}
		const calls: AssistantToolCallRecord[] = response.calls.map((call) => {
			if (call.name === 'read_scribe') {
				return {
					callId: call.callId,
					name: call.name,
					...(storedDecision ? { outcome: storedDecision } : {})
				};
			}
			if (call.name === 'propose_edits') {
				return {
					callId: call.callId,
					name: call.name,
					proposals: call.input.proposals.map((proposal) => resolveForRecord(proposal, document))
				};
			}
			if (call.name === 'show_lyrics') {
				return {
					callId: call.callId,
					name: call.name,
					references: call.input.references.map((reference) =>
						resolveReferenceForRecord(reference, document)
					)
				};
			}
			return {
				callId: call.callId,
				name: call.name,
				actions: call.input.actions.map((action) => resolveLinkForRecord(bridge, action))
			};
		});
		const streamed = message?.answer;
		const turn: AssistantToolTurnRecord = {
			calls,
			providerItems: response.providerItems,
			...(streamed && streamed.blocks.length > 0 ? { narration: streamed } : {})
		};
		// The live answer slot resets with the turn recorded, or a round that
		// streams nothing shows — and would re-record — the previous narration.
		await patchMessage(assistantMessageId, {
			toolTurns: [...priorTurns, turn],
			answer: undefined
		});
		const phase = phaseFor(calls);
		toolSession = { assistantMessageId, phase };
		if (phase === 'continuing') return 'continue';
		busy = false;
		return 'wait';
	}

	async function attempt(assistantMessageId: string, turnstileToken?: string): Promise<void> {
		const repo = await repository();
		const assistantIndex = messages.findIndex((message) => message.id === assistantMessageId);
		const userMessage = assistantIndex > 0 ? messages[assistantIndex - 1] : undefined;
		if (assistantIndex === -1 || !userMessage || userMessage.role !== 'user' || !activeChatId)
			return;
		const chatId = activeChatId;

		// Every provider round and every record it writes belongs to one writer.
		// `send` and `retry` are already holding this conversation, so those come
		// through free; a resumed challenge and a settled tool decision are where
		// the lock is genuinely taken here, both being continuations that ran while
		// nothing was in flight and another tab could have stepped in.
		const outcome = await withConversationLock(chatId, () =>
			runAttempt(repo, chatId, assistantMessageId, assistantIndex, userMessage, turnstileToken)
		);
		if (!outcome.held) refuseHeldElsewhere();
	}

	async function runAttempt(
		repo: AssistantChatRepository,
		chatId: string,
		assistantMessageId: string,
		assistantIndex: number,
		userMessage: AssistantMessageRecord,
		turnstileToken?: string
	): Promise<void> {
		busy = true;
		failure = undefined;
		currentAttempt = { assistantMessageId };
		const showProgress = (answer: Extract<TurnResponse, { kind: 'answer' }>['assistant']) => {
			messages = messages.map((message) =>
				message.id === assistantMessageId ? { ...message, answer } : message
			);
		};
		const resetProgress = () => patchMessage(assistantMessageId, { answer: undefined });
		try {
			await patchMessage(assistantMessageId, { status: 'pending' });
			while (true) {
				const pending = currentMessage(assistantMessageId);
				if (!pending) return;
				const window = boundedHistory(messages.slice(0, assistantIndex - 1), userMessage.content);
				contextDividerIndex = window.firstIncludedIndex;
				const bridge = draftBridge;
				const draftText = bridge?.readText().slice(0, MAX_DRAFT_CHARS) ?? '';
				const response = await deps.ask({
					chatId,
					messages: [
						...window.messages,
						...liveToolSuffix(pending.toolTurns, draftText, bridge?.sectionLinks() ?? [])
					],
					clientRuleSetVersion: deps.ruleSetVersion,
					toolsAvailable: draftBridge !== undefined,
					onProgress: showProgress,
					onRetry: resetProgress,
					...(turnstileToken ? { turnstileToken } : {})
				});
				// A draft switch can interrupt a parked or in-flight tool turn while
				// its provider response is on the way back. Never let that late response
				// recreate the session against the replacement bridge.
				if (currentMessage(assistantMessageId)?.status !== 'pending') return;
				// A token is for the request it resumed, not every later tool round.
				turnstileToken = undefined;
				challengePending = false;
				if (response.kind === 'tool_calls') {
					const disposition = await handleToolCalls(assistantMessageId, response);
					if (disposition !== 'continue') return;
					continue;
				}

				currentAttempt = undefined;
				toolSession = undefined;
				quota = response.quota;
				await patchMessage(assistantMessageId, {
					status: 'complete',
					answer: response.assistant,
					requestId: response.requestId,
					content: response.assistant.blocks.map((block) => block.text).join('\n\n'),
					toolTurns: withoutProviderItems(pending.toolTurns)
				});
				await repo.touchChat(chatId);
				chats = await repo.listChats();
				return;
			}
		} catch (error) {
			const described = fail(error);
			failure = described;
			if (described.code === 'challenge_required' || described.code === 'challenge_failed') {
				// The message record is the continuation checkpoint the widget resumes.
				challengePending = true;
			} else {
				currentAttempt = undefined;
				toolSession = undefined;
				await patchMessage(assistantMessageId, { status: 'failed' });
			}
		} finally {
			busy = false;
		}
	}

	async function updateLatestTurn(
		assistantMessageId: string,
		update: (calls: AssistantToolCallRecord[]) => AssistantToolCallRecord[]
	): Promise<void> {
		const message = currentMessage(assistantMessageId);
		const turns = message?.toolTurns;
		const latest = turns?.at(-1);
		if (!turns || !latest) return;
		const nextCalls = update(latest.calls);
		const nextTurns = [...turns.slice(0, -1), { ...latest, calls: nextCalls }];
		await patchMessage(assistantMessageId, { toolTurns: nextTurns });
		const phase = phaseFor(nextCalls);
		toolSession = { assistantMessageId, phase };
		if (callsAcknowledged(nextCalls)) await attempt(assistantMessageId);
	}

	function pendingProposal(id: string): AssistantProposalRecord | undefined {
		const assistantMessageId = toolSession?.assistantMessageId;
		if (!assistantMessageId) return undefined;
		const calls = currentMessage(assistantMessageId)?.toolTurns?.at(-1)?.calls ?? [];
		for (const call of calls) {
			if (call.name !== 'propose_edits') continue;
			const proposal = call.proposals.find(
				(candidate) => candidate.id === id && candidate.status === 'pending'
			);
			if (proposal) return proposal;
		}
		return undefined;
	}

	function pendingLinkAction(id: string): AssistantLinkActionRecord | undefined {
		const assistantMessageId = toolSession?.assistantMessageId;
		if (!assistantMessageId) return undefined;
		const calls = currentMessage(assistantMessageId)?.toolTurns?.at(-1)?.calls ?? [];
		for (const call of calls) {
			if (call.name !== 'manage_links') continue;
			const action = call.actions.find(
				(candidate) => candidate.id === id && candidate.status === 'pending'
			);
			if (action) return action;
		}
		return undefined;
	}

	async function settleProposal(
		id: string,
		status: 'applied' | 'rejected' | 'failed',
		reason?: string
	): Promise<void> {
		const assistantMessageId = toolSession?.assistantMessageId;
		if (!assistantMessageId) return;
		const settled = (proposal: AssistantProposalRecord): AssistantProposalRecord => {
			if (status === 'failed') {
				return { ...proposal, status, ...(reason ? { reason } : {}) };
			}
			const offered: AssistantProposal = {
				id: proposal.id,
				anchor: proposal.anchor,
				replacement: proposal.replacement,
				note: proposal.note,
				...(proposal.applyTo ? { applyTo: proposal.applyTo } : {})
			};
			return status === 'applied'
				? { ...offered, status: 'applied' }
				: { ...offered, status: 'rejected' };
		};
		await updateLatestTurn(assistantMessageId, (calls) =>
			calls.map((call) =>
				call.name === 'propose_edits'
					? {
							...call,
							proposals: call.proposals.map((proposal) =>
								proposal.id === id && proposal.status === 'pending' ? settled(proposal) : proposal
							)
						}
					: call
			)
		);
	}

	async function settleLinkAction(
		id: string,
		status: 'applied' | 'rejected' | 'failed',
		reason?: AssistantLinkFailureReason
	): Promise<void> {
		const assistantMessageId = toolSession?.assistantMessageId;
		if (!assistantMessageId) return;
		await updateLatestTurn(assistantMessageId, (calls) =>
			calls.map((call) =>
				call.name === 'manage_links'
					? {
							...call,
							actions: call.actions.map((action): AssistantLinkActionRecord => {
								if (action.id !== id || action.status !== 'pending') return action;
								const base = {
									id: action.id,
									action: action.action,
									headers: action.headers,
									note: action.note
								};
								return status === 'failed'
									? { ...base, status, ...(reason ? { reason } : {}) }
									: { ...base, status };
							})
						}
					: call
			)
		);
	}

	return {
		get isOpen() {
			return isOpen;
		},
		get ready() {
			return ready;
		},
		get chats() {
			return chats;
		},
		get activeChatId() {
			return activeChatId;
		},
		get messages() {
			return messages;
		},
		get busy() {
			return busy;
		},
		get quota() {
			return quota;
		},
		get failure() {
			return failure;
		},
		get challengePending() {
			return challengePending;
		},
		get contextDividerIndex() {
			return contextDividerIndex;
		},
		get toolSession() {
			return toolSession;
		},
		get draftToolsAvailable() {
			return draftBridge !== undefined;
		},
		get draftAccessState() {
			return draftAccessState;
		},

		async open(): Promise<void> {
			isOpen = true;
			await initialize();
		},

		/**
		 * Load the stored conversation without opening the modal. The workbench
		 * panel is always mounted, so its transcript has to arrive without the
		 * side effect `open()` exists for.
		 */
		async ensureLoaded(): Promise<void> {
			await initialize();
		},

		/**
		 * The /rules/ prompt: open the modal and send in one gesture.
		 *
		 * Every question asked from that field starts its own chat, because that
		 * field is not in a conversation. `initialize()` re-seats the last chat the
		 * user had open — which is what the workbench panel and the modal's own
		 * composer want, since both are looking at the transcript they are adding
		 * to — so a question typed on the rule reference landed at the foot of a
		 * conversation the reader had not seen, possibly from another day, and the
		 * model answered it with that history as context. `newChat()` writes no
		 * record; `send()` is what creates one, so an empty question leaves the
		 * transcript alone rather than replacing it with a chat that never existed.
		 */
		async openWithQuestion(question: string): Promise<void> {
			await this.open();
			if (!question.trim()) return;
			await this.newChat();
			await this.send(question);
		},

		/** Closing never cancels a request; state lives here, not in the dialog. */
		close(): void {
			isOpen = false;
		},

		// None of these three refuse on `toolSession` any more, and dropping that
		// term unlocks exactly one state: a turn waiting on a decision. A round
		// actually in flight is `busy`, which still refuses. A decision is not in
		// flight — nothing is running, the record holds everything, and a session
		// restored at boot would otherwise trap the panel in a conversation whose
		// question the user no longer wants to answer.
		async newChat(): Promise<void> {
			if (busy || challengePending) return;
			await initialize();
			activeChatId = undefined;
			messages = [];
			abandonToolSession();
			failure = undefined;
			challengePending = false;
			contextDividerIndex = undefined;
		},

		async selectChat(id: string): Promise<void> {
			if (busy || challengePending) return;
			const repo = await repository();
			currentAttempt = undefined;
			// Opening a conversation is the moment its orphaned turns are drawn, so
			// it is the moment they are swept — see `openChat`.
			await openChat(repo, id);
			failure = undefined;
			challengePending = false;
			contextDividerIndex = undefined;
		},

		async deleteChat(id: string): Promise<void> {
			if (busy || challengePending) return;
			const repo = await repository();
			await repo.deleteChat(id);
			chats = await repo.listChats();
			if (activeChatId === id) {
				activeChatId = undefined;
				messages = [];
				abandonToolSession();
			}
		},

		/**
		 * Resolves `true` only when the question was consumed — a request actually
		 * started. A refusal a caller could only discover after an await (the
		 * conversation held by another tab) resolves `false`, so a composer that
		 * cleared itself optimistically can hand the question back.
		 */
		async send(question: string): Promise<boolean> {
			const text = question.trim();
			if (!text || busy || challengePending || toolSession) return false;
			if ([...text].length > MAX_QUESTION_CHARS) {
				failure = { code: 'invalid_request', message: FAILURE_MESSAGES.invalid_request };
				return false;
			}
			await initialize();
			const repo = await repository();
			if (!activeChatId) {
				const chat = await repo.createChat(chatTitle(text), deps.ruleSetVersion);
				activeChatId = chat.id;
				chats = await repo.listChats();
				messages = [];
			}
			const chatId = activeChatId;
			// The lock is taken before the first row is written, so a conversation
			// another tab is answering in takes nothing from this one: no question,
			// no placeholder, no `updatedAt`. A chat created just above cannot be
			// held anywhere — its id is minted in this call — so only a send into an
			// existing conversation can be refused here.
			const outcome = await withConversationLock(chatId, async () => {
				const user = await repo.addMessage({
					chatId,
					role: 'user',
					createdAt: nowIso(),
					status: 'complete',
					content: text
				});
				const placeholder = await repo.addMessage({
					chatId,
					role: 'assistant',
					createdAt: nowIso(),
					status: 'pending',
					content: ''
				});
				messages = [...messages, user, placeholder];
				await attempt(placeholder.id);
			});
			if (!outcome.held) refuseHeldElsewhere();
			return outcome.held;
		},

		/** Retry starts the logical turn over; provider state and old outcomes are not reusable. */
		async retry(assistantMessageId: string): Promise<void> {
			if (busy) return;
			const target = messages.find((message) => message.id === assistantMessageId);
			if (!target || target.role !== 'assistant' || target.status === 'complete') return;
			const chatId = activeChatId;
			if (!chatId) return;
			// The reset is inside the lock with the request it precedes: stripped
			// first and refused after, the record would lose the answer it still has
			// to a turn that never started.
			const outcome = await withConversationLock(chatId, async () => {
				toolSession = undefined;
				challengePending = false;
				await patchMessage(assistantMessageId, {
					status: 'pending',
					content: '',
					answer: undefined,
					requestId: undefined,
					toolTurns: undefined
				});
				await attempt(assistantMessageId);
			});
			if (!outcome.held) refuseHeldElsewhere();
		},

		/** The Turnstile widget passed; rebuild and resume the interrupted POST. */
		async submitChallenge(token: string): Promise<void> {
			const attemptRef = currentAttempt;
			challengePending = false;
			if (attemptRef) await attempt(attemptRef.assistantMessageId, token);
		},

		registerDraftBridge(bridge: AssistantDraftBridge): () => void {
			// Registration runs inside the workspace's own $effect, and this guard
			// reads the very state the registration writes — untracked, or the
			// effect depends on itself and boot never settles.
			untrack(() => {
				const previousDraftId = draftBridge?.draftId();
				if (toolSession && previousDraftId !== undefined && previousDraftId !== bridge.draftId()) {
					interruptToolSessionForDraftChange();
				}
			});
			draftBridge = bridge;
			draftAccessState = undefined;
			bridgeGeneration += 1;
			const generation = bridgeGeneration;
			void readAccess(bridge.draftId())
				.then((decision) => {
					if (generation === bridgeGeneration && draftBridge === bridge) {
						draftAccessState = decision;
					}
				})
				.catch(() => {
					// A disclosure read is advisory; a tool request repeats it on
					// the awaited path and reports a real persistence failure there.
				});
			return () => {
				if (draftBridge !== bridge) return;
				interruptToolSessionForDraftChange();
				bridge.clearPreview();
				draftBridge = undefined;
				draftAccessState = undefined;
				bridgeGeneration += 1;
			};
		},

		async allowDraftRead(): Promise<void> {
			const bridge = draftBridge;
			const assistantMessageId = toolSession?.assistantMessageId;
			if (!bridge || !assistantMessageId || toolSession?.phase !== 'awaiting-permission') return;
			await writeAccess(bridge.draftId(), 'granted');
			bridgeGeneration += 1;
			draftAccessState = 'granted';
			await updateLatestTurn(assistantMessageId, (calls) =>
				calls.map((call) =>
					call.name === 'read_scribe' && !call.outcome ? { ...call, outcome: 'granted' } : call
				)
			);
		},

		async denyDraftRead(): Promise<void> {
			const bridge = draftBridge;
			const assistantMessageId = toolSession?.assistantMessageId;
			if (!bridge || !assistantMessageId || toolSession?.phase !== 'awaiting-permission') return;
			await writeAccess(bridge.draftId(), 'denied');
			bridgeGeneration += 1;
			draftAccessState = 'denied';
			await updateLatestTurn(assistantMessageId, (calls) =>
				calls.map((call) =>
					call.name === 'read_scribe' && !call.outcome ? { ...call, outcome: 'denied' } : call
				)
			);
		},

		async approveProposal(id: string): Promise<void> {
			const bridge = draftBridge;
			const proposal = pendingProposal(id);
			if (!proposal) return;
			if (!bridge) {
				await settleProposal(id, 'failed', 'not-found');
				return;
			}
			const resolved = atomicProposalEdit(bridge, proposal);
			if ('reason' in resolved) {
				await settleProposal(id, 'failed', resolved.reason);
				return;
			}
			const applied =
				proposal.applyTo === 'this_section_only'
					? bridge.apply(resolved.edit, {
							applyTo: proposal.applyTo,
							range: resolved.range
						})
					: bridge.apply(resolved.edit);
			if (!applied) {
				await settleProposal(id, 'failed', 'apply-failed');
				return;
			}
			await settleProposal(id, 'applied');
		},

		async rejectProposal(id: string): Promise<void> {
			if (!pendingProposal(id)) return;
			await settleProposal(id, 'rejected');
		},

		async approveLinkAction(id: string): Promise<void> {
			const bridge = draftBridge;
			const action = pendingLinkAction(id);
			if (!action) return;
			const reason = linkFailure(bridge, action);
			if (reason) {
				await settleLinkAction(id, 'failed', reason);
				return;
			}
			const resolution = resolveLinkAction(bridge!.readText(), action);
			if (!resolution.ok) {
				await settleLinkAction(id, 'failed', resolution.reason);
				return;
			}
			const applied =
				action.action === 'link'
					? bridge!.linkSections(resolution.headerLines)
					: bridge!.unlinkSection(resolution.headerLines[0]!);
			await settleLinkAction(
				id,
				applied ? 'applied' : 'failed',
				applied ? undefined : 'apply-failed'
			);
		},

		async rejectLinkAction(id: string): Promise<void> {
			if (!pendingLinkAction(id)) return;
			await settleLinkAction(id, 'rejected');
		},

		previewProposal(id: string): boolean {
			const bridge = draftBridge;
			const proposal = pendingProposal(id);
			if (!bridge || !proposal) return false;
			const resolved = atomicProposalEdit(bridge, proposal);
			if ('reason' in resolved) return false;
			if (!bridge.preview(resolved.edit)) return false;
			// A diagnostic's preview deliberately never scrolls, because whatever
			// selected it has already brought its range into view. Nothing has
			// here: a proposal quotes a line the user did not navigate to and
			// usually cannot see, so a diff drawn in silence is a card claiming an
			// edit with no evidence anywhere on screen. The reveal is what makes
			// the preview readable, and it comes after the preview for the reason
			// `revealDiagnostic` states — CodeMirror applies queued scrolls in its
			// measure phase, so the deliberate placement has to be the last one
			// asked for. It moves no caret and no selection.
			const span = editedSpan(resolved.edit);
			if (span) bridge.reveal(span);
			return true;
		},

		endProposalPreview(id: string): void {
			void id;
			draftBridge?.clearPreview();
		},

		/**
		 * Show where a `show_lyrics` reference points: the selection wash moves
		 * onto the quoted range and the viewport scrolls to it, exactly as a
		 * proposal's preview reveals its diff — minus the diff, because a
		 * reference changes nothing.
		 *
		 * Deliberately not gated on the tool session: a proposal is an offer that
		 * expires with the turn, while a reference is an answer to "where", which
		 * stays true for as long as the text it quotes is still in the draft. It
		 * re-resolves at hover time, so a card restored against a draft that no
		 * longer carries the quote quietly reveals nothing.
		 */
		revealReference(anchor: AssistantProposalAnchor, occurrence?: AnchorOccurrence): boolean {
			const bridge = draftBridge;
			if (!bridge || anchor.exact.length === 0) return false;
			const resolution = resolveAnchor(bridge.readText(), anchor, occurrence);
			if (!resolution.ok) return false;
			bridge.reveal({ from: resolution.from, to: resolution.to });
			return true;
		},

		async revokeDraftAccess(): Promise<void> {
			const bridge = draftBridge;
			if (!bridge) return;
			await removeAccess(bridge.draftId());
			bridgeGeneration += 1;
			draftAccessState = undefined;
		}
	};
}

export type AssistantState = ReturnType<typeof createAssistantState>;

/** The production wiring: Dexie behind a lazy import, the real API client,
 * the shipped ruleset version, and the browser's own lock manager — this is the
 * one construction where two writers into a conversation are two tabs. */
export function createDefaultAssistantState(): AssistantState {
	return createAssistantState({
		locks: browserChatLocks(),
		async repository() {
			const [{ openDatabase }, { createAssistantChatRepository }] = await Promise.all([
				import('$lib/persistence/database.js'),
				import('./chat-repository.js')
			]);
			return createAssistantChatRepository(await openDatabase());
		},
		ask: askAssistant,
		ruleSetVersion: currentRuleSetVersion()
	});
}

function currentRuleSetVersion(): string {
	// The manifest is plain data with no rule implementations behind it, so
	// importing it here costs the bundle nothing it does not already carry.
	return currentRuleSet.version;
}

const CONTEXT_KEY = Symbol('lyriclint.assistant');

export function provideAssistantState(state: AssistantState): AssistantState {
	setContext(CONTEXT_KEY, state);
	return state;
}

export function useAssistantState(): AssistantState | undefined {
	return getContext<AssistantState | undefined>(CONTEXT_KEY);
}
