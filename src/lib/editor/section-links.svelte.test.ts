import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { parseDocument } from '$lib/core/parser.js';
import type { EditorHandle, LanguagePack } from '$lib/core/types.js';
import { germanLanguagePack } from '$lib/languages/de.js';
import { norwegianLanguagePack } from '$lib/languages/no.js';
import { englishLanguagePack } from '$lib/languages/en.js';
import type { EditorDisplayContext, LyricEditorCallbacks } from './contracts.js';
import EditorPane from './EditorPane.svelte';
import { linkOccurrences, linkableHeaderAt, sectionBodyRange } from './section-links.js';

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

describe('linking sections through the editor', () => {
	it('overwrites every target from the source, as one undoable step', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.([
			offsetOf(SONG, '[Chorus]'),
			offsetOf(SONG, '[Chorus 2]'),
			offsetOf(SONG, '[Chorus 3]')
		]);

		const linked = handle.getSnapshot().text;
		// The typo in the second chorus is gone, and the empty third one has words.
		expect(linked).not.toContain('tigth');
		expect(linked.split('Hold on tight')).toHaveLength(4);
		// Nothing else moved.
		expect(linked).toContain('A second thing entirely');
		expect(linked).toContain('Fading now');
		expect(handle.getSectionLinks?.()).toEqual([{ lines: [4, 11, 15] }]);

		// One press, one undo: the whole overwrite comes back off together.
		handle.undo();
		expect(handle.getSnapshot().text).toBe(SONG);
	});

	it('repeats a later edit in every linked section', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.([offsetOf(SONG, '[Chorus]'), offsetOf(SONG, '[Chorus 2]')]);

		// CodeMirror's history groups transactions less than `newGroupDelay` apart,
		// and a test links and types in the same millisecond — so without this the
		// undo below would take the link's own overwrite off with the typing and
		// prove nothing about the mirror.
		await new Promise((resolve) => setTimeout(resolve, 600));

		// Type into the source's second line, the way a user correcting a word does.
		const linked = handle.getSnapshot().text;
		const caret = linked.indexOf('Never let go') + 'Never let go'.length;
		handle.focus();
		handle.setSelection({ anchor: caret, head: caret });
		await userEvent.keyboard(' now');

		const mirrored = handle.getSnapshot().text;
		expect(mirrored.split('Never let go now')).toHaveLength(3);
		// And one undo takes the typing and its mirror off together.
		handle.undo();
		expect(handle.getSnapshot().text).toBe(linked);
	});

	it('leaves everything alone once the link is taken off', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.([offsetOf(SONG, '[Chorus]'), offsetOf(SONG, '[Chorus 2]')]);
		handle.linkSections?.([offsetOf(handle.getSnapshot().text, '[Chorus]')]);
		expect(handle.getSectionLinks?.()).toEqual([]);

		const unlinked = handle.getSnapshot().text;
		const caret = unlinked.indexOf('Never let go') + 'Never let go'.length;
		handle.focus();
		handle.setSelection({ anchor: caret, head: caret });
		await userEvent.keyboard('!');

		const typed = handle.getSnapshot().text;
		expect(typed.split('Never let go!')).toHaveLength(2);
	});

	it('opens the link picker when a linked-section mark is hovered', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.([offsetOf(SONG, '[Chorus]'), offsetOf(SONG, '[Chorus 2]')]);
		const marker = document.querySelector<HTMLElement>('.ll-section-link-marker');
		expect(marker).not.toBeNull();

		await userEvent.hover(marker!);

		await expect.element(page.getByRole('dialog', { name: 'Link this chorus' })).toBeVisible();
		await expect.element(page.getByText('This section · line 4')).toBeVisible();
	});

	// The pointer opens this card by selecting a header whole, which a keyboard
	// user has no equivalent of — so `Mod-Shift-L` is the whole of its way in, and
	// it runs `requestSectionLink`, the same command the handle exposes here.
	it('opens the card on a chorus, with every occurrence numbered and the source named', async () => {
		const announcements: string[] = [];
		const handle = await mount(SONG, englishLanguagePack, {
			onAnnouncement: (message: string) => void announcements.push(message)
		});
		const caret = offsetOf(SONG, 'Hold on tight');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();

		const card = page.getByRole('dialog', { name: 'Link this chorus' });
		await expect.element(card).toBeVisible();
		// Every chorus is listed, numbered chronologically, and the one the card was
		// opened from is named rather than offered.
		await expect.element(page.getByText('This section · line 4')).toBeVisible();
		await expect.element(page.getByRole('checkbox', { name: /Chorus 2/ })).toBeVisible();
		await expect.element(page.getByRole('checkbox', { name: /Chorus 3/ })).toBeVisible();
		await expect.element(page.getByText('Different lyrics · line 11')).toBeVisible();
		await expect.element(page.getByText('Empty · line 15')).toBeVisible();
	});

	// Opened on a group that is already complete there is no linking left to
	// describe — every peer is in, and all the card offers is taking one out — so
	// the note states the standing fact instead of narrating an unavailable action.
	it('states the link rather than describing linking when the group is complete', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.([
			offsetOf(SONG, '[Chorus]'),
			offsetOf(SONG, '[Chorus 2]'),
			offsetOf(SONG, '[Chorus 3]')
		]);
		const caret = handle.getSnapshot().text.indexOf('[Chorus]');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();

		await expect
			.element(page.getByText('These 3 sections are linked. Editing one edits the others.'))
			.toBeVisible();
		await expect.element(page.getByText(/Linking replaces their words/)).not.toBeInTheDocument();
	});

	// Partially linked is still an offer to link, so the sentence about what
	// linking does is the right one — and unticking a row inside a complete group
	// must not swap it back, because the two wrap to different heights.
	it('keeps the note it opened with while rows are ticked', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.([
			offsetOf(SONG, '[Chorus]'),
			offsetOf(SONG, '[Chorus 2]'),
			offsetOf(SONG, '[Chorus 3]')
		]);
		const caret = handle.getSnapshot().text.indexOf('[Chorus]');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();

		const note = page.getByText('These 3 sections are linked. Editing one edits the others.');
		await expect.element(note).toBeVisible();
		await page.getByRole('checkbox', { name: /Chorus 3/ }).click();
		await expect.element(page.getByRole('button', { name: /Link 2 sections/ })).toBeVisible();
		await expect.element(note).toBeVisible();
	});

	// The card hangs from its own bottom edge, so anything that changes its size
	// moves it out from under the pointer that just caused the change. Measured
	// rather than trusted: the failure it replaces looked exactly like working CSS.
	it('does not change size when a row is ticked', async () => {
		const handle = await mount(SONG);
		const caret = offsetOf(SONG, 'Hold on tight');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();

		const card = page.getByRole('dialog', { name: 'Link this chorus' });
		await expect.element(card).toBeVisible();
		const before = (await card.element()).getBoundingClientRect();

		await page.getByRole('checkbox', { name: /Chorus 2/ }).click();
		await expect.element(page.getByRole('button', { name: /Link 2 sections/ })).toBeVisible();
		const after = (await card.element()).getBoundingClientRect();

		expect(after.width).toBe(before.width);
		expect(after.height).toBe(before.height);
		expect(after.top).toBe(before.top);
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
			'Put the cursor in a chorus, pre-chorus, or post-chorus to link it to the others.'
		]);
		await expect
			.element(page.getByRole('dialog', { name: 'Link this chorus' }))
			.not.toBeInTheDocument();
	});

	// Line numbers are only how a link is written down. The live truth is a range
	// over each header line, mapped through every change, and the numbers are read
	// off it at save time — so text inserted above a linked section moves it
	// rather than stranding the link on whatever line took its number.
	it('follows its sections when lines are inserted above them', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.([offsetOf(SONG, '[Chorus]'), offsetOf(SONG, '[Chorus 2]')]);
		expect(handle.getSectionLinks?.()).toEqual([{ lines: [4, 11] }]);

		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: 0, to: 0, insert: 'A new title\nAnd a blank line follows\n' }]
		});
		expect(handle.getSectionLinks?.()).toEqual([{ lines: [6, 13] }]);

		// And the mirror still finds both, which is the half a stale number breaks.
		const caret = handle.getSnapshot().text.indexOf('Hold on tight') + 'Hold on tight'.length;
		handle.focus();
		handle.setSelection({ anchor: caret, head: caret });
		await userEvent.keyboard('!');
		expect(handle.getSnapshot().text.split('Hold on tight!')).toHaveLength(3);
	});

	// Undo restores the words by reversing changes, and a `StateField` reverses
	// nothing on its own — so this used to bring a deleted section back with its
	// link silently gone, which is a half-reversal and the worst kind.
	it('undo puts the link back along with the words', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.([offsetOf(SONG, '[Chorus]'), offsetOf(SONG, '[Chorus 2]')]);
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
		expect(handle.getSectionLinks?.()).toEqual([{ lines: [4, 11] }]);
	});

	it('undoing the link itself takes the link off with the overwrite', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.([offsetOf(SONG, '[Chorus]'), offsetOf(SONG, '[Chorus 2]')]);
		expect(handle.getSectionLinks?.()).toEqual([{ lines: [4, 11] }]);

		handle.undo();
		expect(handle.getSnapshot().text).toBe(SONG);
		expect(handle.getSectionLinks?.()).toEqual([]);
	});

	// The honest limit, pinned so it is a decision rather than a surprise: a link
	// describes lines of *this* document, and replacing the document wholesale
	// erases every header line it was written against. Re-attaching links to
	// re-pasted text would be guessing, which this application does not do.
	it('loses its links when the whole document is replaced', async () => {
		const handle = await mount(SONG);
		handle.linkSections?.([offsetOf(SONG, '[Chorus]'), offsetOf(SONG, '[Chorus 2]')]);
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
		handle.linkSections?.([
			offsetOf(SONG, '[Chorus]'),
			offsetOf(SONG, '[Chorus 2]'),
			offsetOf(SONG, '[Chorus 3]')
		]);
		const linked = handle.getSnapshot().text;
		const from = linked.indexOf('[Chorus 3]');
		const to = linked.indexOf('[Outro]');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from, to, insert: '' }]
		});
		expect(handle.getSectionLinks?.()).toEqual([{ lines: [4, 11] }]);
	});

	it('restores a saved link and mirrors through it', async () => {
		const handle = await mount(SONG);
		handle.setSectionLinks?.([{ lines: [4, 11] }]);
		expect(handle.getSectionLinks?.()).toEqual([{ lines: [4, 11] }]);

		const caret = SONG.indexOf('Hold on tight') + 'Hold on tight'.length;
		handle.focus();
		handle.setSelection({ anchor: caret, head: caret });
		await userEvent.keyboard('!');

		const text = handle.getSnapshot().text;
		expect(text).toContain('Hold on tight!');
		// The second chorus is written from the first, typo and all replaced.
		expect(text).not.toContain('tigth');
		expect(text.split('Hold on tight!')).toHaveLength(3);
	});
});
