/**
 * Request and answer schemas. The request schema is what clients may send —
 * deliberately nothing that selects a model, effort, prompt, or corpus. The
 * answer schema is the strict structured output the model must produce, and
 * `validateAnswer` is the gate that keeps invented rules and misplaced
 * citations from ever reaching a browser.
 */
import { z } from 'zod';
import {
	ANSWER_RULES,
	MAX_DRAFT_CHARS,
	MAX_LINK_ACTIONS,
	MAX_LINK_HEADERS,
	MAX_LINK_SUMMARIES,
	MAX_LINK_SUMMARY_CHARS,
	MAX_PROPOSALS,
	MAX_PROVIDER_ITEMS_CHARS,
	MAX_REFERENCES,
	MAX_TOOL_ARGUMENT_CHARS,
	MAX_TOOL_ROUNDS,
	REQUEST_RULES
} from './config';
import { ApiError } from './errors';

export const toolNames = ['read_scribe', 'propose_edits', 'manage_links', 'show_lyrics'] as const;
export type ToolName = (typeof toolNames)[number];

/** Anything `JSON.parse` yields and `JSON.stringify` accepts. What crosses this
 * service's two opaque seams — the provider's replay items and the tolerant
 * partial parse of a half-written answer — is this and nothing narrower until a
 * schema here has run over it. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** A JSON object, keyed however its writer keyed it. */
export type JsonObject = { [key: string]: Json };

export function isJsonObject(value: Json): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const anchorSchema = z
	.object({
		// Empty names the sole zero-width range in an empty 'scribe. The
		// browser resolver refuses that anchor once any document text exists.
		exact: z.string(),
		before: z.string(),
		after: z.string(),
		/** The 1-based line of the numbered draft `exact` begins on. Nullable
		 * rather than absent: a strict provider schema requires every property,
		 * and null is the model saying it could not name one. */
		line: z.number().int().min(1).nullable()
	})
	.strict();

export const proposalSchema = z
	.object({
		id: z.string().min(1),
		anchor: anchorSchema,
		replacement: z.string(),
		note: z.string(),
		// The default accepts a live call created just before this field shipped;
		// the strict provider tool below requires every new call to choose.
		applyTo: z.enum(['linked_sections', 'this_section_only']).default('linked_sections')
	})
	.strict();

export const readScribeArgumentsSchema = z.object({}).strict();
export const proposeEditsArgumentsSchema = z
	.object({ proposals: z.array(proposalSchema).min(1).max(MAX_PROPOSALS) })
	.strict();

/** A proposal without a replacement: a place in the 'scribe worth pointing at. */
export const referenceSchema = z
	.object({
		// An empty exact is refused outright rather than left to the resolver: it
		// only ever names an empty 'scribe, and there is nothing there to show.
		id: z.string().min(1),
		anchor: anchorSchema.refine((anchor) => anchor.exact.length > 0, {
			message: 'A reference must quote some exact text.'
		}),
		note: z.string()
	})
	.strict();

export const showLyricsArgumentsSchema = z
	.object({ references: z.array(referenceSchema).min(1).max(MAX_REFERENCES) })
	.strict();

const linkHeaderSchema = z
	.object({
		text: z.string(),
		occurrence: z.number().int().min(1)
	})
	.strict();

const linkActionSchema = z
	.object({
		id: z.string().min(1),
		action: z.enum(['link', 'unlink']),
		headers: z.array(linkHeaderSchema).min(1).max(MAX_LINK_HEADERS),
		note: z.string()
	})
	.strict()
	.superRefine((value, context) => {
		if (value.action === 'link' && value.headers.length < 2) {
			context.addIssue({
				code: 'custom',
				path: ['headers'],
				message: 'A link action needs at least two headers.'
			});
		}
		if (value.action === 'unlink' && value.headers.length !== 1) {
			context.addIssue({
				code: 'custom',
				path: ['headers'],
				message: 'An unlink action needs exactly one header.'
			});
		}
	});

