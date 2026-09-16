import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';
import { createLyricEditor, type LyricEditorInstance } from './create-editor.js';

const editors: LyricEditorInstance[] = [];
afterEach(() => {
	for (const editor of editors.splice(0)) {
		const host = editor.view.dom.parentElement;
		editor.destroy();
		host?.remove();
	}
});

function mount(text: string, width: number) {
	const host = document.createElement('div');
	host.style.width = `${width}px`;
	document.body.append(host);
	const request = vi.fn();
	const requestLink = vi.fn();
	const editor = createLyricEditor(host, {
		initialText: text,
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
	editor.handle.switchProfile!('musixmatch');
	return { ...editor, request, requestLink, host };
}

describe('retained section boundaries', () => {
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
