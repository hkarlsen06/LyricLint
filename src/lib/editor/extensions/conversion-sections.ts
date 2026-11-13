import { canRenderSection, canRetainSectionHeader } from '#lib/conversion/section-placement.js';
import {
	RangeSet,
	StateField,
	type EditorState,
	type Extension,
	type Range
} from '@codemirror/state';
import {
	Decoration,
	EditorView,
	GutterMarker,
	WidgetType,
	gutterLineClass,
	type DecorationSet
} from '@codemirror/view';
import { conversionForState } from './conversion-state.js';
import {
	editorCallbacksField,
	isCompositionChange,
	parsedDocumentForState
} from './editor-state.js';
import { pressed } from './widget-press.js';
import { conversionSectionLocal } from './conversion-scope.js';

interface BoundarySection {
	id: string;
	label: string;
	header: string;
	empty: boolean;
	local: boolean;
}

/** Section controls are decorations. They never become lyrics or clipboard text. */
class SectionBoundaryWidget extends WidgetType {
	constructor(readonly sections: readonly BoundarySection[]) {
		super();
	}
	eq(other: SectionBoundaryWidget): boolean {
		return (
			this.sections.length === other.sections.length &&
			this.sections.every(
				(section, index) =>
					section.id === other.sections[index]?.id &&
					section.label === other.sections[index]?.label &&
					section.header === other.sections[index]?.header &&
					section.empty === other.sections[index]?.empty &&
					section.local === other.sections[index]?.local
			)
		);
	}
	toDOM(view: EditorView): HTMLElement {
		const row = document.createElement('div');
		row.className = 'll-conversion-sections';
		row.contentEditable = 'false';
		for (const section of this.sections) {
			const item = document.createElement('div');
			item.className = 'll-conversion-section-row';
			const size = document.createElement('span');
			size.className = 'll-conversion-heading-size';
			size.dataset.heading = section.header;
			size.setAttribute('aria-hidden', 'true');
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'button button--quiet ll-conversion-section';
			button.dataset.sectionId = section.id;
			button.textContent = `${section.label}${section.empty ? ' · Empty section' : ''}${section.local ? ' · Editing only here' : ''}`;
			if (section.local) button.dataset.localEditing = 'true';
			button.setAttribute(
				'aria-label',
				`Edit ${section.label}${section.empty ? ', empty section' : ''} details${section.local ? ', editing only here' : ''}`
			);
			button.setAttribute('aria-haspopup', 'false');
			const open = () =>
				view.state.field(editorCallbacksField, false)?.onSectionDetailRequest?.(section.id);
			button.addEventListener('mousedown', (event) => event.preventDefault());
			button.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				open();
			});
			pressed(button, open);
			item.append(size, button);
			row.append(item);
		}
		return row;
	}
	ignoreEvent(): boolean {
		return true;
	}
}

function boundaries(state: EditorState): DecorationSet {
	const conversion = conversionForState(state);
	if (conversion?.recovery || !state.field(editorCallbacksField, false)?.onSectionDetailRequest)
		return Decoration.none;
	if (!conversion || conversion.envelope.profile === 'genius') {
		const currentProjection =
			conversion?.projection.text === state.doc.toString() ? conversion.projection : undefined;
		const retainedStarts =
			currentProjection &&
			new Set(
				currentProjection.sections.flatMap((section) =>
					section.headerFrom === undefined ? [] : [state.doc.lineAt(section.headerFrom).from]
				)
			);
		return Decoration.set(
			parsedDocumentForState(state).sections.flatMap((section) => {
				const header = section.header;
				if (!header?.closed) return [];
				const lineStart = state.doc.lineAt(header.from).from;
				const retained = retainedStarts
					? retainedStarts.has(lineStart)
					: canRetainSectionHeader(header);
				return [
					Decoration.line({
						class: retained ? 'll-conversion-heading' : 'll-conversion-literal-heading'
					}).range(lineStart)
				];
			}),
			true
		);
	}
	const groups = new Map<number, BoundarySection[]>();
	for (const section of conversion.projection.sections) {
		const record = conversion.envelope.model.sections.find((entry) => entry.id === section.id);
		if (record && !canRenderSection(conversion.envelope.model, record)) continue;
		const group = groups.get(section.at) ?? [];
		group.push({
			id: section.id,
			label: section.type ?? section.name ?? 'Section',
			header: (record?.header ?? `[${section.type ?? section.name ?? 'Section'}]`).replace(
				/\r?\n$|\r$/u,
				''
			),
			empty: record?.explicitEmpty ?? false,
			local: conversionSectionLocal(state) === section.id
		});
		groups.set(section.at, group);
	}
	return Decoration.set(
		[...groups].map(([at, sections]) =>
			Decoration.widget({
				widget: new SectionBoundaryWidget(sections),
				block: true,
				side: -1
			}).range(Math.min(at, state.doc.length))
		),
		true
	);
}

