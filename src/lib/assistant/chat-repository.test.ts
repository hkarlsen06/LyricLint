import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type LyricLintDatabase } from '$lib/persistence/database.js';
import { createDraftRepository } from '$lib/persistence/draft-repository.js';
import { createAssistantChatRepository } from './chat-repository.js';

let openDatabases: LyricLintDatabase[] = [];
let counter = 0;

async function database(): Promise<LyricLintDatabase> {
	counter += 1;
	const instance = await openDatabase(`assistant-test-${counter}`);
	openDatabases.push(instance);
	return instance;
}

afterEach(async () => {
	for (const instance of openDatabases) {
		await instance.delete();
	}
	openDatabases = [];
});

describe('assistant chat repository', () => {
	it('persists chats and messages across a reopen', async () => {
		const name = `assistant-persist-${Date.now()}`;
		const first = await openDatabase(name);
		openDatabases.push(first);
		const repo = createAssistantChatRepository(first);
		const chat = await repo.createChat('Chorus headers', '2026.07.30.0');
		await repo.addMessage({
			chatId: chat.id,
			role: 'user',
			createdAt: new Date().toISOString(),
			status: 'complete',
			content: 'When does a chorus need its own header?'
		});
		first.close();

		const reopened = await openDatabase(name);
		openDatabases.push(reopened);
		const repo2 = createAssistantChatRepository(reopened);
		const chats = await repo2.listChats();
		expect(chats).toHaveLength(1);
		expect(chats[0]!.title).toBe('Chorus headers');
		const messages = await repo2.messagesFor(chat.id);
		expect(messages).toHaveLength(1);
		expect(messages[0]!.content).toContain('chorus');
	});

	it('marks pending messages interrupted in the swept chat, sparing what the caller keeps and every other chat', async () => {
		const repo = createAssistantChatRepository(await database());
		const chat = await repo.createChat('t', 'v');
		// Another tab's conversation, streaming right now. The sweep is scoped to
		// the chat being opened, so nothing here may be touched by it.
		const elsewhere = await repo.createChat('another tab', 'v');
		const live = await repo.addMessage({
			chatId: elsewhere.id,
			role: 'assistant',
			createdAt: new Date().toISOString(),
			status: 'pending',
			content: 'still streaming'
		});
		const pending = await repo.addMessage({
			chatId: chat.id,
			role: 'assistant',
			createdAt: new Date().toISOString(),
			status: 'pending',
			content: ''
		});
		const complete = await repo.addMessage({
			chatId: chat.id,
			role: 'assistant',
			createdAt: new Date().toISOString(),
			status: 'complete',
			content: 'done'
		});
		// The sweep is offered every pending record and takes the caller's word
		// for which of them a later session can still carry on.
		const spared = await repo.addMessage({
			chatId: chat.id,
			role: 'assistant',
			createdAt: new Date().toISOString(),
			status: 'pending',
			content: 'waiting on the user'
		});
		const seen: string[] = [];
		await repo.markPendingInterrupted(chat.id, (message) => {
			seen.push(message.id);
			return message.id === spared.id;
		});
		const messages = await repo.messagesFor(chat.id);
		expect(seen).not.toContain(complete.id);
		expect(seen).not.toContain(live.id);
		expect(messages.find((message) => message.id === pending.id)!.status).toBe('interrupted');
		expect(messages.find((message) => message.id === complete.id)!.status).toBe('complete');
		expect(messages.find((message) => message.id === spared.id)!.status).toBe('pending');
		expect((await repo.messagesFor(elsewhere.id))[0]!.status).toBe('pending');
	});

	it('deletes a chat with its messages', async () => {
		const db = await database();
		const repo = createAssistantChatRepository(db);
		const keep = await repo.createChat('keep', 'v');
		const drop = await repo.createChat('drop', 'v');
		await repo.addMessage({
			chatId: drop.id,
			role: 'user',
			createdAt: new Date().toISOString(),
			status: 'complete',
			content: 'x'
		});
		await repo.deleteChat(drop.id);
		expect((await repo.listChats()).map((chat) => chat.id)).toEqual([keep.id]);
		expect(await db.assistantMessages.count()).toBe(0);
	});

	it('is cleared by Delete all local data along with the drafts', async () => {
		const db = await database();
		const chats = createAssistantChatRepository(db);
		const drafts = createDraftRepository(db);
		const chat = await chats.createChat('t', 'v');
		await chats.addMessage({
			chatId: chat.id,
			role: 'user',
			createdAt: new Date().toISOString(),
			status: 'complete',
			content: 'x'
		});
		await drafts.create({ title: 'A draft', text: '[Verse]\nLine' });
		await drafts.deleteAll();
		expect(await db.assistantChats.count()).toBe(0);
		expect(await db.assistantMessages.count()).toBe(0);
		expect(await db.drafts.count()).toBe(0);
	});
});
