import { RangeSet, StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension, Range } from '@codemirror/state';
import {
	Decoration,
	EditorView,
	GutterMarker,
	ViewPlugin,
	WidgetType,
	gutter
} from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { PerformerRecord } from '$lib/core/types.js';
import type { VoiceGroupRange } from '../contracts.js';
import { editorCallbacksField } from './editor-state.js';

const MAX_VISIBLE_SEGMENTS = 3;

/**
 * Editor colors keyed to the stable name-derived roster color ids. Unknown
 * legacy ids hash into the same table.
 *
 * Each entry is a pair of token references, not colors. The solid draws the
 * line's gutter segment, while the tint differentiates a secondary voice on a
 * mixed line and keys performer names in the section legend.
 */
export const performerPalette = [
	{
		id: 'olive',
		solid: 'var(--performer-olive)',
		tint: 'var(--performer-olive-tint)'
	},
	{
		id: 'indigo',
		solid: 'var(--performer-indigo)',
		tint: 'var(--performer-indigo-tint)'
	},
	{ id: 'teal', solid: 'var(--performer-teal)', tint: 'var(--performer-teal-tint)' },
	{ id: 'ochre', solid: 'var(--performer-ochre)', tint: 'var(--performer-ochre-tint)' },
	{ id: 'rose', solid: 'var(--performer-rose)', tint: 'var(--performer-rose-tint)' },
	{ id: 'plum', solid: 'var(--performer-plum)', tint: 'var(--performer-plum-tint)' },
	{
		id: 'copper',
		solid: 'var(--performer-copper)',
		tint: 'var(--performer-copper-tint)'
	},
	{ id: 'slate', solid: 'var(--performer-slate)', tint: 'var(--performer-slate-tint)' }
] as const;

interface VoiceGroupDecorationPayload {
	groups: readonly VoiceGroupRange[];
	performers: readonly PerformerRecord[];
}

interface PerformerSegmentStyle {
	/** Stable identity for comparing groups that resolve to the same performers. */
	identity: string;
	label: string;
	/**
	 * One solid and one tint per group. Joint groups blend their members into a
	 * single color rather than splitting the indicator into stripes.
	 */
	indicator: string;
	background: string;
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

/** Stable slot/color IDs become one blended, accessible, theme-aware tint. */
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
		identity: members
			.map((member) => member.id)
			.sort()
			.join('\u001f'),
		label: `Performed by ${members.map((member) => member.displayName).join(', ')}`,
		indicator: mixColors(colors.map((color) => color.solid)),
		background: mixColors(colors.map((color) => color.tint)),
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

interface ResolvedVoiceRange {
	range: VoiceGroupRange;
	style: PerformerSegmentStyle;
}

interface LineVoice {
	coverage: number;
	firstFrom: number;
	styleSlot: number;
	style: PerformerSegmentStyle;
}

interface LineVoices {
	primary: LineVoice;
	mixed: boolean;
}

interface PerformerVisuals {
	decorations: DecorationSet;
	gutterMarkers: RangeSet<GutterMarker>;
}

function lyricLineFragments(
	state: EditorState,
	from: number,
	to: number
): { from: number; to: number; lineFrom: number }[] {
	const fragments: { from: number; to: number; lineFrom: number }[] = [];
	let position = from;
	while (position < to) {
		const line = state.doc.lineAt(position);
		const fragmentFrom = Math.max(from, line.from);
		const fragmentTo = Math.min(to, line.to);
		if (fragmentFrom < fragmentTo) {
			fragments.push({ from: fragmentFrom, to: fragmentTo, lineFrom: line.from });
		}
		if (to <= line.to) {
			break;
		}
		position = line.to + 1;
	}
	return fragments;
}

/**
 * Pick the voice that owns most attributed characters on each physical line.
 * The plain slot wins an exact tie because it is the section's baseline voice;
 * source order is the final deterministic tie-breaker.
 */
function primaryVoicesByLine(
	state: EditorState,
	ranges: readonly ResolvedVoiceRange[]
): Map<number, LineVoices> {
	const candidates = new Map<number, Map<string, LineVoice>>();

	for (const { range, style } of ranges) {
		if (range.legend) continue;
		for (const fragment of lyricLineFragments(state, range.from, range.to)) {
			let voices = candidates.get(fragment.lineFrom);
			if (!voices) {
				voices = new Map();
				candidates.set(fragment.lineFrom, voices);
			}
			const existing = voices.get(style.identity);
			const coverage = fragment.to - fragment.from;
			if (existing) {
				existing.coverage += coverage;
				existing.firstFrom = Math.min(existing.firstFrom, fragment.from);
				existing.styleSlot = Math.min(existing.styleSlot, range.group.styleSlot);
			} else {
				voices.set(style.identity, {
					coverage,
					firstFrom: fragment.from,
					styleSlot: range.group.styleSlot,
					style
				});
			}
		}
	}

	const primary = new Map<number, LineVoices>();
	for (const [lineFrom, voices] of candidates) {
		const ordered = [...voices.values()].sort(
			(left, right) =>
				right.coverage - left.coverage ||
				Number(right.styleSlot === 1) - Number(left.styleSlot === 1) ||
				left.firstFrom - right.firstFrom
		);
		const leading = ordered[0];
		if (leading) {
			primary.set(lineFrom, {
				primary: leading,
				mixed: voices.size > 1
			});
		}
	}
	return primary;
}

class PerformerGutterMarker extends GutterMarker {
	private tooltip: HTMLElement | undefined;

