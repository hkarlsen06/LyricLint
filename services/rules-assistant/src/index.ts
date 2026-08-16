/**
 * The rules-assistant Worker. One answering endpoint, one health endpoint,
 * layered abuse control (WAF and the AI Gateway ceiling sit outside this
 * file), and browser-executed draft tools whose results return in a later
 * request. Answer text may stream before its final validation; citations and
 * completion remain behind that gate. Nothing a client can say selects a
 * model, prompt, or corpus.
 */
import {
	GLOBAL_REQUEST_SPEND_RESERVATION_USD,
	LIMITS,
	MAX_TOOL_ROUNDS,
	MODEL,
	REQUEST_RULES,
	SESSION_RULES,
	type Env
} from './config';
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
import {
	createOpenAiProvider,
	estimateSpendUsd,
	type AnswerProvider,
	type ProviderResult,
	type ProviderUsage,
	type ProviderToolCall
} from './provider';
import type { BeginResult } from './quota-do';
import {
	answerRequestSchema,
	toolRoundCount,
	validateAnswer,
	validateConversation,
	type AnswerRequest,
	type StructuredAnswer
} from './schema';
import { IncrementalAnswerStream } from './stream';

export { QuotaCounter } from './quota-do';

interface QuotaHandle {
	name: string;
	slot: string;
}

/**
 * What the model is told on the call that follows its last tool round. It is
 * appended as a visitor-role message for the reason `repairMessages` appends
 * one: the developer instructions are byte-identical per corpus so the prompt
 * cache hits, and a per-request fact belongs after the cache breakpoint.
 */
export const FINAL_ROUND_INSTRUCTION =
	`You have now used all ${MAX_TOOL_ROUNDS} 'scribe tool rounds for this turn, so no tools ` +
	`are available on this reply. Answer with what you have: say what you did, what is still ` +
	`outstanding and why, and that they can ask again to carry on. Do not claim work you did not ` +
	`complete.`;

export const REPAIR_INSTRUCTION = (message: string): string =>
	`Your previous answer failed validation: ${message}. It was not shown to the visitor. Answer the question again, corrected, as a complete structured answer.`;

function repairMessages(
	messages: AnswerRequest['messages'],
	raw: unknown,
	message: string
): AnswerRequest['messages'] {
	return [
		...messages,
		{ role: 'assistant', content: JSON.stringify(raw) ?? 'null' },
		{ role: 'user', content: REPAIR_INSTRUCTION(message) }
	];
}

function sumUsage(...values: Array<ProviderUsage | undefined>): ProviderUsage | undefined {
	const present = values.filter((value): value is ProviderUsage => value !== undefined);
	if (present.length === 0) return undefined;
	return present.reduce<ProviderUsage>(
		(total, value) => ({
			inputTokens: total.inputTokens + value.inputTokens,
			cachedInputTokens: total.cachedInputTokens + value.cachedInputTokens,
			cacheWriteTokens: total.cacheWriteTokens + value.cacheWriteTokens,
			outputTokens: total.outputTokens + value.outputTokens
		}),
		{ inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }
	);
}

function invalidAnswerReason(error: ApiError): string {
	return error.message.split(':', 1)[0] ?? error.message;
}

