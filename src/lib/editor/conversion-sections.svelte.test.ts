import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';
import { cdp, page } from 'vitest/browser';
import { createLyricEditor, type LyricEditorInstance } from './create-editor.js';

const editors: LyricEditorInstance[] = [];
afterEach(async () => {
	await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: false });
	await page.viewport(800, 600);
	for (const editor of editors.splice(0)) {
		const host = editor.view.dom.parentElement;
		editor.destroy();
		host?.remove();
	}
});

function mount(text: string, width: number, switchToMusixmatch = true) {
	const host = document.createElement('div');
	host.style.width = `${width}px`;
	document.body.append(host);
	const request = vi.fn();
	const requestLink = vi.fn();
	const editor = createLyricEditor(host, {
		initialText: text,
		sectionGhosts: false,
		context: { language: 'en', performers: [], ruleSetVersion: 'test' },
		callbacks: {
			onSnapshot: vi.fn(),
			onAssignRequest: vi.fn(),
			onSectionHeaderRequest: vi.fn(),
			onDiagnosticActivate: vi.fn(),
			onAnnouncement: vi.fn(),
			onSectionDetailRequest: request,
			onSectionLinkRequest: requestLink
		}
	});
	editors.push(editor);
	if (switchToMusixmatch) editor.handle.switchProfile!('musixmatch');
	return { ...editor, request, requestLink, host };
}

