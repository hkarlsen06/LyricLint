import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { Diagnostic, Severity } from '../../core/types.js';
import type { RevisionedDiagnostics } from '../contracts.js';
import { editorCallbacksField, editorRevisionField } from './editor-state.js';

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
	return `${cluster.diagnostics.length} overlapping diagnostics, highest severity ${cluster.severity}`;
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
		badge.textContent =
			this.cluster.diagnostics.length > 1
				? String(this.cluster.diagnostics.length)
				: this.cluster.severity === 'error'
					? '!'
					: '•';
		badge.setAttribute('aria-label', diagnosticLabel(this.cluster));
		badge.title = diagnosticLabel(this.cluster);
		badge.addEventListener('mousedown', (event) => event.preventDefault());
		const activate = () => {
			const diagnostic = this.cluster.diagnostics[0];
			if (diagnostic) {
				this.activate?.(diagnostic);
			}
		};
		badge.addEventListener('mouseenter', activate);
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
				this.activate?.(diagnostic);
				menu.hidden = true;
				badge.setAttribute('aria-expanded', 'false');
			});
			menu.append(item);
		}
		container.append(menu);
		return container;
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
						title: diagnostic.message
					}
				}).range(diagnostic.from, diagnostic.to)
			);
		}
	}

	const clusters = clusterDiagnostics(diagnostics, (offset) => state.doc.lineAt(offset).number);
	for (const cluster of clusters) {
		const line = state.doc.line(cluster.line);
		ranges.push(
			Decoration.widget({
				widget: new DiagnosticBadge(cluster, callbacks?.onDiagnosticActivate),
				side: 1
			}).range(Math.min(Math.max(cluster.to, line.from), line.to))
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

export const lintDecorationTheme = EditorView.baseTheme({
	'.ll-diagnostic-range': {
		position: 'relative',
		zIndex: '2',
		textDecorationLine: 'underline',
		textDecorationStyle: 'wavy',
		textDecorationThickness: '1.5px',
		textUnderlineOffset: '3px'
	},
	'.ll-diagnostic-error': {
		textDecorationColor: 'oklch(0.53 0.2 28)'
	},
	'.ll-diagnostic-warning': {
		textDecorationColor: 'oklch(0.66 0.16 75)'
	},
	'.ll-diagnostic-suggestion': {
		textDecorationColor: 'oklch(0.55 0.12 155)'
	},
	'.ll-diagnostic-manual-review': {
		textDecorationColor: 'oklch(0.58 0.11 305)'
	},
	'.ll-diagnostic-badge-container': {
		position: 'relative',
		display: 'inline-block'
	},
	'.ll-diagnostic-badge': {
		boxSizing: 'border-box',
		minWidth: '1.25rem',
		height: '1.25rem',
		marginInlineStart: '0.3rem',
		padding: '0 0.25rem',
		border: '1px solid currentColor',
		borderRadius: '0.375rem',
		background: 'var(--ll-surface, oklch(0.98 0.006 80))',
		color: 'var(--ll-text, oklch(0.25 0.015 70))',
		font: '600 0.7rem/1 ui-sans-serif, system-ui, sans-serif',
		verticalAlign: '0.2rem',
		cursor: 'pointer'
	},
	'.ll-diagnostic-badge:focus-visible': {
		outline: '2px solid var(--ll-focus, oklch(0.58 0.14 55))',
		outlineOffset: '2px'
	},
	'.ll-diagnostic-cluster-menu': {
		position: 'absolute',
		zIndex: '20',
		top: 'calc(100% + 0.25rem)',
		right: '0',
		boxSizing: 'border-box',
		width: 'min(22rem, calc(100vw - 1rem))',
		padding: '0.25rem',
		border: '1px solid color-mix(in oklch, currentColor 25%, transparent)',
		borderRadius: '0.375rem',
		background: 'var(--ll-surface, oklch(0.98 0.006 80))',
		boxShadow: '0 2px 8px oklch(0.2 0.01 70 / 0.14)'
	},
	'.ll-diagnostic-cluster-menu[hidden]': {
		display: 'none'
	},
	'.ll-diagnostic-cluster-item': {
		display: 'block',
		width: '100%',
		padding: '0.35rem 0.45rem',
		border: '0',
		borderRadius: '0.25rem',
		background: 'transparent',
		font: '500 0.75rem/1.3 ui-sans-serif, system-ui, sans-serif',
		textAlign: 'start',
		cursor: 'pointer'
	},
	'.ll-diagnostic-cluster-item:hover': {
		background: 'color-mix(in oklch, currentColor 8%, transparent)'
	},
	'.ll-diagnostic-badge-error': {
		color: 'oklch(0.48 0.19 28)'
	},
	'.ll-diagnostic-badge-warning': {
		color: 'oklch(0.55 0.15 70)'
	},
	'.ll-diagnostic-badge-suggestion': {
		color: 'oklch(0.47 0.11 155)'
	},
	'.ll-diagnostic-badge-manual-review': {
		color: 'oklch(0.5 0.11 305)'
	}
});