	constructor(
		readonly style: PerformerSegmentStyle,
		readonly startsSegment: boolean,
		readonly endsSegment: boolean
	) {
		super();
	}

	eq(other: PerformerGutterMarker): boolean {
		return (
			other.style.identity === this.style.identity &&
			other.style.indicator === this.style.indicator &&
			other.style.label === this.style.label &&
			other.startsSegment === this.startsSegment &&
			other.endsSegment === this.endsSegment
		);
	}

	private hideTooltip(): void {
		this.tooltip?.remove();
		this.tooltip = undefined;
	}

	toDOM(view: EditorView): HTMLElement {
		const marker = document.createElement('span');
		marker.className = 'll-performer-gutter-marker';
		if (this.startsSegment) marker.classList.add('ll-performer-gutter-marker--start');
		if (this.endsSegment) marker.classList.add('ll-performer-gutter-marker--end');
		marker.setAttribute('style', `--ll-performer-solid: ${this.style.indicator};`);
		marker.addEventListener('pointerenter', () => {
			this.hideTooltip();
			const rect = marker.getBoundingClientRect();
			const tooltip = document.createElement('span');
			tooltip.className = 'll-performer-gutter-tooltip';
			tooltip.textContent = this.style.label;
			tooltip.setAttribute('aria-hidden', 'true');
			tooltip.style.left = `${rect.right}px`;
			tooltip.style.top = `${rect.top + rect.height / 2}px`;
			view.dom.appendChild(tooltip);
			this.tooltip = tooltip;
		});
		marker.addEventListener('pointerleave', () => this.hideTooltip());
		return marker;
	}

