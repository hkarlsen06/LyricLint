/**
 * The rules-assistant Worker. One answering endpoint, one health endpoint,
 * layered abuse control (WAF and the AI Gateway ceiling sit outside this
 * file), and nothing a client can say that selects a model, prompt, or
 * corpus. `createHandler` takes its provider and clock as parameters so the
 * whole pipeline is testable without the network.
 */
import { LIMITS, MODEL, REQUEST_RULES, SESSION_RULES, type Env } from './config';
import { corpus, corpusRuleIds, corpusSourceIds } from './corpus';
import { ApiError, errorBody } from './errors';
import {
	hashIdentifier,
	readSessionCookie,
	safetyIdentifier,
	sessionCookie,
	signSession,
	turnstileVerifier,
	verifySession,
	type SessionState,
	type TurnstileVerifier
} from './identity';
import { createOpenAiProvider, estimateSpendUsd, type AnswerProvider } from './provider';
import type { BeginResult } from './quota-do';
import { answerRequestSchema, validateAnswer, validateConversation } from './schema';

export { QuotaCounter } from './quota-do';

interface QuotaHandle {
	name: string;
	slot: string;
}

async function quotaCall<T>(env: Env, name: string, path: string, body: unknown): Promise<T> {
	const stub = env.QUOTAS.get(env.QUOTAS.idFromName(name));
	const response = await stub.fetch(`https://quota.internal${path}`, {
		method: 'POST',
		body: JSON.stringify(body)
	});
	return (await response.json()) as T;
}

function allowedOrigins(env: Env): string[] {
	return env.ALLOWED_ORIGIN.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);
}

function acceptedOrigin(env: Env, origin: string | null): string | undefined {
	return origin !== null && allowedOrigins(env).includes(origin) ? origin : undefined;
}

function corsHeaders(env: Env, origin = allowedOrigins(env)[0]): HeadersInit {
	return {
		...(origin ? { 'access-control-allow-origin': origin } : {}),
		'access-control-allow-credentials': 'true',
		'access-control-allow-methods': 'GET, POST, OPTIONS',
		'access-control-allow-headers': 'content-type',
		'access-control-max-age': '86400',
		vary: 'origin'
	};
}

function json(
	env: Env,
	body: unknown,
	status = 200,
	extra?: Record<string, string>,
	origin?: string
): Response {
	return Response.json(body, { status, headers: { ...corsHeaders(env, origin), ...extra } });
}

function streamedAnswer(
	env: Env,
	body: {
		requestId: string;
		assistant: ReturnType<typeof validateAnswer>;
		quota: { browserRemaining: number; ipRemaining: number; resetsAt: string };
	},
	extra?: Record<string, string>,
	origin?: string
): Response {
	const events: unknown[] = [
		{ type: 'start', requestId: body.requestId, scope: body.assistant.scope }
	];
	for (const block of body.assistant.blocks) {
		events.push({ type: 'block_start', kind: block.kind });
		for (let offset = 0; offset < block.text.length; offset += 48) {
			events.push({ type: 'text_delta', delta: block.text.slice(offset, offset + 48) });
		}
		events.push({ type: 'block_done', ruleIds: block.ruleIds, sourceIds: block.sourceIds });
	}
	events.push({ type: 'done', quota: body.quota });

	const encoder = new TextEncoder();
	let index = 0;
	return new Response(
		new ReadableStream({
			pull(controller) {
				const event = events[index++];
				if (event === undefined) {
					controller.close();
					return;
				}
				controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
			}
		}),
		{
			status: 200,
			headers: {
				...corsHeaders(env, origin),
				...extra,
				'content-type': 'application/x-ndjson; charset=utf-8',
				'cache-control': 'no-store'
			}
		}
	);
}

/** Operational metadata only: no raw IPs, no prompt or answer text. */
function writeMetric(
	env: Env,
	point: {
		outcome: 'ok' | 'error';
		code?: string;
		latencyMs: number;
		sessionHash?: string;
		inputTokens?: number;
		cachedInputTokens?: number;
		cacheWriteTokens?: number;
		outputTokens?: number;
		spendUsd?: number;
		requestId?: string;
	}
): void {
	env.METRICS?.writeDataPoint({
		blobs: [point.outcome, point.code ?? '', MODEL.id, point.requestId ?? ''],
		doubles: [
			point.latencyMs,
			point.inputTokens ?? 0,
			point.cachedInputTokens ?? 0,
			point.cacheWriteTokens ?? 0,
			point.outputTokens ?? 0,
			point.spendUsd ?? 0
		],
		indexes: [point.sessionHash ?? 'anonymous']
	});
}