export const manageLinksArgumentsSchema = z
	.object({ actions: z.array(linkActionSchema).min(1).max(MAX_LINK_ACTIONS) })
	.strict()
	.superRefine((value, context) => {
		const ids = new Set<string>();
		for (const [index, action] of value.actions.entries()) {
			if (ids.has(action.id)) {
				context.addIssue({
					code: 'custom',
					path: ['actions', index, 'id'],
					message: 'Link action ids must be unique within a call.'
				});
			}
			ids.add(action.id);
		}
	});

export const wireToolCallSchema = z
	.object({
		callId: z.string().min(1),
		name: z.enum(toolNames),
		arguments: z.string().max(MAX_TOOL_ARGUMENT_CHARS)
	})
	.strict();

const toolOutcomeSchema = z
	.object({
		id: z.string().min(1),
		status: z.enum(['applied', 'rejected', 'failed']),
		reason: z.string().optional()
	})
	.strict();

export const wireToolResultSchema = z.discriminatedUnion('name', [
	z
		.object({
			callId: z.string().min(1),
			name: z.literal('read_scribe'),
			result: z.union([
				z
					.object({
						status: z.literal('granted'),
						draftText: z.string().max(MAX_DRAFT_CHARS),
						sectionLinks: z
							.array(z.string().max(MAX_LINK_SUMMARY_CHARS))
							.max(MAX_LINK_SUMMARIES)
							.optional()
					})
					.strict(),
				z.object({ status: z.literal('denied') }).strict()
			])
		})
		.strict(),
	z
		.object({
			callId: z.string().min(1),
			name: z.literal('propose_edits'),
			result: z.object({ outcomes: z.array(toolOutcomeSchema).max(MAX_PROPOSALS) }).strict()
		})
		.strict(),
	z
		.object({
			callId: z.string().min(1),
			name: z.literal('manage_links'),
			result: z.object({ outcomes: z.array(toolOutcomeSchema).max(MAX_LINK_ACTIONS) }).strict()
		})
		.strict(),
	z
		.object({
			callId: z.string().min(1),
			name: z.literal('show_lyrics'),
			// 'shown' rather than 'applied': a reference changes nothing, so the
			// approve/reject vocabulary of the other tools would be a claim about a
			// decision nobody was asked to make.
			result: z
				.object({
					outcomes: z
						.array(
							z
								.object({
									id: z.string().min(1),
									status: z.enum(['shown', 'failed']),
									reason: z.string().optional()
								})
								.strict()
						)
						.max(MAX_REFERENCES)
				})
				.strict()
		})
		.strict()
]);

/** The two part types an assistant message can be replayed with. */
const providerMessageContentSchema = z.discriminatedUnion('type', [
	z
		.object({
			type: z.literal('output_text'),
			text: z.string(),
			// This worker enables only function tools, so its intermediate output
			// cannot carry file or web annotations. Keeping the field exact makes
			// the replay value assignable to the provider SDK without a cast.
			annotations: z.array(z.never()).max(0)
		})
		.strict(),
	z.object({ type: z.literal('refusal'), refusal: z.string() }).strict()
]);

const providerStatusSchema = z.enum(['in_progress', 'completed', 'incomplete']);

const providerReasoningSummarySchema = z
	.object({ type: z.literal('summary_text'), text: z.string() })
	.strict();

const providerReasoningContentSchema = z
	.object({ type: z.literal('reasoning_text'), text: z.string() })
	.strict();

/**
 * A replay item is handed straight back to the provider as input, so what a
 * client may send is exactly what `replayableItem` in provider.ts writes: these
 * three types, these fields, and nothing else. Under a passthrough a client
 * could put a developer- or system-role message into the model's own input.
 *
 * A field is required here exactly where the provider SDK declares it required
 * on the item type — that mirroring is what lets a parsed replay item assign to
 * `ResponseInputItem` without a cast, and it means a provider response missing
 * one fails validation as `invalid_answer` at serialization time rather than as
 * an opaque 400 when the continuation is replayed.
 */
