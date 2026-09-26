/** Shared drawn pointer for Playwright capture scripts. Decision record: docs/subsystems/site.md. */

/*
 * The pointer. Playwright's mouse moves the page and draws nothing, so the
 * cursor in the picture is ours, an arrow that follows the same coordinates
 * the real mouse is given, one `page.evaluate` per frame, so the two cannot
 * disagree about where the press landed.
 *
 * `pointer-events: none` is load-bearing rather than tidy: every transient
 * surface in this workbench dismisses on an outside `pointerdown` read in the
 * capture phase, so an element sitting under the pointer that could take a hit
 * would close the very picker being filmed.
 *
 * The ring is the press. A pointer that merely stops over a button and the
 * button changing state a frame later is two facts a viewer has to connect;
 * the pulse is the click being *seen*, which is the whole argument for filming
 * this rather than drawing three stills.
 */
export const CURSOR_SCRIPT = `
	const host = document.createElement('div');
	host.id = '__shot_cursor';
	host.style.cssText = [
		'position:fixed', 'left:0', 'top:0', 'width:0', 'height:0',
		'pointer-events:none', 'z-index:2147483647'
	].join(';');
	host.innerHTML = \`
		<div id="__shot_ring" style="position:absolute;left:0;top:0;width:0;height:0">
			<div style="position:absolute;left:-19px;top:-19px;width:38px;height:38px;
				border-radius:50%;border:2px solid rgba(255,255,255,0.9);
				box-shadow:0 0 0 1px rgba(0,0,0,0.35)"></div>
		</div>
		<svg id="__shot_arrow" width="26" height="30" viewBox="0 0 26 30"
			style="position:absolute;left:0;top:0;overflow:visible">
			<path d="M1.5,1.5 L1.5,21.5 L6.6,16.7 L10.1,24.3 L13.6,22.7 L10.2,15.2 L17.2,14.8 Z"
				fill="#ffffff" stroke="rgba(0,0,0,0.55)" stroke-width="1.4"
				stroke-linejoin="round" />
		</svg>\`;
	document.body.appendChild(host);

	/* A steady caret rather than a blinking one. A blink is a change in a region
	   that is otherwise still for seconds at a time, which costs the GIF real
	   bytes for a detail nobody is watching, and a loop that catches it mid-off
	   reads as a dropped frame. */
	const steady = document.createElement('style');
	steady.textContent = '.cm-cursor, .cm-cursor-primary { animation: none !important; }';
	document.head.appendChild(steady);

	window.__shotCursor = (x, y, press) => {
		const parent = document.querySelector('dialog:modal') ?? document.body;
		if (host.parentElement !== parent) parent.append(host);
		const arrow = document.getElementById('__shot_arrow');
		const ring = document.getElementById('__shot_ring');
		/* The path's tip is at 1.5,1.5, so the hotspot is offset by that much and
		   the arrow's point lands exactly where the real mouse is. */
		arrow.style.transform = 'translate(' + (x - 1.5) + 'px,' + (y - 1.5) + 'px)'
			+ (press > 0 ? ' scale(0.92)' : '');
		arrow.style.transformOrigin = '1.5px 1.5px';
		ring.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + (0.3 + press * 0.9) + ')';
		ring.style.opacity = String(press > 0 ? Math.max(0, 0.55 * (1 - press)) : 0);
	};
	window.__shotCursor(-100, -100, 0);
`;
