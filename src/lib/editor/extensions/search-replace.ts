import {
	SearchQuery,
	closeSearchPanel,
	findNext,
	findPrevious,
	getSearchQuery,
	replaceAll,
	replaceNext,
	search,
	searchPanelOpen,
	setSearchQuery
} from '@codemirror/search';
import { EditorSelection } from '@codemirror/state';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, runScopeHandlers } from '@codemirror/view';
import type { DecorationSet, Panel, ViewUpdate } from '@codemirror/view';
import { FixPreviewWidget } from './fix-preview.js';

type MatchRange = { from: number; to: number };
type Matches = { count: number; index: number; current?: MatchRange };

const NO_MATCHES: Matches = { count: 0, index: 0 };

/**
 * How many matches there are and which one the user is on — the one fact a find
 * bar owes its reader, and the thing CodeMirror's own panel never says.
 *
 * The current match is the selection where the selection *is* a match, and the
 * next match at or after the caret otherwise, wrapping to the first. That is the
 * range `Replace` acts on and the range the diff is drawn over, so both are read
 * from here rather than each deciding for itself.
 */
function scanMatches(state: EditorState): Matches {
	const query = getSearchQuery(state);
	if (!searchPanelOpen(state) || !query.valid) return NO_MATCHES;

	const { from, to } = state.selection.main;
	let count = 0;
	let first: MatchRange | undefined;
	let after: MatchRange | undefined;
	let afterIndex = 0;
	let selected: MatchRange | undefined;
	let selectedIndex = 0;

	// SearchCursor reuses one `value` object, so every range is copied out.
	const cursor = query.getCursor(state);
	for (let match = cursor.next(); !match.done; match = cursor.next()) {
		const range = { from: match.value.from, to: match.value.to };
		count += 1;
		first ??= range;
		if (range.from === from && range.to === to) {
			selected = range;
			selectedIndex = count;
		} else if (!after && range.from >= from) {
			after = range;
			afterIndex = count;
		}
	}

	if (selected) return { count, index: selectedIndex, current: selected };
	if (after) return { count, index: afterIndex, current: after };
	return first ? { count, index: 1, current: first } : NO_MATCHES;
}

/**
 * The current match previews its replacement as a diff, exactly as a diagnostic
 * fix does: the text that would go stays put, struck through, and what would
 * take its place sits beside it. That is what replaced the per-match button this
 * extension used to draw — a control in the content flow, which is the one thing
 * the line-anchor column is forbidden from being, and for the same reason: the
 * clean lyrics on the clipboard are this application's output.
 *
 * It has its own field rather than borrowing `fixPreviewField`, because that slot
 * is handed back and forth between the diagnostic card and the popover and a
 * third owner would clear whichever of them is open.
 *
 * The removal carries no wash of its own — the match already has a highlight
 * saying where it is, and a second fill over the first is two marks for one fact.
 */
function preview(state: EditorState): DecorationSet {
	const query = getSearchQuery(state);
	const { current } = scanMatches(state);
	if (!current || !query.replace) return Decoration.none;

	return Decoration.set(
		[
			Decoration.mark({
				class: 'll-find-preview-remove',
				attributes: {
					'aria-label': `Suggested removal: ${state.doc.sliceString(current.from, current.to)}`
				}
			}).range(current.from, current.to),
			Decoration.widget({ widget: new FixPreviewWidget(query.replace), side: 1 }).range(current.to)
		],
		true
	);
}

function searchChanged(update: ViewUpdate): boolean {
	return (
		searchPanelOpen(update.startState) !== searchPanelOpen(update.state) ||
		!getSearchQuery(update.startState).eq(getSearchQuery(update.state))
	);
}

const replacePreview = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = preview(view.state);
		}

		update(update: ViewUpdate): void {
			if (update.docChanged || update.selectionSet || searchChanged(update)) {
				this.decorations = preview(update.state);
			}
		}
	},
	{ decorations: (plugin) => plugin.decorations }
);

function field(label: string): HTMLInputElement {
	const input = document.createElement('input');
	input.className = 'll-find__field';
	input.type = 'text';
	input.placeholder = label;
	input.setAttribute('aria-label', label);
	// The panel is outside any form, and the browser must not autofill a search.
	input.setAttribute('form', '');
	input.autocomplete = 'off';
	return input;
}

function command(className: string, label: string, run: () => void): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = className;
	button.textContent = label;
	button.addEventListener('click', run);
	return button;
}

/**
 * The find bar, and it is one row split by what a control acts on: the left
 * group moves the reader through the document and changes nothing, the right
 * group changes the document, and the way out sits at the far end.
 *
 * Nothing here draws while it has nothing to do — no step controls under one
 * match, no `Replace all 1` beside the press that already does that, no count
 * before there is a query. What is left in the common case, which is finding
 * without replacing, is a field and a number.
 *
 * There are no `regexp`, `by word` or `match case` boxes. A regular expression
 * over song lyrics is a control for nobody, and case is answered without a
 * control at all: a query typed in lower case matches either case, and a capital
 * in it means the user meant one.
 */
