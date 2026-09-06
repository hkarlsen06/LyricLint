import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { parseDocument } from '$lib/core/parser.js';
import type {
	Diagnostic,
	EditorHandle,
	LanguagePack,
	LinkHole,
	PerformerRecord
} from '$lib/core/types.js';
import {
	assignVoiceGroup,
	assignVoiceLegend,
	normalizePerformerKey
} from '$lib/performers/index.js';
import { germanLanguagePack } from '$lib/languages/de.js';
import { norwegianLanguagePack } from '$lib/languages/no.js';
import { englishLanguagePack } from '$lib/languages/en.js';
import { shownControlHint } from '$lib/ui/state/control-tooltip.svelte.js';
import type { EditorDisplayContext, LyricEditorCallbacks } from './contracts.js';
import EditorPane from './EditorPane.svelte';
import {
	linkOccurrences,
	linkTargetAt,
	linkableHeaderAt,
	sectionBodyRange
} from './section-links.js';

afterEach(() => {
	vi.useRealTimers();
});

/**
 * CodeMirror groups history by transaction timestamps, with a 500ms window.
 * Advance only Date for a separate undo step; browser timers and layout stay real.
 */
function separateUndoEvent(): void {
	vi.setSystemTime(Date.now() + 600);
}

const SONG = [
	'[Verse 1]',
	'Something about the way',
	'',
	'[Chorus]',
	'Hold on tight',
	'Never let go',
	'',
	'[Verse 2]',
	'A second thing entirely',
	'',
	'[Chorus 2]',
	'Hold on tigth',
	'Never let go',
	'',
	'[Chorus 3]',
	'',
	'[Outro]',
	'Fading now'
].join('\n');

function offsetOf(text: string, needle: string): number {
	const index = text.indexOf(needle);
	if (index < 0) throw new Error(`${needle} is not in the fixture.`);
	return index;
}

function lineOffset(text: string, line: number): number {
	return text
		.split('\n')
		.slice(0, line - 1)
		.reduce((offset, content) => offset + content.length + 1, 0);
}

function rangeText(text: string, range: LinkHole): string {
	return text.slice(
		lineOffset(text, range.line) + range.column,
		lineOffset(text, range.endLine) + range.endColumn
	);
}

function differenceWordings(handle: EditorHandle): string[][] {
	const text = handle.getSnapshot().text;
	const headers = handle.getSectionLinks?.()[0]?.lines.map((line) => lineOffset(text, line)) ?? [];
	return (
		handle
			.getLinkDifferences?.(headers)
			?.map((difference) => difference.wordings.map((wording) => wording.text)) ?? []
	);
}

function detachedTexts(handle: EditorHandle): string[] {
	const text = handle.getSnapshot().text;
	return handle.getSectionLinks?.()[0]?.detached?.map((range) => rangeText(text, range)) ?? [];
}

/** A roster for the assignments the mirror has to reason about. */
const performers: PerformerRecord[] = ['Avery', 'Blair'].map((displayName, order) => ({
	id: `performer-${order + 1}`,
	displayName,
	normalizedKey: normalizePerformerKey(displayName),
	aliases: [],
	colorId: `performer-${order + 1}`,
	order
}));

function callbacks(overrides: Partial<LyricEditorCallbacks> = {}): LyricEditorCallbacks {
	return {
		onSnapshot: vi.fn(),
		onAssignRequest: vi.fn(),
		onSectionHeaderRequest: vi.fn(),
		onDiagnosticActivate: vi.fn(),
		onAnnouncement: vi.fn(),
		...overrides
	};
}

function context(
	languagePack: LanguagePack,
	overrides: Partial<EditorDisplayContext> = {}
): EditorDisplayContext {
	return {
		language: languagePack.tag,
		performers: [],
		ruleSetVersion: 'section-link-test',
		languagePack,
		...overrides
	};
}

async function mount(
	text: string,
	languagePack: LanguagePack = englishLanguagePack,
	overrides: Partial<LyricEditorCallbacks> = {},
	contextOverrides: Partial<EditorDisplayContext> = {}
): Promise<EditorHandle> {
	let handle: EditorHandle | undefined;
	await render(EditorPane, {
		props: {
			initialText: text,
			context: context(languagePack, contextOverrides),
			callbacks: callbacks(overrides),
			onready: (ready: EditorHandle) => {
				handle = ready;
			}
		}
	});
	await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
	if (!handle) throw new Error('CodeMirror did not publish its editor handle.');
	return handle;
}

describe('what the link picker discovers', () => {
	const parsed = parseDocument(SONG);

	it('numbers every chorus chronologically and leaves unrelated kinds as the source only', () => {
		const occurrences = linkOccurrences(parsed, englishLanguagePack, offsetOf(SONG, '[Chorus]'));
		expect(occurrences.map((occurrence) => occurrence.ordinal)).toEqual([1, 2, 3]);
		expect(occurrences.map((occurrence) => occurrence.label)).toEqual([
			'Chorus',
			'Chorus 2',
			'Chorus 3'
		]);
		expect(occurrences.map((occurrence) => occurrence.comparison)).toEqual([
			'source',
			'different',
			'empty'
		]);
		// Line numbers are what gets written down, so they have to match
		// CodeMirror's own 1-based numbering.
		expect(occurrences.map((occurrence) => occurrence.line)).toEqual([4, 11, 15]);
		expect(
			linkOccurrences(parsed, englishLanguagePack, offsetOf(SONG, '[Verse 1]')).map(
				(occurrence) => occurrence.label
			)
		).toEqual(['Verse 1']);
		expect(
			linkOccurrences(parsed, englishLanguagePack, offsetOf(SONG, '[Outro]')).map(
				(occurrence) => occurrence.label
			)
		).toEqual(['Outro']);
	});

	it('discovers a differently named section from the lyrics they share', () => {
		const text =
			'[Intro]\nHold the line\nAnd wait for me\n\n[Verse]\nNothing alike\n\n[Chorus]\nHold the line\nAnd wait for now';
		const crossKind = parseDocument(text);
		const occurrences = linkOccurrences(crossKind, englishLanguagePack, offsetOf(text, '[Intro]'));

		expect(occurrences.map((occurrence) => occurrence.label)).toEqual(['Intro', 'Chorus']);
		expect(occurrences.map((occurrence) => occurrence.comparison)).toEqual(['source', 'similar']);
	});

	it('keeps an existing peer even when its current lyrics are no longer similar', () => {
		const text = '[Intro]\nOpen the door\n\n[Outro]\nGoodnight forever';
		const crossKind = parseDocument(text);
		const intro = offsetOf(text, '[Intro]');
		const outro = offsetOf(text, '[Outro]');

		expect(linkOccurrences(crossKind, englishLanguagePack, intro)).toHaveLength(1);
		expect(
			linkOccurrences(crossKind, englishLanguagePack, intro, {
				includeHeaderOffsets: [outro]
			}).map((occurrence) => occurrence.label)
		).toEqual(['Intro', 'Outro']);
	});

	it('reads the draft language first and English second', () => {
		const german = parseDocument('[Hook]\nEins\n\n[Chorus]\nZwei');
		// `Hook` is German for chorus; `Chorus` is not in that pack at all and is
		// recognized through English, so the two are the same kind and link.
		expect(
			linkOccurrences(german, germanLanguagePack, offsetOf(german.text, '[Hook]')).map(
				(occurrence) => occurrence.label
			)
		).toEqual(['Hook', 'Chorus']);
		// Norwegian `Refreng` resolves to Chorus rather than to English's separate
		// Refrain, because the selected pack wins.
		const norwegian = parseDocument('[Refreng]\nEn\n\n[Refreng 2]\nTo');
		expect(
			linkOccurrences(norwegian, norwegianLanguagePack, offsetOf(norwegian.text, '[Refreng]'))
		).toHaveLength(2);
	});

	it('names sections with the same lyrics as the source', () => {
		const repeated = parseDocument(SONG.replace('Hold on tigth', 'Hold on tight'));
		expect(
			linkOccurrences(repeated, englishLanguagePack, offsetOf(repeated.text, '[Chorus]')).map(
				(occurrence) => occurrence.comparison
			)
		).toEqual(['source', 'same', 'empty']);
	});

	// Opened on a section with nothing in it, the words can only come from a copy
	// that has some — so the comparisons are read against that copy rather than
	// against the empty one, which would name two identical choruses `different`.
	it('compares against the copy with words when the one it opened on has none', () => {
		const occurrences = linkOccurrences(parsed, englishLanguagePack, offsetOf(SONG, '[Chorus 3]'));
		expect(occurrences.map((occurrence) => occurrence.comparison)).toEqual([
			'same',
			'different',
			'empty'
		]);
	});

	it('offers any section header only when it is selected whole, on one line', () => {
		const header = offsetOf(SONG, '[Chorus]');
		expect(linkableHeaderAt(parsed, englishLanguagePack, header, header + 8)).toEqual({
			from: header,
			to: header + 8
		});
		// Half a header is a word being retyped.
		expect(linkableHeaderAt(parsed, englishLanguagePack, header + 1, header + 4)).toBeUndefined();
		// A selection reaching into the lyrics below it is a passage.
		expect(linkableHeaderAt(parsed, englishLanguagePack, header, header + 20)).toBeUndefined();
		// A differently named repeat can start from a verse too.
		const verse = offsetOf(SONG, '[Verse 1]');
		expect(linkableHeaderAt(parsed, englishLanguagePack, verse, verse + 9)).toEqual({
			from: verse,
			to: verse + 9
		});
	});

	it('measures a body from the end of the header line, so an empty section has one', () => {
		const empty = sectionBodyRange(parsed, offsetOf(SONG, '[Chorus 3]'));
		expect(empty).toBeDefined();
		expect(SONG.slice(empty?.from, empty?.to)).toBe('');
		const full = sectionBodyRange(parsed, offsetOf(SONG, '[Chorus]'));
		expect(SONG.slice(full?.from, full?.to)).toBe('\nHold on tight\nNever let go');
	});
});

