/**
 * Enter and Space on a control a widget draws inside the document.
 *
 * A `<button>` turns both keys into a click on its own — everywhere except
 * here. The widgets that carry controls sit inside `.cm-content`, which is
 * `contenteditable`, and CodeMirror answers Enter and Space against the
 * document the press bubbles into: the line breaks, the activation never
 * happens, and the control reads as one the keyboard cannot press at all. That
 * is what the count badge's cluster menu and the `⇄` beside a linked header
 * both were.
 *
 * So the press is claimed at the element: prevented, and **stopped**, or Enter
 * still splits the line under the control that just answered it.
 *
 * Only Enter and Space, and only bare. A modifier here belongs to a command —
 * the editor's own keymap is full of `Ctrl-Alt` pairs — and swallowing one at a
 * control that happens to hold the focus is how a shortcut comes to work
 * everywhere but the one place the user was standing.
 */
export function pressed(control: HTMLElement, run: () => void): void {
	control.addEventListener('keydown', (event) => {
		if (event.ctrlKey || event.altKey || event.metaKey) {
			return;
		}
		if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		run();
	});
}