class FindPanel implements Panel {
	readonly dom = document.createElement('div');
	readonly top = true;

	private readonly find = field('Find');
	private readonly replace = field('Replace with');
	private readonly status = document.createElement('span');
	private readonly previous: HTMLButtonElement;
	private readonly next: HTMLButtonElement;
	private readonly one: HTMLButtonElement;
	private readonly every: HTMLButtonElement;
	private query: SearchQuery;

	constructor(private readonly view: EditorView) {
		this.query = getSearchQuery(view.state);
		this.find.value = this.query.search;
		this.replace.value = this.query.replace;
		// `openSearchPanel` focuses and seeds whichever field is marked as the main one.
		this.find.setAttribute('main-field', 'true');

		const commit = () => this.commit();
		this.find.addEventListener('input', commit);
		this.replace.addEventListener('input', commit);

		this.previous = command('ll-find__step', '↑', () => findPrevious(view));
		this.previous.setAttribute('aria-label', 'Previous match');
		this.previous.title = 'Previous match';
		this.next = command('ll-find__step', '↓', () => findNext(view));
		this.next.setAttribute('aria-label', 'Next match');
		this.next.title = 'Next match';
		// The tiers are the diagnostic card's, because this is the same row: the
		// change that is previewed is the surface's one contrast action, the batch
		// beside it is bordered, and the way out is quiet.
		this.one = command('ll-find__button ll-find__button--go', 'Replace', () =>
			this.replaceCurrent()
		);
		this.every = command('ll-find__button', 'Replace all', () => replaceAll(view));

		this.status.className = 'll-find__status';
		this.status.setAttribute('aria-live', 'polite');

		const close = command('ll-find__close', '✕', () => closeSearchPanel(view));
		close.setAttribute('aria-label', 'Close find');
		close.title = 'Close find';

		const finding = document.createElement('div');
		finding.className = 'll-find__group';
		finding.append(this.find, this.status, this.previous, this.next);

		const replacing = document.createElement('div');
		replacing.className = 'll-find__group';
		replacing.append(this.replace, this.one, this.every);

		this.dom.className = 'll-find';
		this.dom.addEventListener('keydown', (event) => this.keydown(event));
		this.dom.append(finding, ...(view.state.readOnly ? [] : [replacing]), close);
		this.render(view.state);
	}

	private commit(): void {
		const search = this.find.value;
		const query = new SearchQuery({
			search,
			replace: this.replace.value,
			// A lyric is text, not a pattern: `\n` in the field is a backslash and an n.
			literal: true,
			caseSensitive: search !== search.toLowerCase()
		});
		if (query.eq(this.query)) return;
		this.query = query;
		this.view.dispatch({ effects: setSearchQuery.of(query) });
	}

	/**
	 * The diff is drawn on the current match, so `Replace` has to act on that one —
	 * and `replaceNext` only replaces where the selection is already the match it
	 * found. Selecting it first is what keeps the press and the preview honest.
	 */
	private replaceCurrent(): void {
		const { current } = scanMatches(this.view.state);
		if (!current) return;
		const { from, to } = this.view.state.selection.main;
		if (from !== current.from || to !== current.to) {
			this.view.dispatch({ selection: EditorSelection.single(current.from, current.to) });
		}
		replaceNext(this.view);
	}

	private keydown(event: KeyboardEvent): void {
		if (runScopeHandlers(this.view, event, 'search-panel')) {
			event.preventDefault();
		} else if (event.key === 'Enter' && event.target === this.find) {
			event.preventDefault();
			(event.shiftKey ? findPrevious : findNext)(this.view);
		} else if (event.key === 'Enter' && event.target === this.replace) {
			event.preventDefault();
			this.replaceCurrent();
		}
	}

	private render(state: EditorState): void {
		const query = getSearchQuery(state);
		const { count, index } = scanMatches(state);

		this.status.textContent = query.search ? (count ? `${index} of ${count}` : 'No matches') : '';
		this.previous.hidden = this.next.hidden = count < 2;
		// The two commands arrive with the diff that explains them, and not before:
		// beside an empty replacement they are a pair of loud buttons offering to
		// delete seventeen things, with nothing on screen showing what would go.
		const replacing = count > 0 && query.replace.length > 0;
		this.one.hidden = !replacing;
		this.every.hidden = !replacing || count < 2;
		this.every.textContent = `Replace all ${count}`;
	}

	update(update: ViewUpdate): void {
		for (const transaction of update.transactions) {
			for (const effect of transaction.effects) {
				if (effect.is(setSearchQuery) && !effect.value.eq(this.query)) {
					this.query = effect.value;
					this.find.value = effect.value.search;
					this.replace.value = effect.value.replace;
				}
			}
		}
		this.render(update.state);
	}

