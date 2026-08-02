/**
 * A fake Worker environment that runs the real QuotaCounter logic against
 * in-memory storage, so daily/concurrency/spend accounting is exercised for
 * real while nothing touches the network.
 */
import { vi } from 'vitest';
import type { Env, RateLimit } from '../src/config';
import { corpus } from '../src/corpus';
import type { ProviderResult } from '../src/provider';
import { QuotaCounter } from '../src/quota-do';
import type { StructuredAnswer } from '../src/schema';

class FakeStorage {
	private readonly map = new Map<string, unknown>();
	async get<T>(key: string): Promise<T | undefined> {
		return this.map.get(key) as T | undefined;
	}
	async put(key: string, value: unknown): Promise<void> {
		this.map.set(key, structuredClone(value));
	}
	async deleteAll(): Promise<void> {
		this.map.clear();
	}
	async setAlarm(): Promise<void> {}
}

export class FakeQuotaNamespace {
	readonly instances = new Map<string, QuotaCounter>();
	readonly calls: Array<{ name: string; path: string; body: unknown }> = [];
	idFromName(name: string): unknown {
		return name;
	}
	get(id: unknown): { fetch(url: string, init?: RequestInit): Promise<Response> } {
		const name = String(id);
		let instance = this.instances.get(name);
		if (!instance) {
			instance = new QuotaCounter({ storage: new FakeStorage() } as unknown as DurableObjectState);
			this.instances.set(name, instance);
		}
		const held = instance;
		return {
			fetch: (url, init) => {
				this.calls.push({
					name,
					path: new URL(url).pathname,
					body: init?.body ? JSON.parse(String(init.body)) : undefined
				});
				return held.fetch(new Request(url, init));
			}
		};
	}
}

export interface MetricPoint {
	blobs?: string[];
	doubles?: number[];
	indexes?: string[];
}

export function fakeRateLimit(succeed: () => boolean): RateLimit {
	return { limit: vi.fn(async () => ({ success: succeed() })) };
}

export function makeEnv(
	overrides: Partial<Env> = {}
): Env & { points: MetricPoint[]; quotaNamespace: FakeQuotaNamespace } {
	const points: MetricPoint[] = [];
	const quotaNamespace = new FakeQuotaNamespace();
	return {
		ASSISTANT_DISABLED: 'false',
		ALLOWED_ORIGIN: 'https://lyriclint.com,https://dev.lyriclint.com',
		AI_GATEWAY_BASE_URL: 'https://gateway.invalid/openai',
		AI_GATEWAY_TOKEN: 'gateway-token',
		OPENAI_API_KEY: 'openai-key',
		TURNSTILE_SECRET: 'turnstile-secret',
		TURNSTILE_ALLOW_LOCALHOST: 'false',
		ABUSE_HMAC_SECRET: 'abuse-secret',
		SESSION_SIGNING_SECRET: 'session-secret',
		QUOTAS: quotaNamespace as unknown as DurableObjectNamespace,
		SESSION_MINUTE_LIMIT: fakeRateLimit(() => true),
		IP_MINUTE_LIMIT: fakeRateLimit(() => true),
		METRICS: {
			writeDataPoint: (point: MetricPoint) => {
				points.push(point);
			}
		} as unknown as AnalyticsEngineDataset,
		points,
		quotaNamespace,
		...overrides
	} as Env & { points: MetricPoint[]; quotaNamespace: FakeQuotaNamespace };
}

export const RULE_ID = corpus.rules[0]!.id;
export const SECOND_RULE_ID = corpus.rules[1]!.id;
export const SOURCE_ID = corpus.sources[0]!.id;

export function validAnswer(overrides: Partial<StructuredAnswer> = {}): StructuredAnswer {
	return {
		scope: 'reviewed',
		blocks: [
			{
				kind: 'prose',
				text: 'Genius wants bracketed section headers.',
				ruleIds: [RULE_ID],
				sourceIds: []
			}
		],
		...overrides
	};
}

export function providerReturning(
	raw: unknown,
	usage = { inputTokens: 1000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 200 }
) {
	return vi.fn(async (): Promise<ProviderResult> => ({ kind: 'answer', raw, usage }));
}

export function requestBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		chatId: 'chat-1',
		messages: [{ role: 'user', content: 'How do I mark a chorus?' }],
		clientRuleSetVersion: corpus.ruleSetVersion,
		...overrides
	};
}

export function makeRequest(
	body: unknown,
	options: { origin?: string | null; cookie?: string; ip?: string; accept?: string } = {}
): Request {
	const headers = new Headers({ 'content-type': 'application/json' });
	const origin = options.origin === undefined ? 'https://lyriclint.com' : options.origin;
	if (origin !== null) headers.set('origin', origin);
	if (options.cookie) headers.set('cookie', options.cookie);
	if (options.accept) headers.set('accept', options.accept);
	headers.set('cf-connecting-ip', options.ip ?? '203.0.113.9');
	return new Request('https://api.lyriclint.com/v1/answers', {
		method: 'POST',
		headers,
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
}

export function cookieFromResponse(response: Response): string | undefined {
	const header = response.headers.get('set-cookie');
	return header?.split(';')[0];
}

export const goodTurnstile = vi.fn(async (token: string) => token === 'good-token');
