import type { AssistantMessageRecord } from '$lib/persistence/types.js';

/** A completed turn is recoverable without another request if it retained an answer or text. */
export function hasCompletedAnswer(message: AssistantMessageRecord): boolean {
	return message.status === 'complete' && Boolean(message.answer || message.content.trim());
}
