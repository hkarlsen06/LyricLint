import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
// The parity assertions compare rendered geometry as well as markup, so the
// real tokens have to be loaded rather than mocked.
import '$lib/ui/styles/global.css';
import type { Diagnostic } from '$lib/core/types.js';
import DiagnosticPopover from '$lib/editor/overlays/DiagnosticPopover.svelte';
import DiagnosticDetails from '$lib/ui/linter/DiagnosticDetails.svelte';

/** The case from the screenshot: a fix whose label is already a command. */
function contractionDiagnostic(): Diagnostic {
	return {
		ruleId: 'contraction.apostrophe',
		severity: 'warning',
		from: 0,
		to: 4,
		message: 'Contractions need a typographic apostrophe.',
		explanation: 'Genius renders contractions with a right single quotation mark.',
		sourceIds: [],
		fixes: [
			{
				kind: 'preview',
				label: "Replace with Don't",
				edit: { baseRevision: 0, edits: [{ from: 0, to: 4, insert: "Don't" }] }
			}
		]
	};
}

interface RenderedAction {
	label: string;
	classes: string;
}

function actions(root: ParentNode): RenderedAction[] {
	return [...root.querySelectorAll<HTMLButtonElement>('.diagnostic-actions button')].map(
		(button) => ({
			label: button.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
			classes: [...button.classList].sort().join(' ')
		})
	);
}

function panelActions(diagnostic: Diagnostic): RenderedAction[] {
	const screen = render(DiagnosticDetails, {
		diagnostic,
		sources: new Map(),
		onChooseHeader: vi.fn(),
		onPreviewFix: vi.fn(),
		onCancelPreview: vi.fn(),
		onApplyFix: vi.fn(),
		onIgnore: vi.fn()
	});
	const rendered = actions(screen.container);
	screen.unmount();
	return rendered;
}

function popoverActions(diagnostic: Diagnostic, takeFocus = false): RenderedAction[] {
	const screen = render(DiagnosticPopover, {
		diagnostic,
		takeFocus,
		onPreviewFix: vi.fn(),
		onCancelPreview: vi.fn(),
		onApplyFix: vi.fn(),
		onIgnore: vi.fn()
	});
	const rendered = actions(screen.container);
	screen.unmount();
	return rendered;
}

describe('a diagnostic reads the same in the panel and in the editor', () => {
	it('offers one action row, built from one component, on both surfaces', () => {
		const diagnostic = contractionDiagnostic();
		const panel = panelActions(diagnostic);

		// The hovered card is the panel's card, exactly: same actions, same
		// labels, same button tiers, same order.
		expect(popoverActions(diagnostic)).toEqual(panel);
		expect(panel).toEqual([
			{ label: "Replace with Don't", classes: 'button button--contrast diagnostic-actions__fix' },
			{ label: 'Ignore', classes: 'button button--quiet diagnostic-actions__ignore' }
		]);
	});

	it('adds a way out only where the surface would otherwise trap the keyboard', () => {
		const diagnostic = contractionDiagnostic();

		// The keyboard-opened card holds focus and is exempt from the pointer-leave
		// watcher, so it — and only it — carries a visible Close.
		const dialog = popoverActions(diagnostic, true);
		expect(dialog.at(-1)).toEqual({
			label: 'Close',
			classes: 'button button--quiet diagnostic-actions__close'
		});
		expect(dialog.slice(0, -1)).toEqual(panelActions(diagnostic));
	});

	it('never puts a verb in front of a fix that already names itself', () => {
		const diagnostic = contractionDiagnostic();

		for (const row of [panelActions(diagnostic), popoverActions(diagnostic)]) {
			// "Apply Replace with Don't" said the same thing twice; the label is the
			// whole button now, on both surfaces.
			expect(row.map((action) => action.label)).not.toContain('Apply');
			expect(row.some((action) => action.label.startsWith('Apply'))).toBe(false);
		}
	});

	it('marks the finding with the same severity tag in both places', () => {
		const diagnostic = contractionDiagnostic();
		const popover = render(DiagnosticPopover, {
			diagnostic,
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn()
		});

		const tag = popover.container.querySelector('.severity')!;
		expect(tag).not.toBeNull();
		expect(tag.classList.contains('severity--warning')).toBe(true);
		expect(tag.textContent?.trim()).toBe('Warning');
		// Styled from the shared stylesheet, not from a copy scoped to the
		// overlay: the tag is squared off here exactly as it is in the panel.
		expect(getComputedStyle(tag).borderRadius).toBe('4px');
		popover.unmount();
	});
});
