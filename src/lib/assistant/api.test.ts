import { afterEach, describe, expect, it, vi } from 'vitest';
import { askAssistant, STREAM_INACTIVITY_MS } from './api.js';
import { AssistantError } from './types.js';

const DONE = {
	type: 'done',
	quota: { browserRemaining: 24, ipRemaining: 74, resetsAt: '2026-08-02T00:00:00Z' }
};

/**
 * A stub that behaves like `fetch` in the one way the inactivity watchdog
 * depends on: aborting the signal errors the response body, so a `read()`
 * pending on a stalled stream rejects. A stub that took the signal and ignored
 * it would leave that read hanging forever and make an aborted turn look
 * exactly like a passing test.
 */
function stalledFetcher() {
	const encoder = new TextEncoder();
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	let settled = false;
	const body = new ReadableStream<Uint8Array>({
		start(streamController) {
			controller = streamController;
		}
	});
	const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
		init?.signal?.addEventListener('abort', () => {
			if (settled) return;
			settled = true;
			controller.error(init.signal?.reason ?? new Error('The fetch was aborted.'));
		});
		return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } });
	});
	return {
		fetcher,
		send(...events: unknown[]) {
			controller.enqueue(
				encoder.encode(events.map((event) => `${JSON.stringify(event)}\n`).join(''))
			);
		},
		close() {
			settled = true;
			controller.close();
		}
	};
}

/**
 * The watchdog only ever fires against a wedged connection, so every test here
 * runs on virtual time — a real one would take three minutes to establish that
 * something did *not* happen.
 */
