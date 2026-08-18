/**
 * The one network call the assistant makes: POST /v1/answers on the separate
 * Worker, with credentials so the anonymous session cookie rides along.
 *
 * The endpoint URL is committed for the same reason the Spotify client id is — it
 * is not a secret, and `import.meta.env` resolves at build time, so a runtime
 * variable would never reach the bundle. `PUBLIC_ASSISTANT_ANSWERS_URL` overrides
 * it for a fork or a staging deploy, and setting it empty turns the assistant
 * off: `assistantAvailable` is then false and no surface draws an entry point
 * it cannot honor — the rule `spotifyAvailable` already follows.
 */
import {
	AssistantError,
	type AssistantAnswerBlock,
	type AssistantAnswerScope,
	type AssistantErrorCode,
	type AssistantQuota,
	type AssistantToolCall,
	type StructuredAssistantAnswer,
	type TurnResponse,
	type WireMessageV2
} from './types.js';

const DEFAULT_ANSWERS_URL = 'https://api.lyriclint.com/v1/answers';

/**
 * The longest silence the worker can still be alive through.
 *
 * It commits its response headers before the provider has said anything and
 * emits nothing at all until the first visible token — reasoning time is dead
 * air by design — so a stalled turn and a thinking one look identical on the
 * wire. What bounds the honest case is the worker's own `MODEL.providerTimeoutMs`
 * (120s): a provider call that says nothing for that long is aborted and the
 * worker answers with an `error` event. A repair round resets that same budget
 * after `retrying`, so 120s is the longest legitimate gap between two chunks
 * rather than a total. The rest is margin for the abort to reach the provider
 * stream, the quota release the worker awaits before it emits, and transit.
 *
 * Past this, the connection is being held open by something that is never going
 * to answer — a buffering proxy, a wedged worker — and without a watchdog the
 * store stays `busy` for the life of the tab: the composer disabled, every chat
 * command refusing, and no Retry drawn, recoverable only by a reload.
 *
 * Deliberately not a setting. A false positive costs one Retry on an answer
 * that was still coming; there is no number a visitor could pick that is better
 * informed than the one the worker's own timeout implies.
 */
export const STREAM_INACTIVITY_MS = 180_000;

function assistantAnswersUrl(): string {
	const configured = import.meta.env.PUBLIC_ASSISTANT_ANSWERS_URL;
	if (configured !== undefined) return configured.trim();
	return DEFAULT_ANSWERS_URL;
}

export function assistantAvailable(): boolean {
	return assistantAnswersUrl() !== '';
}

const KNOWN_CODES: ReadonlySet<string> = new Set([
	'invalid_request',
	'challenge_required',
	'challenge_failed',
	'request_in_progress',
	'rate_limited',
	'daily_limit_reached',
	'spend_limit_reached',
	'invalid_answer',
	'provider_error',
	'service_disabled'
] satisfies AssistantErrorCode[]);

export interface AskOptions {
	chatId: string;
	messages: WireMessageV2[];
	clientRuleSetVersion: string;
	toolsAvailable?: boolean;
	turnstileToken?: string;
	onProgress?(answer: StructuredAssistantAnswer): void | Promise<void>;
	onRetry?(): void | Promise<void>;
	fetcher?: typeof fetch;
	signal?: AbortSignal;
}

export async function askAssistant(options: AskOptions): Promise<TurnResponse> {
	if (!assistantAvailable()) throw new AssistantError('not-configured');
	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		throw new AssistantError('offline', 'You are offline. The assistant needs a connection.');
	}
	const fetcher = options.fetcher ?? fetch;
	// One controller for the whole turn. The stream watchdog aborts it, and a
	// caller's own signal is forwarded onto it rather than raced beside it, so
	// there is exactly one thing that can cancel this fetch.
	const abort = new AbortController();
	const caller = options.signal;
	const forwardAbort = () => abort.abort(caller?.reason);
	if (caller?.aborted) forwardAbort();
	else caller?.addEventListener('abort', forwardAbort, { once: true });
	try {
		return await sendTurn(options, fetcher, abort);
	} finally {
		caller?.removeEventListener('abort', forwardAbort);
	}
}

