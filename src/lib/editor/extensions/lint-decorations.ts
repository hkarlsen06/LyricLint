import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension, Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { Diagnostic, Severity, TextRange } from '$lib/core/types.js';
import type { RevisionedDiagnostics } from '../contracts.js';
import { editorCallbacksField, editorComposingField, editorRevisionField } from './editor-state.js';
import { HoverIntent } from './hover-intent.js';

const severityRank: Record<Severity, number> = {
	error: 0,
	warning: 1,
	suggestion: 2,
	'manual-review': 3
};

export interface DiagnosticCluster {
	from: number;
	to: number;
	line: number;
	severity: Severity;
	diagnostics: Diagnostic[];
}

export const setDiagnosticsEffect = StateEffect.define<RevisionedDiagnostics>();

/** Serialized primary `from:to` of the diagnostic an underline belongs to. */
const diagnosticRangeAttribute = 'data-ll-diagnostic-range';
/** Serialized `from:to` of the particular primary or related range being drawn. */
const diagnosticAnchorAttribute = 'data-ll-diagnostic-anchor';

export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
	return [...diagnostics].sort(
		(left, right) =>
			severityRank[left.severity] - severityRank[right.severity] ||
			left.from - right.from ||
			left.to - right.to ||
			left.ruleId.localeCompare(right.ruleId)
	);
}

/**
 * Collapse only intersecting badges on the same physical line.
 */
export function clusterDiagnostics(
	diagnostics: readonly Diagnostic[],
	lineAt: (offset: number) => number
): DiagnosticCluster[] {
	const byPosition = [...diagnostics].sort(
		(left, right) =>
			lineAt(left.from) - lineAt(right.from) || left.from - right.from || left.to - right.to
	);
	const clusters: DiagnosticCluster[] = [];

	for (const diagnostic of byPosition) {
		const line = lineAt(diagnostic.from);
		const current = clusters.at(-1);
		if (current && current.line === line && diagnostic.from <= current.to) {
			current.from = Math.min(current.from, diagnostic.from);
			current.to = Math.max(current.to, diagnostic.to);
			current.diagnostics.push(diagnostic);
			current.diagnostics = sortDiagnostics(current.diagnostics);
			current.severity = current.diagnostics[0]?.severity ?? diagnostic.severity;
			continue;
		}

		clusters.push({
			from: diagnostic.from,
			to: diagnostic.to,
			line,
			severity: diagnostic.severity,
			diagnostics: [diagnostic]
		});
	}

	return clusters;
}

function isValidRange(range: TextRange, documentLength: number): boolean {
	return (
		Number.isSafeInteger(range.from) &&
		Number.isSafeInteger(range.to) &&
		range.from >= 0 &&
		range.from <= range.to &&
		range.to <= documentLength
	);
}

function diagnosticLabel(cluster: DiagnosticCluster): string {
	if (cluster.diagnostics.length === 1) {
		return `${cluster.severity}: ${cluster.diagnostics[0]?.message ?? 'Diagnostic'}`;
	}
	return `${cluster.diagnostics.length} diagnostics on this line, highest severity ${cluster.severity}`;
}

function diagnosticClusterKey(cluster: DiagnosticCluster): string {
	return cluster.diagnostics
		.map(
			(diagnostic) =>
				`${diagnostic.ruleId}:${diagnostic.severity}:${diagnostic.from}:${diagnostic.to}:${diagnostic.message}`
		)
		.join('|');
}

class DiagnosticBadge extends WidgetType {
	/** The badge's own pending reveal, for the diagnostic it leads with. */
	private readonly hover = new HoverIntent<Diagnostic>((diagnostic) => this.activate?.(diagnostic));

	/** The open cluster menu's outside-press watcher, while one is open. */
	private outside?: (event: PointerEvent) => void;

	constructor(
		readonly cluster: DiagnosticCluster,
		readonly activate: ((diagnostic: Diagnostic) => void) | undefined
	) {
		super();
	}

