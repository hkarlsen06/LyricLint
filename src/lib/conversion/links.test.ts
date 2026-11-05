import { describe, expect, it } from 'vitest';
import { importDocument } from './import.js';
import { createConversionEnvelope } from '../persistence/conversion.js';
import { profilePolicyVersions } from '../profiles/versions.js';
import { reconcileEdit, applyTextEdits } from './reconcile.js';
import { parseScribe, serializeScribe } from '../scribe/format.js';
import { projectOffset, renderProfile } from './projection.js';
import { resolveDecision } from './index.js';
import { conversionLinkDifferences, resolveLinkDecision } from './links.js';
import type { ConversionDocument, EngineResult } from './model.js';

function value<T>(result: EngineResult<T>): T {
	if (!result.ok) throw new Error(result.refusal.message);
	return result.value;
}
function song(
	text = '[Chorus]\nWe stay here\n\n[Chorus 2]\nWe stay here\n\n[Outro]\nWe stay near'
) {
	return value(importDocument({ profile: 'genius', text, language: 'en' }));
}
function link(document: ConversionDocument, sectionIds: string[]) {
	return value(
		resolveLinkDecision(document, value(renderProfile(document, 'musixmatch')), {
			kind: 'linkSections',
			sectionIds
		})
	).document;
}

describe('stable section link decisions', () => {
	it('aligns explicit matching passages, preserves local variations and both exact projections', () => {
		const original = song();
		const snapshot = structuredClone(original);
		const next = link(
			original,
			original.sections.map((section) => section.id)
		);
		expect(original).toEqual(snapshot);
		expect(next.links).toHaveLength(1);
		expect(next.links[0].passages?.some((passage) => passage.members.length === 3)).toBe(true);
		expect(next.links[0].passages?.some((passage) => passage.members.length === 2)).toBe(true);
		for (const profile of ['genius', 'musixmatch'] as const)
			expect(value(renderProfile(next, profile)).text).toBe(
				value(renderProfile(original, profile)).text
			);
	});

	it('adding a member keeps established local exclusions and equal but intentionally independent text', () => {
		const original = song(
			'[Chorus]\nWe stay here\n\n[Chorus 2]\nWe stay here\n\n[Chorus 3]\nWe stay here'
		);
		const [a, b, c] = original.sections.map((section) => section.id);
		const linked = link(original, [a, b]);
		linked.links[0].passages = [];
		const from = original.content.indexOf('stay');
		linked.links[0].detached = [{ sectionId: a, from, to: from + 4 }];
		const next = link(linked, [a, c]);
		expect(next.links[0].sectionIds).toEqual([a, b, c]);
		expect(next.links[0].detached).toEqual(linked.links[0].detached);
		for (const passage of next.links[0].passages ?? []) {
			const ids = passage.members.map((member) => member.sectionId);
			expect(ids.includes(a) && ids.includes(b)).toBe(false);
			const own = passage.members.find((member) => member.sectionId === a);
			if (own) expect(own.to <= from || from + 4 <= own.from).toBe(true);
		}
	});

	it('unlinking one member preserves the exact remaining peer connections without changing lyrics', () => {
		const original = song();
		const ids = original.sections.map((section) => section.id);
		const linked = link(original, ids);
		const result = value(
			resolveLinkDecision(linked, value(renderProfile(linked, 'musixmatch')), {
				kind: 'unlinkSection',
				sectionId: ids[2]
			})
		);
		expect(result.document.content).toBe(original.content);
		expect(result.document.links[0].sectionIds).toEqual(ids.slice(0, 2));
		expect(
			result.document.links[0].passages?.every((passage) =>
				passage.members.every((member) => member.sectionId !== ids[2])
			)
		).toBe(true);
		const final = value(
			resolveLinkDecision(result.document, result.projection, {
				kind: 'unlinkSection',
				sectionId: ids[0]
			})
		);
		expect(final.document.links).toEqual([]);
	});

	it('rejects duplicate, missing, single or stale selections without acquiring a group', () => {
		const original = song();
		const projection = value(renderProfile(original, 'musixmatch'));
		const id = original.sections[0].id;
		for (const sectionIds of [[id], [id, id], [id, 'missing']])
			expect(
				resolveLinkDecision(original, projection, { kind: 'linkSections', sectionIds }).ok
			).toBe(false);
		expect(
			resolveLinkDecision(
				original,
				{ ...projection, text: 'different' },
				{ kind: 'linkSections', sectionIds: original.sections.map((section) => section.id) }
			).ok
		).toBe(false);
		expect(original.links).toEqual([]);
	});

	it('keeps collocated empty section identities distinct and never fills them with inferred lyrics', () => {
		const original = song('[Chorus]\n[Chorus 2]\nWe stay here');
		const next = link(
			original,
			original.sections.map((section) => section.id)
		);
		expect(next.links[0].sectionIds).toHaveLength(2);
		expect(next.content).toBe(original.content);
	});
});

