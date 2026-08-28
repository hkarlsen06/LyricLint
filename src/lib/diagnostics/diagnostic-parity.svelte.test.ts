import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
// The parity assertions compare rendered geometry as well as markup, so the
// real tokens have to be loaded rather than mocked.
import '$lib/ui/styles/global.css';
import type { Diagnostic } from '$lib/core/types.js';
import DiagnosticPopover from '$lib/editor/overlays/DiagnosticPopover.svelte';
import DiagnosticDetails from '$lib/ui/linter/DiagnosticDetails.svelte';
import DiagnosticList from '$lib/ui/linter/DiagnosticList.svelte';
import { hideControlHint } from '$lib/ui/state/control-tooltip.svelte.js';
import ControlTooltip from '$lib/ui/primitives/ControlTooltip.svelte';

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
		onLinkSections: vi.fn(),
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
		onLinkSections: vi.fn(),
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

	// A surface has one contrast action, and a diagnostic can carry several fixes
	// — Harper offers up to three, and `ur` alone emits two. A tier each made
	// three answers shout equally in the one place the reader is choosing
	// *between* them, and erased the precedence the fix ordering had just given
	// the lead.
	it('gives the contrast tier to the leading fix alone on both surfaces', () => {
		const diagnostic: Diagnostic = {
			...contractionDiagnostic(),
			ruleId: 'spelling.texting-shorthand',
			message: '“ur” is texting shorthand.',
			fixes: [
				{
					kind: 'preview',
					label: 'Replace with your',
					edit: { baseRevision: 0, edits: [{ from: 0, to: 2, insert: 'your' }] }
				},
				{
					kind: 'preview',
					label: "Replace with you're",
					edit: { baseRevision: 0, edits: [{ from: 0, to: 2, insert: "you're" }] }
				}
			]
		};

		const expected = [
			{ label: 'Replace with your', classes: 'button button--contrast diagnostic-actions__fix' },
			{ label: "Replace with you're", classes: 'button diagnostic-actions__fix' },
			{ label: 'Ignore', classes: 'button button--quiet diagnostic-actions__ignore' }
		];
		expect(panelActions(diagnostic)).toEqual(expected);
		expect(popoverActions(diagnostic)).toEqual(expected);
		for (const row of [panelActions(diagnostic), popoverActions(diagnostic)]) {
			expect(row.filter((action) => action.classes.includes('button--contrast'))).toHaveLength(1);
		}
	});

	/*
	 * The row is where its keyboard twins are learned. This is the most-pressed
	 * surface in the workbench and the pointer crosses a control here on every
	 * press, so the shared box — the same one the tray and the transport use —
	 * arrives with the keystroke at exactly the moment it is worth knowing.
	 * `Mod-.` reaches the *leading* fix (it selects the nearest fixable finding
	 * and lands focus on this row), so only that button names it: an alternate
	 * wearing the same caption would promise a key that reaches its sibling.
	 * Both surfaces render this row from one component, so the parity suite is
	 * where the disclosure is pinned.
	 */
	it('names the keyboard route to the leading fix, and only to the leading fix', async () => {
		hideControlHint();
		const diagnostic: Diagnostic = {
			...contractionDiagnostic(),
			ruleId: 'spelling.texting-shorthand',
			fixes: [
				{
					kind: 'preview',
					label: 'Replace with your',
					edit: { baseRevision: 0, edits: [{ from: 0, to: 2, insert: 'your' }] }
				},
				{
					kind: 'preview',
					label: "Replace with you're",
					edit: { baseRevision: 0, edits: [{ from: 0, to: 2, insert: "you're" }] }
				}
			]
		};
		const screen = render(DiagnosticDetails, {
			diagnostic,
			onChooseHeader: vi.fn(),
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn()
		});
		render(ControlTooltip, { props: {} });

		const fixes = [
			...screen.container.querySelectorAll<HTMLButtonElement>('.diagnostic-actions__fix')
		];
		expect(fixes[0]?.getAttribute('aria-keyshortcuts')).toBe('Control+.');
		expect(fixes[1]?.getAttribute('aria-keyshortcuts')).toBeNull();

		fixes[0]?.dispatchEvent(new PointerEvent('pointerenter'));
		await vi.waitFor(() => {
			expect(document.querySelector('.control-tooltip')?.textContent).toContain(
				'Replace with your'
			);
		});
		expect(document.querySelector('.control-tooltip kbd')?.textContent).toBe('Ctrl+.');

		// The alternate draws no box at all: a hint that only repeated the label
		// would be the label twice, six pixels apart.
		fixes[0]?.dispatchEvent(new PointerEvent('pointerleave'));
		fixes[1]?.dispatchEvent(new PointerEvent('pointerenter'));
		await vi.waitFor(() => {
			expect(document.querySelector('.control-tooltip')).toBeNull();
		});
		screen.unmount();
	});

	// A guided action with a keyboard twin names it; one without a twin names
	// nothing. `Choose header` is `Mod-Shift-H`'s own press; `Manage linking`
	// lost its twin when `Mod-Shift-L` became Type only here, so a box there
	// would only repeat the label.
	it('names a guided action’s keyboard twin, and only where one exists', async () => {
		hideControlHint();
		const headerless: Diagnostic = {
			...contractionDiagnostic(),
			ruleId: 'section.header-missing',
			fixes: undefined
		};
		const screen = render(DiagnosticDetails, {
			diagnostic: headerless,
			onChooseHeader: vi.fn(),
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn()
		});
		render(ControlTooltip, { props: {} });

		const guided = screen.container.querySelector<HTMLButtonElement>('.diagnostic-actions__guided');
		expect(guided?.getAttribute('aria-keyshortcuts')).toBe('Control+Shift+H');

		guided?.dispatchEvent(new PointerEvent('pointerenter'));
		await vi.waitFor(() => {
			expect(document.querySelector('.control-tooltip')?.textContent).toContain('Choose header');
		});
		expect(document.querySelector('.control-tooltip kbd')?.textContent).toBe('Ctrl+Shift+H');
		guided?.dispatchEvent(new PointerEvent('pointerleave'));
		screen.unmount();

		const repeat: Diagnostic = {
			...contractionDiagnostic(),
			ruleId: 'section.unlinked-repeat',
			fixes: undefined
		};
		const linking = render(DiagnosticDetails, {
			diagnostic: repeat,
			onChooseHeader: vi.fn(),
			onLinkSections: vi.fn(),
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn()
		});
		const manage = linking.container.querySelector<HTMLButtonElement>(
			'.diagnostic-actions__guided'
		);
		expect(manage?.getAttribute('aria-keyshortcuts')).toBeNull();
		manage?.dispatchEvent(new PointerEvent('pointerenter'));
		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(document.querySelector('.control-tooltip')).toBeNull();
		linking.unmount();
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

	it('offers the link picker for a repeated section on both surfaces', () => {
		const diagnostic: Diagnostic = {
			...contractionDiagnostic(),
			ruleId: 'section.unlinked-repeat',
			fixes: undefined
		};

		// A guided action, in the bordered tier, like the other two that open a
		// picker rather than changing the document where they stand.
		const expected = [
			{ label: 'Manage linking', classes: 'button diagnostic-actions__guided' },
			{ label: 'Ignore', classes: 'button button--quiet diagnostic-actions__ignore' }
		];
		expect(panelActions(diagnostic)).toEqual(expected);
		expect(popoverActions(diagnostic)).toEqual(expected);
	});

	it('leads with acceptance, and steps the fix down, on both surfaces', () => {
		// A synthetic `presumedCorrect` finding — no catalog rule sets it today
		// (the ad-lib wrap offer that did was retired), but the shell contract
		// stays pinned: the likelier answer takes the row's one contrast tier
		// and the fix follows it as an ordinary bordered button.
		const diagnostic: Diagnostic = {
			...contractionDiagnostic(),
			ruleId: 'adlib.parentheses',
			message: 'This likely ad-lib may need parentheses.',
			presumedCorrect: true,
			fixes: [
				{
					kind: 'preview',
					label: 'Wrap as (Yeah)',
					edit: { baseRevision: 0, edits: [{ from: 0, to: 4, insert: '(Yeah)' }] }
				}
			]
		};

		const expected = [
			{ label: "It's correct", classes: 'button button--contrast diagnostic-actions__accept' },
			{ label: 'Wrap as (Yeah)', classes: 'button diagnostic-actions__fix' }
		];
		expect(panelActions(diagnostic)).toEqual(expected);
		expect(popoverActions(diagnostic)).toEqual(expected);
	});

	it('accepts an unresolved lyric with a normal button on both surfaces', () => {
		const diagnostic: Diagnostic = {
			...contractionDiagnostic(),
			ruleId: 'unknown.unresolved',
			fixes: undefined
		};
		const expected = [{ label: 'It really is unintelligible', classes: 'button button--contrast' }];

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

	it('hands the one preview slot back when the other surface closes', () => {
		// Hovering an underline opens the popover over a card the panel already has
		// expanded, so both surfaces want the same diff. The popover leaving used to
		// clear it outright, and the still-expanded card was left describing a
		// change the document no longer showed.
		const diagnostic = contractionDiagnostic();
		const card = { onPreviewFix: vi.fn(), onCancelPreview: vi.fn() };
		const popover = { onPreviewFix: vi.fn(), onCancelPreview: vi.fn() };
		const panel = render(DiagnosticDetails, {
			diagnostic,
			onChooseHeader: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn(),
			...card
		});
		const overlay = render(DiagnosticPopover, {
			diagnostic,
			onApplyFix: vi.fn(),
			onIgnore: vi.fn(),
			...popover
		});
		expect(popover.onPreviewFix).toHaveBeenCalledTimes(1);

		overlay.unmount();

		// The card that is still open re-asserts its diff, and nothing cleared it.
		expect(popover.onCancelPreview).not.toHaveBeenCalled();
		expect(card.onCancelPreview).not.toHaveBeenCalled();
		expect(card.onPreviewFix).toHaveBeenCalledTimes(2);

		// Nothing is left showing a diff, so the last surface out clears the slot.
		panel.unmount();
		expect(card.onCancelPreview).toHaveBeenCalledTimes(1);
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
				reviewStatus: 'reviewed' as const,
				authority: 'community' as const
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
			// What the line says on screen is the page title and nothing else. The
			// note that the press opens a tab is in the link's accessible name only,
			// because the mark that would otherwise say so is aria-hidden.
			const visible = link.cloneNode(true) as HTMLElement;
			for (const hidden of visible.querySelectorAll('.sr-only')) hidden.remove();
			expect(visible.textContent?.trim()).toBe('Use song part headers');
			expect(link.querySelector('.sr-only')?.textContent).toBe('(opens in a new tab)');
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
