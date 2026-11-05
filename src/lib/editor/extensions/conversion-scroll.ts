import { EditorView, ViewPlugin } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';

const inputEvents = ['wheel', 'touchmove', 'pointerdown', 'keydown'];
const scrollInput = ViewPlugin.fromClass(
	class {
		revision = 0;
		advance = () => {
			this.revision += 1;
		};
		constructor(readonly view: EditorView) {
			for (const event of inputEvents)
				view.scrollDOM.addEventListener(event, this.advance, { capture: true, passive: true });
		}
		destroy() {
			for (const event of inputEvents)
				this.view.scrollDOM.removeEventListener(event, this.advance, true);
		}
	}
);

const pending = new WeakMap<
	EditorView,
	{
		position: number;
		inset: number;
		state: Pick<EditorState, 'doc' | 'selection'>;
		inputRevision: number | undefined;
	}
>();

/** Scope the custom scroll handler to this projection's reading passage. */
export function scrollConversionPassage(
	view: EditorView,
	position: number,
	inset: number,
	state: Pick<EditorState, 'doc' | 'selection'> = view.state
) {
	pending.set(view, { position, inset, state, inputRevision: view.plugin(scrollInput)?.revision });
	return EditorView.scrollIntoView(position, { y: 'start', yMargin: inset });
}

const passageScroll = EditorView.scrollHandler.of((view, range, options) => {
	const target = pending.get(view);
	pending.delete(view);
	if (
		!target ||
		options.y !== 'start' ||
		range.head !== target.position ||
		options.yMargin !== target.inset
	)
		return false;
	// Layout may clamp the old scroll position before this handler runs. Input,
	// rather than that automatic movement, invalidates the scheduled passage.
	const scrollTop = view.scrollDOM.scrollTop;
	const current = () =>
		view.state.doc === target.state.doc &&
		view.state.selection.eq(target.state.selection) &&
		view.plugin(scrollInput)?.revision === target.inputRevision &&
		view.scrollDOM.scrollTop === scrollTop;
	if (!current()) return true;
	view.requestMeasure({
		key: conversionScroll,
		read(view) {
			if (!current()) return undefined;
			const coordinates = view.coordsAtPos(range.head);
			if (!coordinates) return undefined;
			return (
				(coordinates.top - view.scrollDOM.getBoundingClientRect().top - target.inset) / view.scaleY
			);
		},
		write(delta, view) {
			if (delta === undefined || delta === 0 || !current()) return;
			// Quantize the magnitude, then restore its sign. Native absolute scrollTop
			// rounding otherwise loses half a pixel on both legs of a switch. Use
			// the browser itself: emulated DPR and CSS zoom need not imply the same
			// scroll precision. The temporary scroller shares the editor's zoom.
			const quantizer = view.dom.ownerDocument.createElement('div');
			quantizer.style.cssText =
				'position:absolute;top:0;left:0;visibility:hidden;overflow:scroll;width:1px;height:1px;contain:strict;pointer-events:none';
			quantizer.setAttribute('aria-hidden', 'true');
			const content = quantizer.appendChild(view.dom.ownerDocument.createElement('div'));
			content.style.height = `${Math.abs(delta) + view.scrollDOM.clientHeight + 1}px`;
			view.scrollDOM.appendChild(quantizer);
			quantizer.scrollTop = Math.abs(delta);
			const movement = Math.sign(delta) * quantizer.scrollTop;
			quantizer.remove();
			view.scrollDOM.scrollTop += movement;
		}
	});
	return true;
});

export const conversionScroll = [scrollInput, passageScroll];
