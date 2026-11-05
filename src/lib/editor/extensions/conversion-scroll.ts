import { EditorView } from '@codemirror/view';

const pending = new WeakMap<EditorView, { position: number; inset: number }>();

/** Scope the custom scroll handler to this projection's reading passage. */
export function scrollConversionPassage(view: EditorView, position: number, inset: number) {
	pending.set(view, { position, inset });
	return EditorView.scrollIntoView(position, { y: 'start', yMargin: inset });
}

export const conversionScroll = EditorView.scrollHandler.of((view, range, options) => {
	const target = pending.get(view);
	pending.delete(view);
	if (
		!target ||
		options.y !== 'start' ||
		range.head !== target.position ||
		options.yMargin !== target.inset
	)
		return false;
	const { doc, selection } = view.state;
	const scrollTop = view.scrollDOM.scrollTop;
	view.requestMeasure({
		key: conversionScroll,
		read(view) {
			if (
				view.state.doc !== doc ||
				!view.state.selection.eq(selection) ||
				view.scrollDOM.scrollTop !== scrollTop
			)
				return undefined;
			const coordinates = view.coordsAtPos(range.head);
			if (!coordinates) return undefined;
			return (
				(coordinates.top - view.scrollDOM.getBoundingClientRect().top - target.inset) / view.scaleY
			);
		},
		write(delta, view) {
			if (delta === undefined || delta === 0) return;
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
