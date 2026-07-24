import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension, Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { PerformerRecord } from '../../core/types.js';
import type { VoiceGroupRange } from '../contracts.js';
import { editorCallbacksField } from './editor-state.js';

const MAX_VISIBLE_SEGMENTS = 3;

/**
 * Editor tints and underline accents keyed to the roster color ids. Order
 * matches the roster allocation (green, violet, …) so the first performers
 * take the mockup's colors; unknown ids hash into the same table.
 */
export const performerPalette = [
	{
		id: 'olive',
		light: 'oklch(0.9 0.06 145)',
		dark: 'oklch(0.34 0.06 145)',
		accentLight: 'oklch(0.5 0.12 145)',
		accentDark: 'oklch(0.74 0.13 148)'
	},
	{
		id: 'indigo',
		light: 'oklch(0.9 0.06 285)',
		dark: 'oklch(0.34 0.06 285)',
		accentLight: 'oklch(0.5 0.14 285)',
		accentDark: 'oklch(0.72 0.13 288)'
	},
	{
		id: 'teal',
		light: 'oklch(0.9 0.055 195)',
		dark: 'oklch(0.34 0.055 195)',
		accentLight: 'oklch(0.53 0.1 195)',
		accentDark: 'oklch(0.72 0.09 195)'
	},
	{
		id: 'ochre',
		light: 'oklch(0.9 0.055 90)',
		dark: 'oklch(0.34 0.055 90)',
		accentLight: 'oklch(0.6 0.13 75)',
		accentDark: 'oklch(0.76 0.12 75)'
	},
	{
		id: 'rose',
		light: 'oklch(0.9 0.06 20)',
		dark: 'oklch(0.34 0.06 20)',
		accentLight: 'oklch(0.57 0.14 20)',
		accentDark: 'oklch(0.72 0.12 20)'
	},
	{
		id: 'plum',
		light: 'oklch(0.9 0.06 330)',
		dark: 'oklch(0.34 0.06 330)',
		accentLight: 'oklch(0.55 0.15 325)',
		accentDark: 'oklch(0.72 0.13 325)'
	},
	{
		id: 'copper',
		light: 'oklch(0.9 0.06 48)',
		dark: 'oklch(0.34 0.06 48)',
		accentLight: 'oklch(0.55 0.12 48)',
		accentDark: 'oklch(0.72 0.11 48)'
	},
	{
		id: 'slate',
		light: 'oklch(0.9 0.035 240)',
		dark: 'oklch(0.34 0.035 240)',
		accentLight: 'oklch(0.52 0.045 240)',
		accentDark: 'oklch(0.72 0.04 240)'
	}
] as const;

export interface VoiceGroupDecorationPayload {
	groups: readonly VoiceGroupRange[];
	performers: readonly PerformerRecord[];
}

export interface PerformerSegmentStyle {
	label: string;
	lightBackground: string;
	darkBackground: string;
	/** Solid accent for the underline in the member's own hue. */
	lightUnderline: string;
	darkUnderline: string;
	/**
	 * For joint groups: a hard-stop gradient spanning every visible member so
	 * the underline reads as two (or three) stacked colors. Undefined for a
	 * solo group, whose plain underline color already tells the story.
	 */
	lightUnderlineImage?: string;
	darkUnderlineImage?: string;
	/** Soft full-line wash derived from the first member's palette entry. */
	lightLineTint: string;
	darkLineTint: string;
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
	const first = colors[0] ?? performerPalette[0];
	const joint = colors.length > 1;
	return {
		label: `Performed by ${members.map((member) => member.displayName).join(', ')}`,
		lightBackground: segmentedGradient(colors.map((color) => color.light)),
		darkBackground: segmentedGradient(colors.map((color) => color.dark)),
		lightUnderline: first.accentLight,
		darkUnderline: first.accentDark,
		...(joint
			? {
					lightUnderlineImage: segmentedGradient(colors.map((color) => color.accentLight)),
					darkUnderlineImage: segmentedGradient(colors.map((color) => color.accentDark))
				}
			: {}),
		lightLineTint: `color-mix(in oklch, ${first.light} 38%, transparent)`,
		darkLineTint: `color-mix(in oklch, ${first.dark} 45%, transparent)`,
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

		const underlineImages =
			style.lightUnderlineImage && style.darkUnderlineImage
				? ` --ll-performer-underline-img-light: ${style.lightUnderlineImage}; --ll-performer-underline-img-dark: ${style.darkUnderlineImage};`
				: '';
		ranges.push(
			Decoration.mark({
				class:
					`ll-performer-highlight ll-performer-slot-${group.group.styleSlot}` +
					(group.legend ? ' ll-performer-legend-name' : ''),
				attributes: {
					'aria-label': style.label,
					title: style.label,
					style:
						`--ll-performer-light: ${style.lightBackground}; --ll-performer-dark: ${style.darkBackground}; ` +
						`--ll-performer-underline-light: ${style.lightUnderline}; --ll-performer-underline-dark: ${style.darkUnderline};` +
						underlineImages
				}
			}).range(group.from, group.to)
		);
		if (group.legend) {
			// Legend names carry only the inline tint/underline; the header line
			// itself never gets a full-line wash.
			continue;
		}
		const firstLine = state.doc.lineAt(group.from);
		const lastLine = state.doc.lineAt(Math.max(group.from, group.to - 1));
		for (let lineNumber = firstLine.number; lineNumber <= lastLine.number; lineNumber += 1) {
			ranges.push(
				Decoration.line({
					class: 'll-performer-line',
					attributes: {
						style: `--ll-performer-line-light: ${style.lightLineTint}; --ll-performer-line-dark: ${style.darkLineTint};`
					}
				}).range(state.doc.line(lineNumber).from)
			);
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
	'.ll-performer-line': {
		background: 'var(--ll-performer-line-light)'
	},
	'.ll-performer-highlight': {
		position: 'relative',
		zIndex: '1',
		borderRadius: '0.125rem',
		background: 'var(--ll-performer-light)',
		borderBlockEnd: '2px solid var(--ll-performer-underline-light, currentColor)',
		// Joint groups override the solid underline with a hard-stop gradient so
		// e.g. a <b> duet reads as a green+violet dual underline.
		borderImageSource: 'var(--ll-performer-underline-img-light, none)',
		borderImageSlice: '1',
		boxDecorationBreak: 'clone',
		WebkitBoxDecorationBreak: 'clone'
	},
	'.ll-performer-legend-name': {
		borderBlockEndWidth: '1.5px'
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
		'.ll-performer-line': {
			background: 'var(--ll-performer-line-dark)'
		},
		'.ll-performer-highlight': {
			background: 'var(--ll-performer-dark)',
			borderBlockEndColor: 'var(--ll-performer-underline-dark, currentColor)',
			borderImageSource: 'var(--ll-performer-underline-img-dark, none)'
		}
	}
});
