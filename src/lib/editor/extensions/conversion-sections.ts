import { StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { conversionForState } from './conversion-state.js';
import { editorCallbacksField, isCompositionChange } from './editor-state.js';
import { pressed } from './widget-press.js';
import { conversionSectionLocal } from './conversion-scope.js';

interface BoundarySection {
	id: string;
	label: string;
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
			row.append(button);
		}
		return row;
	}
	ignoreEvent(): boolean {
		return true;
	}
}

function boundaries(state: EditorState): DecorationSet {
	const conversion = conversionForState(state);
	if (
		!conversion ||
		conversion.envelope.profile !== 'musixmatch' ||
		conversion.recovery ||
		!state.field(editorCallbacksField, false)?.onSectionDetailRequest
	)
		return Decoration.none;
	const groups = new Map<number, BoundarySection[]>();
	for (const section of conversion.projection.sections) {
		const record = conversion.envelope.model.sections.find((entry) => entry.id === section.id);
		const group = groups.get(section.at) ?? [];
		group.push({
			id: section.id,
			label: section.type ?? section.name ?? 'Section',
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
		'.ll-conversion-sections': {
			display: 'flex',
			flexWrap: 'wrap',
			alignItems: 'center',
			gap: 'var(--space-1)',
			paddingBlock: 'var(--space-1)',
			fontFamily: 'var(--font-ui)',
			fontSize: 'var(--font-size-sm)',
			userSelect: 'none'
		},
		'.ll-conversion-section': {
			maxWidth: '100%',
			whiteSpace: 'normal',
			textAlign: 'start',
			overflowWrap: 'anywhere',
			fontFamily: 'var(--font-ui)',
			fontSize: 'var(--font-size-sm)'
		}
	})
];