/**
 * The shape the whole rebuild is for: two choruses that are the same song part
 * sung the same way, apart from the end of one line. Under the old whole-body
 * link these could not be tied together at all — the only offer was to overwrite
 * one of them, which destroyed the difference the transcriber meant to keep.
 */
const REPEAT = [
	'[Verse 1]',
	'Something about the way',
	'',
	'[Chorus]',
	'Hold on tight',
	'The night is young',
	'And I will be there tonight',
	'',
	'[Verse 2]',
	'A second thing entirely',
	'',
	'[Chorus 2]',
	'Hold on tight',
	'The night is young',
	'And I will be there again'
].join('\n');

/** Two copies that agree throughout, for the differences made by hand. */
const SAME = [
	'[Chorus]',
	'Hold on tight',
	'Never let go',
	'',
	'[Verse 1]',
	'Something about the way',
	'',
	'[Chorus 2]',
	'Hold on tight',
	'Never let go'
].join('\n');

describe('linking sections that do not agree throughout', () => {
	it('writes nothing at all, and records what the copies disagree on', async () => {
		const handle = await mount(REPEAT);
		handle.linkSections?.({
			headers: [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')]
		});

		// The whole point: linking is not an overwrite. Both endings survive.
		expect(handle.getSnapshot().text).toBe(REPEAT);
		const links = handle.getSectionLinks?.() ?? [];
		expect(links).toHaveLength(1);
		expect(links[0]?.lines).toEqual([4, 12]);
		// Stored passages own synchronization; legacy holes are only a safe fallback.
		expect(links[0]?.passages?.length).toBeGreaterThan(0);
		expect(differenceWordings(handle)).toEqual([['tonight', 'again']]);
	});

	it('names the difference by the words, not by the line it is on', async () => {
		const handle = await mount(REPEAT);
		const headers = [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')];
		const differences = handle.getLinkDifferences?.(headers) ?? [];
		expect(differences).toHaveLength(1);
		expect(differences[0]?.wordings.map((wording) => wording.text)).toEqual(['tonight', 'again']);
		expect(differences[0]?.wordings.map((wording) => wording.from)).toEqual([
			REPEAT.indexOf('tonight'),
			REPEAT.indexOf('again')
		]);
	});

	// The line they share is kept in step, which is the half that makes linking
	// worth having: one correction reaches both copies.
	it('carries a correction made in the shared part of the very line that differs', async () => {
		const handle = await mount(REPEAT);
		handle.linkSections?.({
			headers: [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')]
		});
		separateUndoEvent();

		const text = handle.getSnapshot().text;
		const from = text.indexOf('And I will be there tonight') + 'And I'.length;
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from, to: from + ' will'.length, insert: "'ll" }]
		});

		const mirrored = handle.getSnapshot().text;
		expect(mirrored).toContain("And I'll be there tonight");
		expect(mirrored).toContain("And I'll be there again");

		// One press, one undo, both copies.
		handle.undo();
		expect(handle.getSnapshot().text).toBe(text);
	});

	// And the other half: an edit inside the words a copy keeps its own stays
	// where it was made. This is what the whole merge structure exists to do.
	it('leaves an edit inside a difference in the copy it was made in', async () => {
		const handle = await mount(REPEAT);
		handle.linkSections?.({
			headers: [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')]
		});

		const text = handle.getSnapshot().text;
		const caret = text.indexOf('again') + 'again'.length;
		handle.focus();
		handle.setSelection({ anchor: caret, head: caret });
		await userEvent.keyboard(' tonight');

		const typed = handle.getSnapshot().text;
		expect(typed).toContain('And I will be there again tonight');
		// The first chorus is untouched, and did not gain a second `tonight`.
		expect(typed).toContain('And I will be there tonight\n');
		expect(typed.split('be there tonight')).toHaveLength(2);
	});

	// Tagging a performer is a rewrite of *a few characters*, however it is
	// computed. `transformLine` renders the whole line and used to report the
	// whole line as its edit, which `carryHoles` reads as writing over the
	// difference — so styling an ad-lib that exists in one chorus only ended the
	// difference and copied the ad-lib into every other copy, silently. The
	// position within the line decides nothing: an ad-lib in the middle is the
	// same claim as one at the end.
	it.each([
		['at the end of the line', 'The night is young (ayy)'],
		['in the middle of the line', 'The night (ayy) is young']
	])('keeps a one-copy ad-lib local when a performer is tagged %s', async (_label, adlibLine) => {
		const song = [
			'[Chorus: Avery & <i>Blair</i>]',
			'Hold on tight',
			adlibLine,
			'',
			'[Chorus 2: Avery]',
			'Hold on tight',
			'The night is young'
		].join('\n');
		const handle = await mount(song);
		handle.linkSections?.({
			headers: [offsetOf(song, '[Chorus:'), offsetOf(song, '[Chorus 2:')]
		});

		const text = handle.getSnapshot().text;
		const from = text.indexOf('(ayy)');
		const result = assignVoiceGroup({
			revision: handle.getSnapshot().revision,
			text,
			document: parseDocument(text),
			selection: { anchor: from, head: from + '(ayy)'.length },
			performerIds: [performers[1]!.id],
			roster: performers
		});
		expect(result.status).toBe('applied');
		if (result.status !== 'applied') throw new Error(result.reason);
		handle.dispatchAtomic(result.edit);

		const tagged = handle.getSnapshot().text;
		// The parentheses stay outside the formatting — the transform writes the
		// guide's own form, so only the words inside them take the style.
		expect(tagged).toContain(adlibLine.replace('(ayy)', '(<i>ayy</i>)'));
		// The peer never sang it, so it does not gain the ad-lib or its markup.
		expect(tagged.split('ayy')).toHaveLength(2);
		expect(tagged).toContain('[Chorus 2: Avery]\nHold on tight\nThe night is young');
		// And the difference is still a difference, ready to be told apart again.
		expect(
			differenceWordings(handle)
				.flat()
				.some((wording) => wording.includes('ayy'))
		).toBe(true);
	});

	// The complement, and the reason the repair is a narrower edit rather than an
	// exemption for performer markup: text both copies share is still carried.
	// The header already names the slot, so this is one change and the ordinary
	// mirror sees it. First assignments use the performer-specific linked
	// transaction tested below, because they write the legend and body together.
	it('carries a performer tagged on shared words into every copy', async () => {
		const song = [
			'[Chorus: Avery & <i>Blair</i>]',
			'Hold on tight',
			'The night is young (ayy)',
			'',
			'[Chorus 2: Avery]',
			'Hold on tight',
			'The night is young'
		].join('\n');
		const handle = await mount(song);
		handle.linkSections?.({
			headers: [offsetOf(song, '[Chorus:'), offsetOf(song, '[Chorus 2:')]
		});

		const text = handle.getSnapshot().text;
		const from = text.indexOf('Hold on tight');
		const result = assignVoiceGroup({
			revision: handle.getSnapshot().revision,
			text,
			document: parseDocument(text),
			selection: { anchor: from, head: from + 'Hold on tight'.length },
			performerIds: [performers[1]!.id],
			roster: performers
		});
		expect(result.status).toBe('applied');
		if (result.status !== 'applied') throw new Error(result.reason);
		handle.dispatchAtomic(result.edit);

		expect(handle.getSnapshot().text.split('<i>Hold on tight</i>')).toHaveLength(3);
	});

	it('carries a first performer assignment into every linked header and shared body', async () => {
		const song = [
			'[Chorus]',
			'Avery opens',
			'Shared refrain',
			'Ends tonight',
			'',
			'[Chorus]',
			'Avery opens',
			'Shared refrain',
			'Ends again'
		].join('\n');
		const handle = await mount(song);
		const firstHeader = song.indexOf('[Chorus]');
		const secondHeader = song.lastIndexOf('[Chorus]');
		handle.linkSections?.({ headers: [firstHeader, secondHeader] });
		separateUndoEvent();

		const text = handle.getSnapshot().text;
		const from = text.indexOf('Shared refrain');
		const result = assignVoiceGroup({
			revision: handle.getSnapshot().revision,
			text,
			document: parseDocument(text),
			selection: { anchor: from, head: from + 'Shared refrain'.length },
			performerIds: [performers[1]!.id],
			sectionPerformerIds: [performers[0]!.id],
			roster: performers
		});
		expect(result.status).toBe('applied');
		if (result.status !== 'applied') throw new Error(result.reason);
		expect(handle.dispatchLinkedPerformer).toBeTypeOf('function');
		handle.dispatchLinkedPerformer?.(result.edit, from);

		const assigned = handle.getSnapshot().text;
		expect(assigned.split('[Chorus: Avery & <i>Blair</i>]')).toHaveLength(3);
		expect(assigned.split('<i>Shared refrain</i>')).toHaveLength(3);
		// Linking still preserves the words each occurrence sings differently.
		expect(assigned).toContain('Ends tonight');
		expect(assigned).toContain('Ends again');

		handle.undo();
		expect(handle.getSnapshot().text).toBe(song);
	});

	it('repairs every linked header when an existing styled voice is assigned', async () => {
		const song = [
			'[Chorus]',
			'<i>Shared refrain</i>',
			'',
			'[Chorus]',
			'<i>Shared refrain</i>'
		].join('\n');
		const handle = await mount(song);
		const firstHeader = song.indexOf('[Chorus]');
		const secondHeader = song.lastIndexOf('[Chorus]');
		handle.linkSections?.({ headers: [firstHeader, secondHeader] });
		separateUndoEvent();

		const text = handle.getSnapshot().text;
		const result = assignVoiceLegend({
			revision: handle.getSnapshot().revision,
			text,
			document: parseDocument(text),
			sectionFrom: firstHeader,
			assignments: [{ styleSlot: 2, performerIds: [performers[1]!.id] }],
			roster: performers
		});
		expect(result.status).toBe('applied');
		if (result.status !== 'applied') throw new Error(result.reason);
		handle.dispatchLinkedPerformer?.(result.edit, firstHeader);

		expect(handle.getSnapshot().text.split('[Chorus: <i>Blair</i>]')).toHaveLength(3);
		handle.undo();
		expect(handle.getSnapshot().text).toBe(song);
	});

	// A larger selection cannot authorize replacing the peer's independent words.
	it('keeps an edit crossing independent wording local while preserving other shared passages', async () => {
		const handle = await mount(REPEAT);
		handle.linkSections?.({
			headers: [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')]
		});

		// Select `there tonight` — shared text, then the difference — and retype it.
		const text = handle.getSnapshot().text;
		const from = text.indexOf('there tonight');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from, to: from + 'there tonight'.length, insert: 'here tomorrow' }]
		});

		const rewritten = handle.getSnapshot().text;
		expect(rewritten).toContain('And I will be here tomorrow');
		expect(rewritten).toContain('And I will be there again');
		const shared = rewritten.indexOf('Hold on tight');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: shared, to: shared + 'Hold'.length, insert: 'Stay' }]
		});
		expect(handle.getSnapshot().text.split('Stay on tight')).toHaveLength(3);
		expect(handle.getSnapshot().text).toContain('And I will be there again');
	});

	it('draws the divergent words in every copy, and nothing else', async () => {
		const handle = await mount(REPEAT);
		handle.linkSections?.({
			headers: [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')]
		});
		await vi.waitFor(() => {
			const marks = [...document.querySelectorAll('.ll-link-divergent')].map(
				(mark) => mark.textContent
			);
			expect(marks).toEqual([' tonight', ' again']);
		});
	});
});

