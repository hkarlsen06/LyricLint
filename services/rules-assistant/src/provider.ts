/**
 * The one call that leaves Cloudflare: the OpenAI Responses API through the
 * AI Gateway, with the official SDK. No tools, no browsing, no retrieval;
 * `store: false`; strict structured output. Injectable so tests never touch
 * the network.
 */
import OpenAI from 'openai';
import { MODEL } from './config';
import { corpus } from './corpus';
import { ApiError } from './errors';
import { answerJsonSchema, type AnswerRequest } from './schema';
import { buildPromptInput, promptCacheKey } from './prompt';

export interface ProviderUsage {
	inputTokens: number;
	cachedInputTokens: number;
	cacheWriteTokens: number;
	outputTokens: number;
}

export interface ProviderResult {
	/** Parsed JSON of the structured answer (unvalidated). */
	raw: unknown;
	usage: ProviderUsage;
}

export interface AnswerProvider {
	(
		messages: AnswerRequest['messages'],
		safetyIdentifier: string,
		signal: AbortSignal
	): Promise<ProviderResult>;
}

export function estimateSpendUsd(usage: ProviderUsage): number {
	const uncached = Math.max(
		0,
		usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens
	);
	return (
		(uncached * MODEL.estInputUsdPerMTok +
			usage.cachedInputTokens * MODEL.estCachedInputUsdPerMTok +
			usage.cacheWriteTokens * MODEL.estCacheWriteUsdPerMTok +
			usage.outputTokens * MODEL.estOutputUsdPerMTok) /
		1_000_000
	);
}

export function providerRequest(
	messages: AnswerRequest['messages'],
	safetyIdentifier: string
): OpenAI.Responses.ResponseCreateParamsNonStreaming {
	const input = buildPromptInput(corpus, messages);
	return {
		model: MODEL.id,
		input: input.map((message, index) => ({
			role: message.role,
			content: [
				{
					type: 'input_text' as const,
					text: message.content,
					...(index === 0 ? { prompt_cache_breakpoint: { mode: 'explicit' as const } } : {})
				}
			]
		})),
		reasoning: MODEL.reasoning,
		store: false,
		max_output_tokens: MODEL.maxOutputTokens,
		safety_identifier: safetyIdentifier,
		prompt_cache_key: promptCacheKey(corpus),
		prompt_cache_options: { mode: 'explicit', ttl: '30m' },
		text: {
			format: {
				type: 'json_schema',
				name: 'assistant_answer',
				strict: true,
				schema: answerJsonSchema as unknown as Record<string, unknown>
			}
		}
	};
}

export function gatewayHeaders(gatewayToken: string): Record<string, string> {
	return {
		'cf-aig-authorization': `Bearer ${gatewayToken}`,
		// The default Gateway cache key includes the full request body, including
		// our session-derived safety_identifier, so entries cannot cross sessions.
		'cf-aig-cache-ttl': '3600',
		'cf-aig-collect-log': 'false'
	};
}

export function createOpenAiProvider(
	baseUrl: string,
	openAiApiKey: string,
	gatewayToken: string
): AnswerProvider {
	const client = new OpenAI({
		baseURL: baseUrl,
		apiKey: openAiApiKey,
		defaultHeaders: gatewayHeaders(gatewayToken)
	});
	return async (messages, safetyIdentifier, signal) => {
		let response: OpenAI.Responses.Response;
		try {
			response = await client.responses.create(providerRequest(messages, safetyIdentifier), {
				signal
			});
		} catch {
			if (signal.aborted)
				throw new ApiError('provider_error', 'The model took too long to answer.');
			throw new ApiError('provider_error', 'The model is unavailable right now.');
		}
		if (response.status !== 'completed' || !response.output_text) {
			throw new ApiError('provider_error', 'The model did not finish an answer.');
		}
		let raw: unknown;
		try {
			raw = JSON.parse(response.output_text);
		} catch {
			throw new ApiError('invalid_answer', 'The assistant returned a malformed answer.');
		}
		return {
			raw,
			usage: {
				inputTokens: response.usage?.input_tokens ?? 0,
				cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
				cacheWriteTokens: response.usage?.input_tokens_details?.cache_write_tokens ?? 0,
				outputTokens: response.usage?.output_tokens ?? 0
			}
		};
	};
}