it('corrects only an explicit wording choice and refuses a changed group without retargeting', () => {
	const source =
		'[Chorus 1: Mira]\nHold on [tight](123456)\nCarry me home\n\n[Verse]\nWalk with me\n\n[Chorus 2: Mira]\nHold on tighht\nCarry me home (Oh)';
	const original = song(source);
	const sectionIds = [original.sections[0].id, original.sections[2].id];
	const document = link(original, sectionIds);
	const projection = value(renderProfile(document, 'musixmatch'));
	const differences = conversionLinkDifferences(document, projection, sectionIds);
	expect(differences.map((item) => item.wordings.map((wording) => wording.text))).toEqual([
		['tight', 'tighht'],
		['', ' (Oh)']
	]);
	const action = {
		kind: 'reviewLinkDifferences',
		sectionIds,
		choice: {
			headers: [0, 1],
			keepDifferent: [false, true],
			replaceFromByDifference: [0, undefined]
		}
	} as const;
	const corrected = value(resolveLinkDecision(document, projection, { ...action, sectionIds }));
	expect(corrected.projection.text).toBe(projection.text.replace('tighht', 'tight'));
	expect(value(renderProfile(corrected.document, 'genius')).text).toBe(
		source.replace('tighht', 'tight')
	);
	expect(corrected.document.sections.map((section) => section.id)).toEqual(
		document.sections.map((section) => section.id)
	);
	expect(corrected.document.voices.map((voice) => voice.id)).toEqual(
		document.voices.map((voice) => voice.id)
	);
	expect(corrected.document.links[0].id).toBe(document.links[0].id);
	expect(resolveLinkDecision(corrected.document, projection, { ...action, sectionIds }).ok).toBe(
		false
	);
	expect(
		resolveLinkDecision({ ...document, links: [] }, projection, { ...action, sectionIds }).ok
	).toBe(false);
});

function chooseLast(document: ConversionDocument, sectionIds: string[]) {
	const projection = value(renderProfile(document, 'musixmatch'));
	const differences = conversionLinkDifferences(document, projection, sectionIds);
	return value(
		resolveLinkDecision(document, projection, {
			kind: 'reviewLinkDifferences',
			sectionIds,
			choice: {
				headers: sectionIds.map((_, i) => i),
				keepDifferent: differences.map(() => false),
				replaceFromByDifference: differences.map(() => sectionIds.length - 1)
			}
		})
	);
}
it.each([
	['[Chorus]\n[Chorus 2]\nWe stay here', '[Chorus]\nWe stay here\n\n[Chorus 2]\nWe stay here'],
	[
		'[Verse]\nUntouched\n\n[Chorus]\n[Chorus 2]\n[Chorus 3]\nWe stay here',
		'[Verse]\nUntouched\n\n[Chorus]\nWe stay here\n\n[Chorus 2]\nWe stay here\n\n[Chorus 3]\nWe stay here'
	]
])('fills explicit empty section identities in %s', (source, expected) => {
	const original = song(source);
	const sectionIds = original.sections.filter((s) => s.name.startsWith('Chorus')).map((s) => s.id);
	const document = link(original, sectionIds);
	const next = chooseLast(document, sectionIds);
	expect(value(renderProfile(next.document, 'genius')).text).toBe(expected);
	expect(next.document.sections.map((s) => s.id)).toEqual(document.sections.map((s) => s.id));
});
it('preserves a hidden annotation on the unchanged prefix of a corrected word', () => {
	const source = '[Chorus]\nHold on [ti](123)ght\n\n[Chorus 2]\nHold on tighht';
	const original = song(source);
	const sectionIds = original.sections.map((s) => s.id);
	const document = link(original, sectionIds);
	const next = chooseLast(document, sectionIds);
	expect(value(renderProfile(next.document, 'genius')).text).toBe(
		source.replace('[ti](123)ght', '[ti](123)ghht')
	);
	expect(next.document.wrappers.map((w) => w.id)).toEqual(document.wrappers.map((w) => w.id));
});

