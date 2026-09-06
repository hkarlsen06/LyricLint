import { describe, expect, it } from 'vitest';
import {
	alignPassages,
	coalescePassages,
	passageWordCount,
	type PassageBody,
	type SharedPassage
} from './link-passages.js';

function bodies(texts: string[]): PassageBody[] {
	let offset = 10;
	return texts.map((text, header) => {
		const body = { header, from: offset, text };
		offset += text.length + 20;
		return body;
	});
}

function recipients(passages: SharedPassage[], body: PassageBody, phrase: string): number[] {
	const from = body.from + body.text.indexOf(phrase);
	const to = from + phrase.length;
	return (
		passages
			.find((passage) =>
				passage.members.some(
					(member) => member.header === body.header && member.from <= from && member.to >= to
				)
			)
			?.members.map((member) => member.header) ?? []
	);
}

function expectValid(passages: SharedPassage[], input: PassageBody[]): void {
	for (const passage of passages) {
		expect(new Set(passage.members.map((member) => member.header)).size).toBe(
			passage.members.length
		);
		const texts = passage.members.map((member) => {
			const body = input.find((body) => body.header === member.header)!;
			expect(member.from).toBeGreaterThanOrEqual(body.from);
			expect(member.to).toBeLessThanOrEqual(body.from + body.text.length);
			return body.text.slice(member.from - body.from, member.to - body.from);
		});
		expect(new Set(texts).size).toBe(1);
	}
	for (const body of input) {
		const ranges = passages
			.flatMap((passage) => passage.members.filter((member) => member.header === body.header))
			.sort((a, b) => a.from - b.from);
		for (let i = 1; i < ranges.length; i++)
			expect(ranges[i].from).toBeGreaterThanOrEqual(ranges[i - 1].to);
	}
}

const intro = `\nHver sommer drar hun alltid til Italia
Også videre til Frankrike og Frankrike og Spania
Vin-vin-vin, i et badekar, ri-ri
Jeg hitta en J, jeg røyker Marrokan-Marrokan—
Beat-beat-beat, er detlandeplage
Jeg kan gi deg melodi, jeg kan gi deg bars
Kommer aldri til å falle av, samme hva
Lever livet hver dag, ja, det er sammendrag`;

const chorus = `\nHver sommer drar hun alltid til Italia
Også videre til Frankrike og Spania
På vingård, drikker vin i et badekar
FaceTime, jeg hitta en J, røyker marokkansk
Hver gang jeg går på beat er det landeplage
Jeg kan gi deg melodi, jeg kan gi deg bars
Kommer aldri til å falle av, samme hva
Lever livet hver dag, ja, det er sammendrag`;

