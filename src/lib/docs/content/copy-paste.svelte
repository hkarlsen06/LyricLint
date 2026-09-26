<script lang="ts">
	import { resolve } from '$app/paths';
	import Keys from '$lib/ui/docs/Keys.svelte';
</script>

<h2 id="copy">Copy the lyrics</h2>
<p>
	Press <strong>Copy lyrics</strong> in the toolbar to copy the whole 'scribe. The button reads
	<strong>Lyrics copied</strong> for a moment once the lyrics are on the clipboard. If the browser refuses,
	a message asks you to check its clipboard permission.
</p>
<p>
	The copy is exactly the text in the editor, character for character. Performer formatting stays
	as the literal markup Genius uses, such as <code>&lt;i&gt;</code> and <code>&lt;b&gt;</code>, and
	annotation markup stays as it was.
</p>
<p>
	Nothing LyricLint draws on top of the lyrics is copied: not the underlines, not a fix preview,
	not the performer colors or the line times in the margin. What you paste into Genius is only the
	lyrics.
</p>
<p>
	To copy part of a 'scribe, select it and press <Keys combo="Mod-c" />. The text you get is the
	same exact slice.
</p>

<h3>Check before you update the page</h3>
<p>
	<strong>Compare</strong> in the toolbar shows how your 'scribe differs from the lyrics on the Genius
	page.
</p>
<ol>
	<li>Copy the lyrics as the Genius page has them right now.</li>
	<li>Press <strong>Compare</strong> and paste them into the field.</li>
	<li>Press <strong>Show changes</strong>.</li>
</ol>
<p>
	Every changed line is listed. Press a line to put the caret on it in your 'scribe. LyricLint
	remembers the pasted page text, and <strong>Change baseline</strong> replaces it when the page has
	moved on.
</p>

<h2 id="paste">Paste from Genius</h2>
<p>
	Copy the lyrics from the Genius lyrics editor and paste them into an empty 'scribe with
	<strong>Paste lyrics</strong> or <Keys combo="Mod-v" />. The text lands exactly as copied.
</p>
<p>
	Annotation markup such as <code>[fragment](12345)</code> belongs to the lyrics on Genius. LyricLint
	keeps it, checks the words inside it, and copies it back unchanged, so the page's annotations survive
	the round trip.
</p>
<p>
	To bring a 'scribe up to date with a newer version of the page, select everything with
	<Keys combo="Mod-a" /> and paste over it. Where LyricLint can match the new sections to the old ones by their headers
	and lyrics, your <a href={resolve('/docs/section-links/')}>linked sections</a> stay linked. The pasted
	words themselves are not changed.
</p>

<h2 id="between">Between 'scribes</h2>
<p>
	Copy a passage from one 'scribe with <Keys combo="Mod-c" /> and paste it into another, and more
	than the words comes along:
</p>
<ul>
	<li>
		<strong>Line times.</strong> They land only where they still run in order with the times around the
		paste. Any that would not are dropped, and the words still land.
	</li>
	<li>
		<strong>Section links.</strong> A link comes along when every linked section is inside what you copied.
	</li>
	<li>
		<strong>Streaming audio.</strong> When the copy carries line times or links, it also carries the
		'scribe's streaming source. If the 'scribe you paste into has no audio yet, it takes that source,
		ready to start with one press. Audio already attached is never replaced, and local files do not
		travel this way.
	</li>
</ul>
<p>
	Pasted anywhere else, the same copy is plain lyrics. <strong>Copy lyrics</strong> in the toolbar never
	carries any of this.
</p>
<p>
	To copy a whole 'scribe, use <strong>Duplicate</strong> in the <a href={resolve('/docs/scribes/')}
		>'scribes list</a
	>. To move one to another browser, export it as a Scribe file.
</p>
