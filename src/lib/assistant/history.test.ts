import { describe, expect, it } from 'vitest';
import type { AssistantMessageRecord } from '$lib/persistence/types.js';
import { boundedHistory } from './history.js';
import { HISTORY_WINDOW_CHARS } from './types.js';

let counter = 0;
function message(
	role: 'user' | 'assistant',
	content: string,
	status: AssistantMessageRecord['status'] = 'complete'
): AssistantMessageRecord {
	counter += 1;
	return {
		id: `m${counter}`,
		chatId: 'chat',
		role,
		createdAt: new Date(counter).toISOString(),
		status,
		content
	};
}

describe('boundedHistory', () => {
	it('sends complete recent exchanges plus the question', () => {
		const history = [message('user', 'q1'), message('assistant', 'a1')];
		const window = boundedHistory(history, 'q2');
		expect(window.messages).toEqual([
			{ role: 'user', content: 'q1' },
			{ role: 'assistant', content: 'a1' },
			{ role: 'user', content: 'q2' }
		]);
		expect(window.firstIncludedIndex).toBe(0);
	});

	it('drops the oldest exchanges past the character window, whole', () => {
		const history = [
			message('user', 'x'.repeat(HISTORY_WINDOW_CHARS)),
			message('assistant', 'y'.repeat(10)),
			message('user', 'recent question'),
			message('assistant', 'recent answer')
		];
		const window = boundedHistory(history, 'q');
		expect(window.messages).toHaveLength(3);
		expect(window.messages[0]!.content).toBe('recent question');
		expect(window.firstIncludedIndex).toBe(2);
	});

	it('never counts a failed or interrupted turn as context', () => {
		const history = [
			message('user', 'lost question'),
			message('assistant', '', 'failed'),
			message('user', 'answered question'),
			message('assistant', 'the answer')
		];
		const window = boundedHistory(history, 'q');
		expect(window.messages.map((entry) => entry.content)).toEqual([
			'answered question',
			'the answer',
			'q'
		]);
	});

	it('sends only the question when nothing usable precedes it', () => {
		const window = boundedHistory([], 'first question');
		expect(window.messages).toEqual([{ role: 'user', content: 'first question' }]);
		expect(window.firstIncludedIndex).toBe(0);
	});
});
