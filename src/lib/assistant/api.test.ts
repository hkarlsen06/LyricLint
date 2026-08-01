import { describe, expect, it, vi } from 'vitest';
import { askAssistant } from './api.js';

describe('assistant answer streaming', () => {
	it('publishes validated text deltas before resolving the complete answer', async () => {
		const events = [
			{ type: 'start', requestId: 'req-1', scope: 'reviewed' },
			{ type: 'block_start', kind: 'prose' },
			{ type: 'text_delta', delta: 'A chorus ' },
			{ type: 'text_delta', delta: 'needs a header.' },
			{ type: 'block_done', ruleIds: ['section.header-missing'], sourceIds: [] },
			{
				type: 'done',
				quota: { browserRemaining: 24, ipRemaining: 74, resetsAt: '2026-08-02T00:00:00Z' }
			}
		];
		const progress = vi.fn();
		const fetcher = vi.fn(
			async () =>
				new Response(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`, {
					headers: { 'content-type': 'application/x-ndjson' }
				})
		);

		const response = await askAssistant({
			chatId: 'chat-1',
			messages: [{ role: 'user', content: 'Chorus?' }],
			clientRuleSetVersion: 'v1',
			fetcher,
			onProgress: progress
		});

		expect(progress).toHaveBeenCalledWith({
			scope: 'reviewed',
			blocks: [{ kind: 'prose', text: 'A chorus ', ruleIds: [], sourceIds: [] }]
		});
		expect(progress).toHaveBeenLastCalledWith(response.assistant);
		expect(response.assistant.blocks[0]).toEqual({
			kind: 'prose',
			text: 'A chorus needs a header.',
			ruleIds: ['section.header-missing'],
			sourceIds: []
		});
		expect(fetcher).toHaveBeenCalledWith(
			'https://assistant.test/v1/answers',
			expect.objectContaining({
				headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' }
			})
		);
	});
});
