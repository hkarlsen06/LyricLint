import { Compartment, EditorState } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { fireEvent, waitFor } from '@testing-library/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shownControlHint } from '$lib/ui/state/control-tooltip.svelte.js';
import { editorCallbacksField, setEditorCallbacksEffect } from './editor-state.js';
import { SectionLinkMarker, sectionLinkTheme } from './section-link-marker.js';

const toggle = vi.fn(() => true);
const markerWithScope = (
	header: number,
	local: boolean,
	scope?: { label: string; detail?: string }
) => new SectionLinkMarker(header, local, toggle, scope);

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const destroy of cleanup.splice(0)) destroy();
	toggle.mockClear();
});

function setup(width = 640) {
	const host = document.createElement('div');
	host.style.width = `${width}px`;
	document.body.append(host);
	const text = '[Chorus with an unusually long name]\nHold me close';
	const compartment = new Compartment();
	const decorations = (marker: SectionLinkMarker) =>
		EditorView.decorations.of(
			Decoration.set([Decoration.widget({ widget: marker, side: 1 }).range(text.indexOf('\n'))])
		);
	const view = new EditorView({
		parent: host,
		state: EditorState.create({
			doc: text,
			extensions: [
				EditorView.lineWrapping,
				sectionLinkTheme,
				editorCallbacksField,
				compartment.of(decorations(markerWithScope(0, false)))
			]
		})
	});
	const onSectionLinkRequest = vi.fn();
	view.dispatch({
		effects: setEditorCallbacksEffect.of({
			onSnapshot: vi.fn(),
			onAssignRequest: vi.fn(),
			onSectionHeaderRequest: vi.fn(),
			onDiagnosticActivate: vi.fn(),
			onAnnouncement: vi.fn(),
			onSectionLinkRequest
		})
	});
	cleanup.push(() => {
		view.destroy();
		host.remove();
	});
	return {
		view,
		host,
		onSectionLinkRequest,
		marker: () => host.querySelector<HTMLButtonElement>('.ll-section-link-marker')!,
		mode: () => host.querySelector<HTMLButtonElement>('.ll-section-local-toggle')!,
		controls: () => host.querySelector<HTMLElement>('.ll-section-link-controls')!,
		update: (marker: SectionLinkMarker) =>
			view.dispatch({ effects: compartment.reconfigure(decorations(marker)) })
	};
}

