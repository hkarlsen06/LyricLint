// Decision record: docs/subsystems/section-links.md.
import { EditorView, WidgetType } from '@codemirror/view';
import { mount, unmount } from 'svelte';
import { Link, Unlink, Pen, PenLine } from 'lucide-svelte';
import { releaseControlHint, showControlHint } from '$lib/ui/state/control-tooltip.svelte.js';
import { pressed } from './widget-press.js';
import { editorCallbacksField } from './editor-state.js';
import type { SectionLinkOrigin } from '../contracts.js';

export interface SectionLinkScope {
	label: string;
	detail?: string;
}

interface MarkerState {
	widget: SectionLinkMarker;
	observer: ResizeObserver;
	link: HTMLButtonElement;
	mode: HTMLButtonElement;
	destroyIcons: () => void;
}

const markers = new WeakMap<HTMLElement, MarkerState>();

/** A fixed-size control with an out-of-flow scope label, leaving lyric geometry alone. */
export class SectionLinkMarker extends WidgetType {
	constructor(
		readonly headerFrom: number,
		readonly local: boolean,
		readonly toggle: (view: EditorView, header: number) => boolean,
		readonly scope?: SectionLinkScope
	) {
		super();
	}

	eq(other: SectionLinkMarker): boolean {
		return (
			other.headerFrom === this.headerFrom &&
			other.local === this.local &&
			other.toggle === this.toggle &&
			other.scope?.label === this.scope?.label &&
			other.scope?.detail === this.scope?.detail
		);
	}

	private label(): string {
		return this.local ? 'Editing this section only' : (this.scope?.label ?? '');
	}

	private modeDescription(): string {
		return this.local ? 'Resume linked editing' : 'Edit this section only';
	}

	private render(marker: HTMLElement): void {
		const { link, mode } = markers.get(marker)!;
		marker.classList.toggle('ll-section-link-marker--local', this.local);
		mode.setAttribute('aria-pressed', String(this.local));
		link.setAttribute(
			'aria-label',
			['Edit linked sections', this.label(), this.local ? undefined : this.scope?.detail]
				.filter(Boolean)
				.join('. ')
		);
		const status = marker.querySelector<HTMLElement>('.ll-section-link-status')!;
		const label = this.label();
		const changed = status.textContent !== label;
		status.textContent = label;
		status.classList.toggle('ll-section-only-status', this.local);
		if (changed && label) status.dataset.change = status.dataset.change === 'a' ? 'b' : 'a';
		if (!label) delete status.dataset.change;
	}

	private measure(marker: HTMLElement, view: EditorView): void {
		view.requestMeasure({
			key: marker,
			read: () => {
				const line = marker.closest('.cm-line');
				if (!line) return 0;
				const edge = Math.min(
					line.getBoundingClientRect().right,
					view.scrollDOM.getBoundingClientRect().right
				);
				return Math.max(
					0,
					edge -
						marker.getBoundingClientRect().right -
						parseFloat(getComputedStyle(line).paddingRight || '0')
				);
			},
			write: (width) => marker.style.setProperty('--ll-link-scope-width', `${width}px`)
		});
	}

	toDOM(view: EditorView): HTMLElement {
		const marker = document.createElement('span');
		marker.className = 'll-section-link-controls';
		const link = document.createElement('button');
		link.type = 'button';
		link.className = 'll-section-link-marker';
		const mode = document.createElement('button');
		mode.type = 'button';
		mode.className = 'll-section-local-toggle';
		mode.setAttribute('aria-label', 'Edit this section only');
		const icons = [
			mount(Link, { target: link, props: { 'aria-hidden': true, class: 'll-shared-icon' } }),
			mount(Unlink, { target: link, props: { 'aria-hidden': true, class: 'll-local-icon' } }),
			mount(Pen, { target: mode, props: { 'aria-hidden': true, class: 'll-shared-icon' } }),
			mount(PenLine, { target: mode, props: { 'aria-hidden': true, class: 'll-local-icon' } })
		];
		const status = document.createElement('span');
		status.className = 'll-section-link-status';
		status.setAttribute('aria-hidden', 'true');
		marker.append(link, mode, status);
		const current = {
			widget: this,
			observer: new ResizeObserver(() => current.widget.measure(marker, view)),
			link,
			mode,
			destroyIcons: () => {
				for (const icon of icons) void unmount(icon);
			}
		};
		markers.set(marker, current);
		this.render(marker);
		current.observer.observe(view.scrollDOM);
		queueMicrotask(() => {
			if (!markers.has(marker)) return;
			const line = marker.closest('.cm-line');
			if (line) current.observer.observe(line);
			current.widget.measure(marker, view);
		});
		for (const control of [link, mode]) {
			const showHint = () =>
				showControlHint(control, {
					label: control === link ? 'Manage linking' : current.widget.modeDescription()
				});
			const releaseHint = () => releaseControlHint(control);
			control.addEventListener('pointerenter', showHint);
			control.addEventListener('pointerleave', releaseHint);
			control.addEventListener('focus', showHint);
			control.addEventListener('blur', releaseHint);
			control.addEventListener('keydown', (event) => {
				if (event.key === 'Escape') releaseHint();
			});
		}
		const open = () => {
			releaseControlHint(link);
			const line = view.state.doc.lineAt(
				Math.max(0, Math.min(view.state.doc.length, current.widget.headerFrom))
			);
			const origin: SectionLinkOrigin = {
				takesFocus: true,
				returnFocus: () => {
					if (!link.isConnected) return false;
					link.focus();
					return true;
				}
			};
			view.state
				.field(editorCallbacksField, false)
				?.onSectionLinkRequest?.(
					{ range: { from: line.from, to: line.to }, prefer: 'above' },
					origin
				);
		};
		const toggle = () => {
			current.widget.toggle(view, current.widget.headerFrom);
			releaseControlHint(mode);
		};
		link.addEventListener('click', open);
		pressed(link, open);
		mode.addEventListener('click', toggle);
		pressed(mode, toggle);
		return marker;
	}

