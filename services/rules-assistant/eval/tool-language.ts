/** Opt-in live regression: uses the production provider and fictional lyrics only. */
import { type AnswerProvider, type ProviderToolCall } from '../src/provider';
import { structuredAnswerSchema, type AnswerRequest, type WireToolResult } from '../src/schema';
import { answersInNorwegian, toolNotesInNorwegian } from './assertions.mjs';

export function toolNotes(call: ProviderToolCall): string[] {
	switch (call.name) {
		case 'read_scribe':
			return [];
		case 'show_lyrics':
			return call.input.references.map((reference) => reference.note);
		case 'propose_edits':
			return call.input.proposals.map((proposal) => proposal.note);
		case 'manage_links':
			return call.input.actions.map((action) => action.note);
	}
}

export async function evaluateToolLanguage(
	provider: AnswerProvider,
	question = 'Korrekturles',
	log: (message: string) => void = console.log
): Promise<void> {
	const messages: AnswerRequest['messages'] = [{ role: 'user', content: question }];
	const draftText =
		'[Vers]\nMen, kommer du hjem i natt?\nJeg hører skymåneklangen din\nLyden sier "er du her igjen?"\n\n[Refreng]\nDu så hva jeg skrev\nJeg  venter ved døra\n\n[Refreng]\nDu så hva jeg skrev\nJeg  venter ved døra';
	const notes: string[] = [];
	const failures: string[] = [];
	let finished = false;
	// Four tool rounds plus a final answer. This is deliberately bounded and opt-in.
	for (let round = 0; round < 5; round += 1) {
		const result = await provider(
			messages,
			'eval-norwegian-tool-notes',
			AbortSignal.timeout(120_000),
			round < 4
		);
		if (result.kind === 'answer') {
			const raw = structuredAnswerSchema.parse(result.raw);
			log(`Final answer: ${raw.blocks.map((block) => block.text).join('\n')}`);
			if (!answersInNorwegian(raw.blocks.map((block) => block.text).join('\n')).ok)
				failures.push('final answer');
			finished = true;
			break;
		}
		messages.push({
			role: 'assistant',
			toolCalls: result.calls.map((call) => ({
				callId: call.callId,
				name: call.name,
				arguments: JSON.stringify(call.input)
			})),
			providerItems: result.providerItems
		});
		const results: WireToolResult[] = [];
		for (const call of result.calls) {
			for (const [index, note] of toolNotes(call).entries()) {
				log(`${call.name}[${index}]: ${note}`);
				notes.push(note);
			}
			if (call.name === 'read_scribe') {
				results.push({
					callId: call.callId,
					name: call.name,
					result: { status: 'granted', draftText, sectionLinks: [] }
				});
			} else if (call.name === 'show_lyrics') {
				results.push({
					callId: call.callId,
					name: call.name,
					result: { outcomes: call.input.references.map(({ id }) => ({ id, status: 'shown' })) }
				});
			} else {
				const items = call.name === 'propose_edits' ? call.input.proposals : call.input.actions;
				results.push({
					callId: call.callId,
					name: call.name,
					result: { outcomes: items.map(({ id }) => ({ id, status: 'rejected' })) }
				});
			}
		}
		messages.push({ role: 'tool', results });
	}
	const annotationLanguage = toolNotesInNorwegian(notes);
	if (!annotationLanguage.ok) {
		failures.push(
			`annotation language (notes=${notes.length}, Norwegian markers=${annotationLanguage.norwegianHits}, German note indexes=${annotationLanguage.germanNoteIndexes.join(',')})`
		);
	}
	if (!finished) failures.push('no final answer within five requests');
	if (failures.length) throw new Error(`Tool language regression: ${failures.join(', ')}`);
	log('Norwegian tool notes and final answer passed.');
}
