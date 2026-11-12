import { expect, it } from 'vitest';
import { EditorState, type Transaction } from '@codemirror/state';
import { history, redo, undo } from '@codemirror/commands';
import { importDocument, renderProfile, type EngineResult } from '#lib/conversion/index.js';
import { createConversionEnvelope, parseConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
import { conversionForState, conversionState } from './extensions/conversion-state.js';
import { editorContextField } from './extensions/editor-state.js';

function value<T>(result: EngineResult<T>): T {
	if (!result.ok) throw new Error(result.refusal.message);
	return result.value;
}

it('commits a context deletion without recovery and restores exact spelling through history and reload', () => {
	const model = value(importDocument({ text: '[Verse]\n月?', profile: 'genius', language: 'ja' }));
	const projection = value(renderProfile(model, 'musixmatch'));
	const envelope = createConversionEnvelope(model, 'musixmatch', profilePolicyVersions);
	let state = EditorState.create({
		doc: projection.text,
		extensions: [
			history(),
			editorContextField.init(() => ({ language: 'ja', performers: [], ruleSetVersion: 'test' })),
			conversionState(envelope)
		]
	});
	state = state.update({ changes: { from: 0, to: 1, insert: '' } }).state;
	const edited = conversionForState(state)!;
	expect(state.doc.toString()).toBe('？');
	expect(edited.recovery).toBeUndefined();
	expect(edited.envelope.projectionText).toBe('？');
	const dispatch = (transaction: Transaction) => {
		state = transaction.state;
	};
	expect(undo({ state, dispatch })).toBe(true);
	expect(state.doc.toString()).toBe('月？');
	expect(conversionForState(state)?.recovery).toBeUndefined();
	expect(value(renderProfile(conversionForState(state)!.envelope.model, 'genius')).text).toBe(
		'[Verse]\n月?'
	);
	expect(redo({ state, dispatch })).toBe(true);
	expect(state.doc.toString()).toBe('？');
	expect(conversionForState(state)?.envelope).toEqual(edited.envelope);
	const restored = parseConversionEnvelope(JSON.parse(JSON.stringify(edited.envelope)), '？');
	const reloaded = EditorState.create({ doc: '？', extensions: [conversionState(restored)] });
	expect(conversionForState(reloaded)?.recovery).toBeUndefined();
	expect(value(renderProfile(restored.model, 'genius')).text).toBe('[Verse]\n?');
});
