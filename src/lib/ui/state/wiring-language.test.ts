import { expect, test } from 'vitest';
import {
	importDocument,
	renderProfile,
	resolveDecision,
	type EngineResult,
	type ConversionDocument
} from '#lib/conversion/index.js';
import { parseDocument } from '#lib/core/parser.js';
import type { EditorSnapshot } from '#lib/core/types.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
import { runRules } from '#lib/rules/engine.js';
import { buildRuleContext, projectionPolicyContext } from './wiring.js';

function value<T>(result: EngineResult<T>): T {
	if (!result.ok) throw new Error(result.refusal.message);
	return result.value;
}
function snapshot(model: ConversionDocument, profile: 'genius' | 'musixmatch'): EditorSnapshot {
	const conversion = createConversionEnvelope(model, profile, profilePolicyVersions);
	return {
		conversion,
		text: conversion.projectionText,
		parsed: parseDocument(conversion.projectionText),
		revision: 1,
		selection: { anchor: 0, head: 0 },
		diagnostics: [],
		composing: false,
		canUndo: false,
		canRedo: false
	};
}
function check(current: EditorSnapshot) {
	const policy = projectionPolicyContext(current);
	const context = buildRuleContext(
		current.conversion?.model.defaultLanguage ?? 'en',
		[],
		'test',
		current.revision,
		current.conversion?.profile,
		'unknown',
		policy.languageRanges
	);
	expect(() => runRules(current.parsed, context)).not.toThrow();
	return policy.languageRanges;
}
test('keeps hidden language ownership out of the visible checking scope', () => {
	const source = value(
		importDocument({ text: '[Verse]\nMoon Star Sun', profile: 'genius', language: 'en' })
	);
	const tagged = value(
		resolveDecision(source, value(renderProfile(source, 'musixmatch')), {
			kind: 'setPassageLanguage',
			range: { from: 0, to: 13 },
			language: 'de'
		})
	);
	const hidden = value(
		resolveDecision(tagged.document, tagged.projection, {
			kind: 'setForm',
			range: { from: 5, to: 9 },
			profile: 'genius',
			text: ''
		})
	);
	const projection = value(renderProfile(hidden.document, 'genius'));
	const french = value(
		resolveDecision(hidden.document, projection, {
			kind: 'setPassageLanguage',
			range: { from: 0, to: projection.text.length },
			language: 'fr'
		})
	);
	expect(check(snapshot(french.document, 'genius'))).toEqual([{ from: 8, to: 17, language: 'fr' }]);
	expect(check(snapshot(french.document, 'musixmatch'))).toEqual([
		{ from: 0, to: 5, language: 'fr' },
		{ from: 5, to: 9, language: 'de' },
		{ from: 9, to: 13, language: 'fr' }
	]);
	expect(french.document.languageRanges.find((range) => range.language === 'de')).toMatchObject({
		from: 5,
		to: 9
	});
});
test.each([
	{ from: 3, to: 5, language: 'fr', expected: [{ from: 3, to: 7, language: 'und' }] },
	{ from: 4, to: 6, language: 'fr', expected: [{ from: 3, to: 7, language: 'und' }] },
	{ from: 3, to: 7, language: 'fr', expected: [{ from: 3, to: 7, language: 'fr' }] },
	{ from: 3, to: 5, language: 'en', expected: [] }
])(
	'checks transformed wording with $language source ownership ($from, $to)',
	({ from, to, language, expected }) => {
		const source = value(
			importDocument({ text: 'Un beau jour', profile: 'genius', language: 'en' })
		);
		const tagged = value(
			resolveDecision(source, value(renderProfile(source, 'genius')), {
				kind: 'setPassageLanguage',
				range: { from, to },
				language
			})
		);
		const formed = value(
			resolveDecision(tagged.document, tagged.projection, {
				kind: 'setForm',
				range: { from: 3, to: 7 },
				profile: 'musixmatch',
				text: 'joli'
			})
		);
		expect(check(snapshot(formed.document, 'musixmatch'))).toEqual(expected);
	}
);
