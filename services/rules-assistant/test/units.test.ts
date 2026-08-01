import { describe, expect, it, vi } from 'vitest';
import { REQUEST_RULES, SESSION_RULES } from '../src/config';
import { corpus } from '../src/corpus';
import { signSession, verifySession } from '../src/identity';
import { buildPromptInput, CACHE_BREAKPOINT, promptCacheKey, pruneHistory } from '../src/prompt';
import { gatewayHeaders, providerRequest } from '../src/provider';
import { QuotaCounter } from '../src/quota-do';

function message(role: 'user' | 'assistant', length: number) {
	return { role, content: 'x'.repeat(length) };
}

describe('history pruning', () => {
	it('keeps everything when the history fits the window', () => {
		const messages = [message('user', 100), message('assistant', 100), message('user', 50)];
		expect(pruneHistory(messages)).toEqual(messages);
	});

	it('drops the oldest complete exchanges first and always keeps the question', () => {
		const messages = [
			message('user', 20_000),
			message('assistant', 20_000),
			message('user', 4_000),
			message('assistant', 4_000),
			message('user', 30)
		];
		const pruned = pruneHistory(messages);
		expect(pruned).toHaveLength(3);
		expect(pruned[0]!.content).toHaveLength(4_000);
		expect(pruned.at(-1)!.role).toBe('user');
		expect(pruned.at(-1)!.content).toHaveLength(30);
	});

	it('never keeps half an exchange', () => {
		// The older exchange fits only if split; it must be dropped whole.
		const messages = [
			message('user', 100),
			message('assistant', REQUEST_RULES.historyWindowChars),
			message('user', 40)
		];
		const pruned = pruneHistory(messages);
		expect(pruned).toHaveLength(1);
		expect(pruned[0]!.role).toBe('user');
	});

	it('keeps a question longer than the window itself', () => {
		const messages = [message('user', 10)];
		expect(pruneHistory(messages)).toEqual(messages);
	});
});

describe('prompt assembly', () => {
	it('orders instructions, corpus, breakpoint, history, question', () => {
		const input = buildPromptInput(corpus, [
			message('user', 5),
			message('assistant', 5),
			message('user', 8)
		]);
		expect(input[0]!.role).toBe('developer');
		expect(input[0]!.content).toContain(corpus.contentHash);
		expect(input[0]!.content.trimEnd().endsWith(CACHE_BREAKPOINT)).toBe(true);
		expect(input.slice(1).map((entry) => entry.role)).toEqual(['user', 'assistant', 'user']);
	});

	it('places a real explicit cache breakpoint after the stable corpus prefix', () => {
		const request = providerRequest(
			[
				{ role: 'user', content: 'Earlier' },
				{ role: 'assistant', content: 'Earlier answer' },
				{ role: 'user', content: 'Now' }
			],
			'll-test'
		);
		expect(request.prompt_cache_options).toEqual({ mode: 'explicit', ttl: '30m' });
		expect(request.prompt_cache_key).toBe(promptCacheKey(corpus));
		const input = request.input as unknown as Array<{
			content: Array<Record<string, unknown>>;
		}>;
		expect(input[0]!.content[0]!.prompt_cache_breakpoint).toEqual({ mode: 'explicit' });
		expect(input.slice(1).every((item) => !('prompt_cache_breakpoint' in item.content[0]!))).toBe(
			true
		);
		expect(request).toMatchObject({
			model: 'gpt-5.6-luna',
			reasoning: { effort: 'max', context: 'current_turn' },
			store: false,
			max_output_tokens: 8192,
			safety_identifier: 'll-test'
		});
	});

	it('keys the prompt cache on the ruleset version and corpus hash', () => {
		const key = promptCacheKey(corpus);
		expect(key).toContain(corpus.ruleSetVersion);
		expect(key).toContain(corpus.contentHash.slice(0, 16));
	});

	it('authenticates the Gateway separately from the OpenAI project key', () => {
		expect(gatewayHeaders('gateway-token')).toEqual({
			'cf-aig-authorization': 'Bearer gateway-token',
			'cf-aig-cache-ttl': '3600',
			'cf-aig-collect-log': 'false'
		});
	});
});

