/** In-memory fakes for assistant tests: a repository with the real contract
 * and a canned answer factory. Nothing here touches Dexie or the network. */
import type { AssistantMessageRecord } from '$lib/persistence/types.js';
import type { AssistantChatRepository } from './chat-repository.js';
import type { AnswerResponse, StructuredAssistantAnswer } from './types.js';

export function memoryRepository(): AssistantChatRepository {
	const chats = new Map<
		string,
		{ id: string; title: string; createdAt: string; updatedAt: string; ruleSetVersion: string }
	>();
	const messages = new Map<string, AssistantMessageRecord>();
	let counter = 0;
	return {
		async listChats() {
			return [...chats.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		},
		async createChat(title, ruleSetVersion) {
			counter += 1;
			const record = {
				id: `chat-${counter}`,
				title,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				ruleSetVersion
			};
			chats.set(record.id, record);
			return record;
		},
		async renameChat(id, title) {
			const chat = chats.get(id);
			if (chat) chat.title = title;
		},
		async touchChat(id) {
			const chat = chats.get(id);
			if (chat) chat.updatedAt = new Date().toISOString();
		},
		async deleteChat(id) {
			chats.delete(id);
			for (const [key, message] of messages) {
				if (message.chatId === id) messages.delete(key);
			}
		},
		async messagesFor(chatId) {
			return [...messages.values()]
				.filter((message) => message.chatId === chatId)
				.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		},
		async addMessage(message) {
			counter += 1;
			const record = { ...message, id: message.id ?? `m-${counter}` };
			messages.set(record.id, record);
			return record;
		},
		async updateMessage(id, patch) {
			const record = messages.get(id);
			if (record) messages.set(id, { ...record, ...patch });
		},
		async markPendingInterrupted() {
			for (const [key, message] of messages) {
				if (message.status === 'pending') messages.set(key, { ...message, status: 'interrupted' });
			}
		}
	};
}

export function cannedAnswer(
	assistant: StructuredAssistantAnswer,
	quota = { browserRemaining: 24, ipRemaining: 74, resetsAt: '2026-08-02T00:00:00.000Z' }
): AnswerResponse {
	return { requestId: `req-${Math.random().toString(36).slice(2)}`, assistant, quota };
}
