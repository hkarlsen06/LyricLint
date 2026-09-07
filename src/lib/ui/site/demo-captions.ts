import tutorial from '$lib/assets/hero-tutorial.json' with { type: 'json' };

/** Filmed seconds in the shipped demos. Short spoken beats, with room for pauses.
 * Retiming a scene must retime these cues. */
export interface DemoCaption {
	start: number;
	end: number;
	text: string;
}

// The renderer and the page consume the same authored script and filmed seconds.
export const heroPlaybackRate = tutorial.playbackRate;
export const heroCaptions: readonly DemoCaption[] = tutorial.steps.flatMap((step) => step.captions);

export const playerCaptions: readonly DemoCaption[] = [
	{ start: 0.1, end: 3.2, text: 'Tap Space per line.' },
	{ start: 3.3, end: 5.7, text: 'All synced. Lovely.' },
	{ start: 5.8, end: 9.8, text: 'Scrub. The lyrics follow.' },
	{ start: 10, end: 12.9, text: 'Click a line number.' },
	{ start: 13, end: 16.3, text: 'Esc: pause and replay.' },
	{ start: 16.5, end: 18.9, text: 'Skip between lines.' },
	{ start: 19, end: 21.2, text: 'Treasure hunt cancelled.' }
];
