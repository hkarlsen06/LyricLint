/**
 * The one assistant conversation state, owned by the root-level host so every
 * entry point — the /rules/ prompt and the workbench toolbar — opens the same
 * conversation, and a request stays live while the modal is closed.
 */
import { getContext, setContext } from 'svelte';
import type { AssistantChatRecord, AssistantMessageRecord } from '$lib/persistence/types.js';
import { currentRuleSet } from '$lib/rules/data/rule-set.js';
import { askAssistant, type AskOptions } from './api.js';
import { nowIso, type AssistantChatRepository } from './chat-repository.js';
import { boundedHistory } from './history.js';
import {
	AssistantError,
	MAX_QUESTION_CHARS,
	type AnswerResponse,
	type AssistantErrorCode,
	type AssistantQuota
} from './types.js';

export interface AssistantDeps {
	/** Lazy so nothing opens Dexie until the assistant is first used. */
	repository(): Promise<AssistantChatRepository>;
	ask(options: AskOptions): Promise<AnswerResponse>;
	ruleSetVersion: string;
}

export interface AssistantFailure {
	code: AssistantErrorCode;
	message: string;
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

function chatTitle(question: string): string {
	const line = question.trim().split('\n')[0] ?? '';
	return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line || 'New chat';
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
	/** The attempt a challenge or retry resumes. */
	let currentAttempt: { assistantMessageId: string } | undefined;

	async function repository(): Promise<AssistantChatRepository> {
		repositoryPromise ??= deps.repository();
		return repositoryPromise;
	}

	async function initialize(): Promise<void> {
		if (ready) return;
		const repo = await repository();
		// A reload cannot resume a request it no longer holds.
		await repo.markPendingInterrupted();
		chats = await repo.listChats();
		const latest = chats[0];
		if (latest) {
			activeChatId = latest.id;
			messages = await repo.messagesFor(latest.id);
		}
		ready = true;
	}

	function fail(error: unknown): AssistantFailure {
		const code = error instanceof AssistantError ? error.code : 'provider_error';
		return { code, message: FAILURE_MESSAGES[code] };
	}

	async function attempt(assistantMessageId: string, turnstileToken?: string): Promise<void> {
		const repo = await repository();
		const assistantIndex = messages.findIndex((message) => message.id === assistantMessageId);
		const userMessage = assistantIndex > 0 ? messages[assistantIndex - 1] : undefined;
		if (assistantIndex === -1 || !userMessage || userMessage.role !== 'user' || !activeChatId)
			return;

		busy = true;
		failure = undefined;
		currentAttempt = { assistantMessageId };
		const patch = async (update: Partial<AssistantMessageRecord>) => {
			messages = messages.map((message) =>
				message.id === assistantMessageId ? { ...message, ...update } : message
			);
			await repo.updateMessage(assistantMessageId, update);
		};
		const showProgress = async (answer: AnswerResponse['assistant']) => {
			messages = messages.map((message) =>
				message.id === assistantMessageId ? { ...message, answer } : message
			);
			await new Promise<void>((resolve) => setTimeout(resolve, 16));
		};
		try {
			await patch({ status: 'pending' });
			const window = boundedHistory(messages.slice(0, assistantIndex - 1), userMessage.content);
			contextDividerIndex = window.firstIncludedIndex;
			const response = await deps.ask({
				chatId: activeChatId,
				messages: window.messages,
				clientRuleSetVersion: deps.ruleSetVersion,
				onProgress: showProgress,
				...(turnstileToken ? { turnstileToken } : {})
			});
			challengePending = false;
			currentAttempt = undefined;
			quota = response.quota;
			await patch({
				status: 'complete',
				answer: response.assistant,
				requestId: response.requestId,
				content: response.assistant.blocks.map((block) => block.text).join('\n\n')
			});
			await repo.touchChat(activeChatId);
			chats = await repo.listChats();
		} catch (error) {
			const described = fail(error);
			failure = described;
			if (described.code === 'challenge_required' || described.code === 'challenge_failed') {
				// The question stands; the widget resolves it.
				challengePending = true;
			} else {
				currentAttempt = undefined;
				await patch({ status: 'failed' });
			}
		} finally {
			busy = false;
		}
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

		async open(): Promise<void> {
			isOpen = true;
			await initialize();
		},

		/** The /rules/ prompt: open the modal and send in one gesture. */
		async openWithQuestion(question: string): Promise<void> {
			await this.open();
			if (question.trim()) await this.send(question);
		},

		/** Closing never cancels a request; state lives here, not in the dialog. */
		close(): void {
			isOpen = false;
		},

		async newChat(): Promise<void> {
			if (busy || challengePending) return;
			await initialize();
			activeChatId = undefined;
			messages = [];
			failure = undefined;
			challengePending = false;
			contextDividerIndex = undefined;
		},

		async selectChat(id: string): Promise<void> {
			if (busy || challengePending) return;
			const repo = await repository();
			activeChatId = id;
			messages = await repo.messagesFor(id);
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
			}
		},

		async send(question: string): Promise<void> {
			const text = question.trim();
			if (!text || busy || challengePending) return;
			if ([...text].length > MAX_QUESTION_CHARS) {
				failure = { code: 'invalid_request', message: FAILURE_MESSAGES.invalid_request };
				return;
			}
			await initialize();
			const repo = await repository();
			if (!activeChatId) {
				const chat = await repo.createChat(chatTitle(text), deps.ruleSetVersion);
				activeChatId = chat.id;
				chats = await repo.listChats();
				messages = [];
			}
			const user = await repo.addMessage({
				chatId: activeChatId,
				role: 'user',
				createdAt: nowIso(),
				status: 'complete',
				content: text
			});
			const placeholder = await repo.addMessage({
				chatId: activeChatId,
				role: 'assistant',
				createdAt: nowIso(),
				status: 'pending',
				content: ''
			});
			messages = [...messages, user, placeholder];
			await attempt(placeholder.id);
		},

		/** Retry a failed or interrupted answer in place. */
		async retry(assistantMessageId: string): Promise<void> {
			if (busy) return;
			const target = messages.find((message) => message.id === assistantMessageId);
			if (!target || target.role !== 'assistant' || target.status === 'complete') return;
			await attempt(assistantMessageId);
		},

		/** The Turnstile widget passed; resume the attempt it interrupted. */
		async submitChallenge(token: string): Promise<void> {
			const attemptRef = currentAttempt;
			challengePending = false;
			if (attemptRef) await attempt(attemptRef.assistantMessageId, token);
		}
	};
}

export type AssistantState = ReturnType<typeof createAssistantState>;

/** The production wiring: Dexie behind a lazy import, the real API client,
 * and the shipped ruleset version. */
export function createDefaultAssistantState(): AssistantState {
	return createAssistantState({
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