describe('assistant answer stream inactivity', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('fails a stream that stops arriving with the connection still open', async () => {
		vi.useFakeTimers();
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const stream = stalledFetcher();
		let settled = false;
		const pending = askAssistant({
			chatId: 'chat-stall',
			messages: [{ role: 'user', content: 'Question' }],
			clientRuleSetVersion: 'v1',
			fetcher: stream.fetcher
		})
			.then(() => undefined)
			.catch((error: unknown) => error)
			.finally(() => {
				settled = true;
			});

		stream.send(
			{ type: 'start', requestId: 'req-stall', scope: 'general' },
			{ type: 'block_start', kind: 'general' },
			{ type: 'text_delta', delta: 'Two chunks ' }
		);
		await vi.advanceTimersByTimeAsync(1_000);
		stream.send({ type: 'text_delta', delta: 'then nothing.' });
		await vi.advanceTimersByTimeAsync(1_000);

		// The turn is still open here, so the watchdog is a fresh window rather
		// than a deadline the two chunks have been spending.
		await vi.advanceTimersByTimeAsync(STREAM_INACTIVITY_MS - 2_000);
		expect(settled).toBe(false);

		await vi.advanceTimersByTimeAsync(2_000);
		await expect(pending).resolves.toEqual(
			expect.objectContaining<Partial<AssistantError>>({
				code: 'provider_error',
				message: 'The answer stream was interrupted.'
			})
		);
		// The worded failure never carries the cause, so the abort has to be the
		// thing in the log or a stall is indistinguishable from a parser bug.
		expect(logged).toHaveBeenCalledWith('assistant_stream_interrupted', expect.anything());
	});

	it('leaves a slow stream alone while it is still arriving', async () => {
		vi.useFakeTimers();
		const stream = stalledFetcher();
		const pending = askAssistant({
			chatId: 'chat-slow',
			messages: [{ role: 'user', content: 'Question' }],
			clientRuleSetVersion: 'v1',
			fetcher: stream.fetcher
		});

		// Well past the window in total, and never a gap of it: the watchdog
		// measures silence between chunks, not how long an answer takes.
		stream.send({ type: 'start', requestId: 'req-slow', scope: 'general' });
		await vi.advanceTimersByTimeAsync(STREAM_INACTIVITY_MS - 1_000);
		stream.send({ type: 'block_start', kind: 'general' });
		await vi.advanceTimersByTimeAsync(STREAM_INACTIVITY_MS - 1_000);
		stream.send({ type: 'text_delta', delta: 'Slow but alive.' });
		await vi.advanceTimersByTimeAsync(STREAM_INACTIVITY_MS - 1_000);
		stream.send({ type: 'block_done', ruleIds: [], sourceIds: [] }, DONE);
		stream.close();

		await expect(pending).resolves.toMatchObject({
			kind: 'answer',
			assistant: { blocks: [{ text: 'Slow but alive.' }] }
		});
	});

	it('leaves no timer behind once a turn completes', async () => {
		vi.useFakeTimers();
		const events = [
			{ type: 'start', requestId: 'req-clean', scope: 'general' },
			{ type: 'block_start', kind: 'general' },
			{ type: 'text_delta', delta: 'Answered.' },
			{ type: 'block_done', ruleIds: [], sourceIds: [] },
			DONE
		];
		const fetcher = vi.fn(
			async () =>
				new Response(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`, {
					headers: { 'content-type': 'application/x-ndjson' }
				})
		);

		await askAssistant({
			chatId: 'chat-clean',
			messages: [{ role: 'user', content: 'Question' }],
			clientRuleSetVersion: 'v1',
			fetcher
		});
		// A watchdog that outlived its turn would abort a controller nothing is
		// reading — invisible here, and a leak per question in the workbench.
		expect(vi.getTimerCount()).toBe(0);
	});
});

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
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			void input;
			void init;
			return new Response(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`, {
				headers: { 'content-type': 'application/x-ndjson' }
			});
		});

		const response = await askAssistant({
			chatId: 'chat-1',
			messages: [{ role: 'user', content: 'Chorus?' }],
			clientRuleSetVersion: 'v1',
			fetcher,
			onProgress: progress
		});
		expect(response.kind).toBe('answer');
		if (response.kind !== 'answer') throw new Error('Expected an answer turn.');

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
		const sent = JSON.parse(vi.mocked(fetcher).mock.calls[0]![1]!.body as string) as Record<
			string,
			unknown
		>;
		expect(sent.supportsRetry).toBe(true);
	});

	/**
	 * Validation can shorten a block — a trailing citation run is stripped after
	 * every delta of it has already been sent — and the client assembles purely
	 * from deltas, so the close carries the validated text where it differs.
	 * Streaming is the only mode production uses, so without this the strip was
	 * invisible exactly where it matters.
	 */
	it('takes the validated text from a block that closes carrying one', async () => {
		const events = [
			{ type: 'start', requestId: 'req-strip', scope: 'reviewed' },
			{ type: 'block_start', kind: 'prose' },
			{ type: 'text_delta', delta: 'A chorus needs a header.' },
			{ type: 'text_delta', delta: '¹' },
			{
				type: 'block_done',
				text: 'A chorus needs a header.',
				ruleIds: ['section.header-missing'],
				sourceIds: []
			},
			{
				type: 'done',
				quota: { browserRemaining: 24, ipRemaining: 74, resetsAt: '2026-08-02T00:00:00Z' }
			}
		];
		const fetcher = vi.fn(
			async () =>
				new Response(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`, {
					headers: { 'content-type': 'application/x-ndjson' }
				})
		);

		const response = await askAssistant({
			chatId: 'chat-strip',
			messages: [{ role: 'user', content: 'Chorus?' }],
			clientRuleSetVersion: 'v1',
			fetcher
		});
		expect(response.kind).toBe('answer');
		if (response.kind !== 'answer') throw new Error('Expected an answer turn.');
		expect(response.assistant.blocks).toEqual([
			{
				kind: 'prose',
				text: 'A chorus needs a header.',
				ruleIds: ['section.header-missing'],
				sourceIds: []
			}
		]);
	});

	/**
	 * The narration a tool round streamed is stored off the throttled mirror
	 * (`handleToolCalls` reads the message's live answer), so deltas landing
	 * inside the last 32ms before the calls arrive are the ones that would go
	 * missing from the transcript for good. Only an *open* block can hold any:
	 * a close already forces its own publish.
	 *
	 * What the turn finally resolves to is deliberately not asserted here — the
	 * worker leaves a narration block open on a tool round, and what the reader
	 * does with that is a separate question from whether the text reached the
	 * surface before the calls did.
	 */
	it('forces the streamed narration through before the tool calls arrive', async () => {
		const events = [
			{ type: 'start', requestId: 'req-tools', scope: 'general' },
			{ type: 'block_start', kind: 'general' },
			{ type: 'text_delta', delta: 'Let me read ' },
			{ type: 'text_delta', delta: "the 'scribe." },
			{
				type: 'tool_calls',
				calls: [{ callId: 'call-1', name: 'read_scribe', input: {} }],
				providerItems: '[{"type":"function_call"}]'
			},
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

		await askAssistant({
			chatId: 'chat-tools',
			messages: [{ role: 'user', content: 'Check my draft.' }],
			clientRuleSetVersion: 'v2',
			toolsAvailable: true,
			fetcher,
			onProgress: progress
		}).catch(() => undefined);

		// Both deltas land within one throttle window, so only the forced publish
		// carries the second one.
		expect(progress).toHaveBeenLastCalledWith({
			scope: 'general',
			blocks: [{ kind: 'general', text: "Let me read the 'scribe.", ruleIds: [], sourceIds: [] }]
		});
	});

	/**
	 * NDJSON is newline-delimited, not newline-terminated. A stream whose last
	 * line arrives without one used to leave a whole event — the `done` carrying
	 * the quota — in the buffer, and the turn failed with the entire answer in
	 * hand.
	 */
	it('reads a final line that arrives without a trailing newline', async () => {
		const events = [
			{ type: 'start', requestId: 'req-tail', scope: 'general' },
			{ type: 'block_start', kind: 'general' },
			{ type: 'text_delta', delta: 'Answered.' },
			{ type: 'block_done', ruleIds: [], sourceIds: [] },
			{
				type: 'done',
				quota: { browserRemaining: 5, ipRemaining: 6, resetsAt: '2026-08-02T00:00:00Z' }
			}
		];
		const fetcher = vi.fn(
			async () =>
				new Response(events.map((event) => JSON.stringify(event)).join('\n'), {
					headers: { 'content-type': 'application/x-ndjson' }
				})
		);

		const response = await askAssistant({
			chatId: 'chat-tail',
			messages: [{ role: 'user', content: 'Question' }],
			clientRuleSetVersion: 'v1',
			fetcher
		});
		expect(response).toMatchObject({
			kind: 'answer',
			assistant: { blocks: [{ text: 'Answered.' }] },
			quota: { browserRemaining: 5 }
		});
	});

	it('discards speculative blocks and restarts from the repaired answer', async () => {
		const events = [
			{ type: 'start', requestId: 'req-repair', scope: 'reviewed' },
			{ type: 'block_start', kind: 'prose' },
			{ type: 'text_delta', delta: 'Invented answer.' },
			{ type: 'retrying' },
			{ type: 'start', requestId: 'req-repair', scope: 'general' },
			{ type: 'block_start', kind: 'general' },
			{ type: 'text_delta', delta: 'Corrected answer.' },
			{ type: 'block_done', kind: 'general', ruleIds: [], sourceIds: [] },
			{
				type: 'done',
				quota: { browserRemaining: 24, ipRemaining: 74, resetsAt: '2026-08-02T00:00:00Z' }
			}
		];
		const progress = vi.fn();
		const retry = vi.fn();
		const fetcher = vi.fn(
			async () =>
				new Response(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`, {
					headers: { 'content-type': 'application/x-ndjson' }
				})
		);

		const response = await askAssistant({
			chatId: 'chat-repair',
			messages: [{ role: 'user', content: 'Question' }],
			clientRuleSetVersion: 'v1',
			fetcher,
			onProgress: progress,
			onRetry: retry
		});

		expect(retry).toHaveBeenCalledTimes(1);
		expect(response).toMatchObject({
			kind: 'answer',
			assistant: {
				scope: 'general',
				blocks: [{ kind: 'general', text: 'Corrected answer.', ruleIds: [], sourceIds: [] }]
			}
		});
		expect(progress).toHaveBeenLastCalledWith(
			expect.objectContaining({
				blocks: [expect.objectContaining({ text: 'Corrected answer.' })]
			})
		);
		expect(progress).not.toHaveBeenLastCalledWith(
			expect.objectContaining({
				blocks: [expect.objectContaining({ text: 'Invented answer.' })]
			})
		);
	});

	it('reads the worker ordering: every block opens before any block closes', async () => {
		// The worker cannot close a block before validation, so a multi-block
		// answer streams all its block_starts first and every block_done arrives
		// at the end, oldest block first — with the validated kind on the close.
		const events = [
			{ type: 'start', requestId: 'req-q', scope: 'mixed' },
			{ type: 'block_start', kind: 'general' },
			{ type: 'text_delta', delta: 'First block.' },
			{ type: 'block_start', kind: 'general' },
			{ type: 'text_delta', delta: 'Second block.' },
			{ type: 'block_done', kind: 'prose', ruleIds: ['punctuation.dashes'], sourceIds: [] },
			{ type: 'block_done', kind: 'general', ruleIds: [], sourceIds: [] },
			{
				type: 'done',
				quota: { browserRemaining: 24, ipRemaining: 74, resetsAt: '2026-08-02T00:00:00Z' }
			}
		];
		const fetcher = vi.fn(
			async () =>
				new Response(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`, {
					headers: { 'content-type': 'application/x-ndjson' }
				})
		);

		const response = await askAssistant({
			chatId: 'chat-q',
			messages: [{ role: 'user', content: 'Dashes?' }],
			clientRuleSetVersion: 'v1',
			fetcher
		});
		expect(response.kind).toBe('answer');
		if (response.kind !== 'answer') throw new Error('Expected an answer turn.');
		expect(response.assistant.blocks).toEqual([
			{ kind: 'prose', text: 'First block.', ruleIds: ['punctuation.dashes'], sourceIds: [] },
			{ kind: 'general', text: 'Second block.', ruleIds: [], sourceIds: [] }
		]);
	});

	it('publishes progress while the response stream is still open', async () => {
		const encoder = new TextEncoder();
		let streamController!: ReadableStreamDefaultController<Uint8Array>;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				streamController = controller;
			}
		});
		const progress = vi.fn();
		const fetcher = vi.fn(async () => {
			return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } });
		});
		let settled = false;
		const pending = askAssistant({
			chatId: 'chat-1',
			messages: [{ role: 'user', content: 'Chorus?' }],
			clientRuleSetVersion: 'v1',
			fetcher,
			onProgress: progress
		}).finally(() => {
			settled = true;
		});

		streamController.enqueue(
			encoder.encode(
				`${JSON.stringify({ type: 'start', requestId: 'req-open', scope: 'general' })}\n${JSON.stringify({ type: 'block_start', kind: 'general' })}\n${JSON.stringify({ type: 'text_delta', delta: 'Still writing' })}\n`
			)
		);
		await vi.waitFor(() => expect(progress).toHaveBeenCalledTimes(1));
		expect(settled).toBe(false);

		streamController.enqueue(
			encoder.encode(
				`${JSON.stringify({ type: 'text_delta', delta: ' now.' })}\n${JSON.stringify({ type: 'block_done', ruleIds: [], sourceIds: [] })}\n${JSON.stringify({ type: 'done', quota: { browserRemaining: 1, ipRemaining: 2, resetsAt: 'later' } })}\n`
			)
		);
		streamController.close();
		const response = await pending;
		expect(response).toMatchObject({
			kind: 'answer',
			assistant: { blocks: [{ text: 'Still writing now.' }] }
		});
		// The second delta is throttled at the same timestamp, but block_done
		// forces the complete state through before the request returns.
		expect(progress).toHaveBeenLastCalledWith({
			scope: 'general',
			blocks: [{ kind: 'general', text: 'Still writing now.', ruleIds: [], sourceIds: [] }]
		});
	});

	it('throws the server AssistantError after publishing streamed text', async () => {
		const events = [
			{ type: 'start', requestId: 'req-error', scope: 'general' },
			{ type: 'block_start', kind: 'general' },
			{ type: 'text_delta', delta: 'Unvalidated text' },
			{
				type: 'error',
				requestId: 'req-error',
				error: { code: 'invalid_answer', message: 'The answer cited an unknown rule.' }
			}
		];
		const progress = vi.fn();
		const retry = vi.fn();
		const fetcher = vi.fn(
			async () =>
				new Response(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`, {
					headers: { 'content-type': 'application/x-ndjson' }
				})
		);

		const request = askAssistant({
			chatId: 'chat-1',
			messages: [{ role: 'user', content: 'Question' }],
			clientRuleSetVersion: 'v1',
			fetcher,
			onProgress: progress,
			onRetry: retry
		});
		await expect(request).rejects.toEqual(
			expect.objectContaining<Partial<AssistantError>>({
				code: 'invalid_answer',
				message: 'The answer cited an unknown rule.'
			})
		);
		expect(progress).toHaveBeenCalledWith({
			scope: 'general',
			blocks: [{ kind: 'general', text: 'Unvalidated text', ruleIds: [], sourceIds: [] }]
		});
		expect(retry).not.toHaveBeenCalled();
	});

	it('maps an unknown in-stream error code to provider_error', async () => {
		const fetcher = vi.fn(
			async () =>
				new Response(
					`${JSON.stringify({
						type: 'error',
						requestId: 'req-future',
						error: { code: 'future_error', message: 'A future server failure.' }
					})}\n`,
					{ headers: { 'content-type': 'application/x-ndjson' } }
				)
		);

		await expect(
			askAssistant({
				chatId: 'chat-1',
				messages: [{ role: 'user', content: 'Question' }],
				clientRuleSetVersion: 'v1',
				fetcher
			})
		).rejects.toMatchObject({ code: 'provider_error', message: 'A future server failure.' });
	});

	it('parses a tool_calls event as the other TurnResponse variant', async () => {
		const quota = {
			browserRemaining: 23,
			ipRemaining: 73,
			resetsAt: '2026-08-02T00:00:00Z'
		};
		const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			void input;
			void init;
			return new Response(
				`${JSON.stringify({
					type: 'tool_calls',
					calls: [{ callId: 'call-1', name: 'read_scribe', input: {} }],
					providerItems: '[{"type":"function_call"}]'
				})}\n${JSON.stringify({ type: 'done', quota })}\n`,
				{ headers: { 'content-type': 'application/x-ndjson' } }
			);
		});

		const response = await askAssistant({
			chatId: 'chat-1',
			messages: [{ role: 'user', content: 'Read this draft.' }],
			clientRuleSetVersion: 'v2',
			toolsAvailable: true,
			fetcher
		});

		expect(response).toEqual({
			kind: 'tool_calls',
			calls: [{ callId: 'call-1', name: 'read_scribe', input: {} }],
			providerItems: '[{"type":"function_call"}]',
			quota
		});
		const request = JSON.parse(vi.mocked(fetcher).mock.calls[0]![1]!.body as string) as Record<
			string,
			unknown
		>;
		expect(request.toolsAvailable).toBe(true);
	});

	it('parses validated manage_links calls from the stream union', async () => {
		const quota = {
			browserRemaining: 22,
			ipRemaining: 72,
			resetsAt: '2026-08-02T00:00:00Z'
		};
		const calls = [
			{
				callId: 'links-1',
				name: 'manage_links',
				input: {
					actions: [
						{
							id: 'a1',
							action: 'link',
							headers: [
								{ text: '[Chorus]', occurrence: 1 },
								{ text: '[Chorus]', occurrence: 2 }
							],
							note: 'Repeated words.'
						}
					]
				}
			}
		];
		const fetcher = vi.fn(
			async () =>
				new Response(
					`${JSON.stringify({ type: 'tool_calls', calls, providerItems: '[{"type":"function_call"}]' })}\n${JSON.stringify({ type: 'done', quota })}\n`,
					{ headers: { 'content-type': 'application/x-ndjson' } }
				)
		);

		const response = await askAssistant({
			chatId: 'chat-1',
			messages: [{ role: 'user', content: 'Link the choruses.' }],
			clientRuleSetVersion: 'v2.1',
			toolsAvailable: true,
			fetcher
		});
		expect(response).toMatchObject({ kind: 'tool_calls', calls });
	});
});
