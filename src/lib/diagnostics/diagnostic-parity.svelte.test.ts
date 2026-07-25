import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
// The parity assertions compare rendered geometry as well as markup, so the
// real tokens have to be loaded rather than mocked.
import '$lib/ui/styles/global.css';
import type { Diagnostic } from '$lib/core/types.js';
import DiagnosticPopover from '$lib/editor/overlays/DiagnosticPopover.svelte';
import DiagnosticDetails from '$lib/ui/linter/DiagnosticDetails.svelte';
import DiagnosticList from '$lib/ui/linter/DiagnosticList.svelte';

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

/** A safe fix, which is the only kind a whole batch can be reached from. */
function spellingDiagnostic(): Diagnostic {
	return {
		ruleId: 'spelling.standardized',
		severity: 'suggestion',
		from: 0,
		to: 4,
		message: 'Genius prefers “I’ma”.',
		explanation: 'The reviewed spelling data lists Imma as a non-preferred form.',
		sourceIds: [],
		fixes: [
			{
				kind: 'safe',
				label: "Replace with I'ma",
				edit: { baseRevision: 0, edits: [{ from: 0, to: 4, insert: "I'ma" }] }
			}
		]
	};
}

interface RenderedAction {
	label: string;
	classes: string;
}

/** The batch props both surfaces take, standing in for the shell's planner. */
const batchOf = (size: number) => ({
	fixBatchSize: () => size,
	onApplyFixBatch: vi.fn()
});

function actions(root: ParentNode): RenderedAction[] {
	return [...root.querySelectorAll<HTMLButtonElement>('.diagnostic-actions button')].map(
		(button) => ({
			label: button.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
			classes: [...button.classList].sort().join(' ')
		})
	);
}

function panelActions(
	diagnostic: Diagnostic,
	batch?: ReturnType<typeof batchOf>
): RenderedAction[] {
	const screen = render(DiagnosticDetails, {
		diagnostic,
		onChooseHeader: vi.fn(),
		onSetLanguage: vi.fn(),
		onPreviewFix: vi.fn(),
		onCancelPreview: vi.fn(),
		onApplyFix: vi.fn(),
		onIgnore: vi.fn(),
		...batch
	});
	const rendered = actions(screen.container);
	screen.unmount();
	return rendered;
}

