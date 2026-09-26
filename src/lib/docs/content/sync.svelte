<script lang="ts">
	import { resolve } from '$app/paths';
	import DocsFigure from '$lib/ui/docs/DocsFigure.svelte';
	import Keys from '$lib/ui/docs/Keys.svelte';
</script>

<h2 id="sync-mode">Sync the lyrics</h2>
<p>
	Syncing times every line in one pass: the song plays, and you tap as each line begins. First <a
		href={resolve('/docs/audio/')}>attach the song</a
	>.
</p>
<ol>
	<li>
		Press <strong>Sync lyrics</strong> in the player. The song plays from the start, and the caret
		waits on the first lyric line.
	</li>
	<li>
		Press <Keys combo="Space" /> as each line starts, or press <strong>Tap</strong>. Section headers
		and blank lines are skipped.
	</li>
	<li>
		Tapped too early or too late? <Keys combo="Backspace" /> takes the last tap back and backs the song
		up to the line before, so you can tap it again.
	</li>
	<li>
		The run ends after the last line. <Keys combo="Escape" /> or <strong>Stop syncing</strong> ends it
		sooner.
	</li>
</ol>
<DocsFigure
	name="workbench-player"
	alt="An example track is synced to every lyric line with Space in an accelerated demonstration. Dragging the player's scrubber moves the yellow highlight through the lyrics. Clicking a line number jumps to that line and plays it. On-screen keypresses show Escape pausing and resuming two seconds earlier, then Shift+Escape and Option+Escape stepping between synced lines."
/>
<p>
	While a run is on, <Keys combo="Space" /> taps from anywhere except a text field, a button, or a link. Typing
	a character ends the run, and the character lands where you typed it. Pausing holds the run: press play
	to keep tapping.
</p>
<p>
	Fast lines are easier at a slower speed. Pick 0.75× or 0.5× before you start. The times still
	match the song at full speed.
</p>
<ul>
	<li>
		<strong>A half-timed song</strong> picks up at the last timed line, so you hear a line of run-up
		before the first untimed one. <strong>Skip timed lines</strong> jumps ahead to the next gap during
		a run.
	</li>
	<li>
		<strong>A fully timed song</strong> shows <strong>Retime lyrics</strong>, which starts a fresh pass
		from the top.
	</li>
	<li>
		<strong>Selected lines</strong> change the button to <strong>Sync selection</strong>. The run
		times only those lines and stops after the last one.
	</li>
</ul>
<p>
	Repeated sections you have <a href={resolve('/docs/section-links/')}>linked</a> time themselves. When
	the run reaches a linked copy whose earlier copy you already tapped, one tap on its first line times
	the rest of the copy from the earlier one's rhythm, as far as the two copies line up, and the song
	jumps ahead to match. A message says how
	many lines were timed. Press a line number to time a line by hand instead.
</p>

<h2 id="anchors">Line times</h2>
<p>
	With audio attached, a column of times runs down the right side of the lyrics. A timed line shows
	its time. Beside an untimed line, press <strong>Anchor this line</strong> to time it at the current
	point in the song, or press <Keys combo="Ctrl-Alt-m" /> with the caret on the line.
</p>
<p>
	To correct a time, press <strong>Adjust this line's time</strong> beside it. The time shows to
	the hundredth of a second, with buttons that move it 0.25 seconds earlier or later.
	<strong>Delete this line's timing</strong> clears it.
</p>
<p>
	The <strong>Song</strong> tab offers the same for the caret's line under
	<strong>Timing line</strong>: type an exact <strong>Time in seconds</strong> and press
	<strong>Set time</strong>, or use <strong>Earlier 0.25s</strong>, <strong>Later 0.25s</strong>,
	<strong>Use playback time</strong>, and <strong>Clear line time</strong>. This is the way to time
	lines with a screen reader, which the time column does not reach.
</p>
<p>
	Times stay with their lines as you edit. Changing a line's words keeps its time, deleting the line
	deletes it, and joining two lines keeps the earlier time. Typing never writes a time on its own.
</p>
<p>
	As the song plays, the line being sung is highlighted. Once two or more lines are timed, <strong
		>Follow the playing line</strong
	> in the player scrolls the lyrics along with the song.
</p>

<h2 id="jump">Jump to a line</h2>
<p>
	Press a timed line's number, or its time, to play from that line. The caret stays where it is, so
	you can listen to one part while typing in another.
</p>
<p>
	<Keys combo="Ctrl-Alt-Enter" /> plays from the caret's line, or from the nearest timed line above it.
</p>
<p>
	Back and forward in the player step between timed lines that are within 10 seconds, and move 2
	seconds otherwise.
</p>

<h2 id="export">Export the timings</h2>
<p>
	Once lines are timed, the <strong>Song</strong> tab has a <strong>Timed lyrics</strong> section.
	Choose LRC, SRT, or VTT and press <strong>Export timings</strong>. The file lists the timed lines in
	time order, without markup a music player cannot read.
</p>
<p>
	<strong>Delete line timings…</strong> clears every time in the 'scribe after you confirm. The lyrics
	are untouched.
</p>