describe('session signing', () => {
	const SECRET = 'secret';

	it('round-trips a valid session', async () => {
		const state = { sid: 'abc', iat: 1000, uses: 3 };
		const token = await signSession(state, SECRET);
		expect(await verifySession(token, SECRET, 2000)).toEqual(state);
	});

	it('refuses a token signed with another key', async () => {
		const token = await signSession({ sid: 'abc', iat: 1000, uses: 0 }, 'other');
		expect(await verifySession(token, SECRET, 2000)).toBeUndefined();
	});

	it('refuses an expired token', async () => {
		const token = await signSession({ sid: 'abc', iat: 1000, uses: 0 }, SECRET);
		expect(
			await verifySession(token, SECRET, 1000 + SESSION_RULES.cookieTtlMs + 1)
		).toBeUndefined();
	});
});

describe('QuotaCounter', () => {
	function counter() {
		const map = new Map<string, unknown>();
		const storage = {
			get: async (key: string) => structuredClone(map.get(key)),
			put: async (key: string, value: unknown) => void map.set(key, structuredClone(value)),
			deleteAll: async () => void map.clear(),
			setAlarm: async () => {}
		};
		const instance = new QuotaCounter({ storage } as unknown as DurableObjectState);
		return {
			call: async (path: string, body: unknown) => {
				const response = await instance.fetch(
					new Request(`https://quota.internal${path}`, {
						method: 'POST',
						body: JSON.stringify(body)
					})
				);
				return response.json() as Promise<Record<string, unknown>>;
			}
		};
	}

	it('refunds a cancelled begin so refusals elsewhere cost nothing', async () => {
		const quota = counter();
		const begun = await quota.call('/begin', { dailyLimit: 2, concurrentLimit: 1 });
		expect(begun.ok).toBe(true);
		await quota.call('/cancel', { slot: begun.slot });
		const again = await quota.call('/begin', { dailyLimit: 2, concurrentLimit: 1 });
		expect(again.remaining).toBe(1);
	});

	it('reclaims a leaked slot after the stale window', async () => {
		vi.useFakeTimers();
		try {
			const quota = counter();
			const begun = await quota.call('/begin', { dailyLimit: 10, concurrentLimit: 1 });
			expect(begun.ok).toBe(true);
			// The Worker holding this slot was evicted; nothing calls /finish.
			const blocked = await quota.call('/begin', { dailyLimit: 10, concurrentLimit: 1 });
			expect(blocked.error).toBe('request_in_progress');
			await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
			const reclaimed = await quota.call('/begin', { dailyLimit: 10, concurrentLimit: 1 });
			expect(reclaimed.ok).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('accumulates spend across finishes and refuses past the ceiling', async () => {
		const quota = counter();
		const first = await quota.call('/begin', {
			dailyLimit: 10,
			concurrentLimit: 3,
			spendLimitUsd: 0.5
		});
		await quota.call('/finish', { slot: first.slot, spendUsd: 0.3 });
		const second = await quota.call('/begin', {
			dailyLimit: 10,
			concurrentLimit: 3,
			spendLimitUsd: 0.5
		});
		expect(second.ok).toBe(true);
		await quota.call('/finish', { slot: second.slot, spendUsd: 0.3 });
		const refused = await quota.call('/begin', {
			dailyLimit: 10,
			concurrentLimit: 3,
			spendLimitUsd: 0.5
		});
		expect(refused.error).toBe('spend_limit_reached');
	});

	it('resets counters at the UTC day boundary', async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(Date.UTC(2026, 7, 1, 23, 59, 0));
			const quota = counter();
			const first = await quota.call('/begin', { dailyLimit: 1, concurrentLimit: 5 });
			expect(first.ok).toBe(true);
			const refused = await quota.call('/begin', { dailyLimit: 1, concurrentLimit: 5 });
			expect(refused.error).toBe('daily_limit_reached');
			vi.setSystemTime(Date.UTC(2026, 7, 2, 0, 1, 0));
			const fresh = await quota.call('/begin', { dailyLimit: 1, concurrentLimit: 5 });
			expect(fresh.ok).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});