	updateDOM(marker: HTMLElement, view: EditorView): boolean {
		const current = markers.get(marker);
		if (!current) return false;
		current.widget = this;
		this.render(marker);
		this.measure(marker, view);
		for (const control of [current.link, current.mode]) {
			if (control.matches(':hover') || document.activeElement === control) {
				showControlHint(control, {
					label: control === current.link ? 'Manage linking' : this.modeDescription()
				});
			}
		}
		return true;
	}

	destroy(marker: HTMLElement): void {
		const current = markers.get(marker);
		current?.observer.disconnect();
		current?.destroyIcons();
		if (current) {
			releaseControlHint(current.link);
			releaseControlHint(current.mode);
		}
		markers.delete(marker);
	}
}
export const sectionLinkTheme = EditorView.baseTheme({
	'.ll-section-link-controls': {
		position: 'relative',
		display: 'inline-block',
		inlineSize: 'calc(2 * var(--space-5))',
		blockSize: '1em',
		// Center on the header's capitals, rather than the parent's lowercase x-height.
		verticalAlign: 'calc((1cap - 1em) / 2)',
		fontFamily: 'var(--font-mono)',
		backgroundColor: 'var(--color-fill-subtle)',
		borderRadius: 'var(--radius-control)',
		'--ll-link-scope-width': '0px',
		marginInlineStart: '1ch'
	},
	'.ll-section-link-marker, .ll-section-local-toggle': {
		position: 'absolute',
		insetBlockStart: '50%',
		insetInlineStart: '0',
		transform: 'translateY(-50%)',
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		inlineSize: 'var(--space-5)',
		blockSize: 'var(--space-5)',
		padding: '0',
		border: '0',
		appearance: 'none',
		background: 'transparent',
		borderRadius: 'var(--radius-control)',
		color: 'var(--color-text-muted)',
		fontFamily: 'inherit',
		fontSize: 'inherit',
		lineHeight: 'inherit',
		cursor: 'pointer'
	},
	'.ll-section-local-toggle': { insetInlineStart: '50%' },
	'.ll-section-link-marker:hover, .ll-section-link-marker:focus-visible, .ll-section-local-toggle:hover, .ll-section-local-toggle:focus-visible':
		{
			color: 'var(--color-text)'
		},
	// Compact artwork inside separate, finger-sized targets.
	'.ll-section-link-controls svg': {
		inlineSize: 'var(--space-4)',
		blockSize: 'var(--space-4)'
	},
	'.ll-section-link-controls:not(.ll-section-link-marker--local) .ll-local-icon, .ll-section-link-marker--local .ll-shared-icon':
		{
			display: 'none'
		},
	'.ll-section-link-marker--local .ll-section-local-toggle': {
		color: 'var(--color-text)',
		fontFamily: 'var(--font-ui)',
		fontWeight: 'var(--font-weight-semibold)'
	},
	'.ll-section-link-status.ll-section-only-status': {
		color: 'var(--color-danger)',
		whiteSpace: 'nowrap'
	},
	'.ll-section-link-status': {
		pointerEvents: 'none',
		color: 'var(--color-text-muted)',
		fontSize: 'var(--font-size-xs)',
		textAlign: 'start',
		position: 'absolute',
		insetInlineStart: '100%',
		insetBlockStart: '50%',
		transform: 'translateY(-50%)',
		boxSizing: 'border-box',
		paddingInlineStart: 'min(var(--space-1-5), var(--ll-link-scope-width))',
		inlineSize: 'var(--ll-link-scope-width)',
		fontFamily: 'var(--font-ui)',
		fontWeight: 'var(--font-weight-regular)',
		whiteSpace: 'nowrap',
		overflow: 'hidden',
		textOverflow: 'ellipsis'
	},
	'.ll-section-link-status[data-change=a]': {
		animation: 'll-link-scope-a var(--duration-medium) var(--ease-out-quart)'
	},
	'.ll-section-link-status[data-change=b]': {
		animation: 'll-link-scope-b var(--duration-medium) var(--ease-out-quart)'
	},
	'@keyframes ll-link-scope-a': {
		from: { backgroundColor: 'var(--color-fill)' },
		to: { backgroundColor: 'transparent' }
	},
	'@keyframes ll-link-scope-b': {
		from: { backgroundColor: 'var(--color-fill)' },
		to: { backgroundColor: 'transparent' }
	},
	'@media (prefers-reduced-motion: reduce)': {
		'.ll-section-link-status[data-change]': { animation: 'none' }
	},
	'.ll-section-only-header': {
		background: 'var(--color-danger-surface)',
		boxShadow: 'inset var(--space-1) 0 0 var(--color-danger)'
	},
	// The ordinary caret-row wash is a large inset shadow, so it would otherwise
	// cover both the danger surface and its rail when the caret is on the header.
	'.ll-section-only-header.cm-activeLine': {
		backgroundColor: 'var(--color-danger-surface)',
		boxShadow: 'inset var(--space-1) 0 0 var(--color-danger)'
	},
	'.ll-link-divergent': {
		textDecorationLine: 'underline',
		textDecorationStyle: 'dotted',
		textDecorationThickness: '1px',
		textDecorationColor: 'var(--color-border-strong)',
		textUnderlineOffset: '0.25em'
	}
});