it('fills copies with fresh untimed records and preserves the source annotation, voices and timings', () => {
	const source =
		'[Verse]\nUntouched\n\n[Chorus]\n[Chorus 2]\n[Chorus 3: Mira]\n[We](123) stay here';
	const original = song(source);
	original.lines.forEach((line, i) => {
		line.time = i + 1;
	});
	const ids = original.sections.slice(1).map((section) => section.id);
	const document = link(original, ids);
	const next = chooseLast(document, ids);
	expect(value(renderProfile(next.document, 'genius')).text).toBe(
		'[Verse]\nUntouched\n\n[Chorus]\nWe stay here\n\n[Chorus 2]\nWe stay here\n\n[Chorus 3: Mira]\n[We](123) stay here'
	);
	expect(next.document.wrappers.map((w) => w.id)).toEqual(document.wrappers.map((w) => w.id));
	for (const old of document.lines.filter((line) => line.time !== undefined)) {
		const line = next.document.lines.find((line) => line.id === old.id)!;
		expect(line.time).toBe(old.time);
		expect(next.document.content.slice(line.from, line.to)).toBe(
			document.content.slice(old.from, old.to)
		);
	}
	expect(
		next.document.lines
			.filter((line) => !document.lines.some((old) => old.id === line.id))
			.every((line) => line.time === undefined)
	).toBe(true);
	expect(next.document.voices.map((v) => v.id)).toEqual(document.voices.map((v) => v.id));
	expect(next.document.voices.map((v) => next.document.content.slice(v.from, v.to))).toEqual(
		document.voices.map((v) => document.content.slice(v.from, v.to))
	);
});

it('keeps a transformed wording unit whole when narrowing would cut its retained form', () => {
	const original = song('[Chorus]\n[2](123) stars\n\n[Chorus 2]\ntwins stars');
	const formed = value(
		resolveDecision(original, value(renderProfile(original, 'musixmatch')), {
			kind: 'setForm',
			range: { from: 0, to: 1 },
			profile: 'musixmatch',
			text: 'two'
		})
	).document;
	const ids = formed.sections.map((section) => section.id);
	const document = link(formed, ids);
	const next = chooseLast(document, ids);
	expect(next.projection.text).toBe('twins stars\n\ntwins stars');
	expect(value(renderProfile(next.document, 'genius')).text).toBe(
		'[Chorus]\n[twins](123) stars\n\n[Chorus 2]\ntwins stars'
	);
	expect(next.document.wrappers.map((w) => w.id)).toEqual(document.wrappers.map((w) => w.id));
});
it('narrows Unicode wording edits without splitting a surrogate pair', () => {
	const original = song('[Chorus]\n𐐀abc\n\n[Chorus 2]\n𐐁abc');
	const ids = original.sections.map((section) => section.id);
	const document = link(original, ids);
	const next = chooseLast(document, ids);
	expect(next.projection.text).toBe('𐐁abc\n\n𐐁abc');
});

it('fills a final empty section with an unterminated retained heading', () => {
	const original = song('[Chorus]\n[Chorus 2]\nWe stay here\n\n[Chorus 3]');
	const ids = original.sections.map((section) => section.id);
	const document = link(original, ids);
	const projection = value(renderProfile(document, 'musixmatch'));
	const differences = conversionLinkDifferences(document, projection, ids);
	const next = value(
		resolveLinkDecision(document, projection, {
			kind: 'reviewLinkDifferences',
			sectionIds: ids,
			choice: {
				headers: [0, 1, 2],
				keepDifferent: differences.map(() => false),
				replaceFromByDifference: differences.map(() => 1)
			}
		})
	);
	expect(value(renderProfile(next.document, 'genius')).text).toBe(
		'[Chorus]\nWe stay here\n\n[Chorus 2]\nWe stay here\n\n[Chorus 3]\nWe stay here'
	);
});

