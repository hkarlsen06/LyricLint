import { describe, expect, it } from 'vitest';
import { validateLinkPassages } from './link-record.js';
import { copySectionLinks } from '../persistence/copy.js';
import type { SectionLink } from './types.js';

const text = ['[Intro]', 'i et badekar,', '[Chorus]', 'i et badekar'];
const link: SectionLink = {
	lines: [1, 3],
	passages: [
		{
			members: [
				{ headerLine: 1, line: 2, column: 0, endLine: 2, endColumn: 12 },
				{ headerLine: 3, line: 4, column: 0, endLine: 4, endColumn: 12 }
			]
		}
	],
	detached: [{ headerLine: 1, line: 2, column: 12, endLine: 2, endColumn: 13 }]
};

describe('stored passage validation', () => {
	it('retains shared words beside local punctuation and copies every nested record independently', () => {
		expect(validateLinkPassages(link, link.lines, text)).toEqual({
			passages: link.passages,
			detached: link.detached
		});
		const copied = copySectionLinks([link])[0]!;
		copied.passages![0]!.members[0]!.column = 2;
		copied.detached![0]!.column = 13;
		expect(link.passages![0]!.members[0]!.column).toBe(0);
		expect(link.detached![0]!.column).toBe(12);
	});

	it('suspends unreadable passage metadata during the repository copy before editor restoration', () => {
		const corrupt = JSON.parse('{"lines":[1,3],"passages":null}') as SectionLink;
		expect(copySectionLinks([corrupt])).toEqual([{ lines: [1, 3], passages: [] }]);
	});

	it('keeps empty connections distinct from the legacy format', () => {
		expect(validateLinkPassages({}, link.lines, text)).toEqual({});
		expect(validateLinkPassages({ passages: [] }, link.lines, text)).toEqual({ passages: [] });
		const zero = {
			passages: [
				{ members: link.passages![0]!.members.map((member) => ({ ...member, column: 12 })) }
			]
		};
		expect(validateLinkPassages(zero, link.lines, text)).toEqual(zero);
	});

	it.each([
		{ passages: null },
		{ detached: [] },
		{ passages: [null] },
		{ passages: [{ members: [link.passages![0]!.members[0]] }] },
		{ passages: [{ members: [link.passages![0]!.members[0], link.passages![0]!.members[0]] }] },
		{ passages: [...link.passages!, ...link.passages!] },
		{ ...link, detached: [link.passages![0]!.members[0]] },
		{ ...link, detached: [{ ...link.detached![0], column: 999 }] },
		{
			passages: [
				{ members: link.passages![0]!.members.map((member) => ({ ...member, endColumn: 13 })) }
			]
		}
	])('suspends a corrupt new shape instead of enabling a legacy mirror (%j)', (value) => {
		expect(validateLinkPassages(value, link.lines, text)).toEqual({ passages: [] });
	});

	it('refuses a connection whose stored wording has diverged', () => {
		expect(validateLinkPassages(link, link.lines, [...text.slice(0, 3), 'i et badeker'])).toEqual({
			passages: []
		});
	});
});
