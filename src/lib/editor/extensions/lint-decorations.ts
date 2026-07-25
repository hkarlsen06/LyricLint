import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension, Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { Diagnostic, Severity } from '$lib/core/types.js';
import type { RevisionedDiagnostics } from '../contracts.js';
import { editorCallbacksField, editorComposingField, editorRevisionField } from './editor-state.js';

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

/** Serialized `from:to` of the diagnostic a severity underline belongs to. */
const diagnosticRangeAttribute = 'data-ll-diagnostic-range';

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

function isValidDiagnostic(diagnostic: Diagnostic, documentLength: number): boolean {
	return (
		Number.isSafeInteger(diagnostic.from) &&
		Number.isSafeInteger(diagnostic.to) &&
		diagnostic.from >= 0 &&
		diagnostic.from <= diagnostic.to &&
		diagnostic.to <= documentLength
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

/**
 * How long the pointer has to settle on one diagnostic before its card appears.
 *
 * Long enough that crossing a lint-heavy verse on the way somewhere else opens
 * nothing, short enough to read as immediate to anyone who actually stopped.
 * A pointer merely passing through clears any one target well inside this.
 */
const hoverIntentDelay = 110;

/**
 * The wait a pointer serves before a diagnostic reveals itself.
 *
 * Every pointer route onto a diagnostic — the severity underline and the count
 * badge at the end of the line — shares this, so a pointer crossing a crowded
 * line meets one rule rather than a different one per target. Arming is a no-op
 * for the diagnostic already pending, which is what lets a pointer that comes
 * to a complete stop, emitting no further events at all, still open the card.
 */
class HoverIntent {
	private pending?: Diagnostic;
	private timer?: ReturnType<typeof setTimeout>;

	constructor(private readonly reveal: (diagnostic: Diagnostic) => void) {}

	arm(diagnostic: Diagnostic): void {
		if (this.pending === diagnostic) {
			return;
		}
		this.cancel();
		this.pending = diagnostic;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			this.pending = undefined;
			this.reveal(diagnostic);
		}, hoverIntentDelay);
	}

	cancel(): void {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		this.pending = undefined;
	}
}

class DiagnosticBadge extends WidgetType {
	/** The badge's own pending reveal, for the diagnostic it leads with. */
	private readonly hover = new HoverIntent((diagnostic) => this.activate?.(diagnostic));

	constructor(
		readonly cluster: DiagnosticCluster,
		readonly activate: ((diagnostic: Diagnostic) => void) | undefined
	) {
		super();
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
		badge.addEventListener('click', () => {
			// A click beat the wait: the menu is the answer now, and a card landing
			// on top of it a moment later would be answering a question already put.
			this.hover.cancel();
			menu.hidden = !menu.hidden;
			badge.setAttribute('aria-expanded', String(!menu.hidden));
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
				menu.hidden = true;
				badge.setAttribute('aria-expanded', 'false');
			});
			menu.append(item);
		}
		container.append(menu);
		return container;
	}

	// The badge is rebuilt whenever its line's diagnostics change; a wait armed
	// against the old one must not fire against the new.
	destroy(): void {
		this.hover.cancel();
	}

	ignoreEvent(): boolean {
		return false;
	}
}

interface LintDecorationState {
	revision?: number;
	diagnostics: Diagnostic[];
	decorations: DecorationSet;
}

function buildDecorations(state: EditorState, diagnostics: readonly Diagnostic[]): DecorationSet {
	const callbacks = state.field(editorCallbacksField);
	const ranges: Range<Decoration>[] = [];

	for (const diagnostic of diagnostics) {
		if (diagnostic.from < diagnostic.to) {
			ranges.push(
				Decoration.mark({
					class: `ll-diagnostic-range ll-diagnostic-${diagnostic.severity}`,
					attributes: {
						'aria-label': `${diagnostic.severity}: ${diagnostic.message}`,
						// No native `title`: the popover is this underline's tooltip, and
						// a browser tooltip would sit on top of it saying the same thing.
						//
						// The underline carries its own range so hovering resolves back to
						// the exact diagnostic without re-deriving it from coordinates.
						[diagnosticRangeAttribute]: `${diagnostic.from}:${diagnostic.to}`
					}
				}).range(diagnostic.from, diagnostic.to)
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
					isValidDiagnostic(diagnostic, transaction.state.doc.length)
				)
			);
			value = {
				revision: currentRevision,
				diagnostics,
				decorations: buildDecorations(transaction.state, diagnostics)
			};
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

/** Resolve the underline's own range back to the diagnostic that drew it. */
function diagnosticForUnderline(
	underline: Element,
	diagnostics: readonly Diagnostic[]
): Diagnostic | undefined {
	const [from, to] = (underline.getAttribute(diagnosticRangeAttribute) ?? '')
		.split(':')
		.map(Number);
	if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) {
		return undefined;
	}
	return diagnostics.find((candidate) => candidate.from === from && candidate.to === to);
}

/**
 * Both range ends count as hits. A one-character underline is the common case,
 * and its right half maps to the range's end offset, which strict containment
 * would reject — the pointer would then sit on the underline with no card.
 */
function diagnosticAtPosition(
	diagnostics: readonly Diagnostic[],
	position: number
): Diagnostic | undefined {
	return (
		diagnostics.find((candidate) => candidate.from <= position && position < candidate.to) ??
		diagnostics.find((candidate) => candidate.from <= position && position <= candidate.to)
	);
}

function diagnosticAtPointer(event: MouseEvent, view: EditorView): Diagnostic | undefined {
	const target = event.target instanceof Element ? event.target : undefined;
	const underline = target?.closest('.ll-diagnostic-range');
	if (!underline) {
		return undefined;
	}
	const diagnostics = diagnosticsForState(view.state);
	// Coordinates are the fallback only: resolving the underline's own range is
	// both exact and cheap enough to run on every pointer move.
	const fromRange = diagnosticForUnderline(underline, diagnostics);
	if (fromRange) {
		return fromRange;
	}
	const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
	return position === null ? undefined : diagnosticAtPosition(diagnostics, position);
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
			readonly hover: HoverIntent;

			constructor(view: EditorView) {
				// Resolved when the wait elapses rather than now: a re-lint between
				// arming and firing must not reveal through a retired callback set.
				this.hover = new HoverIntent((diagnostic) =>
					view.state.field(editorCallbacksField)?.onDiagnosticActivate(diagnostic)
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
					const diagnostic = busy ? undefined : diagnosticAtPointer(event, view);
					if (diagnostic) {
						this.hover.arm(diagnostic);
					} else {
						this.hover.cancel();
					}
					// Never handled: pointer moves belong to selection dragging.
					return false;
				},
				// Leaving the text and pressing into it are both answers to the
				// question the wait was asking. Neither may be followed by a card.
				mouseleave() {
					this.hover.cancel();
					return false;
				},
				mousedown() {
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