export interface HandlerOptions {
	provider?: AnswerProvider;
	verifyTurnstile?: TurnstileVerifier;
	now?: () => number;
}

export function createHandler(options: HandlerOptions = {}) {
	return async function handleAnswers(request: Request, env: Env): Promise<Response> {
		const now = options.now ?? Date.now;
		const startedAt = now();
		const requestId = crypto.randomUUID();
		let sessionHash: string | undefined;
		let responseOrigin: string | undefined;
		try {
			if (env.ASSISTANT_DISABLED === 'true') {
				throw new ApiError('service_disabled', 'The assistant is switched off right now.');
			}
			const origin = request.headers.get('origin');
			responseOrigin = acceptedOrigin(env, origin);
			if (!responseOrigin) {
				throw new ApiError('invalid_request', 'Origin not allowed.');
			}

			// Body size before body shape.
			const bodyText = await request.text();
			if (new TextEncoder().encode(bodyText).byteLength > REQUEST_RULES.maxBodyBytes) {
				throw new ApiError('invalid_request', 'Request body too large.');
			}
			let parsedBody: unknown;
			try {
				parsedBody = JSON.parse(bodyText);
			} catch {
				throw new ApiError('invalid_request', 'Request body is not JSON.');
			}
			const parsed = answerRequestSchema.safeParse(parsedBody);
			if (!parsed.success) {
				throw new ApiError('invalid_request', 'Request body failed validation.');
			}
			const body = parsed.data;
			validateConversation(body);
			if (body.clientRuleSetVersion !== corpus.ruleSetVersion) {
				throw new ApiError(
					'invalid_request',
					'This client uses a different ruleset version. Reload and try again.'
				);
			}

			// --- Anonymous session -------------------------------------------------
			const ip = request.headers.get('cf-connecting-ip') ?? undefined;
			const ipHash = ip ? await hashIdentifier('ip', ip, env.ABUSE_HMAC_SECRET) : 'no-ip';
			const verify = options.verifyTurnstile ?? turnstileVerifier(env.TURNSTILE_SECRET);
			let session = await verifySession(
				readSessionCookie(request),
				env.SESSION_SIGNING_SECRET,
				now()
			);
			const needsChallenge =
				!session ||
				session.uses >= SESSION_RULES.requestsPerChallenge ||
				session.abuseHash !== ipHash;
			if (needsChallenge) {
				if (!body.turnstileToken) {
					throw new ApiError('challenge_required', 'Complete the challenge and try again.');
				}
				if (!(await verify(body.turnstileToken, ip))) {
					throw new ApiError('challenge_failed', 'The challenge did not verify.');
				}
				session = session
					? { ...session, uses: 0, abuseHash: ipHash }
					: ({
							sid: crypto.randomUUID(),
							iat: now(),
							uses: 0,
							abuseHash: ipHash
						} satisfies SessionState);
			}
			const state = session!;
			sessionHash = await hashIdentifier('session', state.sid, env.ABUSE_HMAC_SECRET);
			const setCookie = async () =>
				sessionCookie(
					await signSession(state, env.SESSION_SIGNING_SECRET),
					new URL(request.url).protocol === 'https:'
				);

			// --- Fast approximate minute throttles ---------------------------------
			const [sessionMinute, ipMinute] = await Promise.all([
				env.SESSION_MINUTE_LIMIT.limit({ key: sessionHash }),
				env.IP_MINUTE_LIMIT.limit({ key: ipHash })
			]);
			if (!sessionMinute.success || !ipMinute.success) {
				throw new ApiError('rate_limited', 'Slow down a little and try again.');
			}

			// --- Exact daily, concurrency, and spend accounting --------------------
			const held: QuotaHandle[] = [];
			const begin = async (name: string, body: Record<string, unknown>): Promise<BeginResult> => {
				const result = await quotaCall<BeginResult>(env, name, '/begin', body);
				if (result.ok && result.slot) held.push({ name, slot: result.slot });
				return result;
			};
			const releaseAll = async (path: '/cancel' | '/finish', spendUsd = 0) => {
				await Promise.all(
					held.map((handle) => quotaCall(env, handle.name, path, { slot: handle.slot, spendUsd }))
				);
			};

			const sessionQuota = await begin(`s:${sessionHash}`, {
				dailyLimit: LIMITS.sessionPerDay,
				concurrentLimit: LIMITS.sessionConcurrent,
				spendLimitUsd: LIMITS.sessionDailySpendUsd
			});
			const ipQuota = sessionQuota.ok
				? await begin(`i:${ipHash}`, {
						dailyLimit: LIMITS.ipPerDay,
						concurrentLimit: LIMITS.ipConcurrent
					})
				: undefined;
			const globalQuota =
				ipQuota?.ok === true
					? await begin('global', {
							dailyLimit: Number.MAX_SAFE_INTEGER,
							concurrentLimit: Number.MAX_SAFE_INTEGER,
							spendLimitUsd: LIMITS.globalDailySpendUsd
						})
					: undefined;
			const refusal = [sessionQuota, ipQuota, globalQuota].find((result) => result && !result.ok);
			if (refusal) {
				await releaseAll('/cancel');
				throw new ApiError(refusal.error ?? 'rate_limited');
			}

			// --- The model ---------------------------------------------------------
			const provider =
				options.provider ??
				createOpenAiProvider(env.AI_GATEWAY_BASE_URL, env.OPENAI_API_KEY, env.AI_GATEWAY_TOKEN);
			let spendUsd = 0;
			try {
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), MODEL.providerTimeoutMs);
				let result;
				try {
					result = await provider(
						body.messages,
						await safetyIdentifier(state.sid, env.ABUSE_HMAC_SECRET),
						controller.signal
					);
				} finally {
					clearTimeout(timeout);
				}
				spendUsd = estimateSpendUsd(result.usage);
				const answer = validateAnswer(result.raw, corpusRuleIds, corpusSourceIds);

				state.uses += 1;
				await releaseAll('/finish', spendUsd);
				writeMetric(env, {
					outcome: 'ok',
					latencyMs: now() - startedAt,
					sessionHash,
					inputTokens: result.usage.inputTokens,
					cachedInputTokens: result.usage.cachedInputTokens,
					cacheWriteTokens: result.usage.cacheWriteTokens,
					outputTokens: result.usage.outputTokens,
					spendUsd,
					requestId
				});
				const responseBody = {
					requestId,
					assistant: answer,
					quota: {
						browserRemaining: sessionQuota.remaining,
						ipRemaining: ipQuota!.remaining,
						resetsAt: sessionQuota.resetsAt
					}
				};
				const responseHeaders = { 'set-cookie': await setCookie() };
				return request.headers.get('accept')?.includes('application/x-ndjson')
					? streamedAnswer(env, responseBody, responseHeaders, responseOrigin)
					: json(env, responseBody, 200, responseHeaders, responseOrigin);
			} catch (error) {
				// The attempt happened: keep the daily unit, release the slots, count
				// any spend the failed call still incurred.
				await releaseAll('/finish', spendUsd);
				if (error instanceof ApiError && needsChallenge) {
					// A passed challenge survives a failed answer: the retry must not
					// cost the user a second Turnstile pass.
					(error as ApiError & { headers?: Record<string, string> }).headers = {
						'set-cookie': await setCookie()
					};
				}
				throw error;
			}
		} catch (error) {
			const apiError =
				error instanceof ApiError ? error : new ApiError('provider_error', 'Something went wrong.');
			if (apiError.code === 'invalid_answer') {
				// Record only the invariant category, never the model payload or an
				// unknown model-written identifier that may contain user text.
				console.warn('assistant_invalid_answer', {
					requestId,
					reason: apiError.message.split(':', 1)[0]
				});
			}
			writeMetric(env, {
				outcome: 'error',
				code: apiError.code,
				latencyMs: now() - startedAt,
				sessionHash,
				requestId
			});
			const headers = (apiError as ApiError & { headers?: Record<string, string> }).headers;
			return json(
				env,
				{ requestId, ...errorBody(apiError) },
				apiError.status,
				headers,
				responseOrigin
			);
		}
	};
}

const defaultHandler = createHandler();

const worker = {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const requestOrigin = acceptedOrigin(env, request.headers.get('origin'));
		if (request.method === 'OPTIONS') {
			if (!requestOrigin) {
				return json(
					env,
					{ error: { code: 'invalid_request', message: 'Origin not allowed.' } },
					400
				);
			}
			return new Response(null, { status: 204, headers: corsHeaders(env, requestOrigin) });
		}
		if (request.method === 'GET' && url.pathname === '/health') {
			return json(
				env,
				{
					status: env.ASSISTANT_DISABLED === 'true' ? 'disabled' : 'ok',
					ruleSetVersion: corpus.ruleSetVersion,
					corpusHash: corpus.contentHash
				},
				200,
				undefined,
				requestOrigin
			);
		}
		if (request.method === 'POST' && url.pathname === '/v1/answers') {
			return defaultHandler(request, env);
		}
		return json(
			env,
			{ error: { code: 'invalid_request', message: 'No such endpoint.' } },
			404,
			undefined,
			requestOrigin
		);
	}
};

export default worker;