function popoverActions(
	diagnostic: Diagnostic,
	takeFocus = false,
	batch?: ReturnType<typeof batchOf>
): RenderedAction[] {
	const screen = render(DiagnosticPopover, {
		diagnostic,
		takeFocus,
		onSetLanguage: vi.fn(),
		onPreviewFix: vi.fn(),
		onCancelPreview: vi.fn(),
		onApplyFix: vi.fn(),
		onIgnore: vi.fn(),
		...batch
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

	it('offers the detected language before the quiet ignore action on both surfaces', () => {
		const diagnostic: Diagnostic = {
			...contractionDiagnostic(),
			ruleId: 'language.selection-mismatch',
			fixes: undefined,
			detectedLanguage: { tag: 'en', displayName: 'English' }
		};

		const expected = [
			{
				label: 'Set language to English',
				classes: 'button button--contrast diagnostic-actions__language'
			},
			{ label: 'Ignore', classes: 'button button--quiet diagnostic-actions__ignore' }
		];
		expect(panelActions(diagnostic)).toEqual(expected);
		expect(popoverActions(diagnostic)).toEqual(expected);
	});

	it('offers the same batch, in the same tier, on both surfaces', () => {
		const diagnostic = spellingDiagnostic();
		const panel = panelActions(diagnostic, batchOf(3));

		expect(popoverActions(diagnostic, false, batchOf(3))).toEqual(panel);
		expect(panel).toEqual([
			{
				label: "Replace with I'ma",
				classes: 'button button--contrast diagnostic-actions__fix'
			},
			// Follows the fix it repeats and steps down a tier: the contrast action
			// on a surface is one, and it belongs to the change being previewed.
			{ label: 'Fix all 3', classes: 'button diagnostic-actions__fix-all' },
			{ label: 'Ignore', classes: 'button button--quiet diagnostic-actions__ignore' }
		]);
	});

	it('says nothing about a batch that is only this one finding', () => {
		const diagnostic = spellingDiagnostic();

		// The button beside it already applies the single occurrence; "Fix all 1"
		// would be a second control for the same press.
		for (const row of [
			panelActions(diagnostic, batchOf(1)),
			popoverActions(diagnostic, false, batchOf(1))
		]) {
			expect(row.map((action) => action.label)).toEqual(["Replace with I'ma", 'Ignore']);
		}
	});

	it('never offers to repeat a fix the user has to confirm', () => {
		// The contraction fix is `preview`: it is exactly the case that has to be
		// decided one occurrence at a time, whatever count the shell reports.
		const diagnostic = contractionDiagnostic();

		for (const row of [
			panelActions(diagnostic, batchOf(4)),
			popoverActions(diagnostic, false, batchOf(4))
		]) {
			expect(row.some((action) => action.label.startsWith('Fix all'))).toBe(false);
		}
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
		// A glyph, and the word behind it for whoever is not looking at it.
		expect(tag.querySelector('.severity-icon')).not.toBeNull();
		expect(tag.querySelector('.sr-only')?.textContent).toBe('Warning');
		expect(tag.getAttribute('title')).toBe('Warning');
		// Styled from the shared stylesheet, not from a copy scoped to the
		// overlay: a colored glyph with no box around it — the badge that used to
		// sit here spent a whole line on one word.
		const style = getComputedStyle(tag);
		expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
		expect(style.borderRadius).toBe('0px');
		expect(style.padding).toBe('0px');
		// The severity is carried by the word's own color, so it cannot read as
		// the muted prose beneath it.
		const explanation = popover.container.querySelector('.diagnostic-explanation')!;
		expect(style.color).not.toBe(getComputedStyle(explanation).color);
		popover.unmount();
	});

	it('cites its source on the meta line, not in a footer under the card', () => {
		const diagnostic = { ...contractionDiagnostic(), sourceIds: ['G-CONTRACTIONS'] };
		const sources = [
			{
				id: 'G-CONTRACTIONS',
				url: 'https://genius.com/contractions',
				pageTitle: 'Use song part headers',
				sectionTitle: 'Section headers and performer legends',
				retrievedAt: '2026-07-24',
				lastVerifiedAt: '2026-07-24',
				reviewStatus: 'reviewed' as const
			}
		];

		for (const screen of [
			render(DiagnosticPopover, {
				diagnostic,
				sources,
				onPreviewFix: vi.fn(),
				onCancelPreview: vi.fn(),
				onApplyFix: vi.fn(),
				onIgnore: vi.fn()
			}),
			render(DiagnosticList, {
				diagnostics: [diagnostic],
				sources: new Map(sources.map((source) => [source.id, source])),
				emptyState: { title: '', detail: '' },
				onNavigate: vi.fn(),
				onChooseHeader: vi.fn(),
				onSetLanguage: vi.fn(),
				onPreviewFix: vi.fn(),
				onCancelPreview: vi.fn(),
				onApplyFix: vi.fn(),
				onIgnore: vi.fn()
			})
		]) {
			// One source is the meta line's last word, on both surfaces, and the
			// block of citations that used to close the card is gone.
			const meta = screen.container.querySelector('.diagnostic-meta')!;
			const link = meta.querySelector('.source-citation a') as HTMLAnchorElement;
			expect(link.href).toBe('https://genius.com/contractions');
			expect(link.textContent?.trim()).toBe('Use song part headers');
			expect(screen.container.querySelector('.diagnostic-sources')).toBeNull();

			// The severity leads the line the citation ends.
			const severity = meta.querySelector('.severity')!;
			expect(
				severity.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING
			).toBeTruthy();

			// What the footer used to spell out is the link's description, and it is
			// in the accessible tree whether or not the tooltip is on screen.
			const description = document.getElementById(link.getAttribute('aria-describedby')!)!;
			expect(description.textContent).toContain('Section headers and performer legends');
			expect(description.textContent).toContain('2026-07-24');

			screen.unmount();
		}
	});
});
