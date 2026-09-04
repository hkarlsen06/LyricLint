import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { Diagnostic, ParsedDocument, TextRange } from '$lib/core/types.js';
import { editorCallbacksField, isCompositionChange } from './editor-state.js';

interface SectionGhostContext {
	parsed: ParsedDocument;
	diagnostics: readonly Diagnostic[];
}

export const setHeaderlessSectionsEffect = StateEffect.define<SectionGhostContext>();

class SectionGhostWidget extends WidgetType {
	constructor(
		readonly range: TextRange,
		readonly activate: ((range: TextRange) => void) | undefined
	) {
		super();
	}

	eq(other: SectionGhostWidget): boolean {
		return other.range.from === this.range.from && other.range.to === this.range.to;
	}

	toDOM(): HTMLElement {
		const row = document.createElement('div');
		row.className = 'll-section-ghost';
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'll-section-ghost-button';
		button.textContent = '+ Add section header';
		button.addEventListener('mousedown', (event) => event.preventDefault());
		button.addEventListener('click', () => this.activate?.(this.range));
		row.append(button);
		return row;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

function buildGhosts(state: EditorState, context: SectionGhostContext): DecorationSet {
	const { parsed, diagnostics } = context;
	if (parsed.text !== state.doc.toString()) {
		return Decoration.none;
	}

	const callbacks = state.field(editorCallbacksField);
	const ranges: Range<Decoration>[] = [];
	for (const section of parsed.sections) {
		const firstLine = section.lines[0];
		if (section.header || !firstLine) {
			continue;
		}
		// A prose-header finding means the line already names this section; its
		// repair is to bracket that line, not to insert a second header above it.
		// The diagnostics here are already occurrence-filtered, so ignoring that
		// finding deliberately restores this fallback action.
		if (
			diagnostics.some(
				(diagnostic) =>
					diagnostic.ruleId === 'section.header-prose' &&
					diagnostic.from === firstLine.from &&
					diagnostic.to === firstLine.to
			)
		) {
			continue;
		}
		const range = { from: firstLine.from, to: firstLine.to };
		ranges.push(
			Decoration.widget({
				block: true,
				side: -1,
				widget: new SectionGhostWidget(range, (selectedRange) =>
					callbacks?.onSectionHeaderRequest({ range: selectedRange, prefer: 'above' })
				)
			}).range(firstLine.from)
		);
	}
	return Decoration.set(ranges, true);
}

export const sectionGhostField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, transaction) {
		if (transaction.docChanged) {
			value = isCompositionChange(transaction) ? value.map(transaction.changes) : Decoration.none;
		}
		for (const effect of transaction.effects) {
			if (effect.is(setHeaderlessSectionsEffect)) {
				value = buildGhosts(transaction.state, effect.value);
			}
		}
		return value;
	},
	provide: (field) => EditorView.decorations.from(field)
});

export const sectionGhostTheme = EditorView.baseTheme({
	'.ll-section-ghost': {
		padding: 'var(--space-1-5) 0 var(--space-1-5)'
	},
	// A dashed chip offering to add something that is not there yet, so the pill
	// radius is the categorical one it is entitled to — this is a chip, not an
	// action button in the shell's button vocabulary.
	'.ll-section-ghost-button': {
		padding: 'var(--space-1) var(--space-3)',
		border: 'var(--border-width) dashed var(--color-border-strong)',
		borderRadius: 'var(--radius-pill)',
		background: 'transparent',
		color: 'var(--color-text-muted)',
		fontFamily: 'var(--font-ui)',
		fontSize: 'var(--font-size-xs)',
		fontWeight: 'var(--font-weight-medium)',
		lineHeight: 'var(--line-height-tight)',
		cursor: 'pointer'
	},
	'.ll-section-ghost-button:hover': {
		borderColor: 'var(--color-text)',
		background: 'var(--color-control-hover)',
		color: 'var(--color-text)'
	},
	'.ll-section-ghost-button:focus-visible': {
		outline: 'var(--focus-ring-width) solid var(--color-focus)',
		outlineOffset: 'var(--focus-ring-offset)'
	}
});