describe('making linked copies agree', () => {
	// The destructive reading is still available and is now asked for per
	// difference rather than being the price of linking at all.
	it('collapses only the differences the user unticked', async () => {
		const handle = await mount(REPEAT);
		handle.linkSections?.({
			headers: [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')],
			keepDifferent: [false]
		});

		const matched = handle.getSnapshot().text;
		expect(matched.split('And I will be there tonight')).toHaveLength(3);
		expect(matched).not.toContain('again');
		// Nothing outside the choruses moved.
		expect(matched).toContain('A second thing entirely');

		handle.undo();
		expect(handle.getSnapshot().text).toBe(REPEAT);
	});

	// Adding `[Chorus 3]` at the foot of a draft and asking for the copies to
	// agree is a request to *fill* it. Resolved from the section the card was
	// opened on, that request empties the chorus that had the words.
	it('fills an empty section from its peer rather than emptying the peer', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.({
			headers: [offsetOf(SONG, '[Chorus 3]'), offsetOf(SONG, '[Chorus]')],
			keepDifferent: [false]
		});

		const linked = handle.getSnapshot().text;
		expect(linked).toContain('[Chorus 3]\nHold on tight\nNever let go');
		expect(linked).toContain('[Chorus]\nHold on tight\nNever let go');
		// The copy nobody linked keeps its own typo.
		expect(linked).toContain('tigth');

		handle.undo();
		expect(handle.getSnapshot().text).toBe(SONG);
	});

	// The words come from the group, never from the document: a copy the user did
	// not tick is not part of what they asked for.
	it('takes the words from the ticked copy, not the first one in the song', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.({
			headers: [offsetOf(SONG, '[Chorus 3]'), offsetOf(SONG, '[Chorus 2]')],
			keepDifferent: [false]
		});

		const linked = handle.getSnapshot().text;
		expect(linked).toContain('[Chorus 3]\nHold on tigth\nNever let go');
		expect(linked).toContain('[Chorus]\nHold on tight\nNever let go');
	});
});

