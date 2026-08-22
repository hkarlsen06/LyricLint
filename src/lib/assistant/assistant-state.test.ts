import { describe, expect, it, vi } from 'vitest';
import type { AssistantDraftBridge } from './draft-bridge.js';
import { memoryRepository } from './assistant-test-utils.js';
import { createAssistantState, type AssistantDeps } from './assistant.svelte.js';
import { chatLockName } from './chat-lock.js';
import {
	AssistantError,
	type AnswerTurnResponse,
	type AssistantLinkAction,
	type AssistantProposal,
	type AssistantReference,
	type StructuredAssistantAnswer,
	type ToolCallsTurnResponse
} from './types.js';

const QUOTA = {
	browserRemaining: 24,
	ipRemaining: 74,
	resetsAt: '2026-08-02T00:00:00.000Z'
};

function answer(text = 'An answer.'): AnswerTurnResponse {
	return {
		kind: 'answer',
		requestId: 'req-1',
		assistant: {
			scope: 'general',
			blocks: [{ kind: 'general', text, ruleIds: [], sourceIds: [] }]
		},
		quota: QUOTA
	};
}

function toolCalls(
	calls: ToolCallsTurnResponse['calls'],
	providerItems = '[{"type":"function_call"}]'
): ToolCallsTurnResponse {
	return { kind: 'tool_calls', calls, providerItems, quota: QUOTA };
}

function readCall(callId = 'read-1'): ToolCallsTurnResponse {
	return toolCalls([{ callId, name: 'read_scribe', input: {} }]);
}

function proposal(id: string, exact: string, replacement: string): AssistantProposal {
	return { id, anchor: { exact, before: '', after: '' }, replacement, note: `Change ${id}` };
}

function proposalCall(proposals: AssistantProposal[], callId = 'propose-1') {
	return toolCalls([{ callId, name: 'propose_edits', input: { proposals } }]);
}

function linkAction(
	id: string,
	action: 'link' | 'unlink',
	headers: AssistantLinkAction['headers']
): AssistantLinkAction {
	return { id, action, headers, note: `Manage ${id}` };
}

function reference(id: string, exact: string): AssistantReference {
	return { id, anchor: { exact, before: '', after: '' }, note: `Shown ${id}` };
}

function showLyricsCall(references: AssistantReference[], callId = 'show-1') {
	return toolCalls([{ callId, name: 'show_lyrics', input: { references } }]);
}

function manageLinksCall(actions: AssistantLinkAction[], callId = 'links-1') {
	return toolCalls([{ callId, name: 'manage_links', input: { actions } }]);
}

function draftBridge(initial = 'hello world', applyResult = true, draftId = 'draft-1') {
	let text = initial;
	let links: Array<{ lines: number[] }> = [];
	let linkable: (headerLines: number[]) => boolean = () => true;
	const apply = vi.fn((edit: Parameters<AssistantDraftBridge['apply']>[0]) => {
		void edit;
		return applyResult;
	});
	const preview = vi.fn(() => true);
	const clearPreview = vi.fn();
	const reveal = vi.fn();
	const bridge: AssistantDraftBridge = {
		draftId: () => draftId,
		readText: () => text,
		revision: () => 7,
		preview,
		clearPreview,
		reveal,
		apply,
		sectionLinks: () => links,
		linkableSections: vi.fn((headerLines: number[]) => linkable(headerLines)),
		linkSections: vi.fn((headerLines: number[]) => {
			if (!applyResult) return false;
			links = [{ lines: [...headerLines] }];
			return true;
		}),
		unlinkSection: vi.fn((headerLine: number) => {
			const before = links.length;
			links = links.filter((group) => !group.lines.includes(headerLine));
			return links.length !== before;
		})
	};
	return {
		bridge,
		apply,
		preview,
		clearPreview,
		reveal,
		get links() {
			return links;
		},
		setLinks(next: Array<{ lines: number[] }>) {
			links = next;
		},
		setLinkable(next: (headerLines: number[]) => boolean) {
			linkable = next;
		},
		mutate(next: string) {
			text = next;
		}
	};
}

/**
 * A bridge that actually applies what it is given, which is what makes a
 * batch's later proposals see the document its earlier ones left behind.
 * `draftBridge` above deliberately does not, because most tests are about the
 * decision rather than the text.
 */
function editableBridge(initial: string, draftId = 'draft-1') {
	let text = initial;
	const apply = vi.fn((edit: Parameters<AssistantDraftBridge['apply']>[0]) => {
		for (const change of [...edit.edits].sort((a, b) => b.from - a.from)) {
			text = text.slice(0, change.from) + change.insert + text.slice(change.to);
		}
		return true;
	});
	const bridge: AssistantDraftBridge = {
		draftId: () => draftId,
		readText: () => text,
		revision: () => 7,
		preview: vi.fn(() => true),
		clearPreview: vi.fn(),
		reveal: vi.fn(),
		apply,
		sectionLinks: () => [],
		linkableSections: vi.fn(() => true),
		linkSections: vi.fn(() => true),
		unlinkSection: vi.fn(() => true)
	};
	return { bridge, apply, text: () => text };
}

function makeState(overrides: Partial<AssistantDeps> = {}) {
	const repository = memoryRepository();
	const access = new Map<string, 'granted' | 'denied'>();
	const deps: AssistantDeps = {
		repository: async () => repository,
		ask: vi.fn(async () => answer()),
		ruleSetVersion: 'test-version',
		getDraftAccess: async (draftId) => access.get(draftId),
		setDraftAccess: async (draftId, decision) => {
			access.set(draftId, decision);
		},
		clearDraftAccess: async (draftId) => {
			access.delete(draftId);
		},
		...overrides
	};
	return { state: createAssistantState(deps), deps, repository, access };
}