describe('retained section boundaries', () => {
	it.each([false, true])(
		'sets a retained heading at lyric row height, its number level with it (coarse pointer: %s)',
		async (coarse) => {
			await cdp().send('Emulation.setTouchEmulationEnabled', {
				enabled: coarse,
				maxTouchPoints: 1
			});
			const { view } = mount('Moon rises\n\n[Chorus: Frikk]\nStars fall', 800, false);
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			);
			const row = (lineNumber: number) => {
				const at = view.domAtPos(view.state.doc.line(lineNumber).from).node;
				return (at instanceof HTMLElement ? at : at.parentElement)!.closest('.cm-line')!;
			};
			// How far each row's number sits below its own text's top edge.
			const numberOffset = (lineNumber: number) => {
				const number = [...view.dom.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].find(
					(element) => element.textContent === String(lineNumber)
				)!;
				const range = document.createRange();
				range.selectNodeContents(number);
				const line = view.state.doc.line(lineNumber);
				return range.getBoundingClientRect().top - view.coordsAtPos(line.from + 1)!.top;
			};
			expect(row(3).classList.contains('ll-conversion-heading')).toBe(true);
			expect(row(3).getBoundingClientRect().height).toBe(row(4).getBoundingClientRect().height);
			// Line 1 holds the caret, whose number is drawn differently, so line 4 is the reference.
			expect(Math.abs(numberOffset(3) - numberOffset(4))).toBeLessThanOrEqual(1);
		}
	);

	it('replaces a retained Genius draft with shorter lyrics before projection ranges are refreshed', () => {
		const { handle, view } = mount(
			`[Verse]\n${'Moon rises\n'.repeat(10)}[Chorus]\nStars fall`,
			360
		);
		handle.switchProfile!('genius');
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: '[Verse]\nFresh words' }
		});
		expect(handle.getSnapshot().text).toBe('[Verse]\nFresh words');
		expect(handle.getSnapshot().conversionRecovery).toBeUndefined();
	});

	it.each(['genius', 'musixmatch'] as const)(
		'keeps literal headers at lyric height when authored in %s',
		async (profile) => {
			const text =
				profile === 'genius'
					? '[]\nMoon rises\n\n[ ]\nStars fall\n\n[: Mira]\nMorning comes\n\n[Verse]\nSun shines'
					: '[Verse]\nMoon rises\n\n[Chorus]\nStars fall';
			const { handle, view } = mount(
				profile === 'genius' ? text : '',
				360,
				profile === 'musixmatch'
			);
			if (profile === 'musixmatch') view.dispatch({ changes: { from: 0, insert: text } });
			const frame = () =>
				new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
				);
			const positions = () =>
				['Moon rises', 'Stars fall'].map(
					(lyric) => view.coordsAtPos(view.state.doc.toString().indexOf(lyric))!.top
				);
			await frame();
			const original = positions();
			for (const target of profile === 'genius'
				? (['musixmatch', 'genius'] as const)
				: (['genius', 'musixmatch'] as const)) {
				handle.switchProfile!(target);
				await frame();
				expect(positions()).toEqual(original);
				expect(view.dom.querySelectorAll('.ll-conversion-heading')).toHaveLength(
					target === 'genius' && profile === 'genius' ? 1 : 0
				);
			}
			expect(handle.getSnapshot().text).toBe(text);
		}
	);

	it.each([360, 1280])(
		'keeps each Musixmatch section control at the pointer floor at %ipx',
		async (width) => {
			await page.viewport(width, 900);
			await cdp().send('Emulation.setTouchEmulationEnabled', {
				enabled: width < 500,
				maxTouchPoints: 1
			});
			const { view } = mount(
				'[Verse 1]\nMoon rises\n\n[Chorus]\n[Post-Chorus]\nStars fall\n\n' +
					'[A very long explicitly retained section label that wraps on narrow screens]\nMorning comes',
				width
			);
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			);
			const buttons = view.dom.querySelectorAll('.ll-conversion-section');
			expect(buttons).toHaveLength(4);
			for (const button of buttons) {
				expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(
					matchMedia('(pointer: coarse)').matches ? 44 : 24
				);
			}
		}
	);

	it('keeps the lyric column fixed when hiding headings takes a long song below 100 lines', async () => {
		const text = Array.from(
			{ length: 10 },
			(_, section) =>
				`[Verse ${section + 1}]\n${Array.from({ length: 9 }, (_, line) => `Passage ${section} line ${line}`).join('\n')}`
		).join('\n\n');
		const { handle, view } = mount(text, 360, false);
		const frame = () =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			);
		await frame();
		const original = view.contentDOM.getBoundingClientRect().left;
		handle.switchProfile!('musixmatch');
		await frame();
		expect(Math.abs(view.contentDOM.getBoundingClientRect().left - original)).toBeLessThanOrEqual(
			1
		);
	});

	it('keeps a displaced hidden section out of the authored word and routes review through metadata', () => {
		const { handle, view } = mount('[Verse]\nOne\n[Chorus]\nTwo', 360);
		const id = handle.getSnapshot().conversion!.model.sections[1]!.id;
		view.dispatch({ changes: { from: 1, to: 5, insert: 'by' } });
		expect(handle.getSnapshot().text).toBe('Obywo');
		expect(view.dom.querySelector(`[data-section-id="${id}"]`)).toBeNull();
		expect(handle.getSnapshot().conversion!.model.sections[1]!.id).toBe(id);
	});
	it('shows local editing beside the retained boundary and clears the view-only cue on Escape and unlink', () => {
		const { handle, view } = mount('[Verse]\nMoon rises\n\n[Chorus]\nMoon rises', 360);
		const sections = handle.getSnapshot().conversion!.model.sections.map((section) => section.id);
		expect(
			handle.dispatchConversionAction!(
				{ kind: 'linkSections', sectionIds: sections },
				handle.getSnapshot().revision
			)
		).toEqual({ ok: true });
		const model = handle.getSnapshot().conversion!.model;
		expect(handle.toggleConversionSectionLocal!(sections[0]!)).toBe(true);
		const button = view.dom.querySelector<HTMLButtonElement>('[data-local-editing]')!;
		expect(button.textContent).toContain('Editing only here');
		expect(button.getAttribute('aria-label')).toContain('editing only here');
		expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(
			view.dom.getBoundingClientRect().right + 1
		);
		expect(handle.getSnapshot().conversion!.model).toBe(model);
		fireEvent.keyDown(view.contentDOM, { key: 'Escape' });
		expect(view.dom.querySelector('[data-local-editing]')).toBeNull();
		expect(handle.toggleConversionSectionLocal!(sections[0]!)).toBe(true);
		expect(
			handle.dispatchConversionAction!(
				{ kind: 'unlinkSection', sectionId: sections[0]! },
				handle.getSnapshot().revision
			)
		).toEqual({ ok: true });
		expect(view.dom.querySelector('[data-local-editing]')).toBeNull();
		expect(handle.getSnapshot().text).toBe('Moon rises\n\nMoon rises');
	});

	it('applies an assistant only-here operation to one Musixmatch member and resumes mirroring untouched words', () => {
		const { handle } = mount('[Verse]\nMoon rises\n\n[Chorus]\nMoon rises', 960);
		const sections = handle.getSnapshot().conversion!.model.sections.map((section) => section.id);
		handle.dispatchConversionAction!(
			{ kind: 'linkSections', sectionIds: sections },
			handle.getSnapshot().revision
		);
		handle.dispatchAtomicOnlyHere!(
			{ baseRevision: handle.getSnapshot().revision, edits: [{ from: 0, to: 4, insert: 'Stars' }] },
			{ from: 0, to: 4 }
		);
		expect(handle.getSnapshot().conversionRecovery).toBeUndefined();
		expect(handle.getSnapshot().text).toBe('Stars rises\n\nMoon rises');
		const state = handle.getSnapshot();
		const at = state.text.lastIndexOf('rises');
		handle.dispatchAtomic({
			baseRevision: state.revision,
			edits: [{ from: at, to: at + 5, insert: 'shine' }]
		});
		expect(handle.getSnapshot().text).toBe('Stars shine\n\nMoon shine');
		expect(() =>
			handle.dispatchAtomicOnlyHere!(
				{ baseRevision: handle.getSnapshot().revision, edits: [{ from: 0, to: 5, insert: 'Sun' }] },
				{ from: 0, to: 2 }
			)
		).toThrow();
		expect(handle.getSnapshot().text).toBe('Stars shine\n\nMoon shine');
	});

	it('opens Linking from a Musixmatch lyric selection without requiring a Genius header', () => {
		const { handle, view, requestLink } = mount('[Verse]\nMoon rises', 960);
		view.dispatch({ selection: { anchor: 2, head: 5 } });
		handle.requestSectionLink!();
		expect(requestLink).toHaveBeenCalledWith(
			{ range: { from: 2, to: 5 }, selection: { from: 2, to: 5 }, prefer: 'above' },
			undefined
		);
		expect(handle.getSnapshot().text).toBe('Moon rises');
	});
	it('makes coincident empty sections individually reachable without adding copied lyrics', () => {
		const { handle, view, request } = mount('[Verse]\n[Chorus]\n[Outro]', 960);
		const buttons = [...view.dom.querySelectorAll<HTMLButtonElement>('.ll-conversion-section')];
		expect(buttons).toHaveLength(3);
		expect(buttons.map((button) => button.textContent)).toEqual([
			'Verse · Empty section',
			'Chorus · Empty section',
			'Outro · Empty section'
		]);
		const model = handle.getSnapshot().conversion!.model;
		fireEvent.click(buttons[1]!);
		expect(request).toHaveBeenCalledWith(model.sections[1]!.id);
		expect(handle.getSnapshot().text).toBe('');
		fireEvent.keyDown(buttons[2]!, { key: 'Enter' });
		expect(request).toHaveBeenLastCalledWith(model.sections[2]!.id);
		fireEvent.keyDown(buttons[0]!, { key: ' ' });
		expect(request).toHaveBeenLastCalledWith(model.sections[0]!.id);
		expect(handle.getSnapshot().conversion!.model).toBe(model);
	});

	it.each([360, 960])(
		'keeps long section controls inside a %ipx editor and retains lyric geometry on activation',
		(width) => {
			const label =
				'A very long explicitly retained section label that remains readable on a narrow phone viewport';
			const { handle, view, request } = mount(
				`[${label}]\nMoon rises\n[Chorus]\nStars fall`,
				width
			);
			const button = view.dom.querySelector<HTMLButtonElement>('.ll-conversion-section')!;
			const lyric = [...view.dom.querySelectorAll<HTMLElement>('.cm-line')].find(
				(line) => line.textContent === 'Moon rises'
			)!;
			const before = lyric.getBoundingClientRect();
			const box = button.getBoundingClientRect();
			expect(box.right).toBeLessThanOrEqual(view.dom.getBoundingClientRect().right + 1);
			expect(button.getAttribute('aria-label')).toBe(`Edit ${label} details`);
			button.focus();
			fireEvent.keyDown(button, { key: 'Enter' });
			expect(request).toHaveBeenCalledTimes(1);
			expect(lyric.getBoundingClientRect().top).toBe(before.top);
			expect(handle.getSnapshot().text).toBe('Moon rises\nStars fall');
			handle.switchProfile!('genius');
			expect(view.dom.querySelector('.ll-conversion-section')).toBeNull();
			expect(handle.getSnapshot().text).toBe(`[${label}]\nMoon rises\n[Chorus]\nStars fall`);
		}
	);
});
