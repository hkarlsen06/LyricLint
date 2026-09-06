import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { EditorHandle, SectionLink } from '$lib/core/types.js';
import { norwegianLanguagePack } from '$lib/languages/no.js';
import { copySectionLinks } from '$lib/persistence/copy.js';
import EditorPane from './EditorPane.svelte';

const SONG = `[Intro: Mein]
Hver sommer drar hun alltid til Italia
Også videre til Frankrike og Frankrike og Spania
Vin-vin-vin, i et badekar, ri-ri
Jeg hitta en J, jeg røyker Marrokan-Marrokan—
Beat-beat-beat, er detlandeplage
Jeg kan gi deg melodi, jeg kan gi deg bars
Kommer aldri til å falle av, samme hva
Lever livet hver dag, ja, det er sammendrag

[Vers 1: Mul]
Kommer aldri til å falle av, samme hva
Må vanligvis bli bedt om å slappe av
Jeg er i Oslo, jobber hele tiden, hele da'n
Ellers sjeldent på bar Kristiania
Er i byen, jeg har tenning, ja, jeg liker fart og spenning
Har en plan, jeg skal bli fakked up
Ayy, Coca Cola-flaske, Henny
Denne kvelden tar en vending
Kutter cola med mitt bankkort

[Refreng: Mein]
Hver sommer drar hun alltid til Italia
Også videre til Frankrike og Spania
På vingård, drikker vin i et badekar
FaceTime, jeg hitta en J, røyker marokkansk
Hver gang jeg går på beat er det landeplage
Jeg kan gi deg melodi, jeg kan gi deg bars
Kommer aldri til å falle av, samme hva
Lever livet hver dag, ja, det er sammendrag

[Vers 2: KrissyB]
Baby, baby, baby, ah (Baby girl)
Gjør greie med baby (Baby girl)
Det er Kriss, jeg er ready, jeg er steady, jeg er klar for å hente no' hoes i Mercedes
Vroom, vroom, vroom, vi er i bilen
Vi er klar for å hente noen ting, det var dealen
Jeg gjør hva jeg vil, jeg har mine reasons
Drar til Paris med en chick i en weekend

[Refreng: Mein]
Hver sommer drar hun alltid til Italia
Også videre til Frankrike og Spania
På vingård, drikker vin i et badekar
FaceTime, jeg hitta en J, røyker marokkansk
Hver gang jeg går på beat er det landeplage
Jeg kan gi deg melodi, jeg kan gi deg bars
Kommer aldri til å falle av, samme hva
Lever livet hver dag, ja, det er sammendrag

[Outro: Mein]
Hver sommer drar hun alltid til Italia
Også videre til Frankrike og Frankrike og Spania
Vin-vin-vin, i et badekar, ri-ri
Jeg hitta en J, jeg røyker Marrokan-Marrokan—
Beat-beat-beat, er detlandeplage
Jeg kan gi deg melodi, jeg kan gi deg bars
Kommer aldri til å falle av, samme hva
Lever livet hver dag, ja, det er sammendrag (Sammendrag)`;

function headers(text: string): number[] {
	return [...text.matchAll(/^\[(?:Intro|Refreng|Outro): Mein\]/gm)].map((match) => match.index);
}

function occurrence(text: string, word: string, index: number): number {
	const positions = [...text.matchAll(new RegExp(word, 'g'))].map((match) => match.index);
	const found = positions[index];
	if (found === undefined) throw new Error(`Missing occurrence ${index} of ${word}`);
	return found;
}

async function mount(text = SONG, links?: SectionLink[]) {
	let handle: EditorHandle | undefined;
	const view = render(EditorPane, {
		props: {
			initialText: text,
			context: {
				language: 'no',
				languagePack: norwegianLanguagePack,
				performers: [],
				ruleSetVersion: 'passage-test'
			},
			callbacks: {
				onSnapshot: vi.fn(),
				onAssignRequest: vi.fn(),
				onSectionHeaderRequest: vi.fn(),
				onDiagnosticActivate: vi.fn(),
				onAnnouncement: vi.fn()
			},
			onready: (ready: EditorHandle) => {
				handle = ready;
			}
		}
	});
	await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
	if (!handle) throw new Error('Editor did not mount');
	if (links) handle.setSectionLinks?.(links);
	return { handle, unmount: () => view.unmount() };
}

function edit(handle: EditorHandle, from: number, to: number, insert: string) {
	handle.dispatchAtomic({
		baseRevision: handle.getSnapshot().revision,
		edits: [{ from, to, insert }]
	});
}

function linkAll(handle: EditorHandle) {
	handle.linkSections?.({ headers: headers(handle.getSnapshot().text) });
	expect(handle.getSnapshot().text).toBe(SONG);
}