it.each([
	[
		'[Chorus]\n[Chorus 2]\nGo home\n\n[Chorus 3]\nStay home',
		'',
		'Stay home\n\nStay home\n\nStay home'
	],
	['[Chorus]\n[Chorus 2]\nWe X\n\n[Chorus 3]\nWe X', 'We ', 'X\n\nX\n\nX'],
	['[Chorus]\nWe stay here\n\n[Chorus 2]\nWe stay here (Oh)', 'We stay here', ' (Oh)\n\n (Oh)']
])(
	'atomically corrects and fills while preserving exact old empty occurrences: %s',
	(source, deletion, expected) => {
		let document = song(source);
		const ids = document.sections.map((s) => s.id);
		document = link(document, ids);
		if (deletion) {
			const projection = value(renderProfile(document, 'musixmatch'));
			const from = projection.text.indexOf(deletion);
			document = value(
				reconcileEdit(document, projection, {
					changes: [{ from, to: from + deletion.length, insert: '' }]
				})
			).document;
		}
		const snapshot = structuredClone(document);
		const before = value(renderProfile(document, 'musixmatch'));
		const next = chooseLast(document, ids);
		expect(document).toEqual(snapshot);
		expect(next.projection.text).toBe(expected);
		expect(applyTextEdits(before.text, next.changes)).toBe(expected);
		const oldEmpty =
			document.links[0].passages?.filter((p) => p.members.every((m) => m.from === m.to)) ?? [];
		const empty =
			next.document.links[0].passages?.filter((p) => p.members.every((m) => m.from === m.to)) ?? [];
		expect(empty.map((p) => p.members.map((m) => m.sectionId))).toEqual(
			oldEmpty.map((p) => p.members.map((m) => m.sectionId))
		);
		const roundTrip = parseScribe(
			serializeScribe({
				title: 'Comparison',
				performers: [],
				sectionLinks: [],
				lineAnchors: [],
				ignoredDiagnostics: [],
				language: 'en',
				lyrics: next.projection.text,
				conversion: createConversionEnvelope(next.document, 'musixmatch', profilePolicyVersions)
			})
		);
		expect(roundTrip.document.conversion?.model).toEqual(next.document);
		if (empty.length) {
			const anchor = empty[0].members[0];
			const projection = value(renderProfile(next.document, 'musixmatch'));
			const from = projectOffset(projection, anchor.from, 1);
			const typed = value(
				reconcileEdit(next.document, projection, { changes: [{ from, to: from, insert: 'New' }] })
			);
			expect(typed.projection.text.split('New')).toHaveLength(3);
			expect(next.document).toEqual(roundTrip.document.conversion?.model);
		}
		// Copied wording has no implicit passage membership.
		if (ids.length === 3) {
			expect(
				next.document.links[0].passages?.every((p) =>
					p.members.every((m) => m.sectionId !== ids[0])
				)
			).toBe(true);
			const typed = value(
				reconcileEdit(next.document, next.projection, {
					changes: [{ from: 0, to: 1, insert: 'Z' }]
				})
			);
			expect(typed.projection.text).toBe('Z' + expected.slice(1));
		}
	}
);

it('keeps original annotated voiced timed words through simultaneous correction and multiple fills', () => {
	const document = song(
		'[Chorus]\n[Chorus 2]\n[Chorus 3: Mira]\n[Go](123) home\n\n[Chorus 4]\nStay home'
	);
	document.lines.forEach((line, i) => {
		line.time = i + 1;
	});
	const ids = document.sections.map((s) => s.id);
	const linked = link(document, ids);
	const snapshot = structuredClone(linked);
	const next = chooseLast(linked, ids);
	expect(linked).toEqual(snapshot);
	expect(value(renderProfile(next.document, 'genius')).text).toBe(
		'[Chorus]\nStay home\n\n[Chorus 2]\nStay home\n\n[Chorus 3: Mira]\n[Stay](123) home\n\n[Chorus 4]\nStay home'
	);
	expect(next.document.wrappers.map((w) => w.id)).toEqual(linked.wrappers.map((w) => w.id));
	expect(next.document.voices.map((v) => v.id)).toEqual(linked.voices.map((v) => v.id));
	for (const line of linked.lines)
		expect(next.document.lines.find((l) => l.id === line.id)?.time).toBe(line.time);
	expect(
		next.document.lines
			.filter((l) => !linked.lines.some((old) => old.id === l.id))
			.every((l) => l.time === undefined)
	).toBe(true);
});

it('maps a preceding section end empty anchor before a collocated fill', () => {
	let document = song(
		'[Chorus]\nLocal We stay here\n\n[Chorus 2]\nWe stay here\n\n[Chorus 3]\nFresh'
	);
	const ids = document.sections.map((s) => s.id);
	document = link(document, ids);
	let projection = value(renderProfile(document, 'musixmatch'));
	let from = projection.text.indexOf('We stay here');
	document = value(
		reconcileEdit(document, projection, { changes: [{ from, to: from + 12, insert: '' }] })
	).document;
	projection = value(renderProfile(document, 'musixmatch'));
	from = projection.text.indexOf('\n\n');
	document = value(
		reconcileEdit(document, projection, {
			changes: [{ from, to: from + 2, insert: '' }],
			mirror: false
		})
	).document;
	const old = document.links[0].passages!.find((p) => p.members.every((m) => m.from === m.to))!;
	expect(old).toBeDefined();
	const own = old.members.find((m) => m.sectionId === ids[0])!;
	expect(own.from).toBe(document.sections[1].at);
	expect(own.from).toBeGreaterThan(document.sections[0].at);
	const next = value(
		reconcileEdit(document, value(renderProfile(document, 'musixmatch')), {
			changes: [],
			sectionFills: [{ sectionId: ids[1], text: 'Fresh' }],
			mirror: false
		})
	);
	const empty = next.document.links[0].passages!.find((p) =>
		p.members.every((m) => m.from === m.to)
	)!;
	expect(empty.members.find((m) => m.sectionId === ids[0])!.from).toBe(own.from);
});
