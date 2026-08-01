/**
 * Request and answer schemas. The request schema is what clients may send —
 * deliberately nothing that selects a model, effort, prompt, or corpus. The
 * answer schema is the strict structured output the model must produce, and
 * `validateAnswer` is the gate that keeps invented rules and misplaced
 * citations from ever reaching a browser.
 */
import { z } from 'zod';
import { ANSWER_RULES, REQUEST_RULES } from './config';
import { ApiError } from './errors';

export const answerRequestSchema = z
	.object({
		chatId: z.string().min(1).max(64),
		messages: z
			.array(
				z
					.object({
						role: z.enum(['user', 'assistant']),
						content: z.string().min(1)
					})
					.strict()
			)
			.min(1)
			.max(REQUEST_RULES.maxSuppliedMessages),
		turnstileToken: z.string().min(1).max(4096).optional(),
		clientRuleSetVersion: z.string().min(1).max(64)
	})
	.strict();

export type AnswerRequest = z.infer<typeof answerRequestSchema>;

/** Beyond-shape request rules: alternation, final role, question length. */
export function validateConversation(request: AnswerRequest): string {
	const { messages } = request;
	const last = messages[messages.length - 1];
	if (!last || last.role !== 'user') {
		throw new ApiError('invalid_request', 'The final message must be from the user.');
	}
	for (let i = 1; i < messages.length; i++) {
		if (messages[i]!.role === messages[i - 1]!.role) {
			throw new ApiError('invalid_request', 'Message roles must alternate.');
		}
	}
	const question = last.content;
	if ([...question].length > REQUEST_RULES.maxQuestionChars) {
		throw new ApiError('invalid_request', 'The question is too long.');
	}
	return question;
}

export const answerScopes = ['reviewed', 'mixed', 'general', 'not-covered'] as const;
export type AnswerScope = (typeof answerScopes)[number];

const answerBlockSchema = z
	.object({
		/** 'general' blocks are broader language guidance and may cite nothing. */
		kind: z.enum(['prose', 'example', 'general']),
		text: z.string().min(1),
		/** Rule ids whose compact canonical attachment renders after this block. */
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
	raw: unknown,
	knownRuleIds: ReadonlySet<string>,
	knownSourceIds: ReadonlySet<string>
): StructuredAnswer {
	const parsed = structuredAnswerSchema.safeParse(raw);
	if (!parsed.success) {
		throw new ApiError('invalid_answer', 'The assistant returned a malformed answer.');
	}
	const answer = parsed.data;

	const citedRules = new Set<string>();
	for (const block of answer.blocks) {
		if (block.kind === 'general' && block.ruleIds.length > 0) {
			throw new ApiError('invalid_answer', 'General guidance may not carry rule citations.');
		}
		for (const ruleId of block.ruleIds) {
			if (!knownRuleIds.has(ruleId)) {
				throw new ApiError('invalid_answer', `Unknown rule id: ${ruleId}`);
			}
			if (citedRules.has(ruleId)) {
				throw new ApiError('invalid_answer', `Rule cited more than once: ${ruleId}`);
			}
			citedRules.add(ruleId);
		}
		for (const sourceId of block.sourceIds) {
			if (!knownSourceIds.has(sourceId)) {
				throw new ApiError('invalid_answer', `Unknown source id: ${sourceId}`);
			}
		}
	}
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
		// Once a block has attached the canonical reference, later blocks may
		// continue that same explanation without attaching the rule twice.
		return !reviewedSupportSeen;
	});
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
	}
	return answer;
}
