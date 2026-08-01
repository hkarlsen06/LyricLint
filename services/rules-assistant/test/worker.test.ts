import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler } from '../src/index';
import { LIMITS, REQUEST_RULES, SESSION_RULES } from '../src/config';
import { corpus } from '../src/corpus';
import {
	cookieFromResponse,
	fakeRateLimit,
	goodTurnstile,
	makeEnv,
	makeRequest,
	providerReturning,
	requestBody,
	RULE_ID,
	SECOND_RULE_ID,
	validAnswer
} from './harness';

const QUESTION = 'How do I mark a chorus?';

async function firstSession(
	handler: ReturnType<typeof createHandler>,
	env: ReturnType<typeof makeEnv>
): Promise<string> {
	const response = await handler(makeRequest(requestBody({ turnstileToken: 'good-token' })), env);
	expect(response.status).toBe(200);
	return cookieFromResponse(response)!;
}

describe('the answers endpoint', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('answers a validated question and reports quota', async () => {
		const env = makeEnv();
		const handler = createHandler({
			provider: providerReturning(validAnswer()),
			verifyTurnstile: goodTurnstile
		});
		const response = await handler(makeRequest(requestBody({ turnstileToken: 'good-token' })), env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			requestId: string;
			assistant: { scope: string; blocks: Array<{ ruleIds: string[] }> };
			quota: { browserRemaining: number; ipRemaining: number; resetsAt: string };
		};
		expect(body.assistant.scope).toBe('reviewed');
		expect(body.assistant.blocks[0]!.ruleIds).toEqual([RULE_ID]);
		expect(body.quota.browserRemaining).toBe(LIMITS.sessionPerDay - 1);
		expect(body.quota.ipRemaining).toBe(LIMITS.ipPerDay - 1);
		expect(new Date(body.quota.resetsAt).getTime()).toBeGreaterThan(Date.now());
		expect(response.headers.get('set-cookie')).toContain(SESSION_RULES.cookieName);
		expect(response.headers.get('set-cookie')).toMatch(/HttpOnly; Secure; SameSite=Strict/);
	});

	it('streams only a fully validated answer as ordered NDJSON deltas', async () => {
		const env = makeEnv();
		const handler = createHandler({
			provider: providerReturning(validAnswer()),
			verifyTurnstile: goodTurnstile
		});
		const response = await handler(
			makeRequest(requestBody({ turnstileToken: 'good-token' }), {
				accept: 'application/x-ndjson'
			}),
			env
		);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/x-ndjson');
		const events = (await response.text())
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line) as { type: string; [key: string]: unknown });
		expect(events.map((event) => event.type)).toEqual([
			'start',
			'block_start',
			'text_delta',
			'block_done',
			'done'
		]);
		expect(events[3]).toMatchObject({ ruleIds: [RULE_ID] });
		expect(response.headers.get('set-cookie')).toContain(SESSION_RULES.cookieName);
	});

	it('never starts a content stream for an invalid structured answer', async () => {
		const env = makeEnv();
		const handler = createHandler({
			provider: providerReturning({ answer: 'not the schema' }),
			verifyTurnstile: goodTurnstile
		});
		const response = await handler(
			makeRequest(requestBody({ turnstileToken: 'good-token' }), {
				accept: 'application/x-ndjson'
			}),
			env
		);
		expect(response.status).toBe(502);
		expect(response.headers.get('content-type')).toContain('application/json');
		expect(await response.json()).toMatchObject({ error: { code: 'invalid_answer' } });
	});

	describe('kill switch', () => {
		it('refuses new requests without a deployment', async () => {
			const env = makeEnv({ ASSISTANT_DISABLED: 'true' });
			const handler = createHandler({ provider: providerReturning(validAnswer()) });
			const response = await handler(makeRequest(requestBody()), env);
			expect(response.status).toBe(503);
			const body = (await response.json()) as { error: { code: string } };
			expect(body.error.code).toBe('service_disabled');
		});
	});

	describe('CORS and origin', () => {
		it('rejects a foreign origin', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const response = await handler(
				makeRequest(requestBody(), { origin: 'https://evil.example' }),
				env
			);
			expect(response.status).toBe(400);
		});

		it('rejects a missing origin', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const response = await handler(makeRequest(requestBody(), { origin: null }), env);
			expect(response.status).toBe(400);
		});

		it('sets credentials-compatible CORS headers on every response', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const response = await handler(
				makeRequest(requestBody({ turnstileToken: 'good-token' })),
				env
			);
			expect(response.headers.get('access-control-allow-origin')).toBe('https://lyriclint.com');
			expect(response.headers.get('access-control-allow-credentials')).toBe('true');
		});

		it('echoes an explicitly allowed development origin', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const response = await handler(
				makeRequest(requestBody({ turnstileToken: 'good-token' }), {
					origin: 'https://dev.lyriclint.com'
				}),
				env
			);
			expect(response.status).toBe(200);
			expect(response.headers.get('access-control-allow-origin')).toBe('https://dev.lyriclint.com');
		});
	});

	describe('request validation', () => {
		const cases: Array<[string, unknown]> = [
			['non-JSON body', 'not json'],
			['missing chatId', requestBody({ chatId: undefined })],
			['unknown fields', requestBody({ model: 'gpt-4' })],
			['empty messages', requestBody({ messages: [] })],
			[
				'too many messages',
				requestBody({
					messages: Array.from({ length: REQUEST_RULES.maxSuppliedMessages + 1 }, (_, i) => ({
						role: i % 2 === 0 ? 'user' : 'assistant',
						content: 'x'
					}))
				})
			],
			[
				'non-alternating roles',
				requestBody({
					messages: [
						{ role: 'user', content: 'a' },
						{ role: 'user', content: 'b' }
					]
				})
			],
			[
				'assistant-final conversation',
				requestBody({
					messages: [
						{ role: 'user', content: 'a' },
						{ role: 'assistant', content: 'b' }
					]
				})
			],
			[
				'question above the character cap',
				requestBody({
					messages: [{ role: 'user', content: 'x'.repeat(REQUEST_RULES.maxQuestionChars + 1) }]
				})
			]
		];
		for (const [name, body] of cases) {
			it(`rejects ${name}`, async () => {
				const env = makeEnv();
				const handler = createHandler({
					provider: providerReturning(validAnswer()),
					verifyTurnstile: goodTurnstile
				});
				const response = await handler(makeRequest(body), env);
				expect(response.status).toBe(400);
				const parsed = (await response.json()) as { error: { code: string } };
				expect(parsed.error.code).toBe('invalid_request');
			});
		}

		it('rejects a body above 64 KiB', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const oversized = requestBody({
				messages: [
					{ role: 'user', content: 'a'.repeat(1000) },
					{ role: 'assistant', content: 'b'.repeat(66_000) },
					{ role: 'user', content: QUESTION }
				]
			});
			const response = await handler(makeRequest(oversized), env);
			expect(response.status).toBe(400);
		});

		it('rejects a client built against a different ruleset', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const response = await handler(
				makeRequest(requestBody({ clientRuleSetVersion: 'stale-version' })),
				env
			);
			expect(response.status).toBe(400);
			expect((await response.json()) as object).toMatchObject({
				error: { code: 'invalid_request' }
			});
		});
	});

	describe('Turnstile lifecycle', () => {
		it('requires a challenge for the first request', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const response = await handler(makeRequest(requestBody()), env);
			expect(response.status).toBe(403);
			const body = (await response.json()) as { error: { code: string } };
			expect(body.error.code).toBe('challenge_required');
		});

		it('rejects a failed challenge', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const response = await handler(
				makeRequest(requestBody({ turnstileToken: 'bad-token' })),
				env
			);
			expect(response.status).toBe(403);
			const body = (await response.json()) as { error: { code: string } };
			expect(body.error.code).toBe('challenge_failed');
		});

		it('accepts the signed cookie without a new challenge', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const cookie = await firstSession(handler, env);
			const response = await handler(makeRequest(requestBody(), { cookie }), env);
			expect(response.status).toBe(200);
		});

		it('rejects a tampered cookie as unchallenged', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const cookie = await firstSession(handler, env);
			const tampered = `${cookie!.slice(0, -4)}AAAA`;
			const response = await handler(makeRequest(requestBody(), { cookie: tampered }), env);
			expect(response.status).toBe(403);
		});

		it('expires the cookie after 24 hours', async () => {
			let now = Date.UTC(2026, 7, 1, 12, 0, 0);
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile,
				now: () => now
			});
			const cookie = await firstSession(handler, env);
			now += SESSION_RULES.cookieTtlMs + 60_000;
			const response = await handler(makeRequest(requestBody(), { cookie }), env);
			expect(response.status).toBe(403);
			const body = (await response.json()) as { error: { code: string } };
			expect(body.error.code).toBe('challenge_required');
		});

		it('rechallenges after ten successful requests', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			let cookie = await firstSession(handler, env);
			for (let i = 1; i < SESSION_RULES.requestsPerChallenge; i++) {
				const response = await handler(makeRequest(requestBody(), { cookie }), env);
				expect(response.status).toBe(200);
				cookie = cookieFromResponse(response) ?? cookie;
			}
			const refused = await handler(makeRequest(requestBody(), { cookie }), env);
			expect(refused.status).toBe(403);
			const rechallenged = await handler(
				makeRequest(requestBody({ turnstileToken: 'good-token' }), { cookie }),
				env
			);
			expect(rechallenged.status).toBe(200);
		});

		it('rechallenges when the network abuse signal changes', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const first = await handler(
				makeRequest(requestBody({ turnstileToken: 'good-token' }), { ip: '203.0.113.9' }),
				env
			);
			const cookie = cookieFromResponse(first);
			const changed = await handler(
				makeRequest(requestBody(), { cookie, ip: '198.51.100.7' }),
				env
			);
			expect(changed.status).toBe(403);
			expect((await changed.json()) as object).toMatchObject({
				error: { code: 'challenge_required' }
			});
		});
	});

	describe('rate limits and quotas', () => {
		it('applies the per-session minute throttle', async () => {
			const env = makeEnv({ SESSION_MINUTE_LIMIT: fakeRateLimit(() => false) });
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const response = await handler(
				makeRequest(requestBody({ turnstileToken: 'good-token' })),
				env
			);
			expect(response.status).toBe(429);
			const body = (await response.json()) as { error: { code: string } };
			expect(body.error.code).toBe('rate_limited');
		});

		it('applies the per-IP minute throttle', async () => {
			const env = makeEnv({ IP_MINUTE_LIMIT: fakeRateLimit(() => false) });
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const response = await handler(
				makeRequest(requestBody({ turnstileToken: 'good-token' })),
				env
			);
			expect(response.status).toBe(429);
		});

		it('enforces the exact daily session limit and reports zero remaining', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			let cookie: string | undefined;
			for (let i = 0; i < LIMITS.sessionPerDay; i++) {
				const response = await handler(
					makeRequest(requestBody({ turnstileToken: 'good-token' }), { cookie }),
					env
				);
				expect(response.status).toBe(200);
				cookie = cookieFromResponse(response) ?? cookie;
			}
			const refused = await handler(
				makeRequest(requestBody({ turnstileToken: 'good-token' }), { cookie }),
				env
			);
			expect(refused.status).toBe(429);
			const body = (await refused.json()) as { error: { code: string } };
			expect(body.error.code).toBe('daily_limit_reached');
		});

		it('holds one concurrent request per session and releases on completion', async () => {
			const env = makeEnv();
			let release!: () => void;
			const gate = new Promise<void>((resolve) => (release = resolve));
			const provider = vi.fn(async () => {
				await gate;
				return {
					raw: validAnswer(),
					usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 10 }
				};
			});
			const handler = createHandler({ provider, verifyTurnstile: goodTurnstile });
			// Establish a session so both requests carry the same sid.
			const quick = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const cookie = await firstSession(quick, env);

			const first = handler(makeRequest(requestBody(), { cookie }), env);
			await new Promise((resolve) => setTimeout(resolve, 20));
			const second = await handler(makeRequest(requestBody(), { cookie }), env);
			expect(second.status).toBe(409);
			const body = (await second.json()) as { error: { code: string } };
			expect(body.error.code).toBe('request_in_progress');
			release();
			expect((await first).status).toBe(200);
			const after = await quick(makeRequest(requestBody(), { cookie }), env);
			expect(after.status).toBe(200);
		});

		it('releases the concurrency slot when the provider fails', async () => {
			const env = makeEnv();
			const failing = createHandler({
				provider: vi.fn(async () => {
					throw new Error('boom');
				}),
				verifyTurnstile: goodTurnstile
			});
			const working = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const cookie = await firstSession(working, env);
			const failed = await failing(makeRequest(requestBody(), { cookie }), env);
			expect(failed.status).toBe(502);
			const after = await working(makeRequest(requestBody(), { cookie }), env);
			expect(after.status).toBe(200);
		});

		it('stops a session that has spent its daily budget', async () => {
			const env = makeEnv();
			// One answer whose output alone estimates past $0.50 at $6/MTok.
			const expensive = providerReturning(validAnswer(), {
				inputTokens: 1000,
				cachedInputTokens: 0,
				cacheWriteTokens: 0,
				outputTokens: 100_000
			});
			const handler = createHandler({ provider: expensive, verifyTurnstile: goodTurnstile });
			const cookie = await firstSession(handler, env);
			const refused = await handler(makeRequest(requestBody(), { cookie }), env);
			expect(refused.status).toBe(429);
			const body = (await refused.json()) as { error: { code: string } };
			expect(body.error.code).toBe('spend_limit_reached');
		});

		it('stops everyone when the global daily budget is spent', async () => {
			const env = makeEnv();
			// Global ceiling is $15; 2.6M output tokens at $6/MTok estimates past it.
			const expensive = providerReturning(validAnswer(), {
				inputTokens: 1000,
				cachedInputTokens: 0,
				cacheWriteTokens: 0,
				outputTokens: 2_600_000
			});
			const handler = createHandler({ provider: expensive, verifyTurnstile: goodTurnstile });
			await firstSession(handler, env);
			// A different browser session, same deployment: still refused.
			const fresh = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const refused = await fresh(
				makeRequest(requestBody({ turnstileToken: 'good-token' }), { ip: '198.51.100.7' }),
				env
			);
			expect(refused.status).toBe(429);
			const body = (await refused.json()) as { error: { code: string } };
			expect(body.error.code).toBe('spend_limit_reached');
		});
	});

	describe('structured answer validation', () => {
		const invalidAnswers: Array<[string, unknown]> = [
			[
				'an unknown rule id',
				validAnswer({ blocks: [{ kind: 'prose', text: 'x', ruleIds: ['made.up'], sourceIds: [] }] })
			],
			[
				'a rule cited in two blocks',
				validAnswer({
					blocks: [
						{ kind: 'prose', text: 'x', ruleIds: [RULE_ID], sourceIds: [] },
						{ kind: 'prose', text: 'y', ruleIds: [RULE_ID], sourceIds: [] }
					]
				})
			],
			[
				'more than four distinct rules',
				validAnswer({
					blocks: [
						{
							kind: 'prose',
							text: 'x',
							ruleIds: corpus.rules.slice(0, 5).map((rule) => rule.id),
							sourceIds: []
						}
					]
				})
			],
			[
				'general guidance carrying a rule citation',
				validAnswer({
					scope: 'mixed',
					blocks: [
						{ kind: 'prose', text: 'x', ruleIds: [RULE_ID], sourceIds: [] },
						{ kind: 'general', text: 'y', ruleIds: [SECOND_RULE_ID], sourceIds: [] }
					]
				})
			],
			[
				'an invented source id',
				validAnswer({
					blocks: [{ kind: 'prose', text: 'x', ruleIds: [RULE_ID], sourceIds: ['G-INVENTED'] }]
				})
			],
			[
				'a reviewed scope with no citations',
				validAnswer({ blocks: [{ kind: 'prose', text: 'x', ruleIds: [], sourceIds: [] }] })
			],
			[
				'an uncited reviewed block before its supporting citation',
				validAnswer({
					blocks: [
						{ kind: 'prose', text: 'unsupported introduction', ruleIds: [], sourceIds: [] },
						{ kind: 'prose', text: 'supported', ruleIds: [RULE_ID], sourceIds: [] }
					]
				})
			],
			[
				'a general scope carrying citations',
				validAnswer({
					scope: 'general',
					blocks: [{ kind: 'prose', text: 'x', ruleIds: [RULE_ID], sourceIds: [] }]
				})
			],
			[
				'unlabelled prose in a general answer',
				validAnswer({
					scope: 'general',
					blocks: [{ kind: 'prose', text: 'x', ruleIds: [], sourceIds: [] }]
				})
			],
			['prose instead of the schema', { answer: 'Just some text' }]
		];

		for (const [name, raw] of invalidAnswers) {
			it(`refuses ${name} as invalid_answer`, async () => {
				const env = makeEnv();
				const handler = createHandler({
					provider: providerReturning(raw),
					verifyTurnstile: goodTurnstile
				});
				const response = await handler(
					makeRequest(requestBody({ turnstileToken: 'good-token' })),
					env
				);
				expect(response.status).toBe(502);
				const body = (await response.json()) as { error: { code: string } };
				expect(body.error.code).toBe('invalid_answer');
			});
		}

		it('allows an uncited continuation after the rule reference was attached once', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(
					validAnswer({
						blocks: [
							{ kind: 'prose', text: 'supported', ruleIds: [RULE_ID], sourceIds: [] },
							{ kind: 'prose', text: 'continuation', ruleIds: [], sourceIds: [] }
						]
					})
				),
				verifyTurnstile: goodTurnstile
			});
			const response = await handler(
				makeRequest(requestBody({ turnstileToken: 'good-token' })),
				env
			);
			expect(response.status).toBe(200);
		});

		it('reports a provider failure as provider_error', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: vi.fn(async () => {
					throw new Error('socket hang up');
				}),
				verifyTurnstile: goodTurnstile
			});
			const response = await handler(
				makeRequest(requestBody({ turnstileToken: 'good-token' })),
				env
			);
			expect(response.status).toBe(502);
			const body = (await response.json()) as { error: { code: string } };
			expect(body.error.code).toBe('provider_error');
		});
	});

	describe('operational metadata', () => {
		it('logs neither the raw IP nor any prompt text', async () => {
			const env = makeEnv();
			const handler = createHandler({
				provider: providerReturning(validAnswer()),
				verifyTurnstile: goodTurnstile
			});
			const ip = '203.0.113.77';
			await handler(makeRequest(requestBody({ turnstileToken: 'good-token' }), { ip }), env);
			await handler(makeRequest(requestBody()), env); // an error point too
			expect(env.points.length).toBeGreaterThan(0);
			for (const point of env.points) {
				const serialized = JSON.stringify(point);
				expect(serialized).not.toContain(ip);
				expect(serialized).not.toContain(QUESTION);
			}
		});
	});
});
