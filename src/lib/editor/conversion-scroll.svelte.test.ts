import { expect, it } from 'vitest';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import { conversionScroll, scrollConversionPassage } from './extensions/conversion-scroll.js';
class Fixed extends WidgetType {
	constructor(readonly height: number) {
		super();
	}
	get estimatedHeight() {
		return this.height;
	}
	toDOM() {
		const el = document.createElement('div');
		el.style.height = `${this.height}px`;
		return el;
	}
}
const frame = () =>
	new Promise<void>((resolve) =>
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
	);

it('keeps user scrolling that happens before a passage request is measured', async () => {
	const host = document.body.appendChild(document.createElement('div'));
	const view = new EditorView({
		parent: host,
		state: EditorState.create({
			doc: Array.from({ length: 220 }, () => 'Silver water carries every word home').join('\n'),
			extensions: [
				conversionScroll,
				EditorView.theme({
					'&': { height: '300px' },
					'.cm-scroller': { overflow: 'auto' }
				})
			]
		})
	});
	try {
		const pos = view.state.doc.line(120).from;
		view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 20 }) });
		await frame();
		const inset = view.coordsAtPos(pos)!.top - view.scrollDOM.getBoundingClientRect().top;
		view.dispatch({ effects: scrollConversionPassage(view, pos, inset) });
		view.scrollDOM.scrollTop += 125;
		const userScrollTop = view.scrollDOM.scrollTop;
		await frame();
		expect(view.scrollDOM.scrollTop).toBe(userScrollTop);
	} finally {
		view.destroy();
		host.remove();
	}
});

it('keeps a passage stable through known fractional widget changes', async () => {
	const results = [];
	for (const zoom of [1, 1.25])
		for (const lineHeight of [25, 25.5])
			for (const height of [0, 38, 25.5, 25.25]) {
				const host = document.body.appendChild(document.createElement('div'));
				host.style.zoom = String(zoom);
				const compartment = new Compartment();
				const widget = EditorView.decorations.of(
					Decoration.set([
						Decoration.widget({ widget: new Fixed(height), block: true, side: -1 }).range(0)
					])
				);
				const view = new EditorView({
					parent: host,
					state: EditorState.create({
						doc: Array.from({ length: 220 }, () => 'Silver water carries every word home').join(
							'\n'
						),
						extensions: [
							conversionScroll,
							EditorView.theme({
								'&': { height: '600px' },
								'.cm-scroller': { overflow: 'auto' },
								'.cm-content': { lineHeight: `${lineHeight}px` }
							}),
							compartment.of(height ? widget : [])
						]
					})
				});
				try {
					const pos = view.state.doc.line(180).from;
					view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 20 }) });
					await frame();
					const initial = view.coordsAtPos(pos)!.top;
					const positions = [initial];
					for (let i = 0; i < 20; i++) {
						const inset = view.coordsAtPos(pos)!.top - view.scrollDOM.getBoundingClientRect().top;
						view.dispatch({
							effects: [
								compartment.reconfigure(i % 2 || !height ? (height ? widget : []) : []),
								scrollConversionPassage(view, pos, inset)
							]
						});
						await frame();
						positions.push(view.coordsAtPos(pos)!.top);
					}
					results.push({ zoom, lineHeight, height, initial, positions });
				} finally {
					view.destroy();
					host.remove();
				}
			}
	for (const result of results)
		for (const top of result.positions)
			expect(Math.abs(top - result.initial), JSON.stringify(result)).toBeLessThanOrEqual(2);
}, 60000);