const sectionBoundaryField = StateField.define<DecorationSet>({
	create: boundaries,
	update(value, transaction) {
		if (isCompositionChange(transaction)) return value.map(transaction.changes);
		const previous = conversionForState(transaction.startState);
		const next = conversionForState(transaction.state);
		return previous !== next ||
			conversionSectionLocal(transaction.startState) !==
				conversionSectionLocal(transaction.state) ||
			transaction.docChanged ||
			transaction.startState.field(editorCallbacksField, false) !==
				transaction.state.field(editorCallbacksField, false)
			? boundaries(transaction.state)
			: value;
	},
	provide: (field) => EditorView.decorations.from(field)
});

const headingGutterMarker = new (class extends GutterMarker {
	override elementClass = 'll-conversion-heading-gutter';
})();

export const conversionSectionBoundaries: Extension = [
	sectionBoundaryField,
	// A retained heading's row is padded taller than a lyric's, so its line
	// number takes the same top padding to stay level with the text.
	gutterLineClass.compute([sectionBoundaryField], (state) => {
		const marks: Range<GutterMarker>[] = [];
		state.field(sectionBoundaryField).between(0, state.doc.length, (from, _to, value) => {
			if (value.spec.class === 'll-conversion-heading') marks.push(headingGutterMarker.range(from));
		});
		return RangeSet.of(marks);
	}),
	EditorView.baseTheme({
		// On the scroller so the gutters resolve it as well as the lines.
		'.cm-scroller': { '--ll-section-control-height': 'var(--control-height-md)' },
		'.ll-conversion-literal-heading .ll-syntax-dim': { fontFamily: 'inherit' },
		'.cm-line.ll-conversion-heading, .ll-conversion-heading-size': {
			boxSizing: 'border-box',
			minHeight: 'calc(var(--ll-section-control-height) + 2 * var(--space-1))',
			paddingBlock:
				'max(0px, calc((var(--ll-section-control-height) + 2 * var(--space-1) - 1lh) / 2))',
			fontFamily: 'var(--font-mono)',
			fontSize: 'var(--font-size-editor)',
			lineHeight: 'var(--line-height-editor)',
			wordBreak: 'break-all'
		},
		// `1lh` here would be the gutter's own small type, so the heading line's
		// height is spelled out from the tokens it is set in.
		'.cm-lineNumbers .cm-gutterElement.ll-conversion-heading-gutter': {
			paddingTop:
				'calc(var(--space-0-5) + max(0px, calc((var(--ll-section-control-height) + 2 * var(--space-1) - var(--font-size-editor) * var(--line-height-editor)) / 2)))'
		},
		'.ll-conversion-sections': {
			userSelect: 'none'
		},
		// A section break reads as structure: its name, then a hairline rule
		// running to the measure. The rule sits under the label, whose own
		// surface hides the stretch of it the name stands on.
		'.ll-conversion-section-row': { display: 'grid' },
		'.ll-conversion-section-row::after': {
			content: '""',
			gridArea: '1 / 1',
			alignSelf: 'center',
			height: 'var(--border-width)',
			marginInlineEnd: 'max(var(--space-1), calc(100% - var(--measure-editor)))',
			background: 'var(--color-border)',
			pointerEvents: 'none'
		},
		'.ll-conversion-heading-size': {
			gridArea: '1 / 1',
			visibility: 'hidden',
			whiteSpace: 'break-spaces',
			overflowWrap: 'anywhere',
			paddingInlineStart: 'var(--space-1)',
			paddingInlineEnd: 'max(var(--space-1), calc(100% - var(--measure-editor)))'
		},
		'.ll-conversion-heading-size::before': { content: 'attr(data-heading)' },
		'.ll-conversion-section': {
			gridArea: '1 / 1',
			alignSelf: 'center',
			justifySelf: 'start',
			marginBlock: 'var(--space-1)',
			// The label's text starts on the lyric column, and the quiet tier's
			// hover fill reaches back into the gutter instead.
			marginInlineStart: 'calc(var(--space-1) - var(--control-padding-inline))',
			maxWidth: '100%',
			position: 'relative',
			zIndex: '1',
			paddingInlineEnd: 'var(--space-2)',
			background: 'var(--color-surface)',
			color: 'var(--color-text-muted)',
			whiteSpace: 'normal',
			textAlign: 'start',
			overflowWrap: 'anywhere',
			fontFamily: 'var(--font-ui)',
			fontSize: 'var(--font-size-xs)',
			fontWeight: 'var(--font-weight-semibold)',
			letterSpacing: '0.01em'
		},
		'.ll-conversion-section:hover': {
			background: 'var(--color-fill-subtle)',
			color: 'var(--color-text)'
		},
		'@media (max-width: 46rem)': {
			'.cm-scroller': { '--ll-section-control-height': 'var(--control-height-lg)' }
		},
		'@media (pointer: coarse)': {
			'.cm-scroller': { '--ll-section-control-height': 'var(--control-height-touch)' }
		}
	})
];