async function sendTurn(
	options: AskOptions,
	fetcher: typeof fetch,
	abort: AbortController
): Promise<TurnResponse> {
	let response: Response;
	try {
		response = await fetcher(assistantAnswersUrl(), {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
			signal: abort.signal,
			body: JSON.stringify({
				chatId: options.chatId,
				messages: options.messages,
				clientRuleSetVersion: options.clientRuleSetVersion,
				supportsRetry: true,
				...(options.toolsAvailable ? { toolsAvailable: true } : {}),
				...(options.turnstileToken ? { turnstileToken: options.turnstileToken } : {})
			})
		});
	} catch {
		throw new AssistantError('offline', 'The assistant could not be reached.');
	}
	if (!response.ok) {
		let code: AssistantErrorCode = 'provider_error';
		let message: string | undefined;
		try {
			const body = (await response.json()) as { error?: { code?: string; message?: string } };
			if (body.error?.code && KNOWN_CODES.has(body.error.code)) {
				code = body.error.code as AssistantErrorCode;
			}
			message = body.error?.message;
		} catch {
			// A gateway 502 with an HTML body is still a provider error.
		}
		throw new AssistantError(code, message);
	}
	if (response.headers.get('content-type')?.includes('application/x-ndjson')) {
		return readAnswerStream(response, abort, options.onProgress, options.onRetry);
	}
	const answer = (await response.json()) as Omit<Extract<TurnResponse, { kind: 'answer' }>, 'kind'>;
	return { kind: 'answer', ...answer };
}

type StreamEvent =
	| { type: 'start'; requestId: string; scope: AssistantAnswerScope }
	| { type: 'retrying' }
	| { type: 'block_start'; kind: AssistantAnswerBlock['kind'] }
	| { type: 'text_delta'; delta: string }
	| {
			type: 'block_done';
			kind?: AssistantAnswerBlock['kind'];
			/**
			 * The validated text, sent only where it is not what the deltas already
			 * assembled — validation strips a trailing citation run, and a client
			 * that assembled purely from deltas would go on showing the stripped
			 * text in streaming mode, which is the only mode production uses.
			 */
			text?: string;
			ruleIds: string[];
			sourceIds: string[];
	  }
	| { type: 'tool_calls'; calls: AssistantToolCall[]; providerItems: string }
	| { type: 'error'; requestId: string; error: { code: string; message: string } }
	| { type: 'done'; quota: AssistantQuota };

