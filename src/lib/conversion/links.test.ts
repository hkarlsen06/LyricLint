import { describe, expect, it } from 'vitest';
import { importDocument } from './import.js';
import { renderProfile } from './projection.js';
import { resolveLinkDecision } from './links.js';
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
