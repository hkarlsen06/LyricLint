/**
 * Browser-local conversation persistence, on the same Dexie database as the
 * drafts (version 4). Conversations survive reloads and modal closure, stay in
 * this browser, and go only when the user deletes them — singly here, or all
 * at once through `Delete all local data`, which clears these tables in the
 * draft repository's own transaction.
 */
import { randomId } from '$lib/core/random-id.js';
import type { LyricLintDatabase } from '$lib/persistence/database.js';
import type { AssistantChatRecord, AssistantMessageRecord } from '$lib/persistence/types.js';

export interface AssistantChatRepository {
	listChats(): Promise<AssistantChatRecord[]>;
	createChat(title: string, ruleSetVersion: string): Promise<AssistantChatRecord>;
	renameChat(id: string, title: string): Promise<void>;
	touchChat(id: string): Promise<void>;
	deleteChat(id: string): Promise<void>;
	messagesFor(chatId: string): Promise<AssistantMessageRecord[]>;
	addMessage(
		message: Omit<AssistantMessageRecord, 'id'> & { id?: string }
	): Promise<AssistantMessageRecord>;
	updateMessage(id: string, patch: Partial<AssistantMessageRecord>): Promise<void>;
	/**
	 * Boot-time sweep: a `pending` answer cannot outlive the session that asked
	 * it — unless `resumable` says this one can. The caller owns that rule,
	 * because what makes a turn resumable is a fact about the tool protocol
	 * rather than about storage.
	 */
	markPendingInterrupted(resumable: (message: AssistantMessageRecord) => boolean): Promise<void>;
}

/** Exported for the store as well: a plain module may hold a transient Date,
 * where a reactive `.svelte.ts` module would be told to use SvelteDate. */
export function nowIso(): string {
	return new Date().toISOString();
}

const now = nowIso;

export function createAssistantChatRepository(
	database: LyricLintDatabase
): AssistantChatRepository {
	return {
		async listChats() {
			const chats = await database.assistantChats.toArray();
			return chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		},

		async createChat(title, ruleSetVersion) {
			const record: AssistantChatRecord = {
				id: randomId(),
				title,
				createdAt: now(),
				updatedAt: now(),
				ruleSetVersion
			};
			await database.assistantChats.add(record);
			return record;
		},

		async renameChat(id, title) {
			await database.assistantChats.update(id, { title, updatedAt: now() });
		},

		async touchChat(id) {
			await database.assistantChats.update(id, { updatedAt: now() });
		},

		async deleteChat(id) {
			await database.transaction(
				'rw',
				database.assistantChats,
				database.assistantMessages,
				async () => {
					await database.assistantChats.delete(id);
					await database.assistantMessages.where('chatId').equals(id).delete();
				}
			);
		},

		async messagesFor(chatId) {
			const messages = await database.assistantMessages.where('chatId').equals(chatId).toArray();
			return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		},

		async addMessage(message) {
			const record: AssistantMessageRecord = { ...message, id: message.id ?? randomId() };
			await database.assistantMessages.add(record);
			return record;
		},

		async updateMessage(id, patch) {
			await database.assistantMessages.update(id, patch);
		},

		async markPendingInterrupted(resumable) {
			await database.assistantMessages
				.filter((message) => message.status === 'pending' && !resumable(message))
				.modify({ status: 'interrupted' });
		}
	};
}