async function readAnswerStream(
	response: Response,
	abort: AbortController,
	onProgress?: AskOptions['onProgress'],
	onRetry?: AskOptions['onRetry']
): Promise<TurnResponse> {
	if (!response.body) throw new AssistantError('provider_error', 'The answer stream was empty.');
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let requestId = '';
	let scope: AssistantAnswerScope | undefined;
	// The worker cannot close a block before validation — rule and source ids
	// only leave it after the whole answer passes the gate — so `block_start`
	// for block N+1 routinely arrives while block N is still open, and every
	// `block_done` arrives at the end, oldest block first. The reader is
	// therefore a queue, not a single `current` slot: text appends to the
	// newest open block, and a close settles the oldest.
	let open: AssistantAnswerBlock[] = [];
	let closed: AssistantAnswerBlock[] = [];
	let toolCalls: AssistantToolCall[] | undefined;
	let providerItems: string | undefined;
	let quota: AssistantQuota | undefined;
	let lastPublishedAt = Number.NEGATIVE_INFINITY;
	let awaitingRetryStart = false;

	const publish = async (force = false) => {
		if (!scope || !onProgress) return;
		const now = Date.now();
		if (!force && now - lastPublishedAt < 32) return;
		lastPublishedAt = now;
		await onProgress({ scope, blocks: [...closed, ...open] });
	};
	const consume = async (line: string) => {
		const event = JSON.parse(line) as StreamEvent;
		if (awaitingRetryStart && event.type !== 'start' && event.type !== 'error') {
			throw new Error('A repaired answer did not restart its stream.');
		}
		switch (event.type) {
			case 'start':
				requestId = event.requestId;
				scope = event.scope;
				awaitingRetryStart = false;
				break;
			case 'retrying':
				requestId = '';
				scope = undefined;
				open = [];
				closed = [];
				toolCalls = undefined;
				providerItems = undefined;
				quota = undefined;
				lastPublishedAt = Number.NEGATIVE_INFINITY;
				awaitingRetryStart = true;
				await onRetry?.();
				break;
			case 'block_start':
				open = [...open, { kind: event.kind, text: '', ruleIds: [], sourceIds: [] }];
				break;
			case 'text_delta': {
				const newest = open.at(-1);
				if (!newest) throw new Error('Text arrived outside an answer block.');
				open = [...open.slice(0, -1), { ...newest, text: newest.text + event.delta }];
				await publish();
				break;
			}
			case 'block_done': {
				const [oldest, ...rest] = open;
				if (!oldest) throw new Error('A block ended before it started.');
				open = rest;
				closed = [
					...closed,
					{
						...oldest,
						// The close carries the validated kind, which normalization may
						// have moved off the kind the block streamed under — and the
						// validated text where validation changed it, which the deltas
						// alone cannot report.
						...(event.kind ? { kind: event.kind } : {}),
						...(typeof event.text === 'string' ? { text: event.text } : {}),
						ruleIds: event.ruleIds,
						sourceIds: event.sourceIds
					}
				];
				await publish(true);
				break;
			}
			case 'tool_calls':
				// The narration a round streamed is stored off the throttled mirror
				// this publishes, so the deltas of the last 32ms before the calls
				// arrive are the ones that would be missing from it — forced through
				// here, exactly as a block's close forces its own.
				await publish(true);
				toolCalls = event.calls;
				providerItems = event.providerItems;
				break;
			case 'error': {
				const code = KNOWN_CODES.has(event.error.code)
					? (event.error.code as AssistantErrorCode)
					: 'provider_error';
				throw new AssistantError(code, event.error.message);
			}
			case 'done':
				quota = event.quota;
				break;
		}
	};

	// Inter-chunk, not whole-turn: an answer is allowed to take as long as it
	// keeps arriving. It is armed before the first read rather than after it,
	// because the worker commits its headers before the provider has said
	// anything — the gap before the first chunk is the longest one there is, and
	// the request-level path cannot see it at all, since `fetch` has already
	// resolved by then.
	let watchdog: ReturnType<typeof setTimeout> | undefined;
	const watchStream = () => {
		clearTimeout(watchdog);
		watchdog = setTimeout(() => {
			abort.abort(new Error(`No stream activity for ${STREAM_INACTIVITY_MS}ms.`));
		}, STREAM_INACTIVITY_MS);
	};

	try {
		watchStream();
		while (true) {
			const { done, value } = await reader.read();
			// Every resolved read, `done` included: what is being watched is silence
			// on the wire, and the tail below still has parsing left to do.
			watchStream();
			buffer += decoder.decode(value, { stream: !done });
			let newline = buffer.indexOf('\n');
			while (newline !== -1) {
				const line = buffer.slice(0, newline).trim();
				buffer = buffer.slice(newline + 1);
				if (line) await consume(line);
				newline = buffer.indexOf('\n');
			}
			if (done) break;
		}
		// NDJSON is newline-*delimited*, not newline-terminated: a stream whose
		// last line arrives without one leaves a whole event — routinely the
		// `done` that carries the quota — sitting in the buffer, so the answer
		// failed as "did not finish" with every block of it already in hand.
		const rest = buffer.trim();
		if (rest) await consume(rest);
	} catch (error) {
		if (error instanceof AssistantError) throw error;
		// The worded error the user sees never carries the cause; without this
		// line a parser bug and a dropped connection are indistinguishable.
		console.error('assistant_stream_interrupted', error);
		throw new AssistantError('provider_error', 'The answer stream was interrupted.');
	} finally {
		// Before the checks below rather than after them: they throw, and a timer
		// outliving a settled turn would abort a controller nothing is reading.
		clearTimeout(watchdog);
	}
	if (!quota || open.length > 0) {
		throw new AssistantError('provider_error', 'The answer stream did not finish.');
	}
	if (toolCalls && providerItems !== undefined) {
		return { kind: 'tool_calls', calls: toolCalls, providerItems, quota };
	}
	if (!requestId || !scope) {
		throw new AssistantError('provider_error', 'The answer stream did not finish.');
	}
	return { kind: 'answer', requestId, assistant: { scope, blocks: closed }, quota };
}
