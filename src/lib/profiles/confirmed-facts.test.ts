import { describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import {
	importDocument,
	parseProjection,
	reconcileEdit,
	renderProfile,
	resolveDecision,
	type ConversionDocument,
	type EngineResult,
	type Projection
} from '$lib/conversion/index.js';
import { runRules } from '$lib/rules/engine.js';
import { profileSourceRegistry } from './sources.js';
import { projectConfirmedFacts } from './confirmed-facts.js';

function value<T>(result: EngineResult<T>): T {
	if (!result.ok) throw new Error(result.refusal.message);
	return result.value;
}
function imported(text: string) {
	return value(importDocument({ text, profile: 'genius', language: 'en' }));
}
function view(document: ConversionDocument) {
	return value(renderProfile(document, 'musixmatch'));
}
function context(document: ConversionDocument, projection: Projection) {
	return {
		profile: projection.profile,
		language: document.defaultLanguage,
		performers: [],
		sources: profileSourceRegistry,
		ruleSetVersion: 'test',
		revision: 0,
		confirmedFacts: projectConfirmedFacts(document, projection)
	};
}
function findings(document: ConversionDocument) {
	const projection = view(document);
	return runRules(parseProjection(document, projection), context(document, projection));
}
function confirmQuantity(document: ConversionDocument, from = 0) {
	return value(
		resolveDecision(document, view(document), {
			kind: 'confirmQuantity',
			range: { from, to: from + 2 },
			facts: {
				profile: 'musixmatch',
				language: 'en',
				value: '12',
				usage: 'ordinary-cardinal',
				pronunciation: 'whole-quantity'
			}
		})
	);
}
function interval() {
	let document = imported('[Verse]\nOne\n\n[Chorus]\nTwo.');
	for (const [index, type] of ['Verse', 'Chorus'].entries()) {
		if (type !== 'Verse' && type !== 'Chorus') throw new Error('Unexpected section type');
		document = value(
			resolveDecision(document, view(document), {
				kind: 'setSectionType',
				sectionId: document.sections[index]!.id,
				type
			})
		).document;
	}
	return value(
		resolveDecision(document, view(document), {
			kind: 'confirmInstrumentalInterval',
			facts: {
				language: 'en',
				recordingId: 'recording:1',
				currentRecordingId: 'recording:1',
				startMs: 1000,
				endMs: 20001,
				recordingDurationMs: 40000,
				lyricalContent: 'none-confirmed',
				placement: 'between-tagged-sections',
				beforeSectionId: document.sections[0]!.id,
				afterSectionId: document.sections[1]!.id
			}
		})
	);
}

describe('confirmed semantic review scopes', () => {
	it('settles exactly one confirmed quantity while preserving repeated numbers and punctuation checks', () => {
		const result = confirmQuantity(imported('12 stars and 12 moons.'));
		const diagnostics = findings(result.document);
		expect(
			diagnostics
				.filter((finding) => finding.ruleId === 'mxm.numbers.context')
				.map((finding) => finding.from)
		).toEqual([13]);
		expect(diagnostics.some((finding) => finding.ruleId === 'mxm.punctuation.line-ending')).toBe(
			true
		);
		expect(
			projectConfirmedFacts(result.document, value(renderProfile(result.document, 'genius')))
		).toEqual([]);
	});
	it('keeps an unrelated edit confirmed and restores numeric review after the quantity is edited', () => {
		const result = confirmQuantity(imported('12 stars'));
		const unrelated = value(
			reconcileEdit(result.document, result.projection, {
				changes: [{ from: 3, to: 8, insert: 'moons' }]
			})
		);
		expect(
			findings(unrelated.document).filter((finding) => finding.ruleId === 'mxm.numbers.context')
		).toEqual([]);
		const edited = value(
			reconcileEdit(unrelated.document, unrelated.projection, {
				changes: [{ from: 0, to: 2, insert: '13' }]
			})
		);
		expect(
			findings(edited.document).filter((finding) => finding.ruleId === 'mxm.numbers.context')
		).toHaveLength(1);
	});
	it('requires reconfirmation after default or passage language changes and rejects stale ownership', () => {
		const result = confirmQuantity(imported('12 stars'));
		const changed = value(
			resolveDecision(result.document, result.projection, {
				kind: 'setLanguage',
				language: 'fr'
			})
		);
		expect(
			findings(changed.document).filter((finding) => finding.ruleId === 'mxm.numbers.context')
		).toHaveLength(1);
		const scoped = {
			...result.document,
			languageRanges: [
				{ id: `language:${result.document.nextId}`, from: 0, to: 2, language: 'fr' }
			],
			nextId: result.document.nextId + 1
		};
		expect(projectConfirmedFacts(scoped, view(scoped))).toEqual([]);
		const stale = {
			...result.document,
			owners: result.document.owners.map((owner) => ({ ...owner, revision: owner.revision + 1 }))
		};
		expect(projectConfirmedFacts(stale, result.projection)).toEqual([]);
	});
	it('settles the eligible generated marker, preserving spelling and layout checks', () => {
		const result = interval();
		expect(
			findings(result.document).filter((finding) => finding.ruleId === 'mxm.structure.instrumental')
		).toEqual([]);
		expect(
			findings(result.document).some((finding) => finding.ruleId === 'mxm.punctuation.line-ending')
		).toBe(true);
		const missingBlank = result.projection.text.replace('#INSTRUMENTAL\n\n', '#INSTRUMENTAL\n');
		const diagnostics = runRules(
			parseDocument(missingBlank),
			context(result.document, result.projection)
		);
		expect(
			diagnostics
				.filter((finding) => finding.ruleId === 'mxm.structure.instrumental')
				.map((finding) => finding.message)
		).toEqual(['Review the missing blank after the instrumental marker.']);
	});
	it('does not treat literal markers as facts and restores review after recording or language changes', () => {
		expect(
			findings(imported('One\n\n#INSTRUMENTAL\n\nTwo')).filter(
				(finding) => finding.ruleId === 'mxm.structure.instrumental'
			)
		).toHaveLength(1);
		const result = interval();
		const changed = value(
			resolveDecision(result.document, result.projection, {
				kind: 'setRecording',
				recordingId: 'recording:2'
			})
		);
		expect(
			findings(changed.document).filter(
				(finding) => finding.ruleId === 'mxm.structure.instrumental'
			)
		).toHaveLength(1);
		const language = value(
			resolveDecision(result.document, result.projection, {
				kind: 'setLanguage',
				language: 'ja'
			})
		);
		expect(
			findings(language.document).filter(
				(finding) => finding.ruleId === 'mxm.structure.instrumental'
			)
		).toHaveLength(2);
	});
});