describe('editing the edges of a linked section', () => {
	const song = [
		'[Chorus]',
		'Hold on tight',
		'Never let go',
		'',
		'[Verse]',
		'Something else',
		'',
		'[Chorus 2]',
		'Hold on tight',
		'Never let go'
	].join('\n');

	async function linkedSong(): Promise<EditorHandle> {
		const handle = await mount(song);
		handle.linkSections?.({
			headers: [offsetOf(song, '[Chorus]'), offsetOf(song, '[Chorus 2]')]
		});
		return handle;
	}

	it('keeps terminal line breaks local so they can begin the next section', async () => {
		const handle = await linkedSong();
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: song.length, to: song.length, insert: '\n' }]
		});

		// The first Enter leaves the linked body. Mirroring it into the earlier
		// chorus adds layout below a section the user is nowhere near.
		expect(handle.getSnapshot().text).toBe(`${song}\n`);

		const afterBreak = handle.getSnapshot().text;
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [
				{
					from: afterBreak.length,
					to: afterBreak.length,
					insert: '\n[Verse 2]\nA new verse'
				}
			]
		});

		expect(handle.getSnapshot().text).toBe(`${song}\n\n[Verse 2]\nA new verse`);
		expect(handle.getSnapshot().text.match(/\[Verse 2\]/gu)).toHaveLength(1);
	});

	it('still mirrors a line break inserted in the middle of linked lyrics', async () => {
		const handle = await linkedSong();
		const firstNever = song.indexOf('Never let go');
		const splitAt = firstNever + 'Never'.length;
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: splitAt, to: splitAt, insert: '\n' }]
		});

		expect(handle.getSnapshot().text.match(/Never\n let go/gu)).toHaveLength(2);
	});

	it('mirrors a new line typed onto the blank that split linked copies', async () => {
		const handle = await linkedSong();
		// Enter at the end of a lyric line inserts before the break already
		// there, so `Hold\nNever` becomes `Hold\n\nNever`: a blank physical
		// line, which the parser reads as a section boundary. The bare break
		// mirrors, splitting every peer the same way.
		const firstTight = song.indexOf('Hold on tight') + 'Hold on tight'.length;
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: firstTight, to: firstTight, insert: '\n' }]
		});
		expect(handle.getSnapshot().text.match(/Hold on tight\n\nNever let go/gu)).toHaveLength(2);

		// Typing on the empty line merges the edited copy back into one
		// section. Only the filled gap travels: carrying the whole tail would
		// duplicate the `Never let go` peers already hold as their own tail.
		const emptyAt = '[Chorus]\nHold on tight\n'.length;
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: emptyAt, to: emptyAt, insert: 'New line' }]
		});

		const changed = handle.getSnapshot().text;
		expect(changed.match(/Hold on tight\nNew line\nNever let go/gu)).toHaveLength(2);
		expect(handle.getSectionLinks?.()).toHaveLength(1);
	});

	it('mirrors lyrics deliberately extended from the last line', async () => {
		const handle = await linkedSong();
		separateUndoEvent();
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: song.length, to: song.length, insert: '\n' }]
		});
		const afterBreak = handle.getSnapshot().text;
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: afterBreak.length, to: afterBreak.length, insert: 'One more line' }]
		});

		expect(handle.getSnapshot().text.match(/Never let go\nOne more line/gu)).toHaveLength(2);
		handle.undo();
		expect(handle.getSnapshot().text).toBe(afterBreak);
		handle.undo();
		expect(handle.getSnapshot().text).toBe(song);
	});

	it('keeps a terminal lyric extension local while editing only this section', async () => {
		const handle = await linkedSong();
		const secondHeader = offsetOf(song, '[Chorus 2]');
		expect(handle.typeOnlyHere?.(secondHeader)).toBe(true);
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: song.length, to: song.length, insert: '\n' }]
		});
		const afterBreak = handle.getSnapshot().text;
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: afterBreak.length, to: afterBreak.length, insert: 'Only over here' }]
		});

		const changed = handle.getSnapshot().text;
		expect(changed.match(/Never let go\nOnly over here/gu)).toHaveLength(1);
		expect(detachedTexts(handle).some((text) => text.includes('Only over here'))).toBe(true);
	});

	it('keeps an extension local when the linked endings already differ', async () => {
		const handle = await mount(REPEAT);
		handle.linkSections?.({
			headers: [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')]
		});
		const before = handle.getSnapshot().text;
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: before.length, to: before.length, insert: '\n' }]
		});
		const afterBreak = handle.getSnapshot().text;
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: afterBreak.length, to: afterBreak.length, insert: 'Only this ending' }]
		});

		const changed = handle.getSnapshot().text;
		expect(changed.match(/Only this ending/gu)).toHaveLength(1);
		expect(
			handle
				.getLinkDifferences?.([offsetOf(changed, '[Chorus]'), offsetOf(changed, '[Chorus 2]')])?.[0]
				?.wordings.map((wording) => wording.text)
		).toEqual(['tonight', 'again\nOnly this ending']);
	});
});

describe('recording a deliberate difference', () => {
	// Selecting the words that differ and pressing the shortcut is the gesture the
	// second list is driven by: the card opens with the selection offered as a
	// difference, ticked, because setting it aside is what the user asked for.
	it('offers a selection as a new difference and keeps it out of the mirror', async () => {
		const handle = await mount(SAME);
		handle.linkSections?.({
			headers: [offsetOf(SAME, '[Chorus]'), offsetOf(SAME, '[Chorus 2]')]
		});
		expect(differenceWordings(handle)).toEqual([]);
		expect(detachedTexts(handle)).toEqual([]);

		const tight = SAME.indexOf('tight');
		handle.linkSections?.({
			headers: [offsetOf(SAME, '[Chorus]'), offsetOf(SAME, '[Chorus 2]')],
			keepDifferent: [],
			makeDifferent: { from: tight, to: tight + 'tight'.length }
		});
		expect(detachedTexts(handle)).toEqual(['tight']);

		const caret = tight + 'tight'.length;
		handle.focus();
		handle.setSelection({ anchor: caret, head: caret });
		await userEvent.keyboard('er');

		const typed = handle.getSnapshot().text;
		expect(typed).toContain('[Chorus]\nHold on tighter');
		// The peer keeps the word it had, which is what setting it aside meant.
		expect(typed).toContain('[Chorus 2]\nHold on tight\n');
	});

	// The keyboard path resolves a lyric selection to its section; the pointer
	// path deliberately does not, or the link card would start arriving uninvited
	// on the most common gesture in a text editor.
	it('resolves a lyric selection for the shortcut and not for the pointer', () => {
		const parsed = parseDocument(SAME);
		const words = SAME.indexOf('tight');
		const target = linkTargetAt(parsed, englishLanguagePack, words, words + 5);
		expect(target?.header.from).toBe(offsetOf(SAME, '[Chorus]'));
		expect(target?.selection).toEqual({ from: words, to: words + 5 });
		// The predicate the anchor plugin reads answers nothing here.
		expect(linkableHeaderAt(parsed, englishLanguagePack, words, words + 5)).toBeUndefined();
	});
});

