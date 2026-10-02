import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { parseDocument } from '#lib/core/parser.js';
import type { EditorHandle, PerformerRecord } from '#lib/core/types.js';
import {
	assignUnknownVoice,
	assignVoiceGroup,
	normalizePerformerKey
} from '#lib/performers/index.js';
import { englishLanguagePack } from '#lib/languages/en.js';
import type { LyricEditorCallbacks } from './contracts.js';
import EditorPane from './EditorPane.svelte';

afterEach(() => {
	vi.useRealTimers();
});

function separateUndoEvent(): void {
	vi.setSystemTime(Date.now() + 600);
}

const performers: PerformerRecord[] = ['Avery', 'Blair', 'Casey'].map((displayName, order) => ({
	id: `performer-${order + 1}`,
	displayName,
	normalizedKey: normalizePerformerKey(displayName),
	aliases: [],
	colorId: `performer-${order + 1}`,
	order
}));

function callbacks(): LyricEditorCallbacks {
	return {
		onSnapshot: vi.fn(),
		onAssignRequest: vi.fn(),
		onSectionHeaderRequest: vi.fn(),
		onDiagnosticActivate: vi.fn(),
		onAnnouncement: vi.fn()
	};
}

async function mount(text: string): Promise<EditorHandle> {
	let handle: EditorHandle | undefined;
	await render(EditorPane, {
		props: {
			initialText: text,
			context: {
				language: englishLanguagePack.tag,
				performers,
				ruleSetVersion: 'audit-linked-legend',
				languagePack: englishLanguagePack
			},
			callbacks: callbacks(),
			onready: (ready: EditorHandle) => {
				handle = ready;
			}
		}
	});
	await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
	await vi.waitFor(() => expect(handle).toBeDefined());
	if (!handle) throw new Error('CodeMirror did not publish its editor handle.');
	return handle;
}

/** The raw legend group that names the style slot wrapping `needle` in section `index`. */
function voiceOf(text: string, index: number, needle: string): string | undefined {
	const parsed = parseDocument(text);
	const section = parsed.sections.filter((candidate) => candidate.header)[index];
	if (!section?.header) return undefined;
	const at = text.indexOf(needle, section.header.to);
	for (const line of section.lines) {
		for (const span of line.styleSpans) {
			if ('unsupported' in span) continue;
			if (span.from <= at && at + needle.length <= span.to) {
				return section.header.legendGroups.find((group) => group.styleSlot === span.slot)?.raw;
			}
		}
	}
	return section.header.legendGroups.find((group) => group.styleSlot === 1)?.raw;
}

function headers(text: string): string[] {
	return text.split('\n').filter((line) => line.startsWith('['));
}

async function linkedSong(song: string): Promise<EditorHandle> {
	const handle = await mount(song);
	const first = song.indexOf('[Chorus');
	const second = song.indexOf('[Chorus', first + 1);
	handle.linkSections?.({ headers: [first, second] });
	expect(handle.getSectionLinks?.()).toHaveLength(1);
	separateUndoEvent();
	return handle;
}

