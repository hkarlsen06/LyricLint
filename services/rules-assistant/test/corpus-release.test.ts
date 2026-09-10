import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { createHandler } from '../src/index';
import { corpus, corpusCatalog, createCorpusCatalog, type RulesCorpus } from '../src/corpus';
import { promptCacheKey } from '../src/prompt';
import { goodTurnstile, makeEnv, makeRequest, providerReturning, requestBody } from './harness';

function snapshot(label: string): RulesCorpus {
	return {
		...corpus,
		contentHash: `${label}-corpus`,
		rules: [{ ...corpus.rules[0]!, id: `release.${label}` }],
		sources: [{ ...corpus.sources[0]!, id: `${label}-source` }]
	};
}

const previous = snapshot('previous');
const candidate = snapshot('candidate');

function answerFor(selected: RulesCorpus) {
	return {
		scope: 'reviewed',
		blocks: [
			{
				kind: 'prose',
				text: 'The reviewed release guidance.',
				ruleIds: [selected.rules[0]!.id],
				sourceIds: [selected.sources[0]!.id]
			}
		]
	};
}

describe('release corpus compatibility', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('keeps same-version corpora distinct and makes legacy selection explicit', () => {
		const catalog = createCorpusCatalog([candidate, previous], previous.contentHash);
		expect(catalog.resolve(candidate.ruleSetVersion, candidate.contentHash)?.corpus).toBe(
			candidate
		);
		expect(catalog.resolve(previous.ruleSetVersion, previous.contentHash)?.corpus).toBe(previous);
		expect(catalog.resolve(previous.ruleSetVersion)?.corpus).toBe(previous);
		expect(catalog.resolve('unpublished-version', previous.contentHash)).toBeUndefined();
		expect(catalog.resolve(candidate.ruleSetVersion, 'unknown-hash')).toBeUndefined();
		expect(createCorpusCatalog([candidate]).resolve(candidate.ruleSetVersion)).toBeUndefined();
		expect(() => createCorpusCatalog([candidate], previous.contentHash)).toThrow(
			'The legacy client corpus must be included in the release.'
		);
	});

	it.each([
		{ clientCorpusHash: 'unknown-hash' },
		{ clientCorpusHash: undefined },
		{ clientRuleSetVersion: 'unpublished-version', clientCorpusHash: candidate.contentHash }
	])(
		'refuses unsupported client metadata before challenge or provider work: %o',
		async (metadata) => {
			const env = makeEnv();
			const provider = providerReturning(answerFor(candidate));
			const handler = createHandler({
				corpusCatalog: createCorpusCatalog([candidate, previous]),
				provider,
				verifyTurnstile: goodTurnstile
			});
			const response = await handler(
				makeRequest(requestBody({ turnstileToken: 'good-token', ...metadata })),
				env
			);
			expect(response.status).toBe(409);
			expect(await response.json()).toMatchObject({ error: { code: 'ruleset_mismatch' } });
			expect(goodTurnstile).not.toHaveBeenCalled();
			expect(provider).not.toHaveBeenCalled();
			expect(env.quotaNamespace.calls).toEqual([]);
		}
	);

	it('continues serving the published legacy site while the next site is pending', async () => {
		const handler = createHandler({
			corpusCatalog: createCorpusCatalog([candidate, previous], previous.contentHash),
			provider: providerReturning(answerFor(previous)),
			verifyTurnstile: goodTurnstile
		});
		const response = await handler(
			makeRequest(requestBody({ clientCorpusHash: undefined, turnstileToken: 'good-token' })),
			makeEnv()
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ assistant: answerFor(previous) });
	});

	it.each(['application/json', 'application/x-ndjson'])(
		'keeps concurrent old/new prompts, repairs and citations on their own corpus (%s)',
		async (accept) => {
			let release!: () => void;
			const firstResponses = new Promise<void>((resolve) => (release = resolve));
			const attempts = new Map<string, number>();
			// Exercise the real SDK over its HTTP boundary. Both concurrent calls
			// must serialize the correct prompt and keep that corpus through repair.
			const fetchProvider = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
				const request: { prompt_cache_key: string; input: unknown } = JSON.parse(
					String(init?.body)
				);
				const selected = [previous, candidate].find(
					(entry) => request.prompt_cache_key === promptCacheKey(entry)
				);
				expect(selected).toBeDefined();
				const held = selected!;
				expect(JSON.stringify(request.input)).toContain(held.contentHash);
				const attempt = (attempts.get(held.contentHash) ?? 0) + 1;
				attempts.set(held.contentHash, attempt);
				const other = held === previous ? candidate : previous;
				if (attempt === 1) await firstResponses;
				const created = {
					id: `response-${held.contentHash}-${attempt}`,
					object: 'response',
					status: 'in_progress',
					output: []
				};
				const completed = {
					...created,
					status: 'completed',
					output: [
						{
							id: `message-${held.contentHash}-${attempt}`,
							type: 'message',
							role: 'assistant',
							status: 'completed',
							content: [
								{
									type: 'output_text',
									annotations: [],
									// A foreign citation must require repair even when both
									// releases use the same ruleset version.
									text: JSON.stringify(answerFor(attempt === 1 ? other : held))
								}
							]
						}
					]
				};
				return new Response(
					[
						{ type: 'response.created', sequence_number: 0, response: created },
						{ type: 'response.completed', sequence_number: 1, response: completed }
					]
						.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
						.join(''),
					{
						headers: { 'content-type': 'text/event-stream' }
					}
				);
			});
			vi.stubGlobal('fetch', fetchProvider);
			const env = makeEnv();
			const handler = createHandler({
				corpusCatalog: createCorpusCatalog([candidate, previous]),
				verifyTurnstile: goodTurnstile
			});
			const pending = [previous, candidate].map((selected) =>
				handler(
					makeRequest(
						requestBody({
							clientCorpusHash: selected.contentHash,
							turnstileToken: 'good-token',
							supportsRetry: true
						}),
						{ accept }
					),
					env
				)
			);
			try {
				await vi.waitFor(() => expect(fetchProvider).toHaveBeenCalledTimes(2));
			} finally {
				release();
			}
			const responses = await Promise.all(pending);
			for (const [index, response] of responses.entries()) {
				const selected = [previous, candidate][index]!;
				expect(response.status).toBe(200);
				if (accept === 'application/json') {
					expect(await response.json()).toMatchObject({ assistant: answerFor(selected) });
				} else {
					const events = (await response.text())
						.trim()
						.split('\n')
						.map((line) => JSON.parse(line));
					expect(events).toContainEqual({ type: 'retrying' });
					expect(events).toContainEqual(
						expect.objectContaining({
							type: 'block_done',
							ruleIds: [selected.rules[0]!.id],
							sourceIds: [selected.sources[0]!.id]
						})
					);
					expect(events.at(-1)).toMatchObject({ type: 'done' });
				}
			}
			expect(attempts).toEqual(
				new Map([
					[previous.contentHash, 2],
					[candidate.contentHash, 2]
				])
			);
		}
	);

	it('advertises the deployed support set while retaining current release metadata', async () => {
		const response = await worker.fetch(new Request('https://api.lyriclint.com/health'), makeEnv());
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({
			status: 'ok',
			ruleSetVersion: corpus.ruleSetVersion,
			corpusHash: corpus.contentHash,
			supportedCorpora: corpusCatalog.supportedCorpora
		});
	});
});
