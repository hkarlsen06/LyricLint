import { describe, expect, it, vi } from 'vitest';
import { memoryRepository } from './assistant-test-utils.js';
import { createAssistantState, type AssistantDeps } from './assistant.svelte.js';
import { AssistantError, type AnswerResponse } from './types.js';

function answer(text = 'An answer.'): AnswerResponse {
	return {
		requestId: 'req-1',
		assistant: {
			scope: 'general',
			blocks: [{ kind: 'general', text, ruleIds: [], sourceIds: [] }]
		},
		quota: { browserRemaining: 24, ipRemaining: 74, resetsAt: '2026-08-02T00:00:00.000Z' }
	};
}

function makeState(overrides: Partial<AssistantDeps> = {}) {
	const repository = memoryRepository();
	const deps: AssistantDeps = {
		repository: async () => repository,
		ask: vi.fn(async () => answer()),
		ruleSetVersion: 'test-version',
		...overrides
	};
	return { state: createAssistantState(deps), deps, repository };
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
		let release!: (value: AnswerResponse) => void;
		const ask = vi.fn(() => new Promise<AnswerResponse>((resolve) => (release = resolve)));
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
		let release!: (value: AnswerResponse) => void;
		const ask = vi.fn(() => new Promise<AnswerResponse>((resolve) => (release = resolve)));
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
});
