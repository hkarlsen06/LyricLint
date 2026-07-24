import { describe, expect, it } from 'vitest';
import { parseDocument } from '../core/parser.js';
import type { PerformerRecord } from '../core/types.js';
import {
	findHeaderRenameTargets,
	headerNameAtoms,
	isMirrorableHeaderName,
	nameBreaksHeaderStructure
} from './header-rename.js';

function roster(...names: string[]): PerformerRecord[] {
	return names.map((displayName, order) => ({
		id: `performer-${order}`,
		displayName,
		normalizedKey: displayName.toLocaleLowerCase(),
		aliases: [],
		colorId: `color-${order}`,
		order
	}));
}

const document = [
	'[Verse 1: Mara]',
	'Mara opens the song',
	'',
	'[Chorus: Mara & Jun, <i>Jun</i>]',
	'Both of them together',
	'<i>Jun answers</i>'
].join('\n');

function atomAt(text: string, needle: string, occurrence = 0): { from: number; to: number } {
	let from = -1;
	for (let index = 0; index <= occurrence; index += 1) {
		from = text.indexOf(needle, from + 1);
	}
	if (from < 0) {
		throw new Error(`Test fixture is missing occurrence ${occurrence} of ${needle}.`);
	}
	return { from, to: from + needle.length };
}

describe('headerNameAtoms', () => {
	it('splits a joint legend group into one atom per known performer', () => {
		const atoms = headerNameAtoms(parseDocument(document), roster('Mara', 'Jun'));
		expect(atoms.map((atom) => atom.text)).toEqual(['Mara', 'Mara', 'Jun', 'Jun']);
		expect(atoms.map((atom) => atom.performerId)).toEqual([
			'performer-0',
			'performer-0',
			'performer-1',
			'performer-1'
		]);
	});

	it('keeps an exact roster name containing an ampersand whole', () => {
		const text = '[Verse: Echo & The Glass]\nOne voice only';
		const atoms = headerNameAtoms(parseDocument(text), roster('Echo & The Glass', 'Echo'));
		expect(atoms.map((atom) => atom.text)).toEqual(['Echo & The Glass']);
	});

	it('leaves an ampersand name unsplit when a member is not a roster identity', () => {
		const text = '[Verse: Mara & Kit]\nOne voice only';
		const atoms = headerNameAtoms(parseDocument(text), roster('Mara'));
		expect(atoms).toEqual([
			{ from: text.indexOf('Mara'), to: text.indexOf(']'), text: 'Mara & Kit' }
		]);
	});
});

describe('findHeaderRenameTargets', () => {
	const parsed = parseDocument(document);
	const known = roster('Mara', 'Jun');

	it('finds every other header spelling the edited performer', () => {
		const source = atomAt(document, 'Mara');
		const found = findHeaderRenameTargets(parsed, known, { from: source.to, to: source.to });

		expect(found).toEqual({
			performerId: 'performer-0',
			previousName: 'Mara',
			source,
			targets: [atomAt(document, 'Mara', 2)]
		});
	});

	it('resolves an edit inside a joint group back to the solo header', () => {
		const source = atomAt(document, 'Mara', 2);
		const found = findHeaderRenameTargets(parsed, known, { from: source.from, to: source.from });

		expect(found?.previousName).toBe('Mara');
		expect(found?.source).toEqual(source);
		expect(found?.targets).toEqual([atomAt(document, 'Mara')]);
	});

	it('ignores an edit in a lyric line', () => {
		const line = atomAt(document, 'Mara', 1);
		expect(
			findHeaderRenameTargets(parsed, known, { from: line.from, to: line.to })
		).toBeUndefined();
	});

	it('ignores a name the roster does not know', () => {
		const source = atomAt(document, 'Mara');
		expect(
			findHeaderRenameTargets(parsed, roster('Jun'), { from: source.to, to: source.to })
		).toBeUndefined();
	});

	it('ignores a performer named in only one header', () => {
		const text = '[Verse 1: Mara]\nMara opens the song';
		const source = atomAt(text, 'Mara');
		expect(
			findHeaderRenameTargets(parseDocument(text), known, { from: source.to, to: source.to })
		).toBeUndefined();
	});

	it('ignores an edit that reaches outside the name', () => {
		const source = atomAt(document, 'Mara');
		expect(
			findHeaderRenameTargets(parsed, known, { from: source.from - 2, to: source.to })
		).toBeUndefined();
	});
});

describe('header name safety', () => {
	it('rejects characters that would change how another header parses', () => {
		for (const name of ['Ma,ra', 'Ma[ra', 'Ma]ra', 'Ma<i>ra', 'Mara>', 'Ma\nra']) {
			expect(nameBreaksHeaderStructure(name)).toBe(true);
			expect(isMirrorableHeaderName(name)).toBe(false);
		}
	});

	it('accepts a settled name, including one with an ampersand', () => {
		expect(isMirrorableHeaderName('Echo & The Glass')).toBe(true);
		expect(nameBreaksHeaderStructure('Echo & The Glass')).toBe(false);
	});

	it('waits for an unfinished name that is empty or padded', () => {
		expect(isMirrorableHeaderName('')).toBe(false);
		expect(isMirrorableHeaderName('Mara ')).toBe(false);
		expect(isMirrorableHeaderName(' Mara')).toBe(false);
	});
});
