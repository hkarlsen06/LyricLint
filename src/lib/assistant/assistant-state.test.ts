import { describe, expect, it, vi } from 'vitest';
import type { AssistantDraftBridge } from './draft-bridge.js';
import { memoryRepository } from './assistant-test-utils.js';
import { createAssistantState, type AssistantDeps } from './assistant.svelte.js';
import {
	AssistantError,
	type AnswerTurnResponse,
	type AssistantLinkAction,
	type AssistantProposal,
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

function manageLinksCall(actions: AssistantLinkAction[], callId = 'links-1') {
	return toolCalls([{ callId, name: 'manage_links', input: { actions } }]);
}

function draftBridge(initial = 'hello world', applyResult = true) {
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
		draftId: () => 'draft-1',
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
			results: [{ result: { outcomes: [{ id: 'tie', status: 'failed', reason: 'apply-failed' }] } }]
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
			results: [{ result: { outcomes: [{ id: 'tie', status: 'failed', reason: 'not-found' }] } }]
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
					result: { outcomes: [{ id: 'one', status: 'failed', reason: 'not-found' }] }
				}
			]
		});
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
					result: { outcomes: [{ id: 'one', status: 'failed', reason: 'apply-failed' }] }
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
