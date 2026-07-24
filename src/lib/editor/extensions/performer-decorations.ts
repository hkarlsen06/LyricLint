import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension, Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { PerformerRecord } from '../../core/types.js';
import type { VoiceGroupRange } from '../contracts.js';
import { editorCallbacksField } from './editor-state.js';

const MAX_VISIBLE_SEGMENTS = 3;

/**
 * Editor text tints keyed to the roster color ids. Order matches the roster
 * allocation (green, violet, …) so the first performers take the mockup's
 * colors; unknown ids hash into the same table.
 */
export const performerPalette = [
	{
		id: 'olive',
		light: 'oklch(0.9 0.06 145)',
		dark: 'oklch(0.34 0.06 145)'
	},
	{
		id: 'indigo',
		light: 'oklch(0.9 0.06 285)',
		dark: 'oklch(0.34 0.06 285)'
	},
	{
		id: 'teal',
		light: 'oklch(0.9 0.055 195)',
		dark: 'oklch(0.34 0.055 195)'
	},
	{
		id: 'ochre',
		light: 'oklch(0.9 0.055 90)',
		dark: 'oklch(0.34 0.055 90)'
	},
	{
		id: 'rose',
		light: 'oklch(0.9 0.06 20)',
		dark: 'oklch(0.34 0.06 20)'
	},
	{
		id: 'plum',
		light: 'oklch(0.9 0.06 330)',
		dark: 'oklch(0.34 0.06 330)'
	},
	{
		id: 'copper',
		light: 'oklch(0.9 0.06 48)',
		dark: 'oklch(0.34 0.06 48)'
	},
	{
		id: 'slate',
		light: 'oklch(0.9 0.035 240)',
		dark: 'oklch(0.34 0.035 240)'
	}
] as const;

export interface VoiceGroupDecorationPayload {
	groups: readonly VoiceGroupRange[];
	performers: readonly PerformerRecord[];
}

export interface PerformerSegmentStyle {
	label: string;
	/**
	 * A single tint per group: a solo performer's own hue, or for joint groups
	 * the members' hues blended into one color — a shared voice is one color,
	 * not a striped split.
	 */
	lightBackground: string;
	darkBackground: string;
	hiddenCount: number;
}

export const setVoiceGroupsEffect = StateEffect.define<VoiceGroupDecorationPayload>();

const emptyPayload: VoiceGroupDecorationPayload = { groups: [], performers: [] };

export const performerGroupsField = StateField.define<VoiceGroupDecorationPayload>({
	create: () => emptyPayload,
	update(value, transaction) {
		if (transaction.docChanged) {
			value = emptyPayload;
		}
		for (const effect of transaction.effects) {
			if (effect.is(setVoiceGroupsEffect)) {
				value = effect.value;
			}
		}
		return value;
	}
});

function paletteIndex(colorId: string): number {
	const known = performerPalette.findIndex((entry) => entry.id === colorId);
	if (known >= 0) {
		return known;
	}
	let hash = 0;
	for (let index = 0; index < colorId.length; index += 1) {
		hash = (hash * 31 + colorId.charCodeAt(index)) >>> 0;
	}
	return hash % performerPalette.length;
}

/** Blend member hues into one color: an even mix regardless of member count. */
function mixColors(colors: readonly string[]): string {
	if (colors.length === 0) {
		return 'transparent';
	}
	return colors.reduce((mixed, color, index) =>
		index === 0
			? color
			: `color-mix(in oklch, ${color} ${Math.round(100 / (index + 1))}%, ${mixed})`
	);
}

/** Stable slot/color IDs become one blended, accessible light and dark tint. */
export function voiceGroupStyle(
	performerIds: readonly string[],
	performers: readonly PerformerRecord[]
): PerformerSegmentStyle | undefined {
	const roster = new Map(performers.map((performer) => [performer.id, performer]));
	const members = performerIds
		.map((id) => roster.get(id))
		.filter((performer): performer is PerformerRecord => performer !== undefined);
	if (members.length === 0) {
		return undefined;
	}

	const visible = members.slice(0, MAX_VISIBLE_SEGMENTS);
	const colors = visible.map((performer) => performerPalette[paletteIndex(performer.colorId)]);
	return {
		label: `Performed by ${members.map((member) => member.displayName).join(', ')}`,
		lightBackground: mixColors(colors.map((color) => color.light)),
		darkBackground: mixColors(colors.map((color) => color.dark)),
		hiddenCount: Math.max(0, members.length - visible.length)
	};
}

class ExtraMemberWidget extends WidgetType {
	constructor(
		readonly count: number,
		readonly label: string
	) {
		super();
	}

	eq(other: ExtraMemberWidget): boolean {
		return other.count === this.count && other.label === this.label;
	}