describe('the assistant state', () => {
	it('creates a chat on the first question and completes the answer', async () => {
		const { state, deps } = makeState();
		await state.open();
		await state.send('How do I mark a chorus?');
		expect(state.chats).toHaveLength(1);
		expect(state.messages).toHaveLength(2);
		expect(state.messages[0]!.content).toBe('How do I mark a chorus?');
		expect(state.messages[1]!.status).toBe('complete');
		expect(state.messages[1]!.answer?.blocks[0]!.text).toBe('An answer.');
		expect(state.quota?.browserRemaining).toBe(24);
		expect(deps.ask).toHaveBeenCalledWith(
			expect.objectContaining({
				clientRuleSetVersion: 'test-version',
				messages: [{ role: 'user', content: 'How do I mark a chorus?' }]
			})
		);
	});

	it('clears speculative live blocks when the stream retries', async () => {
		interface StateRef {
			current?: ReturnType<typeof createAssistantState>;
		}
		const stateRef: StateRef = {};
		let answerAfterReset: StructuredAssistantAnswer | string | undefined = 'not observed';
		const ask = vi.fn(async (options: Parameters<AssistantDeps['ask']>[0]) => {
			await options.onProgress?.({
				scope: 'reviewed',
				blocks: [{ kind: 'prose', text: 'Speculative.', ruleIds: [], sourceIds: [] }]
			});
			await options.onRetry?.();
			answerAfterReset = stateRef.current?.messages[1]?.answer;
			await options.onProgress?.({
				scope: 'general',
				blocks: [{ kind: 'general', text: 'Corrected.', ruleIds: [], sourceIds: [] }]
			});
			return answer('Corrected.');
		});
		const { state } = makeState({ ask });
		stateRef.current = state;

		await state.open();
		await state.send('Question?');

		expect(answerAfterReset).toBeUndefined();
		expect(state.messages[1]!.answer?.blocks[0]!.text).toBe('Corrected.');
	});

	it('sends complete prior exchanges as context on the next question', async () => {
		const { state, deps } = makeState();
		await state.open();
		await state.send('First?');
		await state.send('Second?');
		const lastCall = vi.mocked(deps.ask).mock.calls.at(-1)![0];
		expect(lastCall.messages).toEqual([
			{ role: 'user', content: 'First?' },
			{ role: 'assistant', content: 'An answer.' },
			{ role: 'user', content: 'Second?' }
		]);
	});

	// The rule reference's prompt is not in a conversation, so a question asked
	// from it may not land at the foot of whichever chat `initialize()` re-seated
	// — the reader would not see that history, and the model would answer with it
	// as context.
	it('starts a new chat for every question asked from the rules prompt', async () => {
		const { state, deps } = makeState();
		await state.open();
		await state.send('First?');
		await state.openWithQuestion('Second?');
		expect(state.chats).toHaveLength(2);
		expect(state.messages).toHaveLength(2);
		expect(state.messages[0]!.content).toBe('Second?');
		expect(vi.mocked(deps.ask).mock.calls.at(-1)![0].messages).toEqual([
			{ role: 'user', content: 'Second?' }
		]);
	});

	it('leaves the transcript alone when the rules prompt has nothing to send', async () => {
		const { state } = makeState();
		await state.open();
		await state.send('First?');
		const activeId = state.activeChatId;
		await state.openWithQuestion('   ');
		expect(state.activeChatId).toBe(activeId);
		expect(state.messages).toHaveLength(2);
		expect(state.chats).toHaveLength(1);
	});

	it('keeps a request live across the modal closing', async () => {
		let release!: (value: AnswerTurnResponse) => void;
		const ask = vi.fn(() => new Promise<AnswerTurnResponse>((resolve) => (release = resolve)));
		const { state } = makeState({ ask });
		await state.open();
		const sending = state.send('Slow question?');
		await vi.waitFor(() => expect(ask).toHaveBeenCalled());
		state.close();
		expect(state.isOpen).toBe(false);
		release(answer('Landed anyway.'));
		await sending;
		expect(state.messages[1]!.status).toBe('complete');
		expect(state.messages[1]!.answer?.blocks[0]!.text).toBe('Landed anyway.');
	});

	it('keeps the active conversation stable while a request is in flight', async () => {
		let release!: (value: AnswerTurnResponse) => void;
		const ask = vi.fn(() => new Promise<AnswerTurnResponse>((resolve) => (release = resolve)));
		const { state } = makeState({ ask });
		await state.open();
		const sending = state.send('Slow question?');
		await vi.waitFor(() => expect(ask).toHaveBeenCalled());
		const activeId = state.activeChatId;
		await state.newChat();
		await state.deleteChat(activeId!);
		expect(state.activeChatId).toBe(activeId);
		release(answer('Still in the right chat.'));
		await sending;
		expect(state.messages[1]!.answer?.blocks[0]!.text).toBe('Still in the right chat.');
	});

	it('marks the answer failed and retries it in place', async () => {
		const ask = vi
			.fn()
			.mockRejectedValueOnce(new AssistantError('provider_error'))
			.mockResolvedValue(answer('Second try.'));
		const { state } = makeState({ ask });
		await state.open();
		await state.send('Question?');
		expect(state.messages[1]!.status).toBe('failed');
		expect(state.failure?.code).toBe('provider_error');
		await state.retry(state.messages[1]!.id);
		expect(state.messages[1]!.status).toBe('complete');
		expect(state.messages).toHaveLength(2);
	});

	it('marks a reload-orphaned pending answer interrupted, and it can be retried', async () => {
		const repository = memoryRepository();
		const chat = await repository.createChat('t', 'v');
		await repository.addMessage({
			chatId: chat.id,
			role: 'user',
			createdAt: '2026-01-01T00:00:00.000Z',
			status: 'complete',
			content: 'Orphaned question?'
		});
		await repository.addMessage({
			chatId: chat.id,
			role: 'assistant',
			createdAt: '2026-01-01T00:00:01.000Z',
			status: 'pending',
			content: ''
		});
		const ask = vi.fn(async () => answer('Recovered.'));
		const state = createAssistantState({
			repository: async () => repository,
			ask,
			ruleSetVersion: 'v'
		});
		await state.open();
		expect(state.messages[1]!.status).toBe('interrupted');
		await state.retry(state.messages[1]!.id);
		expect(state.messages[1]!.status).toBe('complete');
	});

	it('leaves a pending answer in a chat it has not opened, and sweeps it when it is', async () => {
		// The database is shared by every tab of this browser, so a sweep across
		// all of it is another tab's live stream marked interrupted the moment
		// somebody opens the assistant on `/rules/`. Only the chat being drawn is
		// swept, which is also the only chat whose state anybody can read.
		const repository = memoryRepository();
		const streaming = await repository.createChat('streaming elsewhere', 'v');
		const live = await repository.addMessage({
			chatId: streaming.id,
			role: 'assistant',
			createdAt: '2026-01-01T00:00:01.000Z',
			status: 'pending',
			content: ''
		});
		// The chat this instance boots into is a later one, so the streaming chat
		// is not what `initialize()` loads. The repository orders by an ISO
		// timestamp, so the two creations have to land in different milliseconds
		// or which one is "latest" is a coin toss.
		await new Promise((resolve) => setTimeout(resolve, 2));
		const latest = await repository.createChat('this tab', 'v');
		await repository.addMessage({
			chatId: latest.id,
			role: 'user',
			createdAt: '2026-01-02T00:00:00.000Z',
			status: 'complete',
			content: 'Anything?'
		});
		const { state } = makeState({ repository: async () => repository });

		await state.open();
		expect(state.activeChatId).toBe(latest.id);
		expect((await repository.messagesFor(streaming.id))[0]!.status).toBe('pending');

		// Opening it is when a genuinely orphaned turn is about to be drawn, so
		// that is when it is marked — crash recovery is unchanged.
		await state.selectChat(streaming.id);
		expect(state.messages.find((message) => message.id === live.id)!.status).toBe('interrupted');
	});

	it('sweeps a pending turn whose round was in flight, decision recorded or not', async () => {
		// The other side of the rule below: a turn is only resumable while it is
		// waiting on the user. Once every call in the round is acknowledged the
		// continuation POST is in flight, and that request dies with its session.
		const store = memoryRepository();
		const chat = await store.createChat('t', 'v');
		await store.addMessage({
			chatId: chat.id,
			role: 'user',
			createdAt: '2026-01-01T00:00:00.000Z',
			status: 'complete',
			content: 'Read it.'
		});
		await store.addMessage({
			chatId: chat.id,
			role: 'assistant',
			createdAt: '2026-01-01T00:00:01.000Z',
			status: 'pending',
			content: '',
			toolTurns: [
				{
					calls: [{ callId: 'read-1', name: 'read_scribe', outcome: 'granted' }],
					providerItems: '[{"type":"function_call"}]'
				}
			]
		});
		const { state } = makeState({ repository: async () => store });
		await state.open();

		expect(state.messages[1]!.status).toBe('interrupted');
		expect(state.toolSession).toBeUndefined();
	});

	it('spares a turn that was only waiting on a decision, and resumes it on the press', async () => {
		const store = memoryRepository();
		const chat = await store.createChat('t', 'v');
		await store.addMessage({
			chatId: chat.id,
			role: 'user',
			createdAt: '2026-01-01T00:00:00.000Z',
			status: 'complete',
			content: 'Read it.'
		});
		const orphan = await store.addMessage({
			chatId: chat.id,
			role: 'assistant',
			createdAt: '2026-01-01T00:00:01.000Z',
			status: 'pending',
			content: '',
			toolTurns: [
				{
					calls: [{ callId: 'read-1', name: 'read_scribe' }],
					providerItems: '[{"type":"function_call"}]'
				}
			]
		});
		const ask = vi.fn().mockResolvedValue(answer('Resumed.'));
		const { state } = makeState({ repository: async () => store, ask });
		state.registerDraftBridge(draftBridge('[Verse]\nA line').bridge);
		await state.open();

		// Nothing was in flight — the prompt was waiting on a person — so the
		// turn keeps its status and gets its session back.
		expect(state.messages[1]!.status).toBe('pending');
		expect(state.toolSession).toEqual({
			assistantMessageId: orphan.id,
			phase: 'awaiting-permission'
		});
		expect(ask).not.toHaveBeenCalled();

		await state.allowDraftRead();
		expect(ask).toHaveBeenCalledOnce();
		// The continuation is rebuilt from the record, so it carries the round's
		// own provider items and the outcome the press just decided.
		const request = vi.mocked(ask).mock.calls[0]![0];
		expect(request.messages.at(-2)).toMatchObject({
			role: 'assistant',
			providerItems: '[{"type":"function_call"}]'
		});
		expect(request.messages.at(-1)).toEqual({
			role: 'tool',
			results: [
				{
					callId: 'read-1',
					name: 'read_scribe',
					result: { status: 'granted', draftText: '[Verse]\nA line' }
				}
			]
		});
		expect(state.messages[1]!.status).toBe('complete');
	});

	it('abandons a restored decision on leaving the chat and re-seats it on returning', async () => {
		const store = memoryRepository();
		const first = await store.createChat('first', 'v');
		await store.addMessage({
			chatId: first.id,
			role: 'user',
			createdAt: '2026-01-01T00:00:00.000Z',
			status: 'complete',
			content: 'Read it.'
		});
		const orphan = await store.addMessage({
			chatId: first.id,
			role: 'assistant',
			createdAt: '2026-01-01T00:00:01.000Z',
			status: 'pending',
			content: '',
			toolTurns: [
				{
					calls: [{ callId: 'read-1', name: 'read_scribe' }],
					providerItems: '[{"type":"function_call"}]'
				}
			]
		});
		const { state } = makeState({ repository: async () => store });
		await state.open();
		expect(state.toolSession?.assistantMessageId).toBe(orphan.id);

		// A restored decision is not a request in flight, so it may not lock the
		// panel into the conversation holding it.
		await state.newChat();
		expect(state.toolSession).toBeUndefined();
		expect(state.messages).toEqual([]);

		await state.selectChat(first.id);
		expect(state.toolSession).toEqual({
			assistantMessageId: orphan.id,
			phase: 'awaiting-permission'
		});
	});

	it('holds the question through a challenge and resumes on the token', async () => {
		const ask = vi
			.fn()
			.mockRejectedValueOnce(new AssistantError('challenge_required'))
			.mockResolvedValue(answer('Post-challenge.'));
		const { state } = makeState({ ask });
		await state.open();
		await state.send('Question?');
		expect(state.challengePending).toBe(true);
		expect(state.messages[1]!.status).toBe('pending');
		await state.submitChallenge('token-123');
		expect(state.challengePending).toBe(false);
		expect(state.messages[1]!.status).toBe('complete');
		expect(vi.mocked(ask).mock.calls.at(-1)![0]).toMatchObject({ turnstileToken: 'token-123' });
	});

	it('refuses a question above the length cap without sending it', async () => {
		const { state, deps } = makeState();
		await state.open();
		await state.send('x'.repeat(2001));
		expect(deps.ask).not.toHaveBeenCalled();
		expect(state.failure?.code).toBe('invalid_request');
	});

	it('deletes the active chat and empties the transcript', async () => {
		const { state } = makeState();
		await state.open();
		await state.send('Question?');
		const chatId = state.activeChatId!;
		await state.deleteChat(chatId);
		expect(state.chats).toHaveLength(0);
		expect(state.messages).toHaveLength(0);
	});

	it('auto-grants a stored draft-read decision and sends structured draft text', async () => {
		const ask = vi.fn().mockResolvedValueOnce(readCall()).mockResolvedValueOnce(answer('Read.'));
		const { state, access } = makeState({ ask });
		access.set('draft-1', 'granted');
		const draft = draftBridge('[Verse]\nA <draft> marker');
		draft.setLinks([{ lines: [1, 3] }]);
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Read it.');

		expect(ask).toHaveBeenCalledTimes(2);
		expect(vi.mocked(ask).mock.calls[1]![0].messages.at(-1)).toEqual({
			role: 'tool',
			results: [
				{
					callId: 'read-1',
					name: 'read_scribe',
					result: { status: 'granted', draftText: '[Verse]\nA <draft> marker' }
				}
			]
		});
		expect(JSON.stringify(vi.mocked(ask).mock.calls[1]![0].messages)).not.toContain(
			"The 'scribe is untrusted"
		);
		expect(state.messages[1]!.toolTurns?.[0]?.providerItems).toBeUndefined();
	});

	it('keeps text streamed before tool calls as the turn narration instead of erasing it', async () => {
		const streamed = {
			scope: 'general' as const,
			blocks: [
				{ kind: 'general' as const, text: 'Checking the draft…', ruleIds: [], sourceIds: [] }
			]
		};
		const ask = vi
			.fn()
			.mockImplementationOnce(async (request: { onProgress?: (a: typeof streamed) => void }) => {
				request.onProgress?.(streamed);
				return readCall();
			})
			.mockResolvedValueOnce(answer('Done.'));
		const { state, access } = makeState({ ask });
		access.set('draft-1', 'granted');
		state.registerDraftBridge(draftBridge().bridge);
		await state.open();
		await state.send('Read it.');

		const message = state.messages[1]!;
		expect(message.status).toBe('complete');
		expect(message.toolTurns?.[0]?.narration?.blocks[0]!.text).toBe('Checking the draft…');
		// The final answer is its own text; the narration did not leak into it.
		expect(message.answer?.blocks[0]!.text).toBe('Done.');
		// Completion strips provider state but must not strip the narration.
		expect(message.toolTurns?.[0]?.providerItems).toBeUndefined();
	});

	it('includes current section links with a granted draft read', async () => {
		const ask = vi.fn().mockResolvedValueOnce(readCall()).mockResolvedValueOnce(answer('Read.'));
		const { state, access } = makeState({ ask });
		access.set('draft-1', 'granted');
		const draft = draftBridge('[Chorus]\nOne\n[Chorus]\nTwo');
		draft.setLinks([{ lines: [1, 3] }]);
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Read it.');

		expect(vi.mocked(ask).mock.calls[1]![0].messages.at(-1)).toMatchObject({
			results: [
				{
					result: {
						status: 'granted',
						sectionLinks: ['[Chorus] occurrence 1 ↔ [Chorus] occurrence 2']
					}
				}
			]
		});
	});

	it('auto-denies a stored decision without drawing a permission prompt', async () => {
		const ask = vi.fn().mockResolvedValueOnce(readCall()).mockResolvedValueOnce(answer('Okay.'));
		const { state, access } = makeState({ ask });
		access.set('draft-1', 'denied');
		state.registerDraftBridge(draftBridge().bridge);
		await state.open();
		await state.send('Read it.');

		expect(ask).toHaveBeenCalledTimes(2);
		expect(vi.mocked(ask).mock.calls[1]![0].messages.at(-1)).toEqual({
			role: 'tool',
			results: [{ callId: 'read-1', name: 'read_scribe', result: { status: 'denied' } }]
		});
		expect(state.toolSession).toBeUndefined();
	});

	it('asks once for an undecided draft and does not continue until the decision', async () => {
		const ask = vi.fn().mockResolvedValueOnce(readCall()).mockResolvedValueOnce(answer('Shared.'));
		const setAccess = vi.fn(async () => undefined);
		const { state } = makeState({ ask, setDraftAccess: setAccess });
		state.registerDraftBridge(draftBridge('draft text').bridge);
		await state.open();
		await state.send('Read it.');

		expect(state.toolSession?.phase).toBe('awaiting-permission');
		expect(state.busy).toBe(false);
		expect(ask).toHaveBeenCalledTimes(1);
		await state.allowDraftRead();
		expect(setAccess).toHaveBeenCalledWith('draft-1', 'granted');
		expect(ask).toHaveBeenCalledTimes(2);
		expect(state.messages[1]!.status).toBe('complete');
	});

	it('interrupts a parked tool turn when the registered draft changes', async () => {
		const ask = vi
			.fn()
			.mockResolvedValueOnce(readCall())
			.mockResolvedValueOnce(readCall('read-2'))
			.mockResolvedValueOnce(answer('Used the new draft permission.'));
		const getAccess = vi.fn(async (draftId: string) =>
			draftId === 'draft-b' ? ('denied' as const) : undefined
		);
		const { state } = makeState({ ask, getDraftAccess: getAccess });
		const draftA = draftBridge('[Verse]\nA', true, 'draft-a');
		const unregisterA = state.registerDraftBridge(draftA.bridge);
		await state.open();
		await state.send('Read it.');
		expect(state.toolSession?.phase).toBe('awaiting-permission');

		const draftB = draftBridge('[Verse]\nB', true, 'draft-b');
		state.registerDraftBridge(draftB.bridge);
		unregisterA();

		expect(state.toolSession).toBeUndefined();
		expect(state.messages[1]!.status).toBe('interrupted');
		await state.allowDraftRead();
		await state.denyDraftRead();
		expect(ask).toHaveBeenCalledTimes(1);
		expect(getAccess).toHaveBeenCalledWith('draft-b');
		await vi.waitFor(() => expect(state.draftAccessState).toBe('denied'));

		await state.send('Read the new draft.');
		expect(ask).toHaveBeenCalledTimes(3);
		expect(vi.mocked(ask).mock.calls[2]![0].messages.at(-1)).toEqual({
			role: 'tool',
			results: [{ callId: 'read-2', name: 'read_scribe', result: { status: 'denied' } }]
		});
	});

	it('persists an explicit denial before continuing with the denied result', async () => {
		const ask = vi.fn().mockResolvedValueOnce(readCall()).mockResolvedValueOnce(answer('Denied.'));
		const setAccess = vi.fn(async () => undefined);
		const { state } = makeState({ ask, setDraftAccess: setAccess });
		state.registerDraftBridge(draftBridge().bridge);
		await state.open();
		await state.send('Read it.');

		await state.denyDraftRead();
		expect(setAccess).toHaveBeenCalledWith('draft-1', 'denied');
		expect(vi.mocked(ask).mock.calls[1]![0].messages.at(-1)).toMatchObject({
			results: [{ result: { status: 'denied' } }]
		});
	});

	it('serializes proposal outcomes only after every call in the round is acknowledged', async () => {
		const ask = vi
			.fn()
			.mockResolvedValueOnce(
				toolCalls([
					{
						callId: 'propose-1',
						name: 'propose_edits',
						input: { proposals: [proposal('one', 'hello', 'hi')] }
					},
					{
						callId: 'propose-2',
						name: 'propose_edits',
						input: { proposals: [proposal('two', 'world', 'earth')] }
					}
				])
			)
			.mockResolvedValueOnce(answer('Done.'));
		const { state } = makeState({ ask });
		const draft = draftBridge();
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Fix both.');

		await state.approveProposal('one');
		expect(ask).toHaveBeenCalledTimes(1);
		expect(draft.apply).toHaveBeenCalledWith({
			baseRevision: 7,
			edits: expect.any(Array)
		});
		expect(draft.apply.mock.calls[0]![0]).not.toHaveProperty('selectionAfter');
		await state.rejectProposal('two');
		expect(ask).toHaveBeenCalledTimes(2);
		expect(vi.mocked(ask).mock.calls[1]![0].messages.at(-1)).toEqual({
			role: 'tool',
			results: [
				{
					callId: 'propose-1',
					name: 'propose_edits',
					result: { outcomes: [{ id: 'one', status: 'applied' }] }
				},
				{
					callId: 'propose-2',
					name: 'propose_edits',
					result: { outcomes: [{ id: 'two', status: 'rejected' }] }
				}
			]
		});
	});

	it('applies a local proposal with its resolved section span and preserves its scope', async () => {
		const local = {
			...proposal('local', 'Hold on tight', 'Hold me tight'),
			applyTo: 'this_section_only' as const
		};
		const ask = vi
			.fn()
			.mockResolvedValueOnce(proposalCall([local]))
			.mockResolvedValueOnce(answer('Done.'));
		const { state } = makeState({ ask });
		const draft = draftBridge('Hold on tight');
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Change only this copy.');

		await state.approveProposal('local');

		expect(draft.apply).toHaveBeenCalledWith(
			{ baseRevision: 7, edits: expect.any(Array) },
			{ applyTo: 'this_section_only', range: { from: 5, to: 7 } }
		);
		expect(state.messages[1]!.toolTurns?.[0]?.calls[0]).toMatchObject({
			proposals: [{ id: 'local', applyTo: 'this_section_only', status: 'applied' }]
		});
	});

	it('resolves section-link actions at render time with honest failure reasons', async () => {
		const draftText = '[Chorus]\nA\n[Verse]\nB\n[Chorus]\nA\n[Pre-Chorus]\nC';
		const actions = [
			linkAction('missing', 'link', [
				{ text: '[Bridge]', occurrence: 1 },
				{ text: '[Chorus]', occurrence: 1 }
			]),
			linkAction('verse', 'link', [
				{ text: '[Verse]', occurrence: 1 },
				{ text: '[Chorus]', occurrence: 1 }
			]),
			linkAction('same-group', 'link', [
				{ text: '[Chorus]', occurrence: 1 },
				{ text: '[Chorus]', occurrence: 2 }
			]),
			linkAction('loose', 'unlink', [{ text: '[Pre-Chorus]', occurrence: 1 }])
		];
		const ask = vi
			.fn()
			.mockResolvedValueOnce(manageLinksCall(actions))
			.mockResolvedValueOnce(answer());
		const { state } = makeState({ ask });
		const draft = draftBridge(draftText);
		draft.setLinks([{ lines: [1, 5] }]);
		draft.setLinkable((lines) => !lines.includes(3));
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Manage the repeats.');

		const call = state.messages[1]!.toolTurns?.[0]?.calls[0];
		expect(call?.name).toBe('manage_links');
		if (call?.name !== 'manage_links') throw new Error('Expected link actions.');
		expect(call.actions.map(({ id, status, reason }) => ({ id, status, reason }))).toEqual([
			{ id: 'missing', status: 'failed', reason: 'not-found' },
			{ id: 'verse', status: 'failed', reason: 'not-linkable' },
			{ id: 'same-group', status: 'failed', reason: 'already-linked' },
			{ id: 'loose', status: 'failed', reason: 'not-linked' }
		]);
	});

	it('approves link and unlink actions through the bridge and sends their outcomes', async () => {
		const draftText = '[Chorus]\nA\n[Chorus]\nA';
		const ask = vi
			.fn()
			.mockResolvedValueOnce(
				manageLinksCall([
					linkAction('tie', 'link', [
						{ text: '[Chorus]', occurrence: 1 },
						{ text: '[Chorus]', occurrence: 2 }
					])
				])
			)
			.mockResolvedValueOnce(answer('Linked.'));
		const { state } = makeState({ ask });
		const draft = draftBridge(draftText);
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Link them.');
		await state.approveLinkAction('tie');

		expect(draft.bridge.linkSections).toHaveBeenCalledWith([1, 3]);
		expect(vi.mocked(ask).mock.calls[1]![0].messages.at(-1)).toMatchObject({
			results: [
				{
					name: 'manage_links',
					result: { outcomes: [{ id: 'tie', status: 'applied' }] }
				}
			]
		});

		const unlinkAsk = vi
			.fn()
			.mockResolvedValueOnce(
				manageLinksCall([linkAction('untie', 'unlink', [{ text: '[Chorus]', occurrence: 2 }])])
			)
			.mockResolvedValueOnce(answer('Unlinked.'));
		const second = makeState({ ask: unlinkAsk }).state;
		const linkedDraft = draftBridge(draftText);
		linkedDraft.setLinks([{ lines: [1, 3] }]);
		second.registerDraftBridge(linkedDraft.bridge);
		await second.open();
		await second.send('Unlink them.');
		await second.approveLinkAction('untie');
		expect(linkedDraft.bridge.unlinkSection).toHaveBeenCalledWith(3);
	});

	it('reports a bridge refusal as apply-failed for a section-link action', async () => {
		const ask = vi
			.fn()
			.mockResolvedValueOnce(
				manageLinksCall([
					linkAction('tie', 'link', [
						{ text: '[Chorus]', occurrence: 1 },
						{ text: '[Chorus]', occurrence: 2 }
					])
				])
			)
			.mockResolvedValueOnce(answer());
		const { state } = makeState({ ask });
		state.registerDraftBridge(draftBridge('[Chorus]\nA\n[Chorus]\nA', false).bridge);
		await state.open();
		await state.send('Link them.');
		await state.approveLinkAction('tie');

		expect(vi.mocked(ask).mock.calls[1]![0].messages.at(-1)).toMatchObject({
			results: [
				{
					result: {
						outcomes: [
							{ id: 'tie', status: 'failed', reason: expect.stringMatching(/^apply-failed: /) }
						]
					}
				}
			]
		});
	});

	it('re-resolves a section-link action at approval time', async () => {
		const ask = vi
			.fn()
			.mockResolvedValueOnce(
				manageLinksCall([
					linkAction('tie', 'link', [
						{ text: '[Chorus]', occurrence: 1 },
						{ text: '[Chorus]', occurrence: 2 }
					])
				])
			)
			.mockResolvedValueOnce(answer());
		const { state } = makeState({ ask });
		const draft = draftBridge('[Chorus]\nA\n[Chorus]\nA');
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Link them.');
		draft.mutate('[Chorus]\nOnly one remains');
		await state.approveLinkAction('tie');

		expect(draft.bridge.linkSections).not.toHaveBeenCalled();
		expect(vi.mocked(ask).mock.calls[1]![0].messages.at(-1)).toMatchObject({
			results: [
				{
					result: {
						outcomes: [
							{ id: 'tie', status: 'failed', reason: expect.stringMatching(/^not-found: /) }
						]
					}
				}
			]
		});
	});

	it('rejects a link action and retry discards its live tool turn', async () => {
		const ask = vi
			.fn()
			.mockResolvedValueOnce(
				manageLinksCall([
					linkAction('tie', 'link', [
						{ text: '[Chorus]', occurrence: 1 },
						{ text: '[Chorus]', occurrence: 2 }
					])
				])
			)
			.mockRejectedValueOnce(new AssistantError('provider_error'))
			.mockResolvedValueOnce(answer('Fresh answer.'));
		const { state } = makeState({ ask });
		state.registerDraftBridge(draftBridge('[Chorus]\nA\n[Chorus]\nA').bridge);
		await state.open();
		await state.send('Link them.');
		await state.rejectLinkAction('tie');
		expect(state.messages[1]!.status).toBe('failed');

		await state.retry(state.messages[1]!.id);
		expect(vi.mocked(ask).mock.calls[2]![0].messages).toEqual([
			{ role: 'user', content: 'Link them.' }
		]);
		expect(state.messages[1]!.toolTurns).toBeUndefined();
	});

	it('resolves references on arrival and continues the round without a decision', async () => {
		const ask = vi
			.fn()
			.mockResolvedValueOnce(
				showLyricsCall([reference('where', 'world'), reference('gone', 'absent text')])
			)
			.mockResolvedValueOnce(answer('It is in the first line.'));
		const { state } = makeState({ ask });
		const draft = draftBridge('hello world');
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Where does it say world?');

		// Nothing was pending, so the loop continued into the answer by itself.
		expect(ask).toHaveBeenCalledTimes(2);
		expect(state.toolSession).toBeUndefined();
		expect(state.messages[1]!.status).toBe('complete');
		const call = state.messages[1]!.toolTurns?.[0]?.calls[0];
		if (call?.name !== 'show_lyrics') throw new Error('Expected references.');
		expect(call.references.map(({ id, status, reason }) => ({ id, status, reason }))).toEqual([
			{ id: 'where', status: 'shown', reason: undefined },
			{ id: 'gone', status: 'failed', reason: 'not-found' }
		]);
		expect(vi.mocked(ask).mock.calls[1]![0].messages.at(-1)).toEqual({
			role: 'tool',
			results: [
				{
					callId: 'show-1',
					name: 'show_lyrics',
					result: {
						outcomes: [
							{ id: 'where', status: 'shown' },
							{ id: 'gone', status: 'failed', reason: expect.stringMatching(/^not-found: /) }
						]
					}
				}
			]
		});
	});

	it('reveals a reference after its turn, and only while the quote survives', async () => {
		const ask = vi
			.fn()
			.mockResolvedValueOnce(showLyricsCall([reference('where', 'world')]))
			.mockResolvedValueOnce(answer());
		const { state } = makeState({ ask });
		const draft = draftBridge('hello world');
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Where?');

		// The turn is over and no session survives it; the card still answers,
		// because a reference is an answer to "where" rather than a parked offer.
		expect(state.toolSession).toBeUndefined();
		const call = state.messages[1]!.toolTurns?.[0]?.calls[0];
		if (call?.name !== 'show_lyrics') throw new Error('Expected references.');
		const anchor = call.references[0]!.anchor;
		expect(state.revealReference(anchor)).toBe(true);
		expect(draft.reveal).toHaveBeenCalledWith({ from: 6, to: 11 });

		// Edited away, the quote reveals nothing rather than somewhere invented.
		draft.mutate('hello earth');
		expect(state.revealReference(anchor)).toBe(false);
		expect(draft.reveal).toHaveBeenCalledTimes(1);
	});

	it('resumes the exact continuation after a mid-loop challenge', async () => {
		const ask = vi
			.fn()
			.mockResolvedValueOnce(readCall())
			.mockRejectedValueOnce(new AssistantError('challenge_required'))
			.mockResolvedValueOnce(answer('After challenge.'));
		const { state, access } = makeState({ ask });
		access.set('draft-1', 'denied');
		state.registerDraftBridge(draftBridge().bridge);
		await state.open();
		await state.send('Read it.');
		expect(state.challengePending).toBe(true);
		const challengedMessages = vi.mocked(ask).mock.calls[1]![0].messages;

		await state.submitChallenge('turnstile-token');
		expect(vi.mocked(ask).mock.calls[2]![0]).toMatchObject({
			messages: challengedMessages,
			turnstileToken: 'turnstile-token'
		});
	});

	it('retry discards tool turns and restarts from the original question', async () => {
		const ask = vi
			.fn()
			.mockResolvedValueOnce(proposalCall([proposal('one', 'hello', 'hi')]))
			.mockRejectedValueOnce(new AssistantError('provider_error'))
			.mockResolvedValueOnce(answer('Fresh answer.'));
		const { state } = makeState({ ask });
		state.registerDraftBridge(draftBridge().bridge);
		await state.open();
		await state.send('Fix it.');
		await state.rejectProposal('one');
		expect(state.messages[1]!.status).toBe('failed');
		expect(state.messages[1]!.toolTurns).toHaveLength(1);

		await state.retry(state.messages[1]!.id);
		expect(vi.mocked(ask).mock.calls[2]![0].messages).toEqual([
			{ role: 'user', content: 'Fix it.' }
		]);
		expect(state.messages[1]!.toolTurns).toBeUndefined();
	});

	it('fails a fifth tool round locally with the same worded cap as the worker', async () => {
		const ask = vi.fn();
		for (let round = 1; round <= 5; round += 1) {
			ask.mockResolvedValueOnce(readCall(`read-${round}`));
		}
		const { state, access } = makeState({ ask });
		access.set('draft-1', 'denied');
		state.registerDraftBridge(draftBridge().bridge);
		await state.open();
		await state.send('Keep reading.');

		expect(ask).toHaveBeenCalledTimes(5);
		expect(state.messages[1]!.status).toBe('failed');
		expect(state.messages[1]!.content).toBe(
			"The assistant may use 'scribe tools at most 4 times in one turn."
		);
		expect(state.messages[1]!.toolTurns).toHaveLength(4);
	});

	it('keeps a batch resolvable as its own earlier proposals are applied', async () => {
		// The failure this pins: three verses opening on the same line, one
		// proposal per verse putting a header above it. Approving the first
		// moves every line below it, so the second and third anchors — whose
		// line numbers were measured against the 'scribe the model read, and
		// whose neighbours are identical in every copy — used to be refused as
		// ambiguous. They are the model's own correct proposals, invalidated by
		// the linter applying the ones before them.
		const line = 'Sweep me under the rug';
		const song = [line, '', line, '', line].join('\n');
		const headers = ['[Verse 1]', '[Verse 2]', '[Verse 3]'].map((header, index) => ({
			id: header,
			anchor: { exact: line, before: '', after: '', line: index * 2 + 1 },
			replacement: `${header}\n\n${line}`,
			note: `Add ${header}.`
		}));
		const ask = vi
			.fn()
			.mockResolvedValueOnce(proposalCall(headers))
			.mockResolvedValueOnce(answer('Headers added.'));
		const { state } = makeState({ ask });
		const draft = editableBridge(song);
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Add those headers.');

		for (const header of headers) await state.approveProposal(header.id);

		expect(draft.text()).toBe(
			['[Verse 1]', '', line, '', '[Verse 2]', '', line, '', '[Verse 3]', '', line].join('\n')
		);
		expect(vi.mocked(ask).mock.calls[1]![0].messages.at(-1)).toMatchObject({
			results: [
				{
					result: {
						outcomes: headers.map((header) => ({ id: header.id, status: 'applied' }))
					}
				}
			]
		});
	});

	it('reports approve-time anchor loss instead of applying stale text', async () => {
		const ask = vi
			.fn()
			.mockResolvedValueOnce(proposalCall([proposal('one', 'hello', 'hi')]))
			.mockResolvedValueOnce(answer('Could not apply.'));
		const { state } = makeState({ ask });
		const draft = draftBridge();
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Fix it.');
		draft.mutate('the anchor is gone');
		await state.approveProposal('one');

		expect(draft.apply).not.toHaveBeenCalled();
		expect(vi.mocked(ask).mock.calls[1]![0].messages.at(-1)).toMatchObject({
			results: [
				{
					result: {
						outcomes: [
							{ id: 'one', status: 'failed', reason: expect.stringMatching(/^not-found: /) }
						]
					}
				}
			]
		});
	});

	it("offers and applies conversation text to an empty shared 'scribe", async () => {
		const practiceLyrics = '[Verse]\nNatta ligger over byen';
		const insertion: AssistantProposal = {
			id: 'insert-practice-lyrics',
			anchor: { exact: '', before: '', after: '', line: 1 },
			replacement: practiceLyrics,
			note: 'Insert the practice lyrics.'
		};
		const ask = vi
			.fn()
			.mockResolvedValueOnce(readCall())
			.mockResolvedValueOnce(proposalCall([insertion]))
			.mockResolvedValueOnce(answer('Inserted.'));
		const { state, access } = makeState({ ask });
		access.set('draft-1', 'granted');
		const draft = draftBridge('');
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Put those lyrics in.');

		expect(state.toolSession?.phase).toBe('awaiting-review');
		expect(state.messages[1]!.toolTurns?.[1]?.calls[0]).toMatchObject({
			proposals: [{ id: insertion.id, status: 'pending' }]
		});

		await state.approveProposal(insertion.id);

		expect(draft.apply).toHaveBeenCalledWith({
			baseRevision: 7,
			edits: [{ from: 0, to: 0, insert: practiceLyrics }]
		});
		expect(state.messages[1]!.status).toBe('complete');
	});

	it('reports a bridge refusal as a failed proposal outcome', async () => {
		const ask = vi
			.fn()
			.mockResolvedValueOnce(proposalCall([proposal('one', 'hello', 'hi')]))
			.mockResolvedValueOnce(answer('Could not apply.'));
		const { state } = makeState({ ask });
		const draft = draftBridge('hello world', false);
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Fix it.');
		await state.approveProposal('one');

		expect(vi.mocked(ask).mock.calls[1]![0].messages.at(-1)).toMatchObject({
			results: [
				{
					result: {
						outcomes: [
							{ id: 'one', status: 'failed', reason: expect.stringMatching(/^apply-failed: /) }
						]
					}
				}
			]
		});
	});

	it('previews through the bridge and revokes the registered draft decision', async () => {
		const ask = vi
			.fn()
			.mockResolvedValueOnce(proposalCall([proposal('one', 'hello', 'hi')]))
			.mockResolvedValueOnce(answer('Rejected.'));
		const clearAccess = vi.fn(async () => undefined);
		const { state, access } = makeState({ ask, clearDraftAccess: clearAccess });
		access.set('draft-1', 'granted');
		const draft = draftBridge();
		state.registerDraftBridge(draft.bridge);
		await vi.waitFor(() => expect(state.draftAccessState).toBe('granted'));
		await state.open();
		await state.send('Preview it.');

		expect(state.previewProposal('one')).toBe(true);
		expect(draft.preview).toHaveBeenCalledWith({ baseRevision: 7, edits: expect.any(Array) });
		state.endProposalPreview('one');
		expect(draft.clearPreview).toHaveBeenCalled();
		await state.rejectProposal('one');
		await state.revokeDraftAccess();
		expect(clearAccess).toHaveBeenCalledWith('draft-1');
		expect(state.draftAccessState).toBeUndefined();
	});

	it('applies a repeated chorus line to the copy the anchor names by line number', async () => {
		// The failure this exists for: three copies of one chorus, so the exact
		// text and its neighbours are identical and only the line separates them.
		const draftText = '[Chorus]\nBap, bap\n\n[Chorus]\nBap, bap\n\n[Chorus]\nBap, bap';
		const numbered: AssistantProposal = {
			id: 'one',
			anchor: { exact: 'Bap, bap', before: '[Chorus]\n', after: '', line: 5 },
			replacement: 'Bah, bah',
			note: 'Second copy'
		};
		const ask = vi
			.fn()
			.mockResolvedValueOnce(proposalCall([numbered]))
			.mockResolvedValueOnce(answer('Applied.'));
		const { state } = makeState({ ask });
		const draft = draftBridge(draftText);
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Fix the second chorus.');
		await state.approveProposal('one');

		const [edit] = draft.apply.mock.calls[0]!;
		// Offsets into the second copy, which starts at 28 — not the first at 9.
		expect(edit.edits.length).toBeGreaterThan(0);
		expect(edit.edits.every((one) => one.from >= 28 && one.to <= 36)).toBe(true);
		expect(vi.mocked(ask).mock.calls[1]![0].messages.at(-1)).toMatchObject({
			results: [{ result: { outcomes: [{ id: 'one', status: 'applied' }] } }]
		});
	});

	it('fails the same repeated line as ambiguous when the anchor names no line', async () => {
		const draftText = '[Chorus]\nBap, bap\n\n[Chorus]\nBap, bap\n\n[Chorus]\nBap, bap';
		const ask = vi
			.fn()
			.mockResolvedValueOnce(proposalCall([proposal('one', 'Bap, bap', 'Bah, bah')]))
			.mockResolvedValueOnce(answer('Could not apply.'));
		const { state } = makeState({ ask });
		const draft = draftBridge(draftText);
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Fix it.');

		expect(state.messages[1]!.toolTurns?.[0]?.calls[0]).toMatchObject({
			proposals: [{ id: 'one', status: 'failed', reason: 'ambiguous' }]
		});
		expect(draft.apply).not.toHaveBeenCalled();
	});

	it('scrolls the previewed span into view, and reveals nothing it could not preview', async () => {
		const ask = vi.fn().mockResolvedValue(proposalCall([proposal('one', 'world', 'earth')]));
		const { state } = makeState({ ask });
		const draft = draftBridge('hello world');
		state.registerDraftBridge(draft.bridge);
		await state.open();
		await state.send('Fix it.');

		// A proposal quotes a line the user never navigated to, so the diff has
		// to be brought on screen — unlike a diagnostic's, which is already there.
		expect(state.previewProposal('one')).toBe(true);
		expect(draft.reveal).toHaveBeenCalledWith({ from: 6, to: 11 });

		draft.reveal.mockClear();
		draft.preview.mockReturnValueOnce(false);
		expect(state.previewProposal('one')).toBe(false);
		expect(draft.reveal).not.toHaveBeenCalled();
	});
});