const providerItemSchema = z.discriminatedUnion('type', [
	z
		.object({
			type: z.literal('function_call'),
			id: z.string().optional(),
			status: providerStatusSchema.optional(),
			arguments: z.string().max(MAX_TOOL_ARGUMENT_CHARS),
			call_id: z.string().min(1),
			name: z.enum(toolNames)
		})
		.strict(),
	z
		.object({
			type: z.literal('reasoning'),
			id: z.string(),
			status: providerStatusSchema.optional(),
			summary: z.array(providerReasoningSummarySchema),
			content: z.array(providerReasoningContentSchema).optional(),
			// The worker only ever asks for encrypted reasoning, so an item
			// without it is not one it produced.
			encrypted_content: z.string()
		})
		.strict(),
	z
		.object({
			type: z.literal('message'),
			id: z.string(),
			status: providerStatusSchema,
			// Never 'developer' or 'system': the item is replayed into the model's
			// input, so any other role is a prompt the client wrote.
			role: z.literal('assistant'),
			content: z.array(providerMessageContentSchema)
		})
		.strict()
]);

export const providerItemsSchema = z
	.string()
	.max(MAX_PROVIDER_ITEMS_CHARS)
	.superRefine((value, context) => {
		let decoded: unknown;
		try {
			decoded = JSON.parse(value);
		} catch {
			context.addIssue({ code: 'custom', message: 'providerItems must be JSON.' });
			return;
		}
		const parsed = z.array(providerItemSchema).safeParse(decoded);
		if (!parsed.success) {
			context.addIssue({ code: 'custom', message: 'providerItems has an invalid shape.' });
		}
	});

const decodedProviderItemsSchema = z.array(providerItemSchema);

export function decodeProviderItems(value: string): z.infer<typeof decodedProviderItemsSchema> {
	return decodedProviderItemsSchema.parse(JSON.parse(value));
}

const wireToolCallMessageSchema = z
	.object({
		role: z.literal('assistant'),
		toolCalls: z.array(wireToolCallSchema).min(1),
		providerItems: providerItemsSchema
	})
	.strict()
	.superRefine((value, context) => {
		// The items are replayed verbatim, so every function call in them must be
		// one this message declares: an unmatched call is a tool round the browser
		// never ran, carrying whatever arguments the client chose.
		let items: Json;
		try {
			items = JSON.parse(value.providerItems);
		} catch {
			return;
		}
		if (!Array.isArray(items)) return;
		const declared = new Set(value.toolCalls.map((call) => `${call.name}\0${call.callId}`));
		for (const item of items) {
			if (!isJsonObject(item)) continue;
			const name = item['name'];
			const callId = item['call_id'];
			if (item['type'] !== 'function_call' || name === undefined || callId === undefined) continue;
			if (!declared.has(`${String(name)}\0${String(callId)}`)) {
				context.addIssue({
					code: 'custom',
					path: ['providerItems'],
					message: 'A replayed function call must match a declared tool call.'
				});
				return;
			}
		}
	});

export const wireMessageV2Schema = z.union([
	z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1) }).strict(),
	wireToolCallMessageSchema,
	z.object({ role: z.literal('tool'), results: z.array(wireToolResultSchema) }).strict()
]);

export type WireToolCall = z.infer<typeof wireToolCallSchema>;
export type WireToolResult = z.infer<typeof wireToolResultSchema>;
export type WireMessageV2 = z.infer<typeof wireMessageV2Schema>;

export const answerRequestSchema = z
	.object({
		chatId: z.string().min(1).max(64),
		messages: z.array(wireMessageV2Schema).min(1).max(REQUEST_RULES.maxSuppliedMessages),
		turnstileToken: z.string().min(1).max(4096).optional(),
		clientRuleSetVersion: z.string().min(1).max(64),
		toolsAvailable: z.boolean().optional(),
		supportsRetry: z.boolean().optional()
	})
	.strict();

export type AnswerRequest = z.infer<typeof answerRequestSchema>;

function isSettledMessage(
	message: WireMessageV2
): message is Extract<WireMessageV2, { content: string }> {
	return 'content' in message;
}

function callIdSetMatches(calls: WireToolCall[], results: WireToolResult[]): boolean {
	const callIds = new Set(calls.map((call) => call.callId));
	const resultIds = new Set(results.map((result) => result.callId));
	return (
		callIds.size === calls.length &&
		resultIds.size === results.length &&
		callIds.size === resultIds.size &&
		[...callIds].every((callId) => resultIds.has(callId))
	);
}