	/**
	 * Close the cluster menu on a press anywhere else.
	 *
	 * The rule every transient surface in the workbench follows, and the same two
	 * decisions `dismissOnOutside` and the timestamp column's own watcher make:
	 * `pointerdown` in the capture phase, because waiting for `click` leaves the
	 * menu up through the press and the bubble phase never arrives for a press
	 * CodeMirror cancels; and nothing here moves focus, because the press has
	 * already said where the user is going.
	 *
	 * It listens on the document rather than the editor, since most of what is
	 * "anywhere else" — the panel, the toolbar, the transport — is outside it. The
	 * badge and its items are exempt: the menu has to survive being pressed, and
	 * the badge is its own way back out.
	 */
	private watchOutside(container: HTMLElement, close: () => void): void {
		if (this.outside) return;
		this.outside = (event: PointerEvent): void => {
			const target = event.target;
			if (target instanceof Node && container.contains(target)) return;
			close();
		};
		document.addEventListener('pointerdown', this.outside, true);
	}

	private stopWatchingOutside(): void {
		if (!this.outside) return;
		document.removeEventListener('pointerdown', this.outside, true);
		this.outside = undefined;
	}

	eq(other: DiagnosticBadge): boolean {
		return diagnosticClusterKey(other.cluster) === diagnosticClusterKey(this.cluster);
	}

	toDOM(): HTMLElement {
		const container = document.createElement('span');
		container.className = 'll-diagnostic-badge-container';
		const badge = document.createElement('button');
		badge.type = 'button';
		badge.className = `ll-diagnostic-badge ll-diagnostic-badge-${this.cluster.severity}`;
		const count = document.createElement('span');
		count.className = 'll-diagnostic-badge-count';
		count.textContent = String(this.cluster.diagnostics.length);
		badge.append(count);
		badge.setAttribute('aria-label', diagnosticLabel(this.cluster));
		badge.title = diagnosticLabel(this.cluster);
		badge.addEventListener('mousedown', (event) => event.preventDefault());
		const lead = () => this.cluster.diagnostics[0];
		// Reaching the badge with the keyboard or the mouse button is a decision
		// already made, so those reveal at once; only pointing serves the wait.
		const activate = () => {
			const diagnostic = lead();
			if (diagnostic) {
				this.hover.cancel();
				this.activate?.(diagnostic);
			}
		};
		badge.addEventListener('mouseenter', () => {
			const diagnostic = lead();
			if (diagnostic) {
				this.hover.arm(diagnostic);
			}
		});
		badge.addEventListener('mouseleave', () => this.hover.cancel());
		badge.addEventListener('focus', activate);
		container.append(badge);

		if (this.cluster.diagnostics.length === 1) {
			badge.addEventListener('click', activate);
			return container;
		}

		const menu = document.createElement('span');
		menu.className = 'll-diagnostic-cluster-menu';
		menu.hidden = true;
		menu.setAttribute('role', 'menu');
		menu.setAttribute('aria-label', 'Overlapping diagnostics');
		badge.setAttribute('aria-haspopup', 'menu');
		badge.setAttribute('aria-expanded', 'false');
		const closeMenu = (): void => {
			this.stopWatchingOutside();
			if (menu.hidden) return;
			menu.hidden = true;
			badge.setAttribute('aria-expanded', 'false');
		};
		badge.addEventListener('click', () => {
			// A click beat the wait: the menu is the answer now, and a card landing
			// on top of it a moment later would be answering a question already put.
			this.hover.cancel();
			if (!menu.hidden) {
				closeMenu();
				return;
			}
			menu.hidden = false;
			badge.setAttribute('aria-expanded', 'true');
			this.watchOutside(container, closeMenu);
		});
		for (const diagnostic of this.cluster.diagnostics) {
			const item = document.createElement('button');
			item.type = 'button';
			item.className = `ll-diagnostic-cluster-item ll-diagnostic-badge-${diagnostic.severity}`;
			item.setAttribute('role', 'menuitem');
			item.textContent = `${diagnostic.severity}: ${diagnostic.message}`;
			item.addEventListener('mousedown', (event) => event.preventDefault());
			item.addEventListener('click', () => {
				this.hover.cancel();
				this.activate?.(diagnostic);
				closeMenu();
			});
			menu.append(item);
		}
		container.append(menu);
		return container;
	}

	// The badge is rebuilt whenever its line's diagnostics change; a wait armed
	// against the old one must not fire against the new, and a watcher left on the
	// document would outlive the menu it was closing.
	destroy(): void {
		this.hover.cancel();
		this.stopWatchingOutside();
	}