// A linked peer receives a performer edit only whole: its legend matched the
// source's before the edit, every body edit lands in it, and the new legend
// does not hand its own unshared words to a different singer. Otherwise the
// peer is left exactly as it was, and the ordinary mirror stays out too.
describe('linked legend edges', () => {
	it('keeps a peer-only legend group when a shared assignment reaches that peer', async () => {
		const song = [
			'[Chorus]',
			'Hold on tight',
			'Never let go',
			'',
			'[Chorus 2: <b>Casey</b>]',
			'Hold on tight',
			'Never let go <b>(hey)</b>'
		].join('\n');
		const handle = await linkedSong(song);
		const text = handle.getSnapshot().text;
		const from = text.indexOf('Hold on tight');
		const result = assignVoiceGroup({
			revision: handle.getSnapshot().revision,
			text,
			document: parseDocument(text),
			selection: { anchor: from, head: from + 'Hold on tight'.length },
			performerIds: [performers[1]!.id],
			sectionPerformerIds: [performers[0]!.id],
			roster: performers
		});
		if (result.status !== 'applied') throw new Error(result.reason);
		handle.dispatchLinkedPerformer?.(result.edit, from);

		const after = handle.getSnapshot().text;
		// The peer's legend already differed from the source's (its own ad-lib
		// group), so it is left exactly as it was...
		expect(headers(after)).toEqual(['[Chorus: Blair & <i>Avery</i>]', '[Chorus 2: <b>Casey</b>]']);
		expect(after).toContain('Hold on tight\nNever let go <b>(hey)</b>');
		// ...while the source got the assignment.
		expect(voiceOf(after, 0, 'Hold on tight')).toContain('Blair');
	});

	/*
	 * The same wholesale copy would let the source allocate a style slot that
	 * the peer's legend already gives to someone else. Blair's new `<i>` is
	 * chosen from the source's free slots only; mirrored into the peer, it
	 * overwrites the peer's `<i>Casey</i>` group, so the peer's local ad-lib
	 * is silently re-attributed to Blair.
	 */
	it('does not re-attribute a peer ad-lib when the source reuses its style slot', async () => {
		const song = [
			'[Chorus: Avery]',
			'Hold on tight',
			'Never let go',
			'',
			'[Chorus 2: Avery, <i>Casey</i>]',
			'Hold on tight',
			'Never let go <i>(hey)</i>'
		].join('\n');
		const handle = await linkedSong(song);
		const text = handle.getSnapshot().text;
		const from = text.indexOf('tight');
		const result = assignVoiceGroup({
			revision: handle.getSnapshot().revision,
			text,
			document: parseDocument(text),
			selection: { anchor: from, head: from + 'tight'.length },
			performerIds: [performers[1]!.id],
			roster: performers
		});
		if (result.status !== 'applied') throw new Error(result.reason);
		handle.dispatchLinkedPerformer?.(result.edit, from);

		const after = handle.getSnapshot().text;
		// The peer's legend already differed (its own ad-lib group), so it is
		// left exactly as it was.
		expect(headers(after)).toEqual([
			'[Chorus: Avery & <i>Blair</i>]',
			'[Chorus 2: Avery, <i>Casey</i>]'
		]);
		expect(after).toContain('Hold on tight\nNever let go <i>(hey)</i>');
		expect(voiceOf(after, 0, 'tight')).toContain('Blair');
	});

	/*
	 * An unknown voice never edits the header (`assignUnknownVoice`); the
	 * mirror must not touch the peer's legend either, or a peer with its own
	 * named voice loses it just because the source edit named nothing.
	 */
	it('leaves a peer legend alone when the source edit does not touch its own header', async () => {
		const song = [
			'[Chorus]',
			'Hold on tight',
			'Never let go',
			'',
			'[Chorus 2: Casey]',
			'Hold on tight',
			'Never let go'
		].join('\n');
		const handle = await linkedSong(song);
		const text = handle.getSnapshot().text;
		const from = text.indexOf('Never let go');
		const result = assignUnknownVoice({
			revision: handle.getSnapshot().revision,
			text,
			document: parseDocument(text),
			selection: { anchor: from, head: from + 'Never let go'.length }
		});
		if (result.status !== 'applied') throw new Error(result.reason);
		handle.dispatchLinkedPerformer?.(result.edit, from);

		const after = handle.getSnapshot().text;
		expect(headers(after)).toEqual(['[Chorus]', '[Chorus 2: Casey]']);
	});

	/*
	 * An assignment that rebalances the section also wraps its untouched lines
	 * for the section performer. Those wrap edits target wording local to the
	 * source ("Never let go" has no match in the peer's "Never let go again"),
	 * so the peer is not carried whole and must be left exactly as it was.
	 */
	it('keeps the peer lyrics sung by the section performer attributed to them', async () => {
		const song = [
			'[Chorus]',
			'Hold on tight',
			'Never let go',
			'',
			'[Chorus 2]',
			'Hold on tight',
			'Never let go again'
		].join('\n');
		const handle = await linkedSong(song);
		const text = handle.getSnapshot().text;
		const from = text.indexOf('Hold on tight');
		const result = assignVoiceGroup({
			revision: handle.getSnapshot().revision,
			text,
			document: parseDocument(text),
			selection: { anchor: from, head: from + 'Hold on tight'.length },
			performerIds: [performers[1]!.id],
			sectionPerformerIds: [performers[0]!.id],
			roster: performers
		});
		if (result.status !== 'applied') throw new Error(result.reason);
		handle.dispatchLinkedPerformer?.(result.edit, from);

		const after = handle.getSnapshot().text;
		expect(voiceOf(after, 0, 'Hold on tight') ?? '').toContain('Blair');
		expect(voiceOf(after, 0, 'Never let go') ?? '').toContain('Avery');
		expect(headers(after)).toEqual(['[Chorus: Blair & <i>Avery</i>]', '[Chorus 2]']);
		expect(after).toContain('[Chorus 2]\nHold on tight\nNever let go again');
	});

	it('carries a compatible peer whole, and one undo restores both', async () => {
		const song = [
			'[Chorus: Avery]',
			'Hold on tight',
			'Never let go',
			'',
			'[Chorus: Avery]',
			'Hold on tight',
			'Never let go'
		].join('\n');
		const handle = await linkedSong(song);
		const text = handle.getSnapshot().text;
		const from = text.indexOf('tight');
		const result = assignVoiceGroup({
			revision: handle.getSnapshot().revision,
			text,
			document: parseDocument(text),
			selection: { anchor: from, head: from + 'tight'.length },
			performerIds: [performers[1]!.id],
			roster: performers
		});
		if (result.status !== 'applied') throw new Error(result.reason);
		handle.dispatchLinkedPerformer?.(result.edit, from);

		const after = handle.getSnapshot().text;
		const [firstHeader, secondHeader] = headers(after);
		expect(firstHeader).toBeDefined();
		expect(firstHeader).toBe(secondHeader);
		const [firstSection, secondSection] = after.split('\n\n');
		expect(firstSection).toBe(secondSection);

		handle.undo();
		expect(handle.getSnapshot().text).toBe(song);
	});
});