function warnInvalidAnswer(requestId: string, error: ApiError): void {
	console.warn('assistant_invalid_answer', {
		requestId,
		reason: invalidAnswerReason(error)
	});
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

function streamedToolCalls(
	env: Env,
	body: {
		calls: ProviderToolCall[];
		providerItems: string;
		quota: { browserRemaining: number; ipRemaining: number; resetsAt: string };
	},
	extra?: Record<string, string>,
	origin?: string
): Response {
	const events = [
		{ type: 'tool_calls', calls: body.calls, providerItems: body.providerItems },
		{ type: 'done', quota: body.quota }
	];
	return new Response(events.map((event) => `${JSON.stringify(event)}\n`).join(''), {
		status: 200,
		headers: {
			...corsHeaders(env, origin),
			...extra,
			'content-type': 'application/x-ndjson; charset=utf-8',
			'cache-control': 'no-store'
		}
	});
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
		/** Set once a challenge has been passed on this request, so every refusal
		 * below can hand the cookie back. */
		let rescueCookie: (() => Promise<string>) | undefined;
		let metricUsage: ProviderUsage | undefined;
		let metricSpendUsd = 0;
		try {
			if (env.ASSISTANT_DISABLED === 'true') {
				throw new ApiError('service_disabled', 'The assistant is switched off right now.');
			}
			const origin = request.headers.get('origin');
			responseOrigin = acceptedOrigin(env, origin);
			if (!responseOrigin) {
				throw new ApiError('invalid_request', 'Origin not allowed.');
			}

			// Body size before body shape, and a declared size before the body.
			const declaredLength = request.headers.get('content-length');
			if (declaredLength !== null && Number(declaredLength) > REQUEST_RULES.maxBodyBytes) {
				throw new ApiError('invalid_request', 'Request body too large.');
			}
			const bodyText = await request.text();
			// UTF-8 spends one to four bytes per UTF-16 unit, so a string longer
			// than the cap is over it whatever it holds, and one under a quarter of
			// it is under whatever it holds. Only the band between the two pays for
			// an encoding pass, and an ordinary question is nowhere near it.
			if (
				bodyText.length > REQUEST_RULES.maxBodyBytes ||
				(bodyText.length * 4 > REQUEST_RULES.maxBodyBytes &&
					new TextEncoder().encode(bodyText).byteLength > REQUEST_RULES.maxBodyBytes)
			) {
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
			// The IP throttle runs ahead of the challenge, because verifying one is
			// a subrequest to Cloudflare and a flood must not be able to buy one per
			// request. The session throttle cannot move here: there is no session to
			// key it on until the cookie has been read or a challenge has passed.
			if (!(await env.IP_MINUTE_LIMIT.limit({ key: ipHash })).success) {
				throw new ApiError('rate_limited', 'Slow down a little and try again.');
			}
			const verify =
				options.verifyTurnstile ??
				turnstileVerifier(env.TURNSTILE_SECRET, env.TURNSTILE_ALLOW_LOCALHOST === 'true');
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
			// A passed challenge survives every refusal below — the session
			// throttle, a quota the Durable Object declines, a failed answer — so
			// the retry never costs the user a second Turnstile pass.
			if (needsChallenge) rescueCookie = setCookie;

			// --- Fast approximate minute throttle ----------------------------------
			if (!(await env.SESSION_MINUTE_LIMIT.limit({ key: sessionHash })).success) {
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

			// A begin that *throws* rather than refusing leaves every slot already
			// held: unreleased, the session sits at its concurrency ceiling until
			// the stale window passes and keeps a daily unit for a request that
			// never reached the model.
			const beginAll = async (): Promise<
				[BeginResult, BeginResult | undefined, BeginResult | undefined]
			> => {
				try {
					const forSession = await begin(`s:${sessionHash}`, {
						dailyLimit: LIMITS.sessionPerDay,
						concurrentLimit: LIMITS.sessionConcurrent,
						spendLimitUsd: LIMITS.sessionDailySpendUsd
					});
					const forIp = forSession.ok
						? await begin(`i:${ipHash}`, {
								dailyLimit: LIMITS.ipPerDay,
								concurrentLimit: LIMITS.ipConcurrent,
								spendLimitUsd: LIMITS.ipDailySpendUsd
							})
						: undefined;
					const forGlobal =
						forIp?.ok === true
							? await begin('global', {
									dailyLimit: Number.MAX_SAFE_INTEGER,
									concurrentLimit: LIMITS.globalConcurrent,
									spendLimitUsd: LIMITS.globalDailySpendUsd,
									reserveSpendUsd: GLOBAL_REQUEST_SPEND_RESERVATION_USD
								})
							: undefined;
					return [forSession, forIp, forGlobal];
				} catch (error) {
					await releaseAll('/cancel');
					throw error;
				}
			};
			const [sessionQuota, ipQuota, globalQuota] = await beginAll();
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
				const providerSafetyIdentifier = await safetyIdentifier(state.sid, env.ABUSE_HMAC_SECRET);
				// The tool budget is spent by withholding the tools, not by refusing
				// the call that asks for one. A model offered tools with no rounds
				// left will use them — it has no way to know the budget exists — and
				// the turn then died on a gate the visitor reads as "the answer
				// failed validation", losing everything the earlier rounds
				// established. Withheld, the last call can only answer, which is what
				// the visitor is owed at that point. `toolsAvailable` on the request
				// keeps its own meaning throughout: it is what the answer's
				// `draft-work` scope is checked against, and a turn that used tools
				// is still a turn that used them.
				const toolBudgetSpent =
					body.toolsAvailable === true && toolRoundCount(body.messages) >= MAX_TOOL_ROUNDS;
				const providerTools = body.toolsAvailable === true && !toolBudgetSpent;
				const providerMessages: AnswerRequest['messages'] = toolBudgetSpent
					? [...body.messages, { role: 'user', content: FINAL_ROUND_INSTRUCTION }]
					: body.messages;
				const quota = {
					browserRemaining: sessionQuota.remaining,
					ipRemaining: ipQuota!.remaining,
					resetsAt: sessionQuota.resetsAt
				};
				if (request.headers.get('accept')?.includes('application/x-ndjson')) {
					// The response status and headers must be committed before provider tokens
					// arrive. From here on, failures are part of the NDJSON protocol.
					state.uses += 1;
					const responseHeaders = { 'set-cookie': await setCookie() };
					const providerController = new AbortController();
					const encoder = new TextEncoder();
					let cancelled = false;
					let finalized: Promise<void> | undefined;
					let usage: ProviderUsage | undefined;
					let streamedOutputChars = 0;
					let accountedSpendUsd = 0;
					const streamSpendUsd = () =>
						usage
							? estimateSpendUsd(usage)
							: (Math.ceil(streamedOutputChars / 4) * MODEL.estOutputUsdPerMTok) / 1_000_000;

					const stream = new ReadableStream<Uint8Array>({
						start(controller) {
							const emit = (event: unknown) => {
								if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
							};
							let answerStream = new IncrementalAnswerStream(requestId, emit);
							const finalize = (outcome: 'ok' | 'error', code?: string): Promise<void> => {
								finalized ??= (async () => {
									accountedSpendUsd = streamSpendUsd();
									try {
										await releaseAll('/finish', accountedSpendUsd);
									} catch {
										// The HTTP status is already committed, so an accounting outage
										// must not strand the browser in an unterminated answer stream.
										console.error('assistant_quota_release_failed', { requestId });
									}
									writeMetric(env, {
										outcome,
										...(code ? { code } : {}),
										latencyMs: now() - startedAt,
										sessionHash,
										inputTokens: usage?.inputTokens,
										cachedInputTokens: usage?.cachedInputTokens,
										cacheWriteTokens: usage?.cacheWriteTokens,
										outputTokens: usage?.outputTokens,
										spendUsd: accountedSpendUsd,
										requestId
									});
								})();
								return finalized;
							};

							void (async () => {
								let timeout = setTimeout(() => providerController.abort(), MODEL.providerTimeoutMs);
								const resetProviderTimeout = () => {
									clearTimeout(timeout);
									timeout = setTimeout(() => providerController.abort(), MODEL.providerTimeoutMs);
								};
								try {
									// One line per streamed answer: how long the model thought before
									// its first visible token, and how many deltas followed. This is
									// the number to look at before believing "streaming is broken" —
									// a late first delta with a fast tail is reasoning time, not a
									// buffer (that diagnosis has been paid for once already).
									let deltaCount = 0;
									let firstDeltaAtMs: number | undefined;
									let result = await provider(
										providerMessages,
										providerSafetyIdentifier,
										providerController.signal,
										providerTools,
										(delta) => {
											deltaCount += 1;
											streamedOutputChars += delta.length;
											firstDeltaAtMs ??= now() - startedAt;
											answerStream.push(delta);
										},
										(providerUsage) => {
											usage = providerUsage;
										}
									);
									console.warn('assistant_delta_profile', {
										requestId,
										deltaCount,
										firstDeltaAtMs,
										totalMs: now() - startedAt
									});
									usage = result.usage;
									if (result.kind === 'tool_calls') {
										if (!body.toolsAvailable) {
											throw new ApiError(
												'invalid_answer',
												'Draft tools were used when none were offered.'
											);
										}
										if (toolRoundCount(body.messages) >= MAX_TOOL_ROUNDS) {
											throw new ApiError(
												'invalid_answer',
												`The assistant may use draft tools at most ${MAX_TOOL_ROUNDS} times in one turn.`
											);
										}
										const finishing = finalize('ok');
										emit({
											type: 'tool_calls',
											calls: result.calls,
											providerItems: result.providerItems
										});
										await finishing;
										emit({ type: 'done', quota });
									} else {
										let answer: StructuredAnswer;
										try {
											answer = validateAnswer(
												result.raw,
												corpusRuleIds,
												corpusSourceIds,
												body.toolsAvailable === true
											);
										} catch (error) {
											if (
												!(error instanceof ApiError) ||
												error.code !== 'invalid_answer' ||
												body.supportsRetry !== true
											) {
												throw error;
											}
											warnInvalidAnswer(requestId, error);
											const firstUsage = result.usage;
											emit({ type: 'retrying' });
											answerStream = new IncrementalAnswerStream(requestId, emit);
											resetProviderTimeout();
											result = await provider(
												repairMessages(providerMessages, result.raw, error.message),
												providerSafetyIdentifier,
												providerController.signal,
												providerTools,
												(delta) => {
													streamedOutputChars += delta.length;
													answerStream.push(delta);
												},
												(providerUsage) => {
													usage = sumUsage(firstUsage, providerUsage);
												}
											);
											usage = sumUsage(firstUsage, result.usage);
											if (result.kind !== 'answer') {
												throw new ApiError(
													'invalid_answer',
													'The assistant returned draft tools instead of a corrected answer.'
												);
											}
											answer = validateAnswer(
												result.raw,
												corpusRuleIds,
												corpusSourceIds,
												body.toolsAvailable === true
											);
											console.warn('assistant_answer_repaired', {
												requestId,
												reason: invalidAnswerReason(error)
											});
										}
										const finishing = finalize('ok');
										answerStream.flush(answer);
										await finishing;
										emit({ type: 'done', quota });
									}
									if (!cancelled) controller.close();
								} catch (error) {
									const apiError =
										error instanceof ApiError
											? error
											: new ApiError('provider_error', 'Something went wrong.');
									// The browser only ever sees the worded code; the cause behind a
									// provider_error is invisible everywhere unless it is logged here.
									console.error('assistant_turn_failed', {
										requestId,
										code: apiError.code,
										cause: error instanceof Error ? error.message : String(error)
									});
									if (apiError.code === 'invalid_answer') warnInvalidAnswer(requestId, apiError);
									const finishing = finalize('error', apiError.code);
									emit({ type: 'error', requestId, error: errorBody(apiError).error });
									await finishing;
									if (!cancelled) controller.close();
								} finally {
									clearTimeout(timeout);
								}
							})();
						},
						cancel() {
							cancelled = true;
							providerController.abort();
							finalized ??= (async () => {
								accountedSpendUsd = streamSpendUsd();
								try {
									await releaseAll('/finish', accountedSpendUsd);
								} catch {
									console.error('assistant_quota_release_failed', { requestId });
								}
								writeMetric(env, {
									outcome: 'error',
									code: 'provider_error',
									latencyMs: now() - startedAt,
									sessionHash,
									inputTokens: usage?.inputTokens,
									cachedInputTokens: usage?.cachedInputTokens,
									cacheWriteTokens: usage?.cacheWriteTokens,
									outputTokens: usage?.outputTokens,
									spendUsd: accountedSpendUsd,
									requestId
								});
							})();
							return finalized;
						}
					});
					return new Response(stream, {
						status: 200,
						headers: {
							...corsHeaders(env, responseOrigin),
							...responseHeaders,
							'content-type': 'application/x-ndjson; charset=utf-8',
							'cache-control': 'no-store'
						}
					});
				}
				const controller = new AbortController();
				let timeout = setTimeout(() => controller.abort(), MODEL.providerTimeoutMs);
				const resetProviderTimeout = () => {
					clearTimeout(timeout);
					timeout = setTimeout(() => controller.abort(), MODEL.providerTimeoutMs);
				};
				let result: ProviderResult;
				let answer: StructuredAnswer;
				try {
					result = await provider(
						providerMessages,
						providerSafetyIdentifier,
						controller.signal,
						providerTools,
						undefined,
						(providerUsage) => {
							metricUsage = providerUsage;
							spendUsd = estimateSpendUsd(providerUsage);
							metricSpendUsd = spendUsd;
						}
					);
					metricUsage = result.usage;
					spendUsd = estimateSpendUsd(result.usage);
					metricSpendUsd = spendUsd;
					if (result.kind === 'tool_calls') {
						if (!body.toolsAvailable) {
							throw new ApiError('invalid_answer', 'Draft tools were used when none were offered.');
						}
						if (toolRoundCount(body.messages) >= MAX_TOOL_ROUNDS) {
							throw new ApiError(
								'invalid_answer',
								`The assistant may use draft tools at most ${MAX_TOOL_ROUNDS} times in one turn.`
							);
						}

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
						return streamedToolCalls(
							env,
							{
								calls: result.calls,
								providerItems: result.providerItems,
								quota: {
									browserRemaining: sessionQuota.remaining,
									ipRemaining: ipQuota!.remaining,
									resetsAt: sessionQuota.resetsAt
								}
							},
							{ 'set-cookie': await setCookie() },
							responseOrigin
						);
					}
					try {
						answer = validateAnswer(
							result.raw,
							corpusRuleIds,
							corpusSourceIds,
							body.toolsAvailable === true
						);
					} catch (error) {
						if (!(error instanceof ApiError) || error.code !== 'invalid_answer') throw error;
						warnInvalidAnswer(requestId, error);
						const firstResult = result;
						resetProviderTimeout();
						result = await provider(
							repairMessages(providerMessages, firstResult.raw, error.message),
							providerSafetyIdentifier,
							controller.signal,
							providerTools,
							undefined,
							(providerUsage) => {
								const combinedUsage = sumUsage(firstResult.usage, providerUsage)!;
								metricUsage = combinedUsage;
								spendUsd = estimateSpendUsd(combinedUsage);
								metricSpendUsd = spendUsd;
							}
						);
						const combinedUsage = sumUsage(firstResult.usage, result.usage)!;
						metricUsage = combinedUsage;
						spendUsd = estimateSpendUsd(combinedUsage);
						metricSpendUsd = spendUsd;
						if (result.kind !== 'answer') {
							throw new ApiError(
								'invalid_answer',
								'The assistant returned draft tools instead of a corrected answer.'
							);
						}
						answer = validateAnswer(
							result.raw,
							corpusRuleIds,
							corpusSourceIds,
							body.toolsAvailable === true
						);
						console.warn('assistant_answer_repaired', {
							requestId,
							reason: invalidAnswerReason(error)
						});
					}

					state.uses += 1;
					await releaseAll('/finish', spendUsd);
					const finalUsage = metricUsage!;
					writeMetric(env, {
						outcome: 'ok',
						latencyMs: now() - startedAt,
						sessionHash,
						inputTokens: finalUsage.inputTokens,
						cachedInputTokens: finalUsage.cachedInputTokens,
						cacheWriteTokens: finalUsage.cacheWriteTokens,
						outputTokens: finalUsage.outputTokens,
						spendUsd,
						requestId
					});
				} finally {
					clearTimeout(timeout);
				}
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
				return json(env, responseBody, 200, responseHeaders, responseOrigin);
			} catch (error) {
				// The attempt happened: keep the daily unit, release the slots, count
				// any spend the failed call still incurred. The cookie a passed
				// challenge earned is handed back by the outer catch, which is the
				// one place every refusal on this request passes through.
				await releaseAll('/finish', spendUsd);
				throw error;
			}
		} catch (error) {
			const apiError =
				error instanceof ApiError ? error : new ApiError('provider_error', 'Something went wrong.');
			// The browser only ever sees the worded code; the cause behind a
			// provider_error is invisible everywhere unless it is logged here.
			console.error('assistant_turn_failed', {
				requestId,
				code: apiError.code,
				cause: error instanceof Error ? error.message : String(error)
			});
			if (apiError.code === 'invalid_answer') {
				// Record only the invariant category, never the model payload or an
				// unknown model-written identifier that may contain user text.
				warnInvalidAnswer(requestId, apiError);
			}
			writeMetric(env, {
				outcome: 'error',
				code: apiError.code,
				latencyMs: now() - startedAt,
				sessionHash,
				inputTokens: metricUsage?.inputTokens,
				cachedInputTokens: metricUsage?.cachedInputTokens,
				cacheWriteTokens: metricUsage?.cacheWriteTokens,
				outputTokens: metricUsage?.outputTokens,
				spendUsd: metricSpendUsd,
				requestId
			});
			const headers = rescueCookie ? { 'set-cookie': await rescueCookie() } : undefined;
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
