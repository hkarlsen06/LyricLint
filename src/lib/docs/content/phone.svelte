<script lang="ts">
	import { resolve } from '$app/paths';
	import DocsFigure from '$lib/ui/docs/DocsFigure.svelte';
</script>

<h2 id="views">One task at a time</h2>
<p>
	On a phone, LyricLint gives each task the whole screen. Three buttons at the bottom switch between
	them:
</p>
<ul>
	<li><strong>Write</strong> shows the lyrics. LyricLint opens here.</li>
	<li>
		<strong>Review</strong> lists the findings, with their count on the button. See <a
			href={resolve('/docs/findings/')}>Findings and fixes</a
		>.
	</li>
	<li>
		<strong>Tools</strong> holds Linking, Performers, Song, and Preferences, and the rules assistant where
		it is available.
	</li>
</ul>
<DocsFigure
	name="docs-phone"
	alt="The workbench on a phone, with the lyrics filling the screen and the Write, Review, and Tools buttons along the bottom."
/>
<p>
	Switching views keeps your place: the caret, the scroll position, and undo all survive. Portrait
	and landscape both work, and pinch zoom is left on.
</p>
<p>
	In Review, tap a finding to see its lyrics above the finding and its fix. <strong
		>All findings</strong
	> takes you back to the list. Tapping an underline in the lyrics opens that finding in Review too.
</p>
<p>
	The toolbar keeps the 'scribe's name and <strong>Copy lyrics</strong> in view. Its other commands
	(<strong>New 'scribe</strong>, <strong>Undo</strong>, <strong>Redo</strong>, the language, and
	<strong>Compare</strong>) are behind <strong>Document</strong>.
</p>
<p>
	While the on-screen keyboard is up, the view buttons hide to give the lyrics the room. They come
	back when you close the keyboard.
</p>
<p>
	This layout applies to touch screens up to about 1,100 pixels wide, which includes most tablets held
	upright. A narrow desktop window driven by a mouse keeps the desktop layout.
</p>

<h2 id="touch">Selecting and assigning by touch</h2>
<p>Above the lyrics, a row of named buttons replaces the desktop's keyboard shortcuts:</p>
<ul>
	<li><strong>Section</strong> inserts a section header.</li>
	<li><strong>[?]</strong> marks lyrics you cannot make out.</li>
	<li><strong>Find</strong> opens find and replace.</li>
	<li>The music note attaches or changes the audio.</li>
</ul>
<p>To tag a performer:</p>
<ol>
	<li>Select the lines with your phone's own selection handles.</li>
	<li>
		When the selection covers lyric lines inside one section with a header, <strong
			>Assign voices</strong
		> appears in the row. Tap it.
	</li>
	<li>Pick the performers in the picker that opens.</li>
</ol>
<p>Selecting never opens the picker by itself, so you can keep adjusting or editing the selection.</p>
<p>
	See <a href={resolve('/docs/performers/')}>Performers</a> for building the roster and
	<a href={resolve('/docs/section-links/')}>Linked sections</a> for the Linking tool.
</p>

<h2 id="audio">Audio on a phone</h2>
<p>
	The player stays at the bottom of the screen in every view, so you can switch between writing and
	reviewing without stopping the song. A YouTube video sits above the player, or beside the lyrics in
	landscape.
</p>
<p>
	On narrow screens, <strong>Audio</strong> in the player opens the speed menu, <strong>Loop</strong
	>, and <strong>Sync lyrics</strong>. While you sync, <strong>Tap</strong> takes the place of the Space
	key, and it does not open the keyboard. See <a href={resolve('/docs/sync/')}>Synced lyrics</a>.
</p>