/**
 * A `LockManager` that can be told another tab is inside a conversation.
 *
 * The real one cannot: every page in a test process is the same profile, so a
 * genuine "held elsewhere" needs a second browser context. Only `ifAvailable`
 * requests are made, so the stub answers the probe and nothing queues.
 */
function stubLocks() {
	const held = new Set<string>();
	const manager = {
		async request<T>(
			name: string,
			options: LockOptions,
			callback: LockGrantedCallback<T>
		): Promise<Awaited<T>> {
			if (held.has(name)) return await callback(null);
			held.add(name);
			try {
				return await callback({ name, mode: options.mode ?? 'exclusive' });
			} finally {
				held.delete(name);
			}
		}
	};
	return {
		locks: manager as LockManager,
		held,
		/** The other tab entering the conversation, until the returned call lets go. */
		holdElsewhere(chatId: string) {
			const name = chatLockName(chatId);
			held.add(name);
			return () => held.delete(name);
		}
	};
}

describe('the assistant conversation lock', () => {
	it('refuses a send into a conversation another tab is answering in', async () => {
		const { locks, holdElsewhere } = stubLocks();
		const { state, deps, repository } = makeState({ locks });
		await state.open();
		await state.send('First?');
		const letGo = holdElsewhere('chat-1');

		await state.send('Second?');

		// Worded, not silent and not queued — and the question is untouched on the
		// way past, so nothing of it is left half-written in a transcript the other
		// tab is still moving: no row, no placeholder, no request.
		expect(state.failure?.message).toBe('This conversation is answering in another tab.');
		expect(state.messages).toHaveLength(2);
		expect(await repository.messagesFor('chat-1')).toHaveLength(2);
		expect(deps.ask).toHaveBeenCalledOnce();

		letGo();
	});

	it('refuses a retry into a conversation another tab is answering in', async () => {
		const ask = vi.fn().mockRejectedValueOnce(new AssistantError('provider_error'));
		const { locks, holdElsewhere } = stubLocks();
		const { state } = makeState({ ask, locks });
		await state.open();
		await state.send('First?');
		const letGo = holdElsewhere('chat-1');

		await state.retry(state.messages[1]!.id);

		// The reset rides inside the lock, so a refused retry leaves the failed
		// record exactly as it stands rather than stripping it for a turn that
		// never ran.
		expect(state.failure?.message).toBe('This conversation is answering in another tab.');
		expect(state.messages[1]!.status).toBe('failed');
		expect(ask).toHaveBeenCalledOnce();

		letGo();
	});

	it('gives the conversation back when the answer lands and when it fails', async () => {
		const ask = vi
			.fn()
			.mockResolvedValueOnce(answer('One.'))
			.mockRejectedValueOnce(new AssistantError('provider_error'))
			.mockResolvedValueOnce(answer('Three.'));
		const { locks, held } = stubLocks();
		const { state } = makeState({ ask, locks });
		await state.open();

		await state.send('First?');
		expect(held.size).toBe(0);
		await state.send('Second?');
		// A stream that threw is the way a lock leaks, so the third send is the
		// assertion: it proceeds, which it could not do behind a held conversation.
		expect(state.messages[3]!.status).toBe('failed');
		expect(held.size).toBe(0);

		await state.send('Third?');

		expect(state.failure).toBeUndefined();
		expect(state.messages[5]!.answer?.blocks[0]!.text).toBe('Three.');
		expect(held.size).toBe(0);
	});

	it('sends exactly as before where the browser has no lock manager', async () => {
		const { state, deps } = makeState({ locks: null });
		await state.open();
		await state.send('First?');
		await state.send('Second?');

		// An old Safari, and every prerender: the conversation is written the way
		// it was written before any of this existed.
		expect(state.failure).toBeUndefined();
		expect(state.messages).toHaveLength(4);
		expect(deps.ask).toHaveBeenCalledTimes(2);
	});

	it('sends anyway where the lock manager refuses the request', async () => {
		const locks: LockManager = {
			query: () => Promise.reject(new Error('SecurityError')),
			request: () => Promise.reject(new Error('SecurityError'))
		};
		const { state, deps } = makeState({ locks });
		await state.open();
		await state.send('First?');

		// Fails open in this direction too: a manager that will not take the
		// request is not a reason to swallow somebody's question.
		expect(state.failure).toBeUndefined();
		expect(state.messages[1]!.status).toBe('complete');
		expect(deps.ask).toHaveBeenCalledOnce();
	});

	it('names one lock per conversation', () => {
		expect(chatLockName('chat-1')).toBe('lyriclint-chat-chat-1');
	});
});