	mount(): void {
		this.find.select();
	}

	get pos(): number {
		return 80;
	}
}

const searchReplaceTheme = EditorView.theme({
	'.ll-find': {
		display: 'flex',
		flexWrap: 'wrap',
		alignItems: 'center',
		gap: 'var(--space-2) var(--space-3)',
		padding: 'var(--space-2)',
		borderBottom: 'var(--border-width) solid var(--color-border)',
		background: 'var(--color-chrome)',
		color: 'var(--color-text)',
		fontFamily: 'var(--font-ui)',
		fontSize: 'var(--font-size-sm)'
	},
	// A flex container outranks the UA rule that honours the attribute, and every
	// control in this row is hidden through it while it has nothing to act on.
	'.ll-find [hidden]': {
		display: 'none'
	},
	'.ll-find__group': {
		display: 'flex',
		alignItems: 'center',
		gap: 'var(--space-1-5)'
	},
	'.ll-find__field': {
		width: 'min(12rem, 40vw)',
		height: 'var(--control-height-md)',
		margin: '0',
		padding: 'var(--control-padding-block) var(--control-padding-inline)',
		border: 'var(--border-width) solid var(--color-control-border)',
		borderRadius: 'var(--radius-control)',
		outline: 'none',
		background: 'var(--color-control)',
		color: 'var(--color-text)',
		font: 'inherit'
	},
	'.ll-find__field:focus-visible': {
		borderColor: 'var(--color-focus)',
		boxShadow: '0 0 0 var(--focus-ring-width) var(--color-focus-soft)'
	},
	// A readout, not a control: the count is read, never pressed.
	'.ll-find__status': {
		minWidth: '4.5ch',
		color: 'var(--color-text-muted)',
		fontSize: 'var(--font-size-xs)',
		fontVariantNumeric: 'tabular-nums'
	},
	'.ll-find__button': {
		minHeight: 'var(--control-height-md)',
		margin: '0',
		padding: 'var(--control-padding-block) var(--control-padding-inline)',
		border: 'var(--border-width) solid var(--color-control-border)',
		borderRadius: 'var(--radius-control)',
		background: 'var(--color-control)',
		color: 'var(--color-text)',
		font: 'inherit',
		fontWeight: 'var(--font-weight-semibold)',
		cursor: 'pointer'
	},
	'.ll-find__button:hover': {
		borderColor: 'var(--color-border-strong)',
		background: 'var(--color-control-hover)'
	},
	'.ll-find__button--go': {
		borderColor: 'var(--color-text)',
		background: 'var(--color-text)',
		color: 'var(--color-canvas)'
	},
	'.ll-find__button--go:hover': {
		borderColor: 'color-mix(in oklch, var(--color-text) 85%, var(--color-canvas))',
		background: 'color-mix(in oklch, var(--color-text) 85%, var(--color-canvas))'
	},
	'.ll-find__step, .ll-find__close': {
		display: 'inline-grid',
		width: 'var(--control-height-md)',
		height: 'var(--control-height-md)',
		margin: '0',
		padding: '0',
		placeItems: 'center',
		border: '0',
		borderRadius: 'var(--radius-control)',
		background: 'transparent',
		color: 'var(--color-text-muted)',
		font: 'inherit',
		lineHeight: '1',
		cursor: 'pointer'
	},
	// The way out sits at the far end of the row, past everything it closes. It has
	// to come after the shared rule above, whose `margin: 0` would otherwise reset it.
	'.ll-find__close': {
		marginInlineStart: 'auto'
	},
	'.ll-find__step:hover, .ll-find__close:hover': {
		background: 'var(--color-control-hover)',
		color: 'var(--color-text)'
	},
	'.ll-find :is(button, input):focus-visible': {
		outline: 'var(--focus-ring-width) solid var(--color-focus)',
		outlineOffset: 'var(--focus-ring-offset)'
	},
	/*
	 * A match is not a finding. The old wash was `--color-warning-soft`, which is
	 * the warning severity's own color — a yellow band over lyric text in a linter
	 * means the linter said something about it. Matches take the accent instead,
	 * and the one the reader is on is marked the way this editor marks everything
	 * else: an underline, not a second fill.
	 */
	'.cm-content .cm-searchMatch': {
		borderRadius: 'var(--radius-xs)',
		backgroundColor: 'var(--color-accent-soft)'
	},
	'.cm-content .cm-searchMatch-selected': {
		boxShadow: 'inset 0 -2px 0 var(--color-accent)'
	},
	'.ll-find-preview-remove': {
		color: 'var(--color-text-muted)',
		textDecoration: 'line-through',
		textDecorationColor: 'var(--color-danger)',
		textDecorationThickness: '2px'
	}
});

export const searchReplace: Extension = [
	search({ top: true, literal: true, createPanel: (view) => new FindPanel(view) }),
	replacePreview,
	searchReplaceTheme
];
