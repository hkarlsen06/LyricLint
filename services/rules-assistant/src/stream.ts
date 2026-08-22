import {
	answerScopes,
	type AnswerBlock,
	type AnswerScope,
	type Json,
	type StructuredAnswer
} from './schema';

export interface AnswerBlockDoneEvent {
	type: 'block_done';
	kind: AnswerBlock['kind'];
	ruleIds: string[];
	sourceIds: string[];
	/** The validated text, present only where validation did not merely
	 * extend what was streamed — a stripped trailing citation is the one
	 * thing that does this. The client replaces its assembled text with it. */
	text?: string;
}

export type AnswerStreamEvent =
	| { type: 'start'; requestId: string; scope: AnswerScope }
	| { type: 'retrying' }
	| { type: 'block_start'; kind: AnswerBlock['kind'] }
	| { type: 'text_delta'; delta: string }
	| AnswerBlockDoneEvent;

interface EmittedBlock {
	kind: AnswerBlock['kind'];
	text: string;
	stopped: boolean;
}

/**
 * The answer object as far as a tolerant partial parse can see it: a `scope`
 * already complete enough to name one, and a blocks array whose members may
 * still be anything.
 */
type PartialAnswer = { scope: AnswerScope; blocks: Json[] };

/** A block whose `kind` is written and recognized; its text may not exist yet. */
type PartialBlock = { kind: AnswerBlock['kind']; text?: Json };

const scopeSet = new Set<string>(answerScopes);
const blockKinds = new Set<string>(['prose', 'example', 'general']);

function isPartialAnswer(value: unknown): value is PartialAnswer {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	if (!('scope' in value) || typeof value.scope !== 'string' || !scopeSet.has(value.scope)) {
		return false;
	}
	return 'blocks' in value && Array.isArray(value.blocks);
}

function isPartialBlock(value: unknown): value is PartialBlock {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	return 'kind' in value && typeof value.kind === 'string' && blockKinds.has(value.kind);
}

/** A block's text exists only once the provider has written the field; until then
 * there is nothing to compare against what has already been emitted. */
function isWrittenText(text: Json | undefined): text is string {
	return typeof text === 'string';
}

function partialJson(buffer: string): Json | undefined {
	const closers: string[] = [];
	let inString = false;
	let escaped = false;
	let unicodeDigits = 0;

	for (const character of buffer) {
		if (inString) {
			if (unicodeDigits > 0) {
				if (!/[0-9a-f]/i.test(character)) return undefined;
				unicodeDigits -= 1;
				continue;
			}
			if (escaped) {
				escaped = false;
				if (character === 'u') unicodeDigits = 4;
				continue;
			}
			if (character === '\\') escaped = true;
			else if (character === '"') inString = false;
			continue;
		}

		if (character === '"') inString = true;
		else if (character === '{') closers.push('}');
		else if (character === '[') closers.push(']');
		else if (character === '}' || character === ']') {
			if (closers.pop() !== character) return undefined;
		}
	}

	// Guessing the value of an unfinished escape can publish a character the
	// provider has not written. Waiting one more delta keeps emitted text append-only.
	if (escaped || unicodeDigits > 0) return undefined;
	let completed = buffer;
	if (inString) completed += '"';
	completed += closers.reverse().join('');
	try {
		return JSON.parse(completed);
	} catch {
		return undefined;
	}
}

/**
 * Turns the provider's strict-JSON text into early, append-only answer events.
 * Text is speculative until `flush` receives the fully validated answer; rule
 * and source ids never leave this class before that validation gate.
 */
export class IncrementalAnswerStream {
	private buffer = '';
	private started = false;
	private readonly blocks: EmittedBlock[] = [];

	constructor(
		private readonly requestId: string,
		private readonly emit: (event: AnswerStreamEvent) => void
	) {}

	push(delta: string): void {
		this.buffer += delta;
		const candidate = partialJson(this.buffer);
		if (!isPartialAnswer(candidate)) return;

		if (!this.started) {
			this.started = true;
			this.emit({
				type: 'start',
				requestId: this.requestId,
				scope: candidate.scope
			});
		}

		for (const [index, value] of candidate.blocks.entries()) {
			if (!isPartialBlock(value)) break;
			if (index === this.blocks.length) {
				const emitted = {
					kind: value.kind,
					text: '',
					stopped: false
				};
				this.blocks.push(emitted);
				this.emit({ type: 'block_start', kind: emitted.kind });
			}
			const emitted = this.blocks[index];
			const text = value.text;
			if (!emitted || emitted.stopped || !isWrittenText(text)) continue;
			if (!text.startsWith(emitted.text)) {
				emitted.stopped = true;
				continue;
			}
			const growth = text.slice(emitted.text.length);
			if (growth) {
				emitted.text = text;
				this.emit({ type: 'text_delta', delta: growth });
			}
		}
	}

	flush(answer: StructuredAnswer): void {
		if (!this.started) {
			this.started = true;
			this.emit({ type: 'start', requestId: this.requestId, scope: answer.scope });
		}
		for (const [index, block] of answer.blocks.entries()) {
			let emitted = this.blocks[index];
			if (!emitted) {
				emitted = { kind: block.kind, text: '', stopped: false };
				this.blocks.push(emitted);
				this.emit({ type: 'block_start', kind: block.kind });
			}
			// Text already sent can only be appended to, so a validated text that
			// is not an extension of it — validation strips a trailing citation
			// run, which shortens it — rides the completion as a replacement
			// rather than going undelivered.
			const appendsOnly = block.text.startsWith(emitted.text);
			if (appendsOnly) {
				const residual = block.text.slice(emitted.text.length);
				if (residual) {
					emitted.text = block.text;
					this.emit({ type: 'text_delta', delta: residual });
				}
			}
			const done: AnswerBlockDoneEvent = {
				type: 'block_done',
				// The validated kind, not the streamed one: normalization may have
				// moved this block off the kind its block_start announced.
				kind: block.kind,
				ruleIds: block.ruleIds,
				sourceIds: block.sourceIds
			};
			if (!appendsOnly) done.text = block.text;
			this.emit(done);
			emitted.text = block.text;
		}
	}
}
