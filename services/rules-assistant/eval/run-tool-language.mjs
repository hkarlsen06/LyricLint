/** Explicit live-evaluation entry point; never imported by the Worker or unit tests. */
import process from 'node:process';
import { createOpenAiProvider } from '../src/provider.ts';
import { evaluateToolLanguage } from './tool-language.ts';

const { AI_GATEWAY_BASE_URL, OPENAI_API_KEY, AI_GATEWAY_TOKEN } = process.env;
if (!AI_GATEWAY_BASE_URL || !OPENAI_API_KEY || !AI_GATEWAY_TOKEN) {
	throw new Error(
		'Configure AI_GATEWAY_BASE_URL, OPENAI_API_KEY, and AI_GATEWAY_TOKEN; see eval/README.md.'
	);
}
const provider = createOpenAiProvider(AI_GATEWAY_BASE_URL, OPENAI_API_KEY, AI_GATEWAY_TOKEN);
await evaluateToolLanguage(provider, process.env.TOOL_LANGUAGE_EVAL_QUESTION);