	destroy(): void {
		this.hideTooltip();
	}
}

function buildGutterMarkers(
	state: EditorState,
	primaryVoices: ReadonlyMap<number, LineVoices>
): RangeSet<GutterMarker> {
	const lines = [...primaryVoices.entries()]
		.map(([lineFrom, voices]) => ({
			line: state.doc.lineAt(lineFrom),
			voice: voices.primary
		}))
		.sort((left, right) => left.line.number - right.line.number);
	const markers: Range<GutterMarker>[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const current = lines[index];
		if (!current) continue;
		const previous = lines[index - 1];
		const next = lines[index + 1];
		const startsSegment =
			!previous ||
			previous.line.number + 1 !== current.line.number ||
			previous.voice.style.identity !== current.voice.style.identity;
		const endsSegment =
			!next ||
			current.line.number + 1 !== next.line.number ||
			next.voice.style.identity !== current.voice.style.identity;
		markers.push(
			new PerformerGutterMarker(current.voice.style, startsSegment, endsSegment).range(
				current.line.from
			)
		);
	}

	return RangeSet.of(markers, true);
}

/**
 * The DOM attributes one highlighted fragment carries.
 *
 * An alias rather than an interface: `Decoration.mark` takes a string
 * dictionary, and only an object type alias carries the implicit index
 * signature that makes one assignable to it.
 */
type PerformerMarkAttributes = {
	'aria-label': string;
	style: string;
	title?: string;
};

function buildVisuals(state: EditorState, payload: VoiceGroupDecorationPayload): PerformerVisuals {
	const ranges: Range<Decoration>[] = [];
	const resolved: ResolvedVoiceRange[] = [];

	for (const group of payload.groups) {
		if (!safeRange(group, state.doc.length)) continue;
		const style = voiceGroupStyle(group.group.performerIds, payload.performers);
		if (style) resolved.push({ range: group, style });
	}

	const primaryVoices = primaryVoicesByLine(state, resolved);

	for (const { range: group, style } of resolved) {
		const fragments = group.legend
			? [{ from: group.from, to: group.to, lineFrom: state.doc.lineAt(group.from).from }]
			: lyricLineFragments(state, group.from, group.to);

		for (const fragment of fragments) {
			const lineVoices = primaryVoices.get(fragment.lineFrom);
			const mixed = !group.legend && lineVoices?.mixed === true;
			const secondary = mixed && lineVoices.primary.style.identity !== style.identity;
			const attributes: PerformerMarkAttributes = {
				'aria-label': style.label,
				style: `--ll-performer-tint: ${style.background};`
			};
			// Only the legend names a voice in words, so only there is a tooltip
			// naming it again worth having; on the lyric itself it would follow the
			// pointer down the whole document.
			if (group.legend) attributes.title = style.label;
			ranges.push(
				Decoration.mark({
					class:
						`ll-performer-highlight ll-performer-slot-${group.group.styleSlot}` +
						(group.legend ? ' ll-performer-legend-name' : '') +
						(mixed ? ' ll-performer-mixed' : '') +
						(secondary ? ' ll-performer-secondary' : ''),
					attributes
				}).range(fragment.from, fragment.to)
			);
		}
		if (group.legend) continue;
		if (style.hiddenCount > 0) {
			ranges.push(
				Decoration.widget({
					widget: new ExtraMemberWidget(style.hiddenCount, style.label),
					side: 1
				}).range(group.to)
			);
		}
	}

	return {
		decorations: Decoration.set(ranges, true),
		gutterMarkers: buildGutterMarkers(state, primaryVoices)
	};
}

const emptyVisuals: PerformerVisuals = {
	decorations: Decoration.none,
	gutterMarkers: RangeSet.empty
};

export const performerDecorationField = StateField.define<PerformerVisuals>({
	create: () => emptyVisuals,
	update(value, transaction) {
		if (transaction.docChanged) {
			value = emptyVisuals;
		}
		for (const effect of transaction.effects) {
			if (effect.is(setVoiceGroupsEffect)) {
				value = buildVisuals(transaction.state, effect.value);
			}
		}
		return value;
	},
	provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
});

/** A narrow column immediately after the line numbers for primary performer runs. */
export function performerGutter(): Extension {
	return gutter({
		class: 'll-performer-gutter',
		renderEmptyElements: true,
		markers: (view) => view.state.field(performerDecorationField).gutterMarkers
	});
}

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
		zIndex: '1'
	},
	// Every voice on a mixed lyric line carries its tint so the inline handoff
	// is explicit; single-voice lines rely on the gutter. Legend names introduce
	// the same colors in the header.
	'.ll-performer-mixed, .ll-performer-legend-name': {
		borderRadius: 'var(--radius-xs)',
		background: 'var(--ll-performer-tint)',
		boxDecorationBreak: 'clone',
		WebkitBoxDecorationBreak: 'clone'
	},
	'.ll-performer-gutter': {
		minWidth: 'var(--space-2)',
		width: 'var(--space-2)'
	},
	'.ll-performer-gutter .cm-gutterElement': {
		boxSizing: 'border-box',
		width: 'var(--space-2)',
		paddingInline: 'var(--space-0-5)'
	},
	'.ll-performer-gutter-marker': {
		'--ll-performer-line-inset': 'calc((1lh - 1em) / 2)',
		display: 'block',
		boxSizing: 'border-box',
		width: '100%',
		height: '100%',
		background: 'var(--ll-performer-solid)',
		// The document's own type, not a UI rung: the inset above is the leading
		// either side of one lyric line, so both halves of the subtraction have to
		// resolve against the size the lines are actually set in. This was
		// `--font-size-md`, which only agreed while the editor happened to sit on
		// the same rung.
		fontSize: 'var(--font-size-editor)',
		lineHeight: 'var(--line-height-editor)'
	},
	'.ll-performer-gutter-marker--start': {
		height: 'calc(100% - var(--ll-performer-line-inset))',
		marginBlockStart: 'var(--ll-performer-line-inset)',
		borderStartStartRadius: 'var(--radius-xs)',
		borderStartEndRadius: 'var(--radius-xs)'
	},
	'.ll-performer-gutter-marker--end': {
		height: 'calc(100% - var(--ll-performer-line-inset))',
		marginBlockEnd: 'var(--ll-performer-line-inset)',
		borderEndStartRadius: 'var(--radius-xs)',
		borderEndEndRadius: 'var(--radius-xs)'
	},
	'.ll-performer-gutter-marker--start.ll-performer-gutter-marker--end': {
		height: 'calc(100% - var(--ll-performer-line-inset) - var(--ll-performer-line-inset))',
		marginBlock: 'var(--ll-performer-line-inset)'
	},
	'.ll-performer-gutter-tooltip': {
		position: 'fixed',
		zIndex: 'var(--layer-tooltip)',
		boxSizing: 'border-box',
		width: 'max-content',
		maxWidth: 'var(--measure-prose)',
		marginInlineStart: 'var(--space-1-5)',
		padding: 'var(--space-1) var(--space-2)',
		translate: '0 -50%',
		border: 'var(--border-width) solid var(--color-border)',
		borderRadius: 'var(--radius-overlay)',
		background: 'var(--color-overlay)',
		color: 'var(--color-text)',
		boxShadow: 'var(--shadow-popover)',
		fontFamily: 'var(--font-ui)',
		fontSize: 'var(--font-size-xs)',
		fontWeight: 'var(--font-weight-regular)',
		lineHeight: 'var(--line-height-ui)',
		pointerEvents: 'none',
		whiteSpace: 'nowrap'
	},
	// Slot styling mirrors the markup itself (italic, bold, both) so the text
	// still reads as tagged without any extra ornament.
	'.ll-performer-slot-2': {
		fontStyle: 'italic'
	},
	'.ll-performer-slot-3': {
		fontWeight: 'var(--font-weight-semibold)'
	},
	'.ll-performer-slot-4': {
		fontStyle: 'italic',
		fontWeight: 'var(--font-weight-semibold)'
	},
	'.ll-performer-overflow': {
		position: 'relative',
		zIndex: '1',
		marginInlineStart: 'var(--space-0-5)',
		padding: '0 var(--space-0-5)',
		border: 'var(--border-width) solid color-mix(in oklch, currentColor 25%, transparent)',
		borderRadius: 'var(--radius-xs)',
		color: 'var(--color-text)',
		fontFamily: 'var(--font-ui)',
		fontSize: 'var(--font-size-2xs)',
		fontWeight: 'var(--font-weight-semibold)',
		lineHeight: 'var(--line-height-tight)'
	}
});
