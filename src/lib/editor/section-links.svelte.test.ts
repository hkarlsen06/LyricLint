import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { parseDocument } from '$lib/core/parser.js';
import type { EditorHandle, LanguagePack, PerformerRecord } from '$lib/core/types.js';
import { assignVoiceGroup, normalizePerformerKey } from '$lib/performers/index.js';
import { germanLanguagePack } from '$lib/languages/de.js';
import { norwegianLanguagePack } from '$lib/languages/no.js';
import { englishLanguagePack } from '$lib/languages/en.js';
import ControlTooltip from '$lib/ui/primitives/ControlTooltip.svelte';
import type { EditorDisplayContext, LyricEditorCallbacks } from './contracts.js';
import EditorPane from './EditorPane.svelte';
import {
	linkOccurrences,
	linkTargetAt,
	linkableHeaderAt,
	sectionBodyRange
} from './section-links.js';

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

function context(languagePack: LanguagePack): EditorDisplayContext {
	return {
		language: languagePack.tag,
		performers: [],
		ruleSetVersion: 'section-link-test',
		languagePack
	};
}

async function mount(
	text: string,
	languagePack: LanguagePack = englishLanguagePack,
	overrides: Partial<LyricEditorCallbacks> = {}
): Promise<EditorHandle> {
	let handle: EditorHandle | undefined;
	await render(EditorPane, {
		props: {
			initialText: text,
			context: context(languagePack),
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

describe('what counts as a linkable section', () => {
	const parsed = parseDocument(SONG);

	it('numbers every chorus chronologically and leaves other kinds out', () => {
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
		expect(linkOccurrences(parsed, englishLanguagePack, offsetOf(SONG, '[Verse 1]'))).toEqual([]);
		expect(linkOccurrences(parsed, englishLanguagePack, offsetOf(SONG, '[Outro]'))).toEqual([]);
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

	it('offers itself only for a header selected whole, on one line', () => {
		const header = offsetOf(SONG, '[Chorus]');
		expect(linkableHeaderAt(parsed, englishLanguagePack, header, header + 8)).toEqual({
			from: header,
			to: header + 8
		});
		// Half a header is a word being retyped.
		expect(linkableHeaderAt(parsed, englishLanguagePack, header + 1, header + 4)).toBeUndefined();
		// A selection reaching into the lyrics below it is a passage.
		expect(linkableHeaderAt(parsed, englishLanguagePack, header, header + 20)).toBeUndefined();
		// A verse is never linkable however it is selected.
		const verse = offsetOf(SONG, '[Verse 1]');
		expect(linkableHeaderAt(parsed, englishLanguagePack, verse, verse + 9)).toBeUndefined();
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
		// One difference per copy — `tonight` and `again` — and nothing else.
		expect(links[0]?.holes).toHaveLength(2);
	});

	it('names the difference by the words, not by the line it is on', async () => {
		const handle = await mount(REPEAT);
		const headers = [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')];
		const differences = handle.getLinkDifferences?.(headers) ?? [];
		expect(differences).toHaveLength(1);
		expect(differences[0]?.wordings.map((wording) => wording.text)).toEqual(['tonight', 'again']);
	});

	// The line they share is kept in step, which is the half that makes linking
	// worth having: one correction reaches both copies.
	it('carries a correction made in the shared part of the very line that differs', async () => {
		const handle = await mount(REPEAT);
		handle.linkSections?.({
			headers: [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')]
		});
		await new Promise((resolve) => setTimeout(resolve, 600));

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
		await new Promise((resolve) => setTimeout(resolve, 600));

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
		await new Promise((resolve) => setTimeout(resolve, 600));

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
		expect(handle.getSectionLinks?.()[0]?.holes ?? []).toHaveLength(2);
	});

	// The complement, and the reason the repair is a narrower edit rather than an
	// exemption for performer markup: text both copies share is still carried.
	// The header already names the slot, so this is one change and the mirror
	// sees it — an assignment that also writes a legend group arrives as two
	// ranges and is left alone, which is the mirror's own rule about scattered
	// edits rather than anything about performers.
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
		await new Promise((resolve) => setTimeout(resolve, 600));

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

	// Writing across a difference's edge is how a difference is ended: the run is
	// swallowed in every copy rather than the edit being refused, which would
	// leave the copies quietly out of step.
	it('swallows a difference an edit reached across', async () => {
		const handle = await mount(REPEAT);
		handle.linkSections?.({
			headers: [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')]
		});
		await new Promise((resolve) => setTimeout(resolve, 600));

		// Select `there tonight` — shared text, then the difference — and retype it.
		const text = handle.getSnapshot().text;
		const from = text.indexOf('there tonight');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from, to: from + 'there tonight'.length, insert: 'here tomorrow' }]
		});

		const rewritten = handle.getSnapshot().text;
		expect(rewritten.split('And I will be here tomorrow')).toHaveLength(3);
		expect(rewritten).not.toContain('again');
		// Nothing is left to keep apart.
		expect(handle.getSectionLinks?.()[0]?.holes ?? []).toHaveLength(0);
	});

	it('draws the divergent words in every copy, and nothing else', async () => {
		const handle = await mount(REPEAT);
		handle.linkSections?.({
			headers: [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')]
		});
		await new Promise((resolve) => setTimeout(resolve, 50));

		const marks = [...document.querySelectorAll('.ll-link-divergent')].map(
			(mark) => mark.textContent
		);
		expect(marks).toEqual(['tonight', 'again']);
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

describe('recording a deliberate difference', () => {
	// Selecting the words that differ and pressing the shortcut is the gesture the
	// second list is driven by: the card opens with the selection offered as a
	// difference, ticked, because setting it aside is what the user asked for.
	it('offers a selection as a new difference and keeps it out of the mirror', async () => {
		const handle = await mount(SAME);
		handle.linkSections?.({
			headers: [offsetOf(SAME, '[Chorus]'), offsetOf(SAME, '[Chorus 2]')]
		});
		expect(handle.getSectionLinks?.()[0]?.holes ?? []).toHaveLength(0);

		const tight = SAME.indexOf('tight');
		handle.linkSections?.({
			headers: [offsetOf(SAME, '[Chorus]'), offsetOf(SAME, '[Chorus 2]')],
			keepDifferent: [],
			makeDifferent: { from: tight, to: tight + 'tight'.length }
		});
		expect(handle.getSectionLinks?.()[0]?.holes ?? []).toHaveLength(2);

		await new Promise((resolve) => setTimeout(resolve, 600));
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
	it('applies a multi-part atomic edit locally and undoes its words and exception together', async () => {
		const onSectionLinksChanged = vi.fn();
		const handle = await mount(SAME, englishLanguagePack, { onSectionLinksChanged });
		handle.linkSections?.({
			headers: [offsetOf(SAME, '[Chorus]'), offsetOf(SAME, '[Chorus 2]')]
		});
		onSectionLinksChanged.mockClear();
		await new Promise((resolve) => setTimeout(resolve, 600));

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
		expect(handle.getSectionLinks?.()[0]?.holes ?? []).toHaveLength(2);
		expect(onSectionLinksChanged).toHaveBeenCalledOnce();

		handle.undo();
		expect(handle.getSnapshot().text).toBe(SAME);
		expect(handle.getSectionLinks?.()[0]?.holes ?? []).toHaveLength(0);
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
		onSectionLinksChanged.mockClear();
		await new Promise((resolve) => setTimeout(resolve, 600));

		const caret = SAME.indexOf('tight') + 'tight'.length;
		handle.setSelection({ anchor: caret, head: caret });
		render(ControlTooltip, { props: {} });
		handle.requestSectionLink?.();

		await expect.element(page.getByRole('dialog', { name: 'Link this chorus' })).toBeVisible();
		const typeOnlyHereButton = page.getByRole('button', { name: /Type only here/ });
		await expect.element(typeOnlyHereButton).toBeVisible();
		await expect.element(typeOnlyHereButton).toHaveAttribute('aria-keyshortcuts', 'Control+Alt+H');
		await expect.element(page.getByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
		const typeOnlyElement = typeOnlyHereButton.element();
		const localExplanation = page.getByText(
			'Your next edit at the caret won’t be copied to the other linked sections.'
		);
		const localGroup = typeOnlyElement.closest('.type-only-here-action');
		expect(localGroup?.contains(localExplanation.element())).toBe(true);
		const linkedStatus = page.getByText(
			'These 2 sections are linked: editing one edits the others.'
		);
		const statusRect = linkedStatus.element().getBoundingClientRect();
		const explanationRect = localExplanation.element().getBoundingClientRect();
		const actionRect = typeOnlyElement.getBoundingClientRect();
		expect(explanationRect.top - statusRect.bottom).toBeGreaterThan(
			actionRect.top - explanationRect.bottom
		);
		expect(typeOnlyElement.querySelector('.apply__key')).toBeNull();
		const accentProbe = document.createElement('span');
		accentProbe.style.background = getComputedStyle(typeOnlyElement)
			.getPropertyValue('--color-accent')
			.trim();
		document.body.append(accentProbe);
		expect(getComputedStyle(typeOnlyElement).backgroundColor).toBe(
			getComputedStyle(accentProbe).backgroundColor
		);
		accentProbe.remove();
		typeOnlyElement.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
		await expect
			.poll(() => document.querySelector('.control-tooltip')?.textContent)
			.toContain('Type only here');
		const shortcut = navigator.platform.toLocaleLowerCase().includes('mac') ? '⌃⌥H' : 'Ctrl+Alt+H';
		expect(document.querySelector('.control-tooltip kbd')?.textContent).toBe(shortcut);
		typeOnlyElement.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
		await expect
			.element(
				page.getByText('Your next edit at the caret won’t be copied to the other linked sections.')
			)
			.toBeVisible();

		typeOnlyElement.focus();
		await userEvent.keyboard('{Control>}{Alt>}h{/Alt}{/Control}');
		await expect
			.element(page.getByRole('dialog', { name: 'Link this chorus' }))
			.not.toBeInTheDocument();
		expect(document.querySelector('.ll-type-only-here')?.textContent).toBe('Typing only here');
		expect(announcements.at(-1)).toContain('won’t be copied');

		await userEvent.keyboard('er');
		const typed = handle.getSnapshot().text;
		expect(typed).toContain('[Chorus]\nHold on tighter');
		expect(typed).toContain('[Chorus 2]\nHold on tight\n');
		expect(document.querySelector('.ll-type-only-here')).toBeNull();
		expect(onSectionLinksChanged).toHaveBeenCalledTimes(1);
		expect(
			handle
				.getLinkDifferences?.([offsetOf(typed, '[Chorus]'), offsetOf(typed, '[Chorus 2]')])?.[0]
				?.wordings.map((wording) => wording.text)
		).toEqual(['er', '']);

		// Reopening elsewhere in the group keeps that empty peer wording as the
		// deliberate variation just created. It must not be mistaken for a newly
		// linked empty section and offered for automatic replacement.
		const sharedCaret = typed.indexOf('Never let go') + 'Never'.length;
		handle.setSelection({ anchor: sharedCaret, head: sharedCaret });
		handle.requestSectionLink?.();
		await expect.element(page.getByRole('button', { name: /Type only here/ })).toBeVisible();
		await expect
			.element(page.getByRole('radio', { name: 'Respect differences between them' }))
			.toBeChecked();
		await expect.element(page.getByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
		await userEvent.keyboard('{Escape}');

		// The local words and the exception that kept them local are one history
		// event. A half-undo would leave the next edit with the wrong scope.
		handle.undo();
		expect(handle.getSnapshot().text).toBe(SAME);
		expect(handle.getSectionLinks?.()[0]?.holes ?? []).toHaveLength(0);
		expect(onSectionLinksChanged).toHaveBeenCalledTimes(2);
	});

	it('arms the same local edit directly with Ctrl-Alt-H', async () => {
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

		await userEvent.keyboard('{Control>}{Alt>}h{/Alt}{/Control}');

		expect(document.querySelector('.ll-type-only-here')?.textContent).toBe('Typing only here');
		expect(announcements.at(-1)).toContain('won’t be copied');
		await userEvent.keyboard('er');
		const typed = handle.getSnapshot().text;
		expect(typed).toContain('[Chorus]\nHold on tighter');
		expect(typed).toContain('[Chorus 2]\nHold on tight\n');
	});

	it('uses a selection as the words the next local edit replaces', async () => {
		const handle = await mount(SAME);
		const header = offsetOf(SAME, '[Chorus]');
		handle.linkSections?.({ headers: [header, offsetOf(SAME, '[Chorus 2]')] });
		await new Promise((resolve) => setTimeout(resolve, 600));

		const from = SAME.indexOf('tight');
		handle.setSelection({ anchor: from, head: from + 'tight'.length });
		expect(handle.canTypeOnlyHere?.(header)).toBe(true);
		handle.requestSectionLink?.();
		await expect.element(page.getByRole('button', { name: /Type only here/ })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Leave out/ })).not.toBeInTheDocument();
		await page.getByRole('button', { name: /Type only here/ }).click();
		await userEvent.keyboard('close');

		const typed = handle.getSnapshot().text;
		expect(typed).toContain('[Chorus]\nHold on close');
		expect(typed).toContain('[Chorus 2]\nHold on tight\n');
	});

	// The card advertises `⌃⌥H` and matched on the character, which Option
	// rewrites: on the one platform that tooltip is written for, the shortcut
	// never fired. The physical key is what carries it.
	it('answers its own shortcut on a Mac, where Option rewrites the character', async () => {
		const handle = await mount(SAME);
		const header = offsetOf(SAME, '[Chorus]');
		handle.linkSections?.({ headers: [header, offsetOf(SAME, '[Chorus 2]')] });
		await new Promise((resolve) => setTimeout(resolve, 600));

		const caret = SAME.indexOf('tight') + 'tight'.length;
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();
		await expect.element(page.getByRole('button', { name: /Type only here/ })).toBeVisible();

		document.activeElement?.dispatchEvent(
			new KeyboardEvent('keydown', {
				code: 'KeyH',
				key: '˙',
				ctrlKey: true,
				altKey: true,
				bubbles: true,
				cancelable: true
			})
		);

		await expect
			.element(page.getByRole('dialog', { name: 'Link this chorus' }))
			.not.toBeInTheDocument();
		expect(document.querySelector('.ll-type-only-here')?.textContent).toBe('Typing only here');
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
		expect(document.querySelector('.ll-type-only-here')).toBeNull();
		expect(announcements.at(-1)).toBe('Typing only here cancelled.');
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
			await new Promise((resolve) => setTimeout(resolve, 600));
			return handle;
		}

		it('offers the control at the empty run rather than hiding it', async () => {
			const handle = await linked();
			const header = offsetOf(ADLIB, '[Chorus 2]');
			const caret = emptyRunCaret(ADLIB);
			handle.setSelection({ anchor: caret, head: caret });

			expect(handle.canTypeOnlyHere?.(header)).toBe(true);
			handle.requestSectionLink?.();
			await expect.element(page.getByRole('button', { name: /Type only here/ })).toBeVisible();
			await userEvent.keyboard('{Escape}');
		});

		it('keeps the typed ad-lib in this copy and adds no second difference', async () => {
			const handle = await linked();
			const header = offsetOf(ADLIB, '[Chorus 2]');
			const caret = emptyRunCaret(ADLIB);
			handle.setSelection({ anchor: caret, head: caret });
			expect(handle.typeOnlyHere?.(header)).toBe(true);
			handle.focus();
			expect(document.querySelector('.ll-type-only-here')?.textContent).toBe('Typing only here');

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
				' (Woo)',
				' (Yeah)'
			]);
		});

		it('still refuses the control inside a run this copy draws', async () => {
			const handle = await linked();
			const header = offsetOf(ADLIB, '[Chorus]');
			const caret = ADLIB.indexOf('(Yeah)') + '(Yeah'.length;
			handle.setSelection({ anchor: caret, head: caret });

			expect(handle.canTypeOnlyHere?.(header)).toBe(false);
		});
	});
});

describe('the link card', () => {
	// The marker serves the editor's one hover wait, like the severity underline
	// and the count badge. Opening on the bare `pointerenter` meant a mouse
	// crossing the document dragged a card open behind every linked header it
	// passed over. This runs first in the block deliberately: a real pointer
	// parked on a marker by an earlier test would open one for us.
	it('opens nothing for a pointer that only passes over the mark', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.({
			headers: [offsetOf(SONG, '[Chorus]'), offsetOf(SONG, '[Chorus 2]')]
		});
		const marker = document.querySelector<HTMLElement>('.ll-section-link-marker');
		expect(marker).not.toBeNull();

		marker!.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
		marker!.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it('opens the link picker when a linked-section mark is hovered', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.({
			headers: [offsetOf(SONG, '[Chorus]'), offsetOf(SONG, '[Chorus 2]')]
		});
		const marker = document.querySelector<HTMLElement>('.ll-section-link-marker');
		expect(marker).not.toBeNull();
		const caret = offsetOf(SONG, 'Fading now') + 'Fading'.length;
		handle.setSelection({ anchor: caret, head: caret });
		handle.focus();

		await userEvent.hover(marker!);

		await expect.element(page.getByRole('dialog', { name: 'Link this chorus' })).toBeVisible();
		await expect.element(page.getByText('This section · line 4')).toBeVisible();

		// A card nobody asked for leaves the caret where it was. Taking it blurred
		// the editor — the drawn caret goes with `.cm-focused` — and sent the next
		// keystrokes into checkboxes, where Space toggles link membership.
		expect(document.activeElement?.closest('.cm-content')).not.toBeNull();
		expect(document.querySelector('.apply__key')).toBeNull();

		await userEvent.keyboard('!');

		expect(handle.getSnapshot().text).toContain('Fading! now');
	});

	// `aria-haspopup="dialog"` is a promise about a press, and it used to be kept
	// for arriving instead: Tab reached the marker, the card took the focus,
	// Escape handed it to the editor, and the next Tab was back on the same marker
	// — a document with linked sections could not be traversed at all.
	it('opens on a press rather than on arriving, and gives the focus back', async () => {
		// The real pointer is wherever the last test left it, and a marker drawn
		// under it opens a card for us before this one presses anything.
		const corner = document.createElement('button');
		corner.type = 'button';
		corner.textContent = 'Elsewhere';
		corner.style.cssText = 'position: fixed; right: 0; bottom: 0; z-index: 100;';
		document.body.append(corner);
		await userEvent.hover(corner);
		corner.remove();

		const handle = await mount(SONG);
		handle.linkSections?.({
			headers: [offsetOf(SONG, '[Chorus]'), offsetOf(SONG, '[Chorus 2]')]
		});
		const marker = document.querySelector<HTMLElement>('.ll-section-link-marker');
		expect(marker).not.toBeNull();

		marker!.focus();
		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(document.querySelector('[role="dialog"]')).toBeNull();

		await userEvent.keyboard('{Enter}');

		const card = page.getByRole('dialog', { name: 'Link this chorus' });
		await expect.element(card).toBeVisible();
		expect(card.element().contains(document.activeElement)).toBe(true);
		// It holds the focus, so Enter reaches it and the glyph promising that is on.
		expect(document.querySelector('.apply__key')).not.toBeNull();
		// The document is unchanged: Enter on a control inside `.cm-content` is a
		// press CodeMirror would otherwise spend on a line break.
		expect(handle.getSnapshot().text).toBe(SONG);

		await userEvent.keyboard('{Escape}');

		await expect.element(card).not.toBeInTheDocument();
		expect(document.activeElement).toBe(marker);
	});

	it('lists every occurrence, numbered, with the source named rather than offered', async () => {
		const handle = await mount(SONG);
		const caret = offsetOf(SONG, 'Hold on tight');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();

		await expect.element(page.getByRole('dialog', { name: 'Link this chorus' })).toBeVisible();
		await expect.element(page.getByText('This section · line 4')).toBeVisible();
		await expect.element(page.getByRole('checkbox', { name: /Chorus 2/ })).toBeVisible();
		await expect.element(page.getByRole('checkbox', { name: /Chorus 3/ })).toBeVisible();
		await expect.element(page.getByText('Differs · line 11')).toBeVisible();
		await expect.element(page.getByText('Empty · line 15')).toBeVisible();
	});

	// The card asks one thing at a time. Nothing is said about the words until
	// some copies have been picked, because what they differ on is a question
	// about a set the user has not chosen yet.
	it('says nothing about the words until a peer is ticked', async () => {
		const handle = await mount(REPEAT);
		const caret = offsetOf(REPEAT, 'Hold on tight');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();

		const card = page.getByRole('dialog', { name: 'Link this chorus' });
		await expect.element(card).toBeVisible();
		await expect.element(card.getByText(/They differ in/)).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('radio', { name: 'Respect differences between them' }))
			.not.toBeInTheDocument();
	});

	// A diff: each version on its own line, under the name of the section it
	// belongs to, and shown *in* its own line so the shared halves stack up and
	// the differing run is the only thing that moves.
	it('shows the difference inside the line it sits in', async () => {
		const handle = await mount(REPEAT);
		const caret = offsetOf(REPEAT, 'Hold on tight');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();

		await expect.element(page.getByRole('dialog', { name: 'Link this chorus' })).toBeVisible();
		await page.getByRole('checkbox', { name: /Chorus 2/ }).click();

		// Scoped to the card, because the document behind it holds these words too.
		const card = page.getByRole('dialog', { name: 'Link this chorus' });
		await expect.element(card.getByText('They differ in 1 place')).toBeVisible();
		await expect.element(card.getByText('tonight', { exact: true })).toBeVisible();
		await expect.element(card.getByText('again', { exact: true })).toBeVisible();
		// The run is marked, and the rest of its line is around it as context.
		const runs = [...document.querySelectorAll('.compare__run')].map((run) => run.textContent);
		expect(runs).toEqual(['tonight', 'again']);
		const shared = [...document.querySelectorAll('.compare__shared')].map(
			(part) => part.textContent
		);
		expect(shared.some((part) => part?.includes('be there'))).toBe(true);
	});

	// The caret marking where a copy has nothing is a bar with no text in it, so
	// the words were on an `aria-label` — which a generic `span` does not carry
	// and most assistive technology never announces.
	it('says in text where a copy has nothing, rather than labelling a bar', async () => {
		const handle = await mount(SONG);
		const caret = offsetOf(SONG, 'Hold on tight');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();
		await expect.element(page.getByRole('dialog', { name: 'Link this chorus' })).toBeVisible();

		// Both, so the untyped copy is a difference to respect rather than the one
		// thing the link would fill — which is the state that draws the caret.
		await page.getByRole('checkbox', { name: /Chorus 2/ }).click();
		await page.getByRole('checkbox', { name: /Chorus 3/ }).click();

		const bar = document.querySelector('.compare__run--empty');
		expect(bar).not.toBeNull();
		expect(bar?.getAttribute('aria-label')).toBeNull();
		expect(bar?.getAttribute('aria-hidden')).toBe('true');
		expect(bar?.nextElementSibling?.className).toBe('sr-only');
		expect(bar?.nextElementSibling?.textContent).toBe('nothing here');
	});

	// The decision is a radio pair stating both outcomes, not a tick per
	// difference whose polarity has to be worked out against the list above it.
	it('states both outcomes as sentences, and keeps each version by default', async () => {
		const handle = await mount(REPEAT);
		const caret = offsetOf(REPEAT, 'Hold on tight');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();
		await expect.element(page.getByRole('dialog', { name: 'Link this chorus' })).toBeVisible();
		await page.getByRole('checkbox', { name: /Chorus 2/ }).click();

		const keep = page.getByRole('radio', { name: 'Respect differences between them' });
		await expect.element(keep).toBeChecked();
		await expect
			.element(page.getByRole('radio', { name: /Replace them with another section/ }))
			.not.toBeChecked();

		// Applying the default writes nothing, which is what the default says.
		await page.getByRole('button', { name: /Link 2 sections/ }).click();
		expect(handle.getSnapshot().text).toBe(REPEAT);
	});

	it('fills an empty copy without offering emptiness as a difference to preserve', async () => {
		const handle = await mount(SONG);
		const caret = offsetOf(SONG, 'Hold on tight');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();
		await expect.element(page.getByRole('dialog', { name: 'Link this chorus' })).toBeVisible();
		await page.getByRole('checkbox', { name: /Chorus 3/ }).click();

		await expect
			.element(page.getByRole('radio', { name: 'Respect differences between them' }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole('radio', { name: /Replace them with another section/ }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole('combobox', { name: /Which section/ }))
			.not.toBeInTheDocument();

		await page.getByRole('button', { name: /Link 2 sections/ }).click();
		const filled = handle
			.getSnapshot()
			.parsed.sections.find((section) => section.header?.rawNamePart === 'Chorus 3');
		expect(filled?.lines.map((line) => line.text)).toEqual(['Hold on tight', 'Never let go']);
	});

	// An ad-lib present in one copy and absent from the others is a hole inside a
	// worded body, not an untyped copy asking to be filled. Reading it as a fill
	// forced the ad-lib into every chorus with the respect option never drawn —
	// and where in the line the hole sits decides nothing.
	it('offers to respect an ad-lib hole in a worded copy rather than forcing the fill', async () => {
		const ADLIB = [
			'[Chorus]',
			'Hold on <i>(Yeah)</i> tight',
			'Never let go',
			'',
			'[Chorus 2]',
			'Hold on tight',
			'Never let go'
		].join('\n');
		const handle = await mount(ADLIB);
		const caret = offsetOf(ADLIB, 'Never let go');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();
		await expect.element(page.getByRole('dialog', { name: 'Link this chorus' })).toBeVisible();
		await page.getByRole('checkbox', { name: /Chorus 2/ }).click();

		const keep = page.getByRole('radio', { name: 'Respect differences between them' });
		await expect.element(keep).toBeChecked();

		// Applying the default keeps the ad-lib where it was written and nowhere else.
		await page.getByRole('button', { name: /Link 2 sections/ }).click();
		expect(handle.getSnapshot().text).toBe(ADLIB);
	});

	it('replaces the other copies when that outcome is chosen', async () => {
		const handle = await mount(REPEAT);
		const caret = offsetOf(REPEAT, 'Hold on tight');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();
		await expect.element(page.getByRole('dialog', { name: 'Link this chorus' })).toBeVisible();
		await page.getByRole('checkbox', { name: /Chorus 2/ }).click();

		await page.getByRole('radio', { name: /Replace them with another section/ }).click();
		await page.getByRole('button', { name: /Link 2 sections/ }).click();

		const matched = handle.getSnapshot().text;
		expect(matched.split('And I will be there tonight')).toHaveLength(3);
	});

	// The diff answers "what would happen", not "what is there now". A row that is
	// changing shows the words it loses struck through and the words it gains
	// beside them — the editor's own fix-preview idiom. Colouring the row red said
	// only that something was wrong with it.
	it('shows what each copy would end up with once replacing is chosen', async () => {
		const handle = await mount(REPEAT);
		const caret = offsetOf(REPEAT, 'Hold on tight');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();
		await expect.element(page.getByRole('dialog', { name: 'Link this chorus' })).toBeVisible();
		await page.getByRole('checkbox', { name: /Chorus 2/ }).click();

		// Keeping both, neither row is showing a change.
		expect(document.querySelectorAll('.compare__drop, .compare__add')).toHaveLength(0);

		await page.getByRole('radio', { name: /Replace them with another section/ }).click();
		const words = (selector: string): (string | null)[] =>
			[...document.querySelectorAll(selector)].map((node) => node.textContent);
		expect(words('.compare__drop')).toEqual(['again']);
		expect(words('.compare__add')).toEqual(['tonight']);

		// And naming the other copy turns the diff around rather than leaving it
		// describing an outcome nobody chose.
		await page.getByRole('combobox', { name: /Which section/ }).selectOptions('Chorus 2');
		expect(words('.compare__drop')).toEqual(['tonight']);
		expect(words('.compare__add')).toEqual(['again']);
	});

	// Whose version wins is the user's to pick, not the card's. Hard-wired to the
	// copy the card happened to be opened from, noticing that a *later* chorus has
	// the wording worth keeping meant closing the card and opening it again from
	// the right one.
	it('replaces from whichever copy the dropdown names', async () => {
		const handle = await mount(REPEAT);
		const caret = offsetOf(REPEAT, 'Hold on tight');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();
		await expect.element(page.getByRole('dialog', { name: 'Link this chorus' })).toBeVisible();
		await page.getByRole('checkbox', { name: /Chorus 2/ }).click();

		// Choosing a copy is choosing to replace, so the radio follows the dropdown.
		const choice = page.getByRole('combobox', { name: /Which section/ });
		await expect.element(choice).toBeVisible();
		// Opening a native select is its mousedown default action. The picker keeps
		// mouse presses from refocusing the editor, but must leave this gesture
		// alone or the dropdown looks enabled and never opens.
		const select = choice.element() as HTMLSelectElement;
		expect(
			select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
		).toBe(true);
		await choice.selectOptions('Chorus 2');
		await expect
			.element(page.getByRole('radio', { name: /Replace them with another section/ }))
			.toBeChecked();

		await page.getByRole('button', { name: /Link 2 sections/ }).click();

		// The second chorus's ending won, which is the opposite of the default.
		const matched = handle.getSnapshot().text;
		expect(matched.split('And I will be there again')).toHaveLength(3);
		expect(matched).not.toContain('tonight');
	});

	it('lists identical copies as one replacement version', async () => {
		const repeatedVersions = [
			'[Chorus]',
			'And I will be there tonight',
			'',
			'[Chorus 2]',
			'And I will be there again',
			'',
			'[Chorus 3]',
			'And I will be there tonight'
		].join('\n');
		const handle = await mount(repeatedVersions);
		const caret = offsetOf(repeatedVersions, 'And I will be there tonight');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();

		await page.getByRole('checkbox', { name: /Chorus 2/ }).click();
		await page.getByRole('checkbox', { name: /Chorus 3/ }).click();
		await expect.element(page.getByRole('option', { name: 'Chorus 1 & 3' })).toBeInTheDocument();
		await expect.element(page.getByRole('option', { name: 'Chorus 2' })).toBeInTheDocument();
		expect(document.querySelectorAll('.outcome__select option')).toHaveLength(2);
	});

	// Nothing to decide where there is nothing to decide about: the radio pair is
	// a question about words that differ, so two copies that agree are not asked.
	it('asks nothing about the words when the copies already agree', async () => {
		const handle = await mount(SAME);
		const caret = offsetOf(SAME, 'Hold on tight');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();
		await expect.element(page.getByRole('dialog', { name: 'Link this chorus' })).toBeVisible();
		await page.getByRole('checkbox', { name: /Chorus 2/ }).click();

		await expect.element(page.getByText('These copies say the same thing.')).toBeVisible();
		await expect
			.element(page.getByRole('radio', { name: 'Respect differences between them' }))
			.not.toBeInTheDocument();
	});

	// Opened on a group that is already complete there is no linking left to
	// describe — every peer is in, and all the card offers is taking one out — so
	// the note states the standing fact instead of narrating an unavailable action.
	it('states the link rather than describing linking when the group is complete', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.({
			headers: [
				offsetOf(SONG, '[Chorus]'),
				offsetOf(SONG, '[Chorus 2]'),
				offsetOf(SONG, '[Chorus 3]')
			]
		});
		const caret = handle.getSnapshot().text.indexOf('[Chorus]');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();

		await expect.element(page.getByText(/These 3 sections are linked/)).toBeVisible();
		await expect
			.element(page.getByText('Linked sections stay in step as you edit them.'))
			.not.toBeInTheDocument();
	});

	// Partially linked is still an offer to link, so the sentence about what
	// linking does is the right one — and unticking a row inside a complete group
	// must not swap it back, because the two wrap to different heights.
	it('keeps the note it opened with while rows are ticked', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.({
			headers: [
				offsetOf(SONG, '[Chorus]'),
				offsetOf(SONG, '[Chorus 2]'),
				offsetOf(SONG, '[Chorus 3]')
			]
		});
		const caret = handle.getSnapshot().text.indexOf('[Chorus]');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();

		const note = page.getByText(/These 3 sections are linked/);
		await expect.element(note).toBeVisible();
		await page.getByRole('checkbox', { name: /Chorus 3/ }).click();
		await expect.element(page.getByRole('button', { name: /Link 2 sections/ })).toBeVisible();
		await expect.element(note).toBeVisible();
	});

	// What the old "must not resize" rule was really protecting is the *position*
	// of whatever the pointer is on. The card used to hang from its bottom edge,
	// so the diff appearing on the first tick pushed the very checkboxes being
	// ticked up the screen — and freezing the card's size to stop that is what
	// filled it with decisions about copies nobody had picked. Pinned at the top
	// it grows downwards instead, into space the user is not pointing at.
	// Measured rather than trusted: the failure it replaces looked like working CSS.
	it('does not move when a row is ticked, however much it grows', async () => {
		const handle = await mount(REPEAT);
		const caret = offsetOf(REPEAT, 'Hold on tight');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();

		const card = page.getByRole('dialog', { name: 'Link this chorus' });
		await expect.element(card).toBeVisible();
		const rowBefore = (
			await page.getByRole('checkbox', { name: /Chorus 2/ }).element()
		).getBoundingClientRect();
		const before = (await card.element()).getBoundingClientRect();

		await page.getByRole('checkbox', { name: /Chorus 2/ }).click();
		await expect.element(page.getByText('They differ in 1 place')).toBeVisible();
		const after = (await card.element()).getBoundingClientRect();
		const rowAfter = (
			await page.getByRole('checkbox', { name: /Chorus 2/ }).element()
		).getBoundingClientRect();

		expect(after.width).toBe(before.width);
		expect(after.top).toBe(before.top);
		// The row the pointer is on has not moved, which is the whole point.
		expect(rowAfter.top).toBe(rowBefore.top);
		// And it did grow, or this would be pinning nothing.
		expect(after.height).toBeGreaterThan(before.height);
	});

	// An aimed command that silently does nothing reads as a broken command, so
	// the one refusal it can make is said out loud.
	it('says why rather than doing nothing on a section that cannot be linked', async () => {
		const announcements: string[] = [];
		const handle = await mount(SONG, englishLanguagePack, {
			onAnnouncement: (message: string) => void announcements.push(message)
		});
		const verse = offsetOf(SONG, 'A second thing');
		handle.setSelection({ anchor: verse, head: verse });
		handle.requestSectionLink?.();

		expect(announcements).toEqual([
			'Put the cursor in a chorus, pre-chorus, or post-chorus to link it to the others, or select words you want to change only there.'
		]);
		await expect
			.element(page.getByRole('dialog', { name: 'Link this chorus' }))
			.not.toBeInTheDocument();
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
		const holes = handle.getSectionLinks?.()[0]?.holes ?? [];
		expect(holes).toHaveLength(2);
		// Still sitting on the two words it was written for.
		const lines = text.split('\n');
		expect(lines[(holes[0]?.line ?? 1) - 1]?.slice(holes[0]?.column)).toBe('tonight');
		expect(lines[(holes[1]?.line ?? 1) - 1]?.slice(holes[1]?.column)).toBe('again');
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
		await new Promise((resolve) => setTimeout(resolve, 600));

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
		await new Promise((resolve) => setTimeout(resolve, 600));
		handle.linkSections?.({
			headers: [offsetOf(REPEAT, '[Chorus]'), offsetOf(REPEAT, '[Chorus 2]')],
			keepDifferent: [false]
		});
		expect(handle.getSnapshot().text).not.toContain('again');

		handle.undo();
		expect(handle.getSnapshot().text).toBe(REPEAT);
		expect(handle.getSectionLinks?.()[0]?.holes ?? []).toHaveLength(2);
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

	// A draft written before differences existed carries no runs, and its copies
	// were kept identical by the code that wrote it — so the whole body is shared
	// and the mirror behaves exactly as it used to.
	it('restores a saved link with no differences and mirrors the whole body', async () => {
		const handle = await mount(SONG);
		handle.setSectionLinks?.([{ lines: [4, 11] }]);
		expect(handle.getSectionLinks?.()[0]?.lines).toEqual([4, 11]);

		const caret = SONG.indexOf('Hold on tight') + 'Hold on tight'.length;
		handle.focus();
		handle.setSelection({ anchor: caret, head: caret });
		await userEvent.keyboard('!');

		const text = handle.getSnapshot().text;
		expect(text).toContain('Hold on tight!');
		expect(text).not.toContain('tigth');
		expect(text.split('Hold on tight!')).toHaveLength(3);
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

		await new Promise((resolve) => setTimeout(resolve, 600));
		const caret = handle.getSnapshot().text.indexOf('again') + 'again'.length;
		handle.focus();
		handle.setSelection({ anchor: caret, head: caret });
		await userEvent.keyboard('!');

		const text = handle.getSnapshot().text;
		expect(text).toContain('again!');
		expect(text).toContain('there tonight\n');
	});
});