describe('typing only in one linked copy', () => {
	it('keeps a multi-range editor command local and records only its touched words', async () => {
		const handle = await mount(SAME);
		const header = offsetOf(SAME, '[Chorus]');
		handle.linkSections?.({ headers: [header, offsetOf(SAME, '[Chorus 2]')] });
		expect(handle.typeOnlyHere?.(header)).toBe(true);

		const text = handle.getSnapshot().text;
		const hold = text.indexOf('Hold');
		const never = text.indexOf('Never');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [
				{ from: hold, to: hold + 'Hold'.length, insert: 'Stay' },
				{ from: never, to: never + 'Never'.length, insert: 'Always' }
			]
		});

		const changed = handle.getSnapshot().text;
		expect(changed).toContain('[Chorus]\nStay on tight\nAlways let go');
		expect(changed).toContain('[Chorus 2]\nHold on tight\nNever let go');
		expect(
			handle.getLinkDifferences?.([offsetOf(changed, '[Chorus]'), offsetOf(changed, '[Chorus 2]')])
		).toHaveLength(2);
	});

	it('applies a multi-part atomic edit locally and undoes its words and exception together', async () => {
		const onSectionLinksChanged = vi.fn();
		const handle = await mount(SAME, englishLanguagePack, { onSectionLinksChanged });
		handle.linkSections?.({
			headers: [offsetOf(SAME, '[Chorus]'), offsetOf(SAME, '[Chorus 2]')]
		});
		const initialLinks = handle.getSectionLinks?.();
		onSectionLinksChanged.mockClear();
		separateUndoEvent();

		const from = SAME.indexOf('Hold on tight');
		const to = from + 'Hold on tight'.length;
		handle.dispatchAtomicOnlyHere?.(
			{
				baseRevision: handle.getSnapshot().revision,
				edits: [
					{ from, to: from + 'Hold'.length, insert: 'Stay' },
					{ from: to - 'tight'.length, to, insert: 'close' }
				]
			},
			{ from, to }
		);

		const changed = handle.getSnapshot().text;
		expect(changed).toContain('[Chorus]\nStay on close');
		expect(changed).toContain('[Chorus 2]\nHold on tight');
		expect(detachedTexts(handle)).toEqual(['Stay on close']);
		expect(onSectionLinksChanged).toHaveBeenCalledOnce();

		handle.undo();
		expect(handle.getSnapshot().text).toBe(SAME);
		expect(handle.getSectionLinks?.()).toEqual(initialLinks);
	});

	it('arms the caret before writing and keeps the whole typing run local', async () => {
		const announcements: string[] = [];
		const onSectionLinksChanged = vi.fn();
		const handle = await mount(SAME, englishLanguagePack, {
			onAnnouncement: (message) => void announcements.push(message),
			onSectionLinksChanged
		});
		handle.linkSections?.({
			headers: [offsetOf(SAME, '[Chorus]'), offsetOf(SAME, '[Chorus 2]')]
		});
		const initialLinks = handle.getSectionLinks?.();
		onSectionLinksChanged.mockClear();
		separateUndoEvent();

		const caret = SAME.indexOf('tight') + 'tight'.length;
		handle.setSelection({ anchor: caret, head: caret });
		expect(handle.typeOnlyHere?.(offsetOf(SAME, '[Chorus]'))).toBe(true);
		handle.focus();
		const sectionOnlyStatus = document.querySelector('.ll-section-only-status');
		expect(sectionOnlyStatus?.textContent).toBe('Editing this section only');
		// Padding follows CodeMirror's next measurement of the available label width.
		await vi.waitFor(() => {
			const status = document.querySelector('.ll-section-only-status')!;
			expect(getComputedStyle(status).paddingInlineStart).not.toBe('0px');
		});
		expect(document.querySelector('.ll-section-only-header')).not.toBeNull();
		const activeHeader = document.querySelector('.ll-section-only-header')!;
		const dangerProbe = document.createElement('span');
		dangerProbe.style.background = 'var(--color-danger-surface)';
		document.body.append(dangerProbe);
		expect(getComputedStyle(activeHeader).backgroundColor).toBe(
			getComputedStyle(dangerProbe).backgroundColor
		);
		expect(getComputedStyle(activeHeader).boxShadow).not.toBe('none');
		handle.setSelection({ anchor: offsetOf(SAME, '[Chorus]'), head: offsetOf(SAME, '[Chorus]') });
		const activeLocalHeader = document.querySelector('.ll-section-only-header.cm-activeLine')!;
		expect(getComputedStyle(activeLocalHeader).backgroundColor).toBe(
			getComputedStyle(dangerProbe).backgroundColor
		);
		handle.setSelection({ anchor: caret, head: caret });
		dangerProbe.remove();

		await userEvent.keyboard('er');
		const typed = handle.getSnapshot().text;
		expect(typed).toContain('[Chorus]\nHold on tighter');
		expect(typed).toContain('[Chorus 2]\nHold on tight\n');
		// The section mode stays visible while typing creates its local wording.
		expect(document.querySelector('.ll-section-only-status')?.textContent).toBe(
			'Editing this section only'
		);
		expect(onSectionLinksChanged).toHaveBeenCalledTimes(1);
		expect(
			handle
				.getLinkDifferences?.([offsetOf(typed, '[Chorus]'), offsetOf(typed, '[Chorus 2]')])?.[0]
				?.wordings.map((wording) => wording.text)
		).toEqual(['tighter', 'tight']);
		expect(detachedTexts(handle)).toEqual(['er']);

		// Moving elsewhere preserves the deliberately local suffix. The comparison
		// presents complete words while the stored exclusion remains the actual edit.
		const sharedCaret = typed.indexOf('Never let go') + 'Never'.length;
		handle.setSelection({ anchor: sharedCaret, head: sharedCaret });
		// The mode belongs to the section, not the caret or the first local run.
		expect(document.querySelector('.ll-section-only-status')).not.toBeNull();
		expect(handle.isTypeOnlyHere?.(offsetOf(typed, '[Chorus]'))).toBe(true);
		expect(
			handle
				.getLinkDifferences?.([offsetOf(typed, '[Chorus]'), offsetOf(typed, '[Chorus 2]')])?.[0]
				?.wordings.map((wording) => wording.text)
		).toEqual(['tighter', 'tight']);
		expect(detachedTexts(handle)).toEqual(['er']);

		// The local words and the exception that kept them local are one history
		// event. A half-undo would leave the next edit with the wrong scope.
		handle.undo();
		expect(handle.getSnapshot().text).toBe(SAME);
		expect(handle.getSectionLinks?.()).toEqual(initialLinks);
		expect(onSectionLinksChanged).toHaveBeenCalledTimes(2);
	});

	it('arms the same local edit directly with Mod-Shift-L', async () => {
		const announcements: string[] = [];
		const handle = await mount(SAME, englishLanguagePack, {
			onAnnouncement: (message) => void announcements.push(message)
		});
		handle.linkSections?.({
			headers: [offsetOf(SAME, '[Chorus]'), offsetOf(SAME, '[Chorus 2]')]
		});
		const caret = SAME.indexOf('tight') + 'tight'.length;
		handle.setSelection({ anchor: caret, head: caret });
		handle.focus();

		await userEvent.keyboard('{Control>}{Shift>}l{/Shift}{/Control}');

		expect(document.querySelector('.ll-section-only-status')?.textContent).toBe(
			'Editing this section only'
		);
		await userEvent.keyboard('er');
		const typed = handle.getSnapshot().text;
		expect(typed).toContain('[Chorus]\nHold on tighter');
		expect(typed).toContain('[Chorus 2]\nHold on tight\n');
	});

	it('turns the section mode off without discarding its local words', async () => {
		const announcements: string[] = [];
		const handle = await mount(SAME, englishLanguagePack, {
			onAnnouncement: (message) => void announcements.push(message)
		});
		handle.linkSections?.({
			headers: [offsetOf(SAME, '[Chorus]'), offsetOf(SAME, '[Chorus 2]')]
		});
		const caret = SAME.indexOf('tight') + 'tight'.length;
		handle.setSelection({ anchor: caret, head: caret });
		handle.focus();
		await userEvent.keyboard('{Control>}{Shift>}l{/Shift}{/Control}');
		await userEvent.keyboard('er');
		let text = handle.getSnapshot().text;
		expect(text).toContain('[Chorus 2]\nHold on tight\n');

		await userEvent.keyboard('{Control>}{Shift>}l{/Shift}{/Control}');
		text = handle.getSnapshot().text;
		expect(text.split('Hold on tighter')).toHaveLength(2);
		expect(document.querySelector('.ll-section-only-status')).toBeNull();
		expect(announcements.at(-1)).toContain('turned off');

		// Existing local words stay local. Shared words mirror again once the mode is off.
		const shared = text.indexOf('Never let go') + 'Never let go'.length;
		handle.setSelection({ anchor: shared, head: shared });
		await userEvent.keyboard('!');
		text = handle.getSnapshot().text;
		expect(text.split('Never let go!')).toHaveLength(3);
	});

	// Armed and pressed again, the chord stands down — the other half of the
	// toggle, matching the Escape it already answers to.
	it('cancels an armed press with a second press of the chord', async () => {
		const announcements: string[] = [];
		const handle = await mount(SAME, englishLanguagePack, {
			onAnnouncement: (message) => void announcements.push(message)
		});
		handle.linkSections?.({
			headers: [offsetOf(SAME, '[Chorus]'), offsetOf(SAME, '[Chorus 2]')]
		});
		const caret = SAME.indexOf('tight') + 'tight'.length;
		handle.setSelection({ anchor: caret, head: caret });
		handle.focus();

		await userEvent.keyboard('{Control>}{Shift>}l{/Shift}{/Control}');
		expect(document.querySelector('.ll-section-only-status')).not.toBeNull();

		await userEvent.keyboard('{Control>}{Shift>}l{/Shift}{/Control}');
		expect(document.querySelector('.ll-section-only-status')).toBeNull();
		expect(announcements.at(-1)).toContain('Editing only this section turned off.');

		await userEvent.keyboard('!');
		expect(handle.getSnapshot().text.split('Hold on tight!')).toHaveLength(3);
	});

	it('keeps every edit in the section local until the mode is turned off', async () => {
		const handle = await mount(SAME, englishLanguagePack);
		handle.linkSections?.({
			headers: [offsetOf(SAME, '[Chorus]'), offsetOf(SAME, '[Chorus 2]')]
		});
		const caret = SAME.indexOf('tight') + 'tight'.length;
		handle.setSelection({ anchor: caret, head: caret });
		handle.focus();
		await userEvent.keyboard('{Control>}{Shift>}l{/Shift}{/Control}');

		await userEvent.keyboard('er');
		expect(document.querySelector('.ll-section-only-status')).not.toBeNull();

		// Erased back to nothing, the run is zero width — invisible, and still
		// the caret's own: an insertion here stays in this copy.
		await userEvent.keyboard('{Backspace}{Backspace}');
		expect(handle.getSnapshot().text).toBe(SAME);
		expect(document.querySelector('.ll-section-only-status')).not.toBeNull();

		// One more erases formerly shared text, but the section-wide mode keeps it local.
		await userEvent.keyboard('{Backspace}');
		let text = handle.getSnapshot().text;
		expect(text).toContain('[Chorus]\nHold on tigh\n');
		expect(text).toContain('[Chorus 2]\nHold on tight\n');
		expect(document.querySelector('.ll-section-only-status')).not.toBeNull();

		await userEvent.keyboard('ter');
		text = handle.getSnapshot().text;
		expect(text).toContain('[Chorus]\nHold on tighter');
		expect(text).toContain('[Chorus 2]\nHold on tight\n');
		expect(document.querySelector('.ll-section-only-status')).not.toBeNull();

		// Moving to another line in the chorus does not retire the mode, and only
		// only the newly touched spans are added to the link's stored differences.
		const elsewhere = text.indexOf('Never let go') + 'Never'.length;
		handle.setSelection({ anchor: elsewhere, head: elsewhere });
		await userEvent.keyboard('!');
		text = handle.getSnapshot().text;
		expect(text).toContain('[Chorus]\nHold on tighter\nNever! let go');
		expect(text).toContain('[Chorus 2]\nHold on tight\nNever let go');
		expect(document.querySelector('.ll-section-only-status')).not.toBeNull();
		expect(detachedTexts(handle).join('')).toContain('!');
		// Untouched words resume sharing when the mode ends; the two local edits survive.
		expect(handle.typeOnlyHere?.(offsetOf(text, '[Chorus]'))).toBe(true);
		const hold = text.indexOf('Hold');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: hold, to: hold + 'Hold'.length, insert: 'Stay' }]
		});
		expect(handle.getSnapshot().text).toContain('[Chorus]\nStay on tighter\nNever! let go');
		expect(handle.getSnapshot().text).toContain('[Chorus 2]\nStay on tight\nNever let go');
	});

	it('uses a selection as the words the next local edit replaces', async () => {
		const handle = await mount(SAME);
		const header = offsetOf(SAME, '[Chorus]');
		handle.linkSections?.({ headers: [header, offsetOf(SAME, '[Chorus 2]')] });

		const from = SAME.indexOf('tight');
		handle.setSelection({ anchor: from, head: from + 'tight'.length });
		expect(handle.canTypeOnlyHere?.(header)).toBe(true);
		expect(handle.typeOnlyHere?.(header)).toBe(true);
		handle.focus();
		await userEvent.keyboard('close');

		const typed = handle.getSnapshot().text;
		expect(typed).toContain('[Chorus]\nHold on close');
		expect(typed).toContain('[Chorus 2]\nHold on tight\n');
	});

	it('lets Escape cancel before the next edit', async () => {
		const announcements: string[] = [];
		const handle = await mount(SAME, englishLanguagePack, {
			onAnnouncement: (message) => void announcements.push(message)
		});
		const header = offsetOf(SAME, '[Chorus]');
		handle.linkSections?.({ headers: [header, offsetOf(SAME, '[Chorus 2]')] });
		const caret = SAME.indexOf('tight') + 'tight'.length;
		handle.setSelection({ anchor: caret, head: caret });
		expect(handle.typeOnlyHere?.(header)).toBe(true);
		handle.focus();

		await userEvent.keyboard('{Escape}');
		expect(document.querySelector('.ll-section-only-status')).toBeNull();
		expect(announcements.at(-1)).toBe('Editing only this section turned off.');
		await userEvent.keyboard('!');
		expect(handle.getSnapshot().text.split('Hold on tight!')).toHaveLength(3);
	});

	// A run that is empty in this copy is the one difference the document cannot
	// draw, so the caret standing in it looks exactly like a caret in shared
	// text — and it is precisely where a transcriber goes to write the ad-lib
	// the other copy already has. Refusing the control there reported the
	// opposite of the truth about the only position where the truth is invisible.
	describe('where the peer has words and this copy has none', () => {
		const ADLIB = [
			'[Chorus]',
			'Hold on tight (Yeah)',
			'Never let go',
			'',
			'[Verse 1]',
			'Something about the way',
			'',
			'[Chorus 2]',
			'Hold on tight',
			'Never let go'
		].join('\n');

		/** The caret at the empty run: the end of the plain copy's first line. */
		function emptyRunCaret(text: string): number {
			return text.lastIndexOf('Hold on tight') + 'Hold on tight'.length;
		}

		async function linked(): Promise<EditorHandle> {
			const handle = await mount(ADLIB);
			handle.linkSections?.({
				headers: [offsetOf(ADLIB, '[Chorus]'), offsetOf(ADLIB, '[Chorus 2]')]
			});
			return handle;
		}

		it('offers the control at the empty run rather than hiding it', async () => {
			const handle = await linked();
			const header = offsetOf(ADLIB, '[Chorus 2]');
			const caret = emptyRunCaret(ADLIB);
			handle.setSelection({ anchor: caret, head: caret });

			expect(handle.canTypeOnlyHere?.(header)).toBe(true);
			expect(handle.typeOnlyHere?.(header)).toBe(true);
			expect(handle.isTypeOnlyHere?.(header)).toBe(true);
		});

		it('toggles the whole section without changing an existing empty run', async () => {
			const handle = await linked();
			const caret = emptyRunCaret(ADLIB);
			handle.setSelection({ anchor: caret, head: caret });
			handle.focus();

			await userEvent.keyboard('{Control>}{Shift>}l{/Shift}{/Control}');

			const text = handle.getSnapshot().text;
			expect(text).toBe(ADLIB);
			expect(document.querySelector('.ll-section-only-status')).not.toBeNull();
		});

		it('does not confuse an existing difference with the section-wide mode', async () => {
			const handle = await linked();
			const caret = emptyRunCaret(ADLIB);
			handle.setSelection({ anchor: caret, head: caret });
			expect(document.querySelector('.ll-section-only-status')).toBeNull();
		});

		it('keeps the typed ad-lib in this copy and adds no second difference', async () => {
			const handle = await linked();
			const header = offsetOf(ADLIB, '[Chorus 2]');
			const caret = emptyRunCaret(ADLIB);
			handle.setSelection({ anchor: caret, head: caret });
			expect(handle.typeOnlyHere?.(header)).toBe(true);
			handle.focus();
			expect(document.querySelector('.ll-section-only-status')?.textContent).toBe(
				'Editing this section only'
			);

			await userEvent.keyboard(' (Woo)');

			const typed = handle.getSnapshot().text;
			expect(typed).toContain('[Chorus]\nHold on tight (Yeah)\n');
			expect(typed).toContain('[Chorus 2]\nHold on tight (Woo)\n');
			// The difference was already recorded; typing into it fills the empty
			// side rather than opening a second run beside it.
			const differences = handle.getLinkDifferences?.([
				offsetOf(typed, '[Chorus]'),
				offsetOf(typed, '[Chorus 2]')
			]);
			expect(differences).toHaveLength(1);
			expect(differences?.[0]?.wordings.map((wording) => wording.text).sort()).toEqual([
				'(Woo)',
				'(Yeah)'
			]);
		});

		it('offers the section toggle inside an existing divergent run', async () => {
			const handle = await linked();
			const header = offsetOf(ADLIB, '[Chorus]');
			const caret = ADLIB.indexOf('(Yeah)') + '(Yeah'.length;
			handle.setSelection({ anchor: caret, head: caret });

			expect(handle.canTypeOnlyHere?.(header)).toBe(true);
		});
	});
});

