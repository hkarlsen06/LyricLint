import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension, Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { PerformerRecord } from '../../core/types.js';
import type { VoiceGroupRange } from '../contracts.js';
import { editorCallbacksField } from './editor-state.js';

const MAX_VISIBLE_SEGMENTS = 3;

export const performerPalette = [
	{ light: 'oklch(0.9 0.06 34)', dark: 'oklch(0.34 0.06 34)' },
	{ light: 'oklch(0.9 0.055 102)', dark: 'oklch(0.34 0.055 102)' },
	{ light: 'oklch(0.9 0.055 151)', dark: 'oklch(0.34 0.055 151)' },
	{ light: 'oklch(0.9 0.055 225)', dark: 'oklch(0.34 0.055 225)' },
	{ light: 'oklch(0.9 0.06 285)', dark: 'oklch(0.34 0.06 285)' },
	{ light: 'oklch(0.9 0.06 330)', dark: 'oklch(0.34 0.06 330)' }
] as const;

export interface VoiceGroupDecorationPayload {
	groups: readonly VoiceGroupRange[];
	performers: readonly PerformerRecord[];
}

export interface PerformerSegmentStyle {
	label: string;
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
	let hash = 0;
	for (let index = 0; index < colorId.length; index += 1) {
		hash = (hash * 31 + colorId.charCodeAt(index)) >>> 0;
	}
	return hash % performerPalette.length;
}

function segmentedGradient(colors: readonly string[]): string {
	if (colors.length === 1) {
		return colors[0] ?? 'transparent';
	}

	const stops = colors.flatMap((color, index) => {
		const start = (index / colors.length) * 100;
		const end = ((index + 1) / colors.length) * 100;
		return [`${color} ${start}%`, `${color} ${end}%`];
	});
	return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/** Stable slot/color IDs become accessible segmented light and dark styles. */
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
		lightBackground: segmentedGradient(colors.map((color) => color.light)),
		darkBackground: segmentedGradient(colors.map((color) => color.dark)),
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

		ranges.push(
			Decoration.mark({
				class: `ll-performer-highlight ll-performer-slot-${group.group.styleSlot}`,
				attributes: {
					'aria-label': style.label,
					title: style.label,
					style: `--ll-performer-light: ${style.lightBackground}; --ll-performer-dark: ${style.darkBackground};`
				}
			}).range(group.from, group.to)
		);
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
		borderRadius: '0.125rem',
		background: 'var(--ll-performer-light)',
		borderBlockEnd: '1px solid currentColor',
		boxDecorationBreak: 'clone',
		WebkitBoxDecorationBreak: 'clone'
	},
	'.ll-performer-slot-2': {
		borderBlockEndStyle: 'double',
		borderBlockEndWidth: '3px',
		fontStyle: 'italic'
	},
	'.ll-performer-slot-3': {
		borderBlockEndStyle: 'dashed',
		fontWeight: '650'
	},
	'.ll-performer-slot-4': {
		borderBlockEndStyle: 'dotted',
		borderBlockEndWidth: '2px'
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