export function toolRoundCount(messages: WireMessageV2[]): number {
	return messages.filter((message) => message.role === 'tool').length;
}

/** Beyond-shape request rules: settled alternation and the bounded live suffix. */
export function validateConversation(request: AnswerRequest): string {
	const { messages } = request;
	const last = messages[messages.length - 1];
	if (!last || (last.role !== 'user' && last.role !== 'tool')) {
		throw new ApiError('invalid_request', 'The final message must be from the user or a tool.');
	}
	let finalUserIndex = -1;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i]!.role === 'user') {
			finalUserIndex = i;
			break;
		}
	}
	if (finalUserIndex < 0) {
		throw new ApiError('invalid_request', 'A conversation must contain a user question.');
	}
	for (let i = 0; i <= finalUserIndex; i++) {
		const message = messages[i]!;
		const expectedRole = i % 2 === 0 ? 'user' : 'assistant';
		if (!isSettledMessage(message) || message.role !== expectedRole) {
			throw new ApiError('invalid_request', 'Settled message roles must alternate.');
		}
	}
	const suffix = messages.slice(finalUserIndex + 1);
	if (suffix.length > 0 && !request.toolsAvailable) {
		throw new ApiError('invalid_request', 'Draft tools were not offered for this conversation.');
	}
	if (suffix.length % 2 !== 0) {
		throw new ApiError('invalid_request', 'A live tool turn must end with tool results.');
	}
	const rounds = suffix.length / 2;
	if (rounds > MAX_TOOL_ROUNDS) {
		throw new ApiError(
			'invalid_request',
			`A turn may use draft tools at most ${MAX_TOOL_ROUNDS} times.`
		);
	}
	for (let offset = 0; offset < suffix.length; offset += 2) {
		const assistant = suffix[offset]!;
		const tool = suffix[offset + 1]!;
		if (assistant.role !== 'assistant' || !('toolCalls' in assistant) || tool.role !== 'tool') {
			throw new ApiError(
				'invalid_request',
				'The live suffix must alternate tool calls and results.'
			);
		}
		if (!callIdSetMatches(assistant.toolCalls, tool.results)) {
			throw new ApiError(
				'invalid_request',
				'Tool results must match the preceding call ids exactly.'
			);
		}
		const namesByCallId = new Map(assistant.toolCalls.map((call) => [call.callId, call.name]));
		if (tool.results.some((result) => namesByCallId.get(result.callId) !== result.name)) {
			throw new ApiError('invalid_request', 'Tool results must match the preceding call names.');
		}
	}
	const question = messages[finalUserIndex]!;
	if (!isSettledMessage(question) || question.role !== 'user') {
		throw new ApiError('invalid_request', 'A conversation must contain a user question.');
	}
	if ([...question.content].length > REQUEST_RULES.maxQuestionChars) {
		throw new ApiError('invalid_request', 'The question is too long.');
	}
	return question.content;
}

export const answerScopes = ['reviewed', 'mixed', 'general', 'not-covered', 'draft-work'] as const;
export type AnswerScope = (typeof answerScopes)[number];

const answerBlockSchema = z
	.object({
		/** 'general' blocks are broader language guidance and may cite nothing. */
		kind: z.enum(['prose', 'example', 'general']),
		text: z.string().min(1),
		/** Rule ids this block cites. Rendered as a superscript footnote number
		 * on the block, with the rule itself as a numbered card collected under
		 * the answer. */
		ruleIds: z.array(z.string()),
		/** Reviewed source ids this block leans on beyond its rules' own citations. */
		sourceIds: z.array(z.string())
	})
	.strict();

export const structuredAnswerSchema = z
	.object({
		scope: z.enum(answerScopes),
		blocks: z.array(answerBlockSchema).min(1)
	})
	.strict();

export type AnswerBlock = z.infer<typeof answerBlockSchema>;
export type StructuredAnswer = z.infer<typeof structuredAnswerSchema>;