describe('opening Linking from the editor', () => {
	it('uses the related diagnostic occurrence that opened linking as this section', async () => {
		const song = [
			'[Pre-Chorus]',
			'Stay near',
			'[Verse]',
			...Array.from({ length: 23 }, (_, index) => `Verse line ${index + 1}`),
			'[Pre-Chorus 2]',
			'Stay near'
		].join('\n');
		const relatedFrom = offsetOf(song, '[Pre-Chorus 2]');
		const diagnostic: Diagnostic = {
			ruleId: 'section.unlinked-repeat',
			severity: 'suggestion',
			from: 0,
			to: '[Pre-Chorus]'.length,
			message: 'These pre-choruses can stay in sync.',
			explanation: 'Link matching song parts.',
			sourceIds: [],
			relatedRanges: [{ from: relatedFrom, to: relatedFrom + '[Pre-Chorus 2]'.length }]
		};
		const onSectionLinkRequest = vi.fn();
		await mount(
			song,
			englishLanguagePack,
			{ onSectionLinkRequest },
			{
				diagnostics: { revision: 0, items: [diagnostic] }
			}
		);
		const relatedUnderline = document.querySelector<HTMLElement>(
			`[data-ll-diagnostic-anchor="${relatedFrom}:${relatedFrom + '[Pre-Chorus 2]'.length}"]`
		);
		expect(relatedUnderline).not.toBeNull();

		await userEvent.hover(relatedUnderline!);
		await page.getByRole('button', { name: 'Manage linking' }).click();

		expect(onSectionLinkRequest).toHaveBeenCalledWith(
			{
				range: { from: relatedFrom, to: relatedFrom + '[Pre-Chorus 2]'.length },
				prefer: 'above'
			},
			undefined
		);
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it('never opens Linking from hover, focus, or whole-header selection', async () => {
		const onSectionLinkRequest = vi.fn();
		const handle = await mount(SONG, englishLanguagePack, { onSectionLinkRequest });
		const header = offsetOf(SONG, '[Chorus]');
		handle.linkSections?.({ headers: [header, offsetOf(SONG, '[Chorus 2]')] });
		const marker = document.querySelector<HTMLElement>('.ll-section-link-marker')!;
		await userEvent.hover(marker);
		marker.focus();
		handle.setSelection({ anchor: header, head: header + '[Chorus]'.length });
		await new Promise((resolve) => setTimeout(resolve, 600));
		expect(onSectionLinkRequest).not.toHaveBeenCalled();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(handle.getSnapshot().text).toBe(SONG);
	});

	it('names the marker through the shared hint and clears it when the gesture ends', async () => {
		const handle = await mount(SONG);
		const header = offsetOf(SONG, '[Chorus]');
		handle.linkSections?.({ headers: [header, offsetOf(SONG, '[Chorus 2]')] });
		const marker = document.querySelector<HTMLElement>('.ll-section-link-marker')!;
		expect(marker.hasAttribute('title')).toBe(false);
		expect(marker.hasAttribute('aria-keyshortcuts')).toBe(false);

		marker.dispatchEvent(new PointerEvent('pointerenter'));
		expect(shownControlHint()).toMatchObject({ label: 'Manage linking' });
		expect(shownControlHint()?.shortcut).toBeUndefined();
		marker.dispatchEvent(new PointerEvent('pointerleave'));
		await expect.poll(shownControlHint).toBeUndefined();

		marker.focus();
		expect(shownControlHint()?.label).toBe('Manage linking');
		marker.blur();
		await expect.poll(shownControlHint).toBeUndefined();

		marker.dispatchEvent(new PointerEvent('pointerenter'));
		handle.linkSections?.({ headers: [header] });
		await expect.poll(shownControlHint).toBeUndefined();
		expect(marker.isConnected).toBe(false);
	});

	it.each(['click', 'Enter', 'Space'])(
		'toggles local editing with the separate lock %s without opening Linking',
		async (press) => {
			// The previous pointer test may leave the mouse where this fresh marker
			// will mount. Move it away so keyboard assertions have no later hover.
			const elsewhere = document.createElement('button');
			elsewhere.style.cssText = 'position: fixed; right: 0; bottom: 0;';
			elsewhere.textContent = 'Elsewhere';
			document.body.append(elsewhere);
			await userEvent.hover(elsewhere);
			elsewhere.remove();
			const onSectionLinkRequest = vi.fn();
			const handle = await mount(SONG, englishLanguagePack, { onSectionLinkRequest });
			const header = offsetOf(SONG, '[Chorus]');
			handle.linkSections?.({ headers: [header, offsetOf(SONG, '[Chorus 2]')] });
			const marker = document.querySelector<HTMLElement>('.ll-section-local-toggle')!;
			if (press === 'click') {
				await userEvent.click(marker);
			} else {
				marker.focus();
				await userEvent.keyboard(press === 'Enter' ? '{Enter}' : ' ');
			}
			expect(onSectionLinkRequest).not.toHaveBeenCalled();
			expect(handle.isTypeOnlyHere?.(header)).toBe(true);
			expect(marker.getAttribute('aria-pressed')).toBe('true');
			await userEvent.click(marker);
			expect(handle.isTypeOnlyHere?.(header)).toBe(false);
			expect(marker.getAttribute('aria-pressed')).toBe('false');
			expect(handle.getSnapshot().text).toBe(SONG);
			expect(document.querySelector('[role="dialog"]')).toBeNull();
			expect(marker.hasAttribute('aria-haspopup')).toBe(false);
			await expect.poll(shownControlHint).toBeUndefined();
		}
	);

	it.each(['click', 'Enter', 'Space'])(
		'opens the matching section in Linking with marker %s without toggling the lock',
		async (press) => {
			const onSectionLinkRequest = vi.fn();
			const handle = await mount(SONG, englishLanguagePack, { onSectionLinkRequest });
			const first = offsetOf(SONG, '[Chorus]');
			const header = offsetOf(SONG, '[Chorus 2]');
			handle.linkSections?.({ headers: [first, header] });
			const marker = [...document.querySelectorAll<HTMLElement>('.ll-section-link-marker')].at(-1)!;
			if (press === 'click') await userEvent.click(marker);
			else {
				marker.focus();
				await userEvent.keyboard(press === 'Enter' ? '{Enter}' : ' ');
			}
			expect(onSectionLinkRequest).toHaveBeenCalledWith(
				{ range: { from: header, to: header + '[Chorus 2]'.length }, prefer: 'above' },
				expect.objectContaining({ takesFocus: true })
			);
			expect(handle.isTypeOnlyHere?.(first)).toBe(false);
			expect(handle.isTypeOnlyHere?.(header)).toBe(false);
			expect(handle.getSnapshot().text).toBe(SONG);
		}
	);

	it('forwards an explicit request resolved from a lyric caret to its header', async () => {
		const onSectionLinkRequest = vi.fn();
		const handle = await mount(SONG, englishLanguagePack, { onSectionLinkRequest });
		const caret = offsetOf(SONG, 'Hold on tigth');
		const header = offsetOf(SONG, '[Chorus 2]');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();
		expect(onSectionLinkRequest).toHaveBeenCalledWith(
			{
				range: { from: header, to: header + '[Chorus 2]'.length },
				prefer: 'above'
			},
			undefined
		);
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it('uses a chosen populated peer as the replacement source', async () => {
		const handle = await mount(REPEAT);
		const headers = [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')];
		handle.linkSections?.({ headers, keepDifferent: [false], replaceFrom: headers[1] });
		expect(handle.getSnapshot().text.split('And I will be there again')).toHaveLength(3);
		expect(handle.getSnapshot().text).not.toContain('tonight');
	});

	// An aimed command that silently does nothing reads as a broken command, so
	// the one refusal it can make is said out loud.
	it('says why rather than doing nothing in a document without a headed section', async () => {
		const announcements: string[] = [];
		const text = 'A lyric without a header';
		const handle = await mount(text, englishLanguagePack, {
			onAnnouncement: (message: string) => void announcements.push(message)
		});
		const lyric = offsetOf(text, 'lyric');
		handle.setSelection({ anchor: lyric, head: lyric });
		handle.requestSectionLink?.();

		expect(announcements).toEqual([
			'Put the cursor in a section with a header to link it to matching lyrics, or select words you want to change only there.'
		]);
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});
});

describe('what a link survives', () => {
	// Line numbers are only how a link is written down. The live truth is a range
	// over each header line, mapped through every change, and the numbers are read
	// off it at save time — so text inserted above a linked section moves it
	// rather than stranding the link on whatever line took its number.
	it('follows its sections when lines are inserted above them', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.({
			headers: [offsetOf(SONG, '[Chorus]'), offsetOf(SONG, '[Chorus 2]')]
		});
		expect(handle.getSectionLinks?.()[0]?.lines).toEqual([4, 11]);

		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: 0, to: 0, insert: 'A new title\nAnd a blank line follows\n' }]
		});
		expect(handle.getSectionLinks?.()[0]?.lines).toEqual([6, 13]);
	});

	// A difference is a range over the words too, so it moves with them.
	it('moves a difference with the text it describes', async () => {
		const handle = await mount(REPEAT);
		handle.linkSections?.({
			headers: [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')]
		});
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: 0, to: 0, insert: 'A new title\n\n' }]
		});

		const text = handle.getSnapshot().text;
		expect(differenceWordings(handle)).toEqual([['tonight', 'again']]);
		// The mapped shared coordinates must still carry a correction to both copies.
		const shared = text.indexOf('Hold');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: shared, to: shared + 'Hold'.length, insert: 'Stay' }]
		});
		expect(handle.getSnapshot().text.split('Stay on tight')).toHaveLength(3);
		expect(differenceWordings(handle)).toEqual([['tonight', 'again']]);
	});

	// Undo restores the words by reversing changes, and a `StateField` reverses
	// nothing on its own — so this used to bring a deleted section back with its
	// link silently gone, which is a half-reversal and the worst kind.
	it('undo puts the link back along with the words', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.({
			headers: [offsetOf(SONG, '[Chorus]'), offsetOf(SONG, '[Chorus 2]')]
		});
		const linked = handle.getSnapshot().text;
		separateUndoEvent();

		const from = linked.indexOf('[Chorus 2]');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from, to: linked.indexOf('[Chorus 3]'), insert: '' }]
		});
		expect(handle.getSectionLinks?.()).toEqual([]);

		handle.undo();
		expect(handle.getSnapshot().text).toBe(linked);
		expect(handle.getSectionLinks?.()[0]?.lines).toEqual([4, 11]);
	});

	// Undoing a difference that was closed has to bring the difference back, not
	// just the words — a half-reversal that restored `again` while the group still
	// believed the line was shared would overwrite it on the next keystroke.
	it('undo puts a closed difference back along with the words', async () => {
		const handle = await mount(REPEAT);
		handle.linkSections?.({
			headers: [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')]
		});
		separateUndoEvent();
		handle.linkSections?.({
			headers: [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')],
			keepDifferent: [false]
		});
		expect(handle.getSnapshot().text).not.toContain('again');

		handle.undo();
		expect(handle.getSnapshot().text).toBe(REPEAT);
		expect(differenceWordings(handle)).toEqual([['tonight', 'again']]);
		const again = REPEAT.indexOf('again');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: again, to: again + 'again'.length, insert: 'tomorrow' }]
		});
		expect(handle.getSnapshot().text).toContain('there tonight');
		expect(handle.getSnapshot().text).toContain('there tomorrow');
	});

	it('undoing the link itself takes the link off', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.({
			headers: [offsetOf(SONG, '[Chorus]'), offsetOf(SONG, '[Chorus 2]')]
		});
		expect(handle.getSectionLinks?.()[0]?.lines).toEqual([4, 11]);

		handle.undo();
		expect(handle.getSectionLinks?.()).toEqual([]);
	});

	// The honest limit, pinned so it is a decision rather than a surprise: a link
	// describes lines of *this* document, and replacing the document wholesale
	// erases every header line it was written against.
	it('loses its links when the whole document is replaced', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.({
			headers: [offsetOf(SONG, '[Chorus]'), offsetOf(SONG, '[Chorus 2]')]
		});
		const linked = handle.getSnapshot().text;

		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: 0, to: linked.length, insert: '' }]
		});
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: 0, to: 0, insert: linked }]
		});

		expect(handle.getSnapshot().text).toBe(linked);
		expect(handle.getSectionLinks?.()).toEqual([]);
	});

	it('drops a section from its group when the section is deleted', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.({
			headers: [
				offsetOf(SONG, '[Chorus]'),
				offsetOf(SONG, '[Chorus 2]'),
				offsetOf(SONG, '[Chorus 3]')
			]
		});
		const linked = handle.getSnapshot().text;
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: linked.indexOf('[Chorus 3]'), to: linked.indexOf('[Outro]'), insert: '' }]
		});
		expect(handle.getSectionLinks?.()[0]?.lines).toEqual([4, 11]);
	});

	it('leaves everything alone once the link is taken off', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.({
			headers: [offsetOf(SONG, '[Chorus]'), offsetOf(SONG, '[Chorus 2]')]
		});
		handle.linkSections?.({ headers: [offsetOf(handle.getSnapshot().text, '[Chorus]')] });
		expect(handle.getSectionLinks?.()).toEqual([]);

		const unlinked = handle.getSnapshot().text;
		const caret = unlinked.indexOf('Never let go') + 'Never let go'.length;
		handle.focus();
		handle.setSelection({ anchor: caret, head: caret });
		await userEvent.keyboard('!');

		expect(handle.getSnapshot().text.split('Never let go!')).toHaveLength(2);
	});

	// Missing legacy runs are not permission to overwrite bodies that already differ.
	it('preserves differing wording while restoring valid shared passages from an older link', async () => {
		const handle = await mount(SONG);
		handle.setSectionLinks?.([{ lines: [4, 11] }]);
		expect(handle.getSectionLinks?.()[0]?.lines).toEqual([4, 11]);

		const caret = SONG.indexOf('Hold on tight') + 'Hold on tight'.length;
		handle.focus();
		handle.setSelection({ anchor: caret, head: caret });
		await userEvent.keyboard('!');

		const text = handle.getSnapshot().text;
		expect(text).toContain('Hold on tight!');
		expect(text).toContain('Hold on tigth');
		expect(text.split('Hold on tight!')).toHaveLength(2);
		const shared = text.indexOf('Never');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: shared, to: shared + 'Never'.length, insert: 'Always' }]
		});
		expect(handle.getSnapshot().text.split('Always let go')).toHaveLength(3);
		expect(handle.getSnapshot().text).toContain('Hold on tigth');
	});

	it('restores an older whole-body link when the saved copies agree', async () => {
		const handle = await mount(SAME);
		handle.setSectionLinks?.([{ lines: [1, 8] }]);
		const caret = SAME.indexOf('Hold on tight') + 'Hold on tight'.length;
		handle.focus();
		handle.setSelection({ anchor: caret, head: caret });
		await userEvent.keyboard('!');
		expect(handle.getSnapshot().text.split('Hold on tight!')).toHaveLength(3);
	});

	it('restores saved differences and keeps them out of the mirror', async () => {
		const handle = await mount(REPEAT);
		const links = (() => {
			handle.linkSections?.({
				headers: [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')]
			});
			return handle.getSectionLinks?.() ?? [];
		})();
		handle.setSectionLinks?.([]);
		expect(handle.getSectionLinks?.()).toEqual([]);

		handle.setSectionLinks?.(links);
		expect(handle.getSectionLinks?.()).toEqual(links);

		const caret = handle.getSnapshot().text.indexOf('again') + 'again'.length;
		handle.focus();
		handle.setSelection({ anchor: caret, head: caret });
		await userEvent.keyboard('!');

		const text = handle.getSnapshot().text;
		expect(text).toContain('again!');
		expect(text).toContain('there tonight\n');
	});
});

describe('chosen wording for individual link differences', () => {
	it('removes an absent phrase from peers without replacing another intentional difference, and undoes atomically', async () => {
		const text =
			'[Chorus]\nHold on (hey) tonight\nNever let go\n\n[Chorus 2]\nHold on tonight\nNever let go (again)';
		const handle = await mount(text);
		const headers = [0, text.indexOf('[Chorus 2]')];
		const differences = handle.getLinkDifferences!(headers);
		const adlib = differences.findIndex((d) => d.wordings.some((w) => w.text.includes('hey')));
		expect(adlib).toBeGreaterThanOrEqual(0);
		handle.linkSections!({
			headers,
			keepDifferent: differences.map((_, i) => i !== adlib),
			replaceFromByDifference: differences.map((_, i) => (i === adlib ? headers[1] : undefined))
		});
		expect(handle.getSnapshot().text).not.toContain('hey');
		expect(handle.getSnapshot().text).toContain('(again)');
		expect(handle.getSnapshot().text.split('(again)')).toHaveLength(2);
		handle.undo();
		expect(handle.getSnapshot().text).toBe(text);
	});
});