	toDOM(): HTMLElement {
		const label = document.createElement('span');
		label.className = 'll-performer-overflow';
		label.textContent = `+${this.count}`;
		label.title = this.label;
		label.setAttribute('aria-label', `${this.label}, plus ${this.count} additional color segments`);
		return label;
	}
}

function safeRange(group: VoiceGroupRange, documentLength: number): boolean {
	return (
		Number.isSafeInteger(group.from) &&
		Number.isSafeInteger(group.to) &&
		group.from >= 0 &&
		group.from < group.to &&
		group.to <= documentLength
	);
}

function buildDecorations(state: EditorState, payload: VoiceGroupDecorationPayload): DecorationSet {
	const ranges: Range<Decoration>[] = [];

	for (const group of payload.groups) {
		if (!safeRange(group, state.doc.length)) {
			continue;
		}
		const style = voiceGroupStyle(group.group.performerIds, payload.performers);
		if (!style) {
			continue;
		}

		// Only the text that is actually performed gets the tint: no full-line
		// wash, and no underline — color is a quiet distinguisher, not a link.
		ranges.push(
			Decoration.mark({
				class:
					`ll-performer-highlight ll-performer-slot-${group.group.styleSlot}` +
					(group.legend ? ' ll-performer-legend-name' : ''),
				attributes: {
					'aria-label': style.label,
					title: style.label,
					style: `--ll-performer-light: ${style.lightBackground}; --ll-performer-dark: ${style.darkBackground};`
				}
			}).range(group.from, group.to)
		);
		if (group.legend) {
			continue;
		}
		if (style.hiddenCount > 0) {
			ranges.push(
				Decoration.widget({
					widget: new ExtraMemberWidget(style.hiddenCount, style.label),
					side: 1
				}).range(group.to)
			);
		}
	}

	return Decoration.set(ranges, true);
}

export const performerDecorationField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, transaction) {
		if (transaction.docChanged) {
			value = Decoration.none;
		}
		for (const effect of transaction.effects) {
			if (effect.is(setVoiceGroupsEffect)) {
				value = buildDecorations(transaction.state, effect.value);
			}
		}
		return value;
	},
	provide: (field) => EditorView.decorations.from(field)
});

function performerRangeAtCaret(state: EditorState): VoiceGroupRange | undefined {
	const selection = state.selection.main;
	if (!selection.empty) {
		return undefined;
	}
	const position = selection.head;
	return state
		.field(performerGroupsField)
		.groups.find((group) => group.from <= position && position < group.to);
}

function performerRangeKey(range: VoiceGroupRange | undefined): string | undefined {
	return range ? `${range.from}:${range.to}:${range.group.id}` : undefined;
}

class PerformerCaretAnnouncer {
	private activeRangeKey: string | undefined;

	constructor(readonly view: EditorView) {
		this.activeRangeKey = performerRangeKey(performerRangeAtCaret(view.state));
	}

	update(update: ViewUpdate): void {
		if (!update.selectionSet) {
			return;
		}
		const range = performerRangeAtCaret(update.state);
		const nextRangeKey = performerRangeKey(range);
		if (nextRangeKey === this.activeRangeKey) {
			return;
		}
		this.activeRangeKey = nextRangeKey;
		if (!range) {
			return;
		}
		const style = voiceGroupStyle(
			range.group.performerIds,
			update.state.field(performerGroupsField).performers
		);
		if (style) {
			update.state.field(editorCallbacksField)?.onAnnouncement(style.label);
		}
	}
}

/** Announce performer identity once when a collapsed caret enters a highlighted range. */
export function performerCaretAnnouncementPlugin(): Extension {
	return ViewPlugin.define((view) => new PerformerCaretAnnouncer(view));
}

export const performerDecorationTheme = EditorView.baseTheme({
	'.ll-performer-highlight': {
		position: 'relative',
		zIndex: '1',
		borderRadius: '0.2rem',
		background: 'var(--ll-performer-light)',
		boxDecorationBreak: 'clone',
		WebkitBoxDecorationBreak: 'clone'
	},
	// Slot styling mirrors the markup itself (italic, bold, both) so the text
	// still reads as tagged without any extra ornament.
	'.ll-performer-slot-2': {
		fontStyle: 'italic'
	},
	'.ll-performer-slot-3': {
		fontWeight: '650'
	},
	'.ll-performer-slot-4': {
		fontStyle: 'italic',
		fontWeight: '650'
	},
	'.ll-performer-overflow': {
		position: 'relative',
		zIndex: '1',
		marginInlineStart: '0.2rem',
		padding: '0 0.2rem',
		border: '1px solid color-mix(in oklch, currentColor 25%, transparent)',
		borderRadius: '0.25rem',
		font: '600 0.65rem/1.2 ui-sans-serif, system-ui, sans-serif'
	},
	'@media (prefers-color-scheme: dark)': {
		'.ll-performer-highlight': {
			background: 'var(--ll-performer-dark)'
		}
	}
});
