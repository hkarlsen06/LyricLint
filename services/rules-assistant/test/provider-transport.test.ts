import { afterEach, describe, expect, it, vi } from 'vitest';
import { corpus } from '../src/corpus';
import { createOpenAIProvider, estimateSpendUsd } from '../src/provider';
import { MAX_TOOL_ARGUMENT_CHARS } from '../src/config';
import { eventStream, outputMessage, providerResponse, responseEvents } from './response-fixtures';

const answer = {
	scope: 'general',
	blocks: [{ kind: 'general', text: 'Keep the sung words.', ruleIds: [], sourceIds: [] }]
};
const call = {
	type: 'function_call' as const,
	id: 'fc-1',
	call_id: 'call-1',
	name: 'read_scribe',
	arguments: '{}'
};
const reasoning = {
	type: 'reasoning' as const,
	id: 'rs-1',
	summary: [],
	encrypted_content: 'opaque'
};

function provider() {
	return createOpenAIProvider(
		'https://gateway.invalid/openai',
		'openai-key',
		'gateway-token',
		corpus
	);
}
const question = [{ role: 'user' as const, content: 'Proofread' }];

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('Responses streaming transport', () => {
	it('streams answer deltas through the authenticated Gateway and accounts cache tokens once', async () => {
		const fetchProvider = vi.fn<typeof fetch>(async () =>
			eventStream(responseEvents(providerResponse([outputMessage(JSON.stringify(answer))])))
		);
		vi.stubGlobal('fetch', fetchProvider);
		const deltas: string[] = [];
		const usage = vi.fn();
		const result = await provider()(
			question,
			'hashed-session',
			new AbortController().signal,
			'none',
			(delta) => deltas.push(delta),
			usage
		);
		expect(result).toMatchObject({ kind: 'answer', raw: answer });
		expect(deltas.join('')).toBe(JSON.stringify(answer));
		expect(deltas.length).toBeGreaterThan(1);
		expect(usage).toHaveBeenCalledExactlyOnceWith({
			inputTokens: 20,
			cachedInputTokens: 5,
			cacheWriteTokens: 2,
			outputTokens: 10
		});
		const [url, init] = fetchProvider.mock.calls[0]!;
		expect(String(url)).toBe('https://gateway.invalid/openai/responses');
		const headers = new Headers(init?.headers);
		expect(headers.get('authorization')).toBe('Bearer openai-key');
		expect(headers.get('cf-aig-authorization')).toBe('Bearer gateway-token');
		expect(headers.get('cf-aig-skip-cache')).toBe('true');
		expect(headers.get('cf-aig-collect-log')).toBe('false');
		expect(JSON.parse(String(init?.body))).toMatchObject({
			model: 'gpt-6.1-terra',
			stream: true,
			store: false,
			safety_identifier: 'hashed-session',
			reasoning: { effort: 'medium' }
		});
		if (result.kind === 'answer')
			expect(estimateSpendUsd(result.usage)).toBeCloseTo(0.00006575, 10);
	});

	it('replays encrypted reasoning and stripped SDK output on a spent continuation', async () => {
		const fetchProvider = vi.fn<typeof fetch>(async () =>
			eventStream(responseEvents(providerResponse([reasoning, call])))
		);
		vi.stubGlobal('fetch', fetchProvider);
		const result = await provider()(
			question,
			'hashed-session',
			new AbortController().signal,
			'offered'
		);
		if (result.kind !== 'tool_calls') throw new Error('expected calls');
		expect(result.calls).toEqual([{ callId: 'call-1', name: 'read_scribe', input: {} }]);
		expect(JSON.parse(result.providerItems)).toEqual([reasoning, call]);
		fetchProvider.mockImplementationOnce(async () =>
			eventStream(responseEvents(providerResponse([outputMessage(JSON.stringify(answer))])))
		);
		await provider()(
			[
				...question,
				{
					role: 'assistant',
					toolCalls: [{ callId: 'call-1', name: 'read_scribe', arguments: '{}' }],
					providerItems: result.providerItems
				},
				{
					role: 'tool',
					results: [{ callId: 'call-1', name: 'read_scribe', result: { status: 'denied' } }]
				},
				{ role: 'user', content: 'Final round instruction' }
			],
			'hashed-session',
			new AbortController().signal,
			'spent'
		);
		const body = JSON.parse(String(fetchProvider.mock.calls[1]![1]?.body));
		expect(body.tool_choice).toBe('none');
		expect(body.tools).toHaveLength(4);
		expect(body.include).toEqual(['reasoning.encrypted_content']);
		expect(body.input.slice(2)).toEqual([
			reasoning,
			call,
			{ type: 'function_call_output', call_id: 'call-1', output: '{"status":"denied"}' },
			{ role: 'user', content: [{ type: 'input_text', text: 'Final round instruction' }] }
		]);
	});

	it.each(['incomplete', 'failed'] as const)(
		'accounts terminal %s usage before rejecting',
		async (status) => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => eventStream(responseEvents(providerResponse([], status))))
			);
			const usage = vi.fn();
			await expect(
				provider()(question, 'hash', new AbortController().signal, 'none', undefined, usage)
			).rejects.toMatchObject({ code: 'provider_error' });
			expect(usage).toHaveBeenCalledExactlyOnceWith({
				inputTokens: 20,
				cachedInputTokens: 5,
				cacheWriteTokens: 2,
				outputTokens: 10
			});
		}
	);

	it.each([
		['broken JSON arguments', { ...call, arguments: '{' }],
		['invalid argument fields', { ...call, arguments: '{"unexpected":true}' }],
		['unknown tool', { ...call, name: 'exfiltrate' }],
		['oversized arguments', { ...call, arguments: 'x'.repeat(MAX_TOOL_ARGUMENT_CHARS + 1) }]
	])('rejects %s after accounting completed usage', async (_name, item) => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => eventStream(responseEvents(providerResponse([item]))))
		);
		const usage = vi.fn();
		await expect(
			provider()(question, 'hash', new AbortController().signal, 'offered', undefined, usage)
		).rejects.toMatchObject({ code: 'invalid_answer' });
		expect(usage).toHaveBeenCalledOnce();
	});

	it.each([
		['malformed answer JSON', outputMessage('{'), 'invalid_answer'],
		[
			'model refusal',
			{ ...outputMessage(''), content: [{ type: 'refusal' as const, refusal: 'Cannot answer.' }] },
			'provider_error'
		]
	])('rejects %s after reporting terminal usage', async (_name, item, code) => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => eventStream(responseEvents(providerResponse([item]))))
		);
		const usage = vi.fn();
		await expect(
			provider()(question, 'hash', new AbortController().signal, 'none', undefined, usage)
		).rejects.toMatchObject({ code });
		expect(usage).toHaveBeenCalledOnce();
	});

	it('rejects duplicate provider call ids before browser execution', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				eventStream(responseEvents(providerResponse([call, { ...call, id: 'fc-2' }])))
			)
		);
		await expect(
			provider()(question, 'hash', new AbortController().signal, 'offered')
		).rejects.toMatchObject({ code: 'invalid_answer' });
	});

	it('rejects a stream ending without a terminal response', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const events = responseEvents(providerResponse([outputMessage(JSON.stringify(answer))]));
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => eventStream(events.slice(0, -1)))
		);
		await expect(provider()(question, 'hash', new AbortController().signal)).rejects.toMatchObject({
			code: 'provider_error'
		});
	});

	it('maps an aborted request to the timeout refusal', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const controller = new AbortController();
		controller.abort();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('aborted');
			})
		);
		await expect(provider()(question, 'hash', controller.signal)).rejects.toMatchObject({
			code: 'provider_error',
			message: 'The model took too long to answer.'
		});
	});
});