describe('stored passage alignment', () => {
	it('links the reported shared word from every source, preserving subset-only wording', () => {
		const input = bodies([intro, chorus, chorus, `${intro} (Sammendrag)`]);
		const passages = alignPassages(input);
		expectValid(passages, input);
		for (const body of input) {
			expect(recipients(passages, body, 'i et badekar')).toEqual([0, 1, 2, 3]);
			expect(recipients(passages, body, 'Jeg kan gi deg melodi')).toEqual([0, 1, 2, 3]);
		}
		expect(recipients(passages, input[1], 'På vingård')).toEqual([1, 2]);
		expect(recipients(passages, input[1], 'FaceTime')).toEqual([1, 2]);
		expect(recipients(passages, input[0], 'Vin-vin-vin')).toEqual([0, 3]);
		expect(recipients(passages, input[3], '(Sammendrag)')).toEqual([]);
		expect(alignPassages([...input].reverse())).toEqual(passages);
	});

	it('retains complete equal bodies including their punctuation and whitespace', () => {
		for (const text of ['\nSing, sing!\nOh—oh  \n', '', '!!!']) {
			const input = bodies([text, text]);
			expect(alignPassages(input)).toEqual([
				{
					members: input.map((body) => ({
						header: body.header,
						from: body.from,
						to: body.from + text.length
					}))
				}
			]);
		}
	});

	it('retains an identical punctuation-only subset', () => {
		const input = bodies(['!!!', '!!!', 'Sing with me']);
		const passages = alignPassages(input);
		expectValid(passages, input);
		expect(recipients(passages, input[0], '!!!')).toEqual([0, 1]);
	});

	it('continues matching after different and inserted lines', () => {
		const input = bodies([
			'\nHold on tight\nMy own story\nCarry me home\nNever let go',
			'\nHold on tight\nYour new story\nAn extra verse\nCarry me home\nNever let go',
			'\nHold on tight\nCarry me home\nNever let go'
		]);
		const passages = alignPassages(input);
		expectValid(passages, input);
		expect(recipients(passages, input[0], 'Carry me home\nNever let go')).toEqual([0, 1, 2]);
		expect(recipients(passages, input[0], 'My own')).toEqual([]);
	});

	it('does not guess which repeated occurrence survives a deletion', () => {
		const input = bodies(['start here\nla la\nfinish now', 'start here\nla\nfinish now']);
		const passages = alignPassages(input);
		expectValid(passages, input);
		expect(recipients(passages, input[0], 'la')).toEqual([]);
		expect(recipients(passages, input[1], 'la')).toEqual([]);
		expect(recipients(passages, input[0], 'finish now')).toEqual([0, 1]);
	});

	it('does not mistake deterministic crossing tie-breaks for anchors', () => {
		const input = bodies(['red blue', 'blue red']);
		expect(alignPassages(input)).toEqual([]);
	});

	it('does not link unrelated single common words or fragments of words', () => {
		for (const texts of [
			['my love', 'your love'],
			['love tonight', 'lover together'],
			["can't go", 'can go']
		]) {
			expect(alignPassages(bodies(texts))).toEqual([]);
		}
	});

	it('keeps internal lexical punctuation but separates commas and Unicode words', () => {
		const input = bodies([
			'\nÉcoute l’amour, blå-bær\nSing with me',
			'\nÉcoute l’amour! blå-bær\nSing with me'
		]);
		const passages = alignPassages(input);
		expectValid(passages, input);
		expect(recipients(passages, input[0], 'Écoute l’amour')).toEqual([0, 1]);
		expect(recipients(passages, input[0], 'blå-bær')).toEqual([0, 1]);
		expect(recipients(passages, input[0], ',')).toEqual([]);
	});

	it('never uses a performer tag name as a sung word anchor', () => {
		const input = bodies([
			'start here i et badekar finish now',
			'start here <i>badekar</i> finish now'
		]);
		const passages = alignPassages(input);
		expectValid(passages, input);
		expect(recipients(passages, input[0], 'badekar')).toEqual([0, 1]);
		const tagFrom = input[1].from + input[1].text.indexOf('<i>');
		expect(
			passages.some((passage) =>
				passage.members.some(
					(member) => member.header === 1 && member.from < tagFrom + 3 && member.to > tagFrom
				)
			)
		).toBe(false);
		expect(passageWordCount(input[1].text)).toBe(5);
	});

	it('matches an entire one-word refrain across wrappers without splitting formatted words', () => {
		const input = bodies(['<i>badekar</i>', 'badekar,']);
		const passages = alignPassages(input);
		expectValid(passages, input);
		expect(recipients(passages, input[0], 'badekar')).toEqual([0, 1]);
		const split = bodies(['start here lo<i>ve</i> finish now', 'start here lo finish now']);
		expect(recipients(alignPassages(split), split[0], 'lo')).toEqual([]);
	});

	it('uses annotation fragments as lyrics while keeping IDs out of correspondence', () => {
		const input = bodies([
			'start here [badekar](123) finish now',
			'start here 123 badekar finish now'
		]);
		const passages = alignPassages(input);
		expectValid(passages, input);
		expect(recipients(passages, input[0], 'badekar')).toEqual([0, 1]);
		expect(recipients(passages, input[0], '123')).toEqual([]);
		expect(recipients(passages, input[1], '123')).toEqual([]);
		expect(passageWordCount(input[0].text)).toBe(5);
	});

	it('does not assign arbitrary occurrences when an entire repeated line is inserted', () => {
		const input = bodies([
			'start here\nhold on\nhold on\nfinish now',
			'start here\nhold on\nhold on\nhold on\nfinish now'
		]);
		const passages = alignPassages(input);
		expectValid(passages, input);
		expect(recipients(passages, input[0], 'hold on')).toEqual([]);
		expect(recipients(passages, input[0], 'start here')).toEqual([0, 1]);
		expect(recipients(passages, input[0], 'finish now')).toEqual([0, 1]);
	});

	it('never hides differing inter-word spaces inside an allegedly exact passage', () => {
		const input = bodies(['Hold on tight', 'Hold  on tight']);
		const passages = alignPassages(input);
		expectValid(passages, input);
		expect(recipients(passages, input[0], 'Hold on')).toEqual([]);
		expect(recipients(passages, input[0], 'on tight')).toEqual([0, 1]);
	});

	it('rejects globally contradictory occurrence matches', () => {
		const variants = ['a b a b', 'a a b b', 'a b b a'];
		const input = bodies(variants);
		expectValid(alignPassages(input), input);
		// Repeated positions may remain local; a section can never occur twice in
		// one passage, even if pairwise alignments imply a contradictory cycle.
	});

	it('bounds expensive alignment and preserves large identical subsets', () => {
		const text = 'one two three four '.repeat(2000);
		const input = bodies([text, text, `${text}different`]);
		const start = performance.now();
		const passages = alignPassages(input);
		expectValid(passages, input);
		expect(recipients(passages, input[0], text)).toEqual([0, 1]);
		expect(performance.now() - start).toBeLessThan(1500);
	});

	it('bounds malformed markup scanning before attempting non-exact alignment', () => {
		const malformed = '<a'.repeat(30_000);
		const input = bodies([malformed, `${malformed} changed`]);
		const start = performance.now();
		expect(alignPassages(input)).toEqual([]);
		expect(passageWordCount(malformed)).toBe(Infinity);
		expect(performance.now() - start).toBeLessThan(500);
	});

	it('coalesces only ranges touching in every same-subset occurrence', () => {
		const first = {
			members: [
				{ header: 1, from: 5, to: 8 },
				{ header: 2, from: 20, to: 23 }
			]
		};
		const second = {
			members: [
				{ header: 2, from: 23, to: 24 },
				{ header: 1, from: 8, to: 9 }
			]
		};
		expect(coalescePassages([second, first])).toEqual([
			{
				members: [
					{ header: 1, from: 5, to: 9 },
					{ header: 2, from: 20, to: 24 }
				]
			}
		]);
		expect(first.members[0].to).toBe(8);
	});

	it('keeps deleted-word anchors separate from both adjacent passages regardless of input order', () => {
		const before = {
			members: [
				{ header: 1, from: 5, to: 8 },
				{ header: 2, from: 20, to: 23 }
			]
		};
		const empty = {
			members: [
				{ header: 1, from: 8, to: 8 },
				{ header: 2, from: 23, to: 23 }
			]
		};
		const after = {
			members: [
				{ header: 1, from: 8, to: 10 },
				{ header: 2, from: 23, to: 25 }
			]
		};
		for (const order of [
			[before, empty, after],
			[after, before, empty],
			[empty, after, before]
		]) {
			expect(coalescePassages(order)).toEqual([before, empty, after]);
		}
	});
});
