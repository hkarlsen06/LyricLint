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

export function assistantAnswersUrl(): string {
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
	fetcher?: typeof fetch;
	signal?: AbortSignal;
}

export async function askAssistant(options: AskOptions): Promise<TurnResponse> {
	if (!assistantAvailable()) throw new AssistantError('not-configured');
	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		throw new AssistantError('offline', 'You are offline. The assistant needs a connection.');
	}
	const fetcher = options.fetcher ?? fetch;
	let response: Response;
	try {
		response = await fetcher(assistantAnswersUrl(), {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
			signal: options.signal ?? null,
			body: JSON.stringify({
				chatId: options.chatId,
				messages: options.messages,
				clientRuleSetVersion: options.clientRuleSetVersion,
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
		return readAnswerStream(response, options.onProgress);
	}
	const answer = (await response.json()) as Omit<Extract<TurnResponse, { kind: 'answer' }>, 'kind'>;
	return { kind: 'answer', ...answer };
}

type StreamEvent =
	| { type: 'start'; requestId: string; scope: AssistantAnswerScope }
	| { type: 'block_start'; kind: AssistantAnswerBlock['kind'] }
	| { type: 'text_delta'; delta: string }
	| {
			type: 'block_done';
			kind?: AssistantAnswerBlock['kind'];
			ruleIds: string[];
			sourceIds: string[];
	  }
	| { type: 'tool_calls'; calls: AssistantToolCall[]; providerItems: string }
	| { type: 'error'; requestId: string; error: { code: string; message: string } }
	| { type: 'done'; quota: AssistantQuota };

async function readAnswerStream(
	response: Response,
	onProgress?: AskOptions['onProgress']
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

	const publish = async (force = false) => {
		if (!scope || !onProgress) return;
		const now = Date.now();
		if (!force && now - lastPublishedAt < 32) return;
		lastPublishedAt = now;
		await onProgress({ scope, blocks: [...closed, ...open] });
	};
	const consume = async (line: string) => {
		const event = JSON.parse(line) as StreamEvent;
		switch (event.type) {
			case 'start':
				requestId = event.requestId;
				scope = event.scope;
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
						// have moved off the kind the block streamed under.
						...(event.kind ? { kind: event.kind } : {}),
						ruleIds: event.ruleIds,
						sourceIds: event.sourceIds
					}
				];
				await publish(true);
				break;
			}
			case 'tool_calls':
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

	try {
		while (true) {
			const { done, value } = await reader.read();
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
	} catch (error) {
		if (error instanceof AssistantError) throw error;
		// The worded error the user sees never carries the cause; without this
		// line a parser bug and a dropped connection are indistinguishable.
		console.error('assistant_stream_interrupted', error);
		throw new AssistantError('provider_error', 'The answer stream was interrupted.');
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