describe('shared passages in the reported Norwegian song', () => {
	it.each([0, 1, 2, 3])(
		'updates badekar from occurrence %i across punctuation and differing lines',
		async (source) => {
			const { handle } = await mount();
			linkAll(handle);
			const from = occurrence(SONG, 'badekar', source);
			edit(handle, from, from + 7, 'badeker');
			expect(handle.getSnapshot().text).toBe(SONG.replaceAll('badekar', 'badeker'));
			handle.undo();
			expect(handle.getSnapshot().text).toBe(SONG);
			handle.redo();
			expect(handle.getSnapshot().text).toBe(SONG.replaceAll('badekar', 'badeker'));
		}
	);

	it.each([0, 1, 2, 3])(
		'keeps typing at the right edge connected from occurrence %i',
		async (source) => {
			const { handle } = await mount();
			linkAll(handle);
			const position = occurrence(SONG, 'badekar', source) + 7;
			handle.setSelection({ anchor: position, head: position });
			handle.focus();
			await userEvent.keyboard('et');
			expect(handle.getSnapshot().text).toBe(SONG.replaceAll('badekar', 'badekaret'));
		}
	);

	it('keeps chorus-only passages linked despite the Intro and Outro differences between shared lines', async () => {
		const { handle } = await mount();
		linkAll(handle);
		const from = SONG.indexOf('På vingård');
		edit(handle, from, from + 'På vingård'.length, 'På en vingård');
		expect(handle.getSnapshot().text).toBe(SONG.replaceAll('På vingård', 'På en vingård'));
	});

	it('keeps the other three copies connected after a deliberate local correction', async () => {
		const { handle } = await mount();
		linkAll(handle);
		expect(handle.typeOnlyHere?.(0)).toBe(true);
		const local = occurrence(SONG, 'badekar', 0);
		edit(handle, local, local + 7, 'bassenget');
		expect(handle.typeOnlyHere?.(0)).toBe(true);
		const before = handle.getSnapshot().text;
		const from = occurrence(before, 'badekar', 0);
		edit(handle, from, from + 7, 'badekaret');
		expect(handle.getSnapshot().text).toBe(before.replaceAll('badekar', 'badekaret'));
		expect(handle.getSnapshot().text).toContain('Vin-vin-vin, i et bassenget, ri-ri');
	});

	it('survives a real editor remount after deleting a word and then typing into its stored empty connection', async () => {
		const first = await mount();
		linkAll(first.handle);
		const from = occurrence(SONG, 'badekar', 1);
		edit(first.handle, from, from + 7, '');
		const savedText = first.handle.getSnapshot().text;
		expect(savedText).toBe(SONG.replaceAll('badekar', ''));
		const links = copySectionLinks(first.handle.getSectionLinks?.() ?? []);
		expect(
			links[0]?.passages?.filter((passage) =>
				passage.members.every(
					(member) => member.line === member.endLine && member.column === member.endColumn
				)
			)
		).toHaveLength(1);
		await first.unmount();
		const { handle } = await mount(savedText, links);
		const position = savedText.indexOf('i et ,') + 'i et '.length;
		edit(handle, position, position, 'badekar');
		expect(handle.getSnapshot().text).toBe(SONG);
	});

	it('refreshes a legacy saved group through the public editor action without rewriting the song', async () => {
		const { handle } = await mount();
		linkAll(handle);
		const legacy = (handle.getSectionLinks?.() ?? []).map(({ lines, holes }) => ({ lines, holes }));
		handle.setSectionLinks?.(legacy);
		expect(handle.getSectionLinks?.()[0]?.passages).toEqual([]);
		handle.linkSections?.({ headers: headers(SONG), refreshConnections: true });
		expect(handle.getSnapshot().text).toBe(SONG);
		const from = occurrence(SONG, 'badekar', 1);
		edit(handle, from, from + 7, 'badekaret');
		expect(handle.getSnapshot().text).toBe(SONG.replaceAll('badekar', 'badekaret'));
	});

	it('preserves a chorus connection when Intro and Outro join an existing group', async () => {
		const { handle } = await mount();
		const all = headers(SONG);
		handle.linkSections?.({ headers: all.slice(1, 3) });
		const from = occurrence(SONG, 'badekar', 1);
		edit(handle, from, from + 7, 'badekaret');
		const before = handle.getSnapshot().text;
		handle.linkSections?.({ headers: headers(before) });
		const changed = occurrence(before, 'badekaret', 0);
		edit(handle, changed, changed + 9, 'badekarene');
		expect(handle.getSnapshot().text).toBe(before.replaceAll('badekaret', 'badekarene'));
	});
});
