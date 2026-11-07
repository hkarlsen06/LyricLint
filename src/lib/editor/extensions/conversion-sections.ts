import { canRenderSection, canRetainSectionHeader } from '#lib/conversion/section-placement.js';
import { StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
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

export const conversionSectionBoundaries: Extension = [
	sectionBoundaryField,
	EditorView.baseTheme({
		'.cm-content': { '--ll-section-control-height': 'var(--control-height-md)' },
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
		'.ll-conversion-sections': {
			userSelect: 'none'
		},
		'.ll-conversion-section-row': { display: 'grid' },
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
			maxWidth: '100%',
			whiteSpace: 'normal',
			textAlign: 'start',
			overflowWrap: 'anywhere',
			fontFamily: 'var(--font-ui)',
			fontSize: 'var(--font-size-sm)'
		},
		'@media (max-width: 46rem)': {
			'.cm-content': { '--ll-section-control-height': 'var(--control-height-lg)' }
		},
		'@media (pointer: coarse)': {
			'.cm-content': { '--ll-section-control-height': 'var(--control-height-touch)' }
		}
	})
];
