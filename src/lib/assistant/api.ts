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
	type AnswerResponse,
	type AssistantAnswerBlock,
	type AssistantAnswerScope,
	type AssistantErrorCode,
	type AssistantQuota,
	type StructuredAssistantAnswer
} from './types.js';
import type { WireMessage } from './history.js';

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
	messages: WireMessage[];
	clientRuleSetVersion: string;
	turnstileToken?: string;
	onProgress?(answer: StructuredAssistantAnswer): void | Promise<void>;
	fetcher?: typeof fetch;
	signal?: AbortSignal;
}

export async function askAssistant(options: AskOptions): Promise<AnswerResponse> {
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
	return (await response.json()) as AnswerResponse;
}

type StreamEvent =
	| { type: 'start'; requestId: string; scope: AssistantAnswerScope }
	| { type: 'block_start'; kind: AssistantAnswerBlock['kind'] }
	| { type: 'text_delta'; delta: string }
	| { type: 'block_done'; ruleIds: string[]; sourceIds: string[] }
	| { type: 'done'; quota: AssistantQuota };

async function readAnswerStream(
	response: Response,
	onProgress?: AskOptions['onProgress']
): Promise<AnswerResponse> {
	if (!response.body) throw new AssistantError('provider_error', 'The answer stream was empty.');
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let requestId = '';
	let scope: AssistantAnswerScope | undefined;
	let current: AssistantAnswerBlock | undefined;
	let blocks: AssistantAnswerBlock[] = [];
	let quota: AssistantQuota | undefined;

	const publish = async () => {
		if (!scope || !onProgress) return;
		await onProgress({ scope, blocks: current ? [...blocks, current] : [...blocks] });
	};
	const consume = async (line: string) => {
		const event = JSON.parse(line) as StreamEvent;
		switch (event.type) {
			case 'start':
				requestId = event.requestId;
				scope = event.scope;
				break;
			case 'block_start':
				current = { kind: event.kind, text: '', ruleIds: [], sourceIds: [] };
				break;
			case 'text_delta':
				if (!current) throw new Error('Text arrived outside an answer block.');
				current = { ...current, text: current.text + event.delta };
				await publish();
				break;
			case 'block_done':
				if (!current) throw new Error('A block ended before it started.');
				blocks = [...blocks, { ...current, ruleIds: event.ruleIds, sourceIds: event.sourceIds }];
				current = undefined;
				await publish();
				break;
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
	} catch {
		throw new AssistantError('provider_error', 'The answer stream was interrupted.');
	}
	if (!requestId || !scope || !quota || current) {
		throw new AssistantError('provider_error', 'The answer stream did not finish.');
	}
	return { requestId, assistant: { scope, blocks }, quota };
}
