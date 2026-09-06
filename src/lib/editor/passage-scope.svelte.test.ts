import { fireEvent, waitFor } from '@testing-library/dom';
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { EditorHandle } from '$lib/core/types.js';
import { englishLanguagePack } from '$lib/languages/en.js';
import { shownControlHint } from '$lib/ui/state/control-tooltip.svelte.js';
import EditorPane from './EditorPane.svelte';

const SONG = [
	'[Intro]',
	'Hver sommer drar hun alltid til Italia',
	'Vin-vin-vin, i et badekar, ri-ri',
	'Lever livet hver dag',
	'',
	'[Chorus 1]',
	'Hver sommer drar hun alltid til Italia',
	'På vingård, drikker vin i et badekar',
	'First unique phrase',
	'Lever livet hver dag',
	'',
	'[Chorus 2]',
	'Hver sommer drar hun alltid til Italia',
	'På vingård, drikker vin i et badekar',
	'Second unique phrase',
	'Lever livet hver dag',
	'',
	'[Outro]',
	'Hver sommer drar hun alltid til Italia',
	'Vin-vin-vin, i et badekar, ri-ri',
	'Lever livet hver dag (Oh)'
].join('\n');

async function setup(text = SONG, reducedMotion = false) {
	let handle: EditorHandle | undefined;
	const view = await render(EditorPane, {
		props: {
			initialText: text,
			context: {
				language: 'en',
				languagePack: englishLanguagePack,
				performers: [],
				ruleSetVersion: 'passage-scope-test',
				reducedMotion
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
	await waitFor(() => expect(handle).toBeDefined());
	const headers = handle!
		.getSnapshot()
		.parsed.sections.flatMap((section) => (section.header ? [section.header.from] : []));
	handle!.linkSections?.({ headers });
	await waitFor(() =>
		expect(view.container.querySelectorAll('.ll-section-link-marker')).toHaveLength(4)
	);
	const markers = () => [
		...view.container.querySelectorAll<HTMLButtonElement>('.ll-section-link-marker')
	];
	const caret = (at: number) => handle!.setSelection({ anchor: at, head: at });
	const label = (index: number) =>
		markers()[index]!.parentElement!.querySelector('.ll-section-link-status')!.textContent;
	return { handle: handle!, container: view.container, markers, caret, label, headers };
}

function replace(handle: EditorHandle, from: number, to: number, insert: string) {
	handle.dispatchAtomic({
		baseRevision: handle.getSnapshot().revision,
		edits: [{ from, to, insert }]
	});
}

describe('passage scope in the real editor', () => {
	it('names all recipients, chorus-only recipients, and genuinely local words at the active header', async () => {
		const { handle, caret, label, headers } = await setup();
		caret(SONG.indexOf('sommer') + 2);
		await waitFor(() => expect(label(0)).toBe('Also edits Chorus 1, Chorus 2, and Outro'));
		expect(label(1)).toBe('');
		const chorus = SONG.indexOf('drikker');
		caret(chorus + 3);
		await waitFor(() => expect(label(1)).toBe('Also edits Chorus 2'));
		expect(label(0)).toBe('');
		caret(SONG.indexOf('First') + 2);
		await waitFor(() => expect(label(1)).toBe('Only this section'));
		expect(handle.typeOnlyHere?.(headers[1]!)).toBe(true);
		caret(chorus + 3);
		await waitFor(() => expect(label(1)).toBe('Editing this section only'));
	});

	it('the recipients named for a chorus-only word match the sections actually edited', async () => {
		const { handle, caret, label } = await setup();
		const from = SONG.indexOf('drikker');
		caret(from + 3);
		await waitFor(() => expect(label(1)).toBe('Also edits Chorus 2'));
		replace(handle, from, from + 'drikker'.length, 'smaker');
		const result = handle.getSnapshot().text;
		expect(result.match(/smaker/g)).toHaveLength(2);
		expect(result.match(/Vin-vin-vin, i et badekar, ri-ri/g)).toHaveLength(2);
		expect(result).not.toContain('drikker');
	});

	it('discloses differing typing and deletion scopes at a shared suffix beside local punctuation', async () => {
		const { handle, caret, label, markers } = await setup();
		const at = SONG.indexOf('badekar') + 'badekar'.length;
		caret(at);
		await waitFor(() => expect(label(0)).toBe('Typing also edits Chorus 1, Chorus 2, and Outro'));
		expect(markers()[0]!.getAttribute('aria-label')).toContain(
			'Backspace: Also edits Chorus 1, Chorus 2, and Outro. Delete: Also edits Outro.'
		);
		await fireEvent.pointerEnter(markers()[0]!);
		expect(shownControlHint()?.label).toBe('Manage linking');
		replace(handle, at, at, 's');
		expect(handle.getSnapshot().text.match(/badekars/g)).toHaveLength(4);
		expect(handle.getSnapshot().text.match(/badekars, ri-ri/g)).toHaveLength(2);
	});

	it.each([390, 1280])(
		'keeps lyrics and headings stable through long recipient scope changes at %ipx',
		async (width) => {
			await page.viewport(width, 900);
			try {
				const text = SONG.replace(
					'[Chorus 2]',
					'[Chorus 2 with an exceptionally long section name]'
				).replace('[Outro]', '[Outro with another exceptionally long section name]');
				const { caret, label, markers, container } = await setup(text);
				container.style.width = `${width}px`;
				caret(text.indexOf('drikker') + 3);
				await waitFor(() =>
					expect(label(1)).toContain('Chorus 2 with an exceptionally long section name')
				);
				const lines = [...container.querySelectorAll('.cm-line')];
				const before = lines.map((line) => ({
					top: line.getBoundingClientRect().top,
					height: line.getBoundingClientRect().height
				}));
				caret(text.indexOf('sommer', text.indexOf('[Chorus 1]')) + 2);
				await waitFor(() =>
					expect(label(1)).toContain('Outro with another exceptionally long section name')
				);
				expect(
					lines.map((line) => ({
						top: line.getBoundingClientRect().top,
						height: line.getBoundingClientRect().height
					}))
				).toEqual(before);
				const status =
					markers()[1]!.parentElement!.querySelector<HTMLElement>('.ll-section-link-status')!;
				await waitFor(() =>
					expect(status.getBoundingClientRect().right).toBeLessThanOrEqual(
						container.getBoundingClientRect().right + 1
					)
				);
				expect(markers()[1]!.getAttribute('aria-label')).toContain(
					'Outro with another exceptionally long section name'
				);
			} finally {
				await page.viewport(800, 600);
			}
		}
	);

	it('suppresses scope highlighting under the editor’s reduced-motion context', async () => {
		const { caret, markers, label } = await setup(SONG, true);
		caret(SONG.indexOf('sommer') + 2);
		await waitFor(() => expect(label(0)).toContain('Also edits'));
		const status =
			markers()[0]!.parentElement!.querySelector<HTMLElement>('.ll-section-link-status')!;
		expect(parseFloat(getComputedStyle(status).animationDuration)).toBeLessThanOrEqual(0.00001);
	});
});