	ignoreEvent(): boolean {
		return false;
	}
}

class BlankLineDiagnosticWidget extends WidgetType {
	constructor(
		readonly diagnostic: Diagnostic,
		readonly range: TextRange
	) {
		super();
	}

	eq(other: BlankLineDiagnosticWidget): boolean {
		return (
			other.diagnostic === this.diagnostic &&
			other.range.from === this.range.from &&
			other.range.to === this.range.to
		);
	}

	toDOM(): HTMLElement {
		const marker = document.createElement('span');
		marker.className =
			`ll-diagnostic-range ll-diagnostic-blank-line ` +
			`ll-diagnostic-blank-line-${this.diagnostic.severity}`;
		marker.textContent = '↵';
		marker.setAttribute('aria-label', `${this.diagnostic.severity}: ${this.diagnostic.message}`);
		marker.setAttribute(diagnosticRangeAttribute, `${this.diagnostic.from}:${this.diagnostic.to}`);
		marker.setAttribute(diagnosticAnchorAttribute, `${this.range.from}:${this.range.to}`);
		return marker;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

interface LintDecorationState {
	revision?: number;
	diagnostics: Diagnostic[];
	active?: Diagnostic;
	decorations: DecorationSet;
}

function activeRelatedDiagnostic(
	state: EditorState,
	diagnostics: readonly Diagnostic[]
): Diagnostic | undefined {
	const selection = state.selection.main;
	return diagnostics.find(
		(diagnostic) =>
			diagnostic.relatedRanges?.length &&
			selection.from === diagnostic.from &&
			selection.to === diagnostic.to
	);
}

function buildDecorations(
	state: EditorState,
	diagnostics: readonly Diagnostic[],
	active?: Diagnostic
): DecorationSet {
	const callbacks = state.field(editorCallbacksField);
	const ranges: Range<Decoration>[] = [];

	for (const diagnostic of diagnostics) {
		for (const range of [diagnostic, ...(diagnostic.relatedRanges ?? [])]) {
			if (range.from >= range.to || !isValidRange(range, state.doc.length)) {
				continue;
			}
			const text = state.doc.sliceString(range.from, range.to);
			if (text.trim().length === 0 && /[\r\n]/u.test(text)) {
				ranges.push(
					Decoration.widget({
						widget: new BlankLineDiagnosticWidget(diagnostic, range),
						side: 1
					}).range(range.from)
				);
				continue;
			}
			ranges.push(
				Decoration.mark({
					class:
						`ll-diagnostic-range ll-diagnostic-${diagnostic.severity}` +
						(diagnostic === active ? ' ll-diagnostic-range--active' : ''),
					attributes: {
						'aria-label': `${diagnostic.severity}: ${diagnostic.message}`,
						// No native `title`: the popover is this underline's tooltip, and
						// a browser tooltip would sit on top of it saying the same thing.
						//
						// Keep the diagnostic identity and the occurrence it draws separate.
						// Related ranges share the first, while the popover must hang from the
						// particular second one under the pointer.
						[diagnosticRangeAttribute]: `${diagnostic.from}:${diagnostic.to}`,
						[diagnosticAnchorAttribute]: `${range.from}:${range.to}`
					}
				}).range(range.from, range.to)
			);
		}
	}

	// Per the approved design, only lines carrying two or more diagnostics get a
	// circled count badge at the end of the line; a single diagnostic keeps just
	// its severity underline.
	const byLine = new Map<number, Diagnostic[]>();
	for (const diagnostic of diagnostics) {
		const line = state.doc.lineAt(diagnostic.from).number;
		const existing = byLine.get(line);
		if (existing) {
			existing.push(diagnostic);
		} else {
			byLine.set(line, [diagnostic]);
		}
	}
	for (const [lineNumber, lineDiagnostics] of byLine) {
		if (lineDiagnostics.length < 2) {
			continue;
		}
		const line = state.doc.line(lineNumber);
		const sorted = sortDiagnostics(lineDiagnostics);
		const cluster: DiagnosticCluster = {
			from: Math.min(...sorted.map((item) => item.from)),
			to: Math.max(...sorted.map((item) => item.to)),
			line: lineNumber,
			severity: sorted[0]?.severity ?? 'suggestion',
			diagnostics: sorted
		};
		ranges.push(
			Decoration.widget({
				widget: new DiagnosticBadge(cluster, callbacks?.onDiagnosticActivate),
				side: 1
			}).range(line.to)
		);
	}

	return Decoration.set(ranges, true);
}

export const lintDecorationField = StateField.define<LintDecorationState>({
	create: () => ({ diagnostics: [], decorations: Decoration.none }),
	update(value, transaction) {
		if (transaction.docChanged) {
			value = { diagnostics: [], decorations: Decoration.none };
		}

		for (const effect of transaction.effects) {
			if (!effect.is(setDiagnosticsEffect)) {
				continue;
			}

			const currentRevision = transaction.state.field(editorRevisionField);
			if (effect.value.revision !== currentRevision) {
				continue;
			}

			const diagnostics = sortDiagnostics(
				effect.value.items.filter((diagnostic) =>
					isValidRange(diagnostic, transaction.state.doc.length)
				)
			);
			const active = activeRelatedDiagnostic(transaction.state, diagnostics);
			value = {
				revision: currentRevision,
				diagnostics,
				active,
				decorations: buildDecorations(transaction.state, diagnostics, active)
			};
		}

		if (transaction.selection && value.diagnostics.length > 0) {
			const active = activeRelatedDiagnostic(transaction.state, value.diagnostics);
			if (active !== value.active) {
				value = {
					...value,
					active,
					decorations: buildDecorations(transaction.state, value.diagnostics, active)
				};
			}
		}

		return value;
	},
	provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
});

export function diagnosticsForState(state: EditorState): Diagnostic[] {
	const value = state.field(lintDecorationField, false);
	if (!value || value.revision !== state.field(editorRevisionField)) {
		return [];
	}
	return value.diagnostics;
}

interface DiagnosticHit {
	diagnostic: Diagnostic;
	range: TextRange;
}

/** Resolve the underline's own occurrence back to the diagnostic that drew it. */
function diagnosticForUnderline(
	underline: Element,
	diagnostics: readonly Diagnostic[]
): DiagnosticHit | undefined {
	const serializedRange = (attribute: string): TextRange | undefined => {
		const [from, to] = (underline.getAttribute(attribute) ?? '').split(':').map(Number);
		return Number.isSafeInteger(from) && Number.isSafeInteger(to) ? { from, to } : undefined;
	};
	const identity = serializedRange(diagnosticRangeAttribute);
	if (!identity) {
		return undefined;
	}
	const diagnostic = diagnostics.find(
		(candidate) => candidate.from === identity.from && candidate.to === identity.to
	);
	return diagnostic
		? { diagnostic, range: serializedRange(diagnosticAnchorAttribute) ?? identity }
		: undefined;
}

/**
 * Both range ends count as hits. A one-character underline is the common case,
 * and its right half maps to the range's end offset, which strict containment
 * would reject — the pointer would then sit on the underline with no card.
 */
function diagnosticAtPosition(
	diagnostics: readonly Diagnostic[],
	position: number
): DiagnosticHit | undefined {
	for (const inclusiveEnd of [false, true]) {
		for (const diagnostic of diagnostics) {
			for (const range of [diagnostic, ...(diagnostic.relatedRanges ?? [])]) {
				if (range.from <= position && (inclusiveEnd ? position <= range.to : position < range.to)) {
					return { diagnostic, range: { from: range.from, to: range.to } };
				}
			}
		}
	}
	return undefined;
}

function diagnosticAtPointer(event: MouseEvent, view: EditorView): DiagnosticHit | undefined {
	const target = event.target instanceof Element ? event.target : undefined;
	const diagnostics = diagnosticsForState(view.state);
	const underline = target?.closest('.ll-diagnostic-range');
	if (underline) {
		// Coordinates are the fallback only: resolving the underline's own range is
		// both exact and cheap enough to run on every pointer move.
		const fromRange = diagnosticForUnderline(underline, diagnostics);
		if (fromRange) {
			return fromRange;
		}
		const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
		return position === null ? undefined : diagnosticAtPosition(diagnostics, position);
	}
	// The replacement text a preview inserts belongs to the diagnostic that
	// proposed it: it sits beside the words it replaces, and a card that opened
	// over the struck-through half but not the new one made the more interesting
	// half of the diff a dead zone. The widget has no text of its own to read
	// coordinates against, so its place in the document is what resolves it.
	const inserted = target?.closest('.ll-fix-preview-insert');
	if (inserted) {
		return diagnosticAtPosition(diagnostics, view.posAtDOM(inserted));
	}
	const blankLinePreview = target?.closest('.ll-fix-preview-blank-line');
	if (!blankLinePreview) {
		return undefined;
	}
	const marker = blankLinePreview.closest('.cm-line')?.querySelector('.ll-diagnostic-blank-line');
	return marker
		? diagnosticForUnderline(marker, diagnostics)
		: diagnosticAtPosition(diagnostics, view.posAtDOM(blankLinePreview));
}

/**
 * Show the underlined diagnostic while the pointer rests on it.
 *
 * Pointing is what reveals a diagnostic; clicking is left alone so a tap does
 * what a tap does everywhere else in a text field — place the caret. The
 * popover takes it from here: it stays up while the pointer travels toward it
 * and closes once the pointer leaves both it and the underline.
 */
export function diagnosticRangeHoverHandler(): Extension {
	return ViewPlugin.fromClass(
		class {
			readonly hover: HoverIntent<Diagnostic>;
			range?: TextRange;

			constructor(view: EditorView) {
				// Resolved when the wait elapses rather than now: a re-lint between
				// arming and firing must not reveal through a retired callback set.
				this.hover = new HoverIntent<Diagnostic>((diagnostic) =>
					view.state.field(editorCallbacksField)?.onDiagnosticActivate(diagnostic, this.range)
				);
			}

			destroy(): void {
				this.hover.cancel();
			}
		},
		{
			eventHandlers: {
				mousemove(event: MouseEvent, view: EditorView) {
					// A held button means the pointer is dragging out a selection, not
					// pointing at anything; cards popping up along the way would land
					// under the very text being swept over. Composition owns the surface
					// outright.
					const busy =
						event.buttons !== 0 || view.composing || view.state.field(editorComposingField, false);
					const hit = busy ? undefined : diagnosticAtPointer(event, view);
					if (hit) {
						this.range = hit.range;
						// The diagnostic is the stable hover identity; the exact occurrence is
						// kept beside it so repeated pointer moves do not restart the wait.
						this.hover.arm(hit.diagnostic);
					} else {
						this.range = undefined;
						this.hover.cancel();
					}
					// Never handled: pointer moves belong to selection dragging.
					return false;
				},
				// Leaving the text and pressing into it are both answers to the
				// question the wait was asking. Neither may be followed by a card.
				mouseleave() {
					this.range = undefined;
					this.hover.cancel();
					return false;
				},
				mousedown() {
					this.range = undefined;
					this.hover.cancel();
					return false;
				}
			}
		}
	);
}

export const lintDecorationTheme = EditorView.baseTheme({
	'.ll-diagnostic-range': {
		position: 'relative',
		zIndex: '2',
		// Underlined text is still text: the caret cursor is the promise that a
		// click puts the caret here rather than opening something.
		cursor: 'text',
		textDecorationLine: 'underline',
		textDecorationStyle: 'wavy',
		textDecorationThickness: '1.5px',
		textUnderlineOffset: '3px'
	},
	'.ll-diagnostic-range--active': {
		backgroundColor: 'var(--color-text-selection)'
	},
	'.ll-diagnostic-blank-line': {
		display: 'inline-block',
		paddingInline: '0.15em',
		color: 'var(--color-text-muted)'
	},
	'.cm-line:has(.ll-fix-preview-blank-line) .ll-diagnostic-blank-line': {
		borderRadius: 'var(--radius-xs)',
		background: 'color-mix(in oklch, var(--color-danger) 16%, transparent)',
		textDecoration: 'none',
		boxShadow: 'inset 0 -2px 0 var(--color-danger)'
	},
	'.cm-line:has(.ll-diagnostic-blank-line) .ll-fix-preview-blank-line': {
		display: 'none'
	},
	'.ll-diagnostic-blank-line-error': {
		textDecorationColor: 'var(--color-danger)'
	},
	'.ll-diagnostic-blank-line-warning': {
		textDecorationColor: 'var(--color-warning)'
	},
	'.ll-diagnostic-blank-line-suggestion': {
		textDecorationColor: 'var(--color-suggestion)'
	},
	'.ll-diagnostic-blank-line-manual-review': {
		textDecorationColor: 'var(--color-manual)'
	},
	'.ll-diagnostic-error': {
		textDecorationColor: 'var(--color-danger)'
	},
	'.ll-diagnostic-warning': {
		textDecorationColor: 'var(--color-warning)'
	},
	'.ll-diagnostic-suggestion': {
		textDecorationColor: 'var(--color-suggestion)'
	},
	'.ll-diagnostic-manual-review': {
		textDecorationColor: 'var(--color-manual)'
	},
	// Position marker: a small caret sits under the offending character so the
	// exact spot (e.g. a trailing comma) is unambiguous.
	'.ll-diagnostic-warning::after': {
		content: '"˄"',
		position: 'absolute',
		bottom: '-0.72em',
		left: '0',
		color: 'var(--color-warning)',
		fontFamily: 'var(--font-ui)',
		fontSize: '0.62em',
		fontWeight: 'var(--font-weight-bold)',
		lineHeight: '1',
		pointerEvents: 'none'
	},
	'.ll-diagnostic-badge-container': {
		position: 'relative',
		display: 'inline-block'
	},
	// Cluster badges are filled circles in the severity color with dark count
	// text (mockup: the amber "2" past the end of the line).
	'.ll-diagnostic-badge': {
		boxSizing: 'border-box',
		minWidth: '1.15rem',
		height: '1.15rem',
		marginInlineStart: 'var(--space-1-5)',
		padding: '0 var(--space-1)',
		border: 'none',
		borderRadius: 'var(--radius-pill)',
		background: 'currentColor',
		fontFamily: 'var(--font-ui)',
		fontSize: 'var(--font-size-2xs)',
		fontWeight: 'var(--font-weight-bold)',
		lineHeight: '1.15rem',
		textAlign: 'center',
		verticalAlign: '0.16rem',
		cursor: 'pointer'
	},
	'.ll-diagnostic-badge > .ll-diagnostic-badge-count': {
		color: 'var(--color-canvas)'
	},
	// `--ll-focus` was never defined anywhere, so this ring had been rendering in
	// its literal fallback — an off-palette orange at a width the focus tokens
	// did not control.
	'.ll-diagnostic-badge:focus-visible': {
		outline: 'var(--focus-ring-width) solid var(--color-focus)',
		outlineOffset: 'var(--focus-ring-offset)'
	},
	'.ll-diagnostic-cluster-menu': {
		position: 'absolute',
		zIndex: 'var(--layer-menu)',
		top: 'calc(100% + var(--space-1))',
		right: '0',
		boxSizing: 'border-box',
		width: 'min(22rem, calc(100vw - 1rem))',
		padding: 'var(--space-1)',
		border: 'var(--border-width) solid var(--color-border)',
		borderRadius: 'var(--radius-panel)',
		background: 'var(--color-overlay)',
		color: 'var(--color-text)',
		boxShadow: 'var(--shadow-overlay)'
	},
	'.ll-diagnostic-cluster-menu[hidden]': {
		display: 'none'
	},
	'.ll-diagnostic-cluster-item': {
		display: 'block',
		width: '100%',
		padding: 'var(--space-1-5) var(--space-2)',
		border: '0',
		borderRadius: 'var(--radius-control)',
		background: 'transparent',
		color: 'inherit',
		fontFamily: 'var(--font-ui)',
		fontSize: 'var(--font-size-xs)',
		fontWeight: 'var(--font-weight-medium)',
		lineHeight: 'var(--line-height-ui)',
		textAlign: 'start',
		cursor: 'pointer'
	},
	'.ll-diagnostic-cluster-item:hover': {
		background: 'var(--color-control-hover)'
	},
	'.ll-diagnostic-badge-error': {
		color: 'var(--color-danger)'
	},
	'.ll-diagnostic-badge-warning': {
		color: 'var(--color-warning)'
	},
	'.ll-diagnostic-badge-suggestion': {
		color: 'var(--color-suggestion)'
	},
	'.ll-diagnostic-badge-manual-review': {
		color: 'var(--color-manual)'
	}
});