/** JSON Schema handed to the Responses API as the strict output format. */
export const answerJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['scope', 'blocks'],
	properties: {
		scope: { type: 'string', enum: [...answerScopes] },
		blocks: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['kind', 'text', 'ruleIds', 'sourceIds'],
				properties: {
					kind: { type: 'string', enum: ['prose', 'example', 'general'] },
					text: { type: 'string' },
					ruleIds: { type: 'array', items: { type: 'string' } },
					sourceIds: { type: 'array', items: { type: 'string' } }
				}
			}
		}
	}
} as const;

/**
 * Reject any structured answer the frontend could not render truthfully.
 * Failures are `invalid_answer` (502): the model produced it, not the client.
 */
export function validateAnswer(
	raw: Json,
	knownRuleIds: ReadonlySet<string>,
	knownSourceIds: ReadonlySet<string>,
	toolsAvailable = false
): StructuredAnswer {
	const parsed = structuredAnswerSchema.safeParse(raw);
	if (!parsed.success) {
		throw new ApiError('invalid_answer', 'The assistant returned a malformed answer.');
	}
	let answer = parsed.data;

	// The interface draws the footnote number after each cited block, and the
	// model — prompted about that presentation — sometimes types the superscript
	// or rule id itself, so the block rendered "…sjekker.¹ ¹" or drew the same
	// citation as both "[syntax.unsupported-voice-markup]" and a chip. A trailing
	// citation run is that mistake, never content; strip it rather than retract
	// the answer.
	//
	// One superscript per outer iteration, never `[…]+` inside `(?:…)+`: nested
	// quantifiers over the same character give the engine an exponential number
	// of ways to split a run, so a long run followed by a non-matching character
	// never terminated. The outer `+` still consumes the whole run.
	const trailingCitations =
		/(?:\s*(?:[⁰¹²³⁴-⁹]|\[[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*\]))+\s*$/;
	answer = {
		...answer,
		blocks: answer.blocks.map((block) =>
			trailingCitations.test(block.text)
				? { ...block, text: block.text.replace(trailingCitations, '') }
				: block
		)
	};

	// Scope and block-kind labels are DERIVED here, not trusted. The model
	// gets the citations right and the labels wrong often enough (roughly one
	// answer in three, at every reasoning effort tried) that validating labels
	// meant streaming an answer and then retracting it over presentation
	// bookkeeping. Citations are the ground truth: a cited block is substance
	// ('prose'), an uncited block ahead of any support is broader guidance
	// ('general'), and the scope is whatever the normalized blocks add up to.
	// The invariant checks below still run — after this, as a backstop — and
	// the real gates (unknown or duplicate rule ids, the rule ceiling,
	// draft-work without tools) are untouched.
	if (answer.scope !== 'draft-work') {
		let supportSeen = false;
		const blocks = answer.blocks.map((block) => {
			const cited = block.ruleIds.length > 0 || block.sourceIds.length > 0;
			if (cited) supportSeen = true;
			if (cited && block.kind === 'general') return { ...block, kind: 'prose' as const };
			if (!cited && block.kind === 'prose' && !supportSeen) {
				// A lead-in before any citation is general guidance; an uncited
				// block after support is a continuation and keeps its kind.
				return { ...block, kind: 'general' as const };
			}
			if (!cited && answer.scope === 'general') return { ...block, kind: 'general' as const };
			return block;
		});
		const hasSupport = blocks.some(
			(block) => block.ruleIds.length > 0 || block.sourceIds.length > 0
		);
		const hasGeneral = blocks.some((block) => block.kind === 'general');
		const scope = hasSupport
			? hasGeneral
				? ('mixed' as const)
				: ('reviewed' as const)
			: answer.scope === 'not-covered'
				? ('not-covered' as const)
				: ('general' as const);
		answer = {
			scope,
			blocks:
				scope === 'general'
					? blocks.map((block) => ({ ...block, kind: 'general' as const }))
					: blocks
		};
	} else {
		// Draft work keeps its shape; only a cited 'general' label is repaired,
		// because that combination is contradictory in any scope.
		answer = {
			...answer,
			blocks: answer.blocks.map((block) =>
				block.kind === 'general' && (block.ruleIds.length > 0 || block.sourceIds.length > 0)
					? { ...block, kind: 'prose' as const }
					: block
			)
		};
	}

	const citedRules = new Set<string>();
	answer = {
		...answer,
		blocks: answer.blocks.map((block) => {
			if (block.kind === 'general' && (block.ruleIds.length > 0 || block.sourceIds.length > 0)) {
				throw new ApiError('invalid_answer', 'General guidance may not carry citations.');
			}
			// A repeat of an already-attached rule is the model continuing its
			// explanation, not new support — the canonical attachment renders
			// once, and an uncited continuation is a shape the ordering rule
			// already blesses. The first attachment wins; unknown ids and the
			// rule ceiling stay fatal because those guard substance.
			const ruleIds = block.ruleIds.filter((ruleId) => {
				if (!knownRuleIds.has(ruleId)) {
					throw new ApiError('invalid_answer', `Unknown rule id: ${ruleId}`);
				}
				if (citedRules.has(ruleId)) return false;
				citedRules.add(ruleId);
				return true;
			});
			for (const sourceId of block.sourceIds) {
				if (!knownSourceIds.has(sourceId)) {
					throw new ApiError('invalid_answer', `Unknown source id: ${sourceId}`);
				}
			}
			return ruleIds.length === block.ruleIds.length ? block : { ...block, ruleIds };
		})
	};
	if (citedRules.size > ANSWER_RULES.maxRuleReferences) {
		throw new ApiError('invalid_answer', 'Too many rule references in one answer.');
	}

	const citesSources = answer.blocks.some((block) => block.sourceIds.length > 0);
	const hasGeneralBlock = answer.blocks.some((block) => block.kind === 'general');
	const hasReviewedSupport = citedRules.size > 0 || citesSources;
	let reviewedSupportSeen = false;
	const reviewedBlockBeforeSupport = answer.blocks.some((block) => {
		if (block.kind === 'general') return false;
		if (block.ruleIds.length > 0 || block.sourceIds.length > 0) {
			reviewedSupportSeen = true;
			return false;
		}
		// An uncited example is an illustration, not a reviewed claim — the
		// prose beside it carries the citation. Binding it to the ordering rule
		// retracted whole streamed answers that led with a short example before
		// their cited explanation, which is an ordinary answer shape.
		if (block.kind === 'example') return false;
		// Once a block has attached the canonical reference, later blocks may
		// continue that same explanation without attaching the rule twice.
		return !reviewedSupportSeen;
	});
	if (answer.scope === 'draft-work' && !toolsAvailable) {
		throw new ApiError('invalid_answer', 'Draft work requires draft tools to have been offered.');
	}
	switch (answer.scope) {
		case 'reviewed':
			if (!hasReviewedSupport) {
				throw new ApiError('invalid_answer', 'A reviewed answer must cite reviewed material.');
			}
			if (hasGeneralBlock) {
				throw new ApiError('invalid_answer', 'A reviewed answer may not contain general guidance.');
			}
			if (reviewedBlockBeforeSupport) {
				throw new ApiError(
					'invalid_answer',
					'A reviewed continuation must follow cited reviewed material.'
				);
			}
			break;
		case 'mixed':
			if (!hasReviewedSupport || !hasGeneralBlock) {
				throw new ApiError(
					'invalid_answer',
					'A mixed answer needs both reviewed citations and general guidance.'
				);
			}
			if (reviewedBlockBeforeSupport) {
				throw new ApiError(
					'invalid_answer',
					'A reviewed continuation must follow cited reviewed material.'
				);
			}
			break;
		case 'general':
			if (answer.blocks.some((block) => block.kind !== 'general')) {
				throw new ApiError('invalid_answer', 'A general answer must label every block as general.');
			}
			if (hasReviewedSupport) {
				throw new ApiError('invalid_answer', 'This scope may not carry reviewed citations.');
			}
			break;
		case 'not-covered':
			if (hasReviewedSupport) {
				throw new ApiError('invalid_answer', 'This scope may not carry reviewed citations.');
			}
			break;
		case 'draft-work':
			// Draft work may be uncited prose. Any citations it does carry have
			// already passed the same identity and cardinality gate as other scopes.
			break;
	}
	return answer;
}
