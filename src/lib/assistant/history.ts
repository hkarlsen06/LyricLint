/**
 * The bounded history window: complete recent exchanges up to
 * `HISTORY_WINDOW_CHARS`, plus the question being asked. Older messages stay
 * on screen with a divider saying they were not included as model context —
 * `firstIncludedIndex` is where that divider goes.
 */
import type { AssistantMessageRecord } from '$lib/persistence/types.js';
import { HISTORY_WINDOW_CHARS } from './types.js';

export interface WireMessage {
	role: 'user' | 'assistant';
	content: string;
}

export interface BoundedHistory {
	/** What the backend receives, oldest first, question last. */
	messages: WireMessage[];
	/** Index into the *source* history of the oldest message sent as context;
	 * `history.length` when no prior exchange was included. Everything before
	 * this index draws under the "not included as context" divider. */
	firstIncludedIndex: number;
}

function wireContent(message: AssistantMessageRecord): string {
	return message.content;
}

/**
 * `history` is the settled conversation (no pending placeholder), `question`
 * the text being asked now. Only complete exchanges — a user turn and the
 * assistant answer it got — count as context; failed and interrupted turns are
 * skipped, because resending a question that got no answer as though it had
 * one misleads the model about its own transcript.
 */
export function boundedHistory(
	history: AssistantMessageRecord[],
	question: string
): BoundedHistory {
	const usable: Array<{ index: number; pair: WireMessage[] }> = [];
	for (let i = 0; i + 1 < history.length; i++) {
		const user = history[i]!;
		const assistant = history[i + 1]!;
		if (user.role === 'user' && assistant.role === 'assistant' && assistant.status === 'complete') {
			usable.push({
				index: i,
				pair: [
					{ role: 'user', content: wireContent(user) },
					{ role: 'assistant', content: wireContent(assistant) }
				]
			});
			i += 1;
		}
	}

	let budget = HISTORY_WINDOW_CHARS;
	const kept: Array<{ index: number; pair: WireMessage[] }> = [];
	for (let i = usable.length - 1; i >= 0; i--) {
		const exchange = usable[i]!;
		const cost = exchange.pair.reduce((sum, message) => sum + message.content.length, 0);
		if (cost > budget) break;
		budget -= cost;
		kept.unshift(exchange);
	}

	return {
		messages: [...kept.flatMap((exchange) => exchange.pair), { role: 'user', content: question }],
		firstIncludedIndex: kept[0]?.index ?? history.length
	};
}
