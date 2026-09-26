<script lang="ts">
	import { resolve } from '$app/paths';
	import DocsFigure from '$lib/ui/docs/DocsFigure.svelte';
	import Keys from '$lib/ui/docs/Keys.svelte';
	import * as Alert from '$lib/ui/primitives/alert/index.js';
</script>

<h2 id="attach">Attach audio</h2>
<p>
	Press the music note at the top right of the editor. Its tooltip reads <strong
		>Add audio source</strong
	>, and it opens a dialog with every source this copy of LyricLint offers:
</p>
<ul>
	<li><strong>Choose a file…</strong> plays an audio file from your computer.</li>
	<li>
		The YouTube field takes a video link, or a search where the field says so. Apple Music and
		Spotify have their own search fields when they are available. See <a
			href={resolve('/docs/audio-sources/')}>YouTube, Apple Music, and Spotify</a
		>.
	</li>
</ul>
<p>You can also drop an audio file straight onto the lyrics.</p>
<DocsFigure
	name="docs-audio"
	alt="The Add audio source dialog open over the workbench, with a field for each streaming source and a Choose a file button at the foot."
/>
<p>
	The song belongs to the 'scribe. Each 'scribe remembers its own audio and the point where you
	stopped, and switching 'scribes switches the song. If the 'scribe still has its default name, the
	song's title becomes its name.
</p>
<p>
	To change or remove the song, press the note again (now <strong>Change audio source</strong>). The
	dialog shows the current song first, with a minus button that detaches it.
</p>

<h2 id="transport">Pause, replay, and step</h2>
<p>
	The player sits under the editor: back, play, forward, the elapsed time, and a seek bar. Your
	hands can stay on the keyboard, because the Escape key drives it:
</p>
<ul>
	<li><Keys combo="Escape" /> plays and pauses.</li>
	<li><Keys combo="Shift-Escape" /> goes back.</li>
	<li><Keys combo="Alt-Escape" /> goes forward.</li>
</ul>
<p>
	These work while you type in the lyrics, and a fumbled press never types a character. When
	something else is open, such as a finding's popover or the find bar, the first Escape closes that
	instead.
</p>
<p>
	Back and forward jump to the previous or next timed line when one is within 10 seconds, and move 2
	seconds otherwise. Hover either button to see which it will do. Once lines are timed, see <a
		href={resolve('/docs/sync/')}>Synced lyrics</a
	>.
</p>
<p>
	Resuming after a pause backs up 2 seconds, so you hear the words again before the gap you were
	typing into. After you drag the seek bar, playback starts exactly where you put it.
</p>
<p>
	The speed menu beside the seek bar slows the song to 0.75× or 0.5×, or speeds it up to 1.5×. It
	lists only the speeds the current source can play. A local file keeps its pitch when slowed.
</p>
<p>
	Function keys, the <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd> keys, and your keyboard's media keys
	work too. They are all on <a href={resolve('/docs/shortcuts/')}>Keyboard shortcuts</a>.
</p>

<h2 id="loop">Repeat a passage</h2>
<ol>
	<li>Play or seek to where the passage starts, and press <strong>Loop</strong>.</li>
	<li>Play or seek past where it ends, and press <strong>End here</strong>.</li>
	<li>
		The button now shows the passage's start and end times, and playback repeats it. Press the button
		again to stop repeating.
	</li>
</ol>
<p>
	Before you press <strong>End here</strong>, the <strong>Cancel loop</strong> button next to it drops
	the start. Pausing keeps the loop. Seeking outside the passage, changing the audio, or starting to
	sync the lyrics clears it.
</p>

<h2 id="local-files">Local files</h2>
<Alert.Root>
	<Alert.Title>Local audio never leaves your device</Alert.Title>
	<Alert.Description>
		LyricLint plays the file from your disk. It does not upload it or copy it into the browser: the
		'scribe keeps only the file's name, a handle to it, and your place in it.
	</Alert.Description>
</Alert.Root>
<p>
	LyricLint accepts any audio file your browser can play, such as MP3, M4A, AAC, WAV, FLAC, Ogg, and
	Opus. A local file plays offline.
</p>
<p>When you come back to a 'scribe, its file returns at the point where you stopped:</p>
<ul>
	<li>
		In Chrome and Edge, the 'scribe keeps a handle to the file. While the browser still allows
		access, the song comes back on its own. Otherwise the player shows <strong
			>Reconnect audio</strong
		>: press it, or <Keys combo="Escape" />, and allow access.
	</li>
	<li>
		Firefox and Safari cannot keep that handle. Press <strong>Reconnect audio</strong> and choose the
		file again.
	</li>
</ul>
<p>
	If you moved, renamed, or deleted the file since, LyricLint says it could not be reopened. Attach
	it again from the audio dialog. A <a href="{resolve('/docs/scribes/')}#backup">workspace backup</a> brings
	back your 'scribes but not their audio files, so reconnect those after importing one.
</p>