describe('linked header scope marker', () => {
	it('keeps the scope readout outside separate accessible targets', async () => {
		const { marker, mode, controls, update, onSectionLinkRequest } = setup();
		update(markerWithScope(0, false, { label: 'Also edits Chorus 2' }));
		const status = controls().querySelector<HTMLElement>('.ll-section-link-status')!;
		expect(status.parentElement).toBe(controls());
		expect(status.closest('button')).toBeNull();
		expect(getComputedStyle(status).pointerEvents).toBe('none');
		await fireEvent.click(status);
		expect(onSectionLinkRequest).not.toHaveBeenCalled();
		expect(toggle).not.toHaveBeenCalled();
		const group = controls().getBoundingClientRect();
		expect(group.height).toBeCloseTo(parseFloat(getComputedStyle(controls()).fontSize), 1);
		for (const button of [marker(), mode()]) {
			const rect = button.getBoundingClientRect();
			expect(rect.width).toBe(24);
			expect(rect.height).toBe(24);
			expect(rect.top + rect.height / 2).toBeCloseTo(group.top + group.height / 2, 1);
		}
		expect(mode().getBoundingClientRect().left).toBeGreaterThanOrEqual(
			marker().getBoundingClientRect().right
		);
	});

	it.each([320, 640])(
		'keeps header and lyric geometry stable for long recipient labels at %ipx',
		async (width) => {
			const { view, host, marker, mode, controls, update } = setup(width);
			await waitFor(() =>
				expect(controls().style.getPropertyValue('--ll-link-scope-width')).not.toBe('')
			);
			expect(mode().getBoundingClientRect().left).toBeGreaterThanOrEqual(
				marker().getBoundingClientRect().right
			);
			expect(mode().parentElement).toBe(marker().parentElement);
			const lines = [...host.querySelectorAll('.cm-line')];
			const before = lines.map((line) => line.getBoundingClientRect());
			const label =
				'Also edits Intro with a very long performer name, Chorus 2, Outro with an equally long performer name';
			update(markerWithScope(0, false, { label, detail: 'Backspace edits Chorus 2 only.' }));
			await waitFor(() => expect(marker().getAttribute('aria-label')).toContain(label));
			const status = marker().parentElement!.querySelector<HTMLElement>('.ll-section-link-status')!;
			await waitFor(() =>
				expect(status.getBoundingClientRect().right).toBeLessThanOrEqual(
					host.getBoundingClientRect().right + 1
				)
			);
			expect(lines.map((line) => line.getBoundingClientRect().top)).toEqual(
				before.map((rect) => rect.top)
			);
			expect(lines.map((line) => line.getBoundingClientRect().height)).toEqual(
				before.map((rect) => rect.height)
			);
			expect(view.state.doc.toString()).toBe('[Chorus with an unusually long name]\nHold me close');
			await fireEvent.pointerEnter(marker());
			expect(shownControlHint()?.label).toBe('Manage linking');
		}
	);

	it('updates the existing widget without restarting the highlight for an unchanged label', () => {
		const { marker, update } = setup();
		update(markerWithScope(0, false, { label: 'Also edits Chorus 2' }));
		const button = marker();
		const status = button.parentElement!.querySelector<HTMLElement>('.ll-section-link-status')!;
		const change = status.dataset.change;
		expect(getComputedStyle(status).textAlign).toBe('start');
		update(
			markerWithScope(0, false, {
				label: 'Also edits Chorus 2',
				detail: 'Delete edits this section only.'
			})
		);
		expect(marker()).toBe(button);
		expect(status.dataset.change).toBe(change);
		update(markerWithScope(0, false, { label: 'Also edits Chorus 2 and Outro' }));
		expect(status.dataset.change).not.toBe(change);
		update(markerWithScope(0, true, { label: 'Also edits Chorus 2 and Outro' }));
		expect(status.textContent).toBe('Editing this section only');
		expect(marker().getAttribute('aria-label')).not.toContain('Also edits');
	});

	it('opens Linking from its marker while the separate mode owns local editing', async () => {
		const { marker, mode, onSectionLinkRequest, view } = setup();
		await fireEvent.pointerEnter(marker());
		marker().focus();
		expect(onSectionLinkRequest).not.toHaveBeenCalled();
		await fireEvent.keyDown(marker(), { key: 'Enter' });
		await fireEvent.keyDown(marker(), { key: ' ' });
		await fireEvent.click(marker());
		expect(onSectionLinkRequest).toHaveBeenCalledTimes(3);
		expect(onSectionLinkRequest).toHaveBeenLastCalledWith(
			{ range: { from: 0, to: view.state.doc.line(1).to }, prefer: 'above' },
			expect.objectContaining({ takesFocus: true })
		);
		expect(toggle).not.toHaveBeenCalled();
		await waitFor(() => expect(shownControlHint()).toBeUndefined());
		await fireEvent.pointerEnter(mode());
		expect(shownControlHint()?.label).toBe('Edit this section only');
		mode().focus();
		await fireEvent.keyDown(mode(), { key: 'Enter' });
		await fireEvent.keyDown(mode(), { key: ' ' });
		await fireEvent.click(mode());
		expect(toggle).toHaveBeenCalledWith(view, 0);
		expect(toggle).toHaveBeenCalledTimes(3);
		expect(onSectionLinkRequest).toHaveBeenCalledTimes(3);
		await waitFor(() => expect(shownControlHint()).toBeUndefined());
		expect(view.state.doc.lines).toBe(2);
	});

	it('switches both icon pairs and the editing mode without moving either button', async () => {
		const { marker, mode, update } = setup();
		const before = [marker(), mode()].map((button) => button.getBoundingClientRect().width);
		const linkIcon = marker().querySelector<SVGElement>('.ll-shared-icon')!;
		const unlinkIcon = marker().querySelector<SVGElement>('.ll-local-icon')!;
		expect(getComputedStyle(linkIcon).display).not.toBe('none');
		expect(getComputedStyle(unlinkIcon).display).toBe('none');
		const openIcon = mode().querySelector<SVGElement>('.ll-shared-icon')!;
		const closedIcon = mode().querySelector<SVGElement>('.ll-local-icon')!;
		expect(getComputedStyle(openIcon).display).not.toBe('none');
		expect(getComputedStyle(closedIcon).display).toBe('none');
		expect(mode().getAttribute('aria-label')).toBe('Edit this section only');
		expect(mode().getAttribute('aria-pressed')).toBe('false');
		update(markerWithScope(0, true));
		expect(mode().getAttribute('aria-pressed')).toBe('true');
		await fireEvent.pointerEnter(mode());
		expect(shownControlHint()?.label).toBe('Resume linked editing');
		expect(getComputedStyle(linkIcon).display).toBe('none');
		expect(getComputedStyle(unlinkIcon).display).not.toBe('none');
		expect(getComputedStyle(openIcon).display).toBe('none');
		expect(getComputedStyle(closedIcon).display).not.toBe('none');
		expect([marker(), mode()].map((button) => button.getBoundingClientRect().width)).toEqual(
			before
		);
		expect(marker().hasAttribute('aria-pressed')).toBe(false);
	});
});
