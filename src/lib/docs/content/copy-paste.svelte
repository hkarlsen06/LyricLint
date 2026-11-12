<script lang="ts">
	import { resolve } from '$app/paths';
	import { handoffBookmarklet } from '#lib/core/handoff-bookmarklet.js';
	import Keys from '#lib/ui/docs/Keys.svelte';
</script>

<h2 id="formats">Main format and exports</h2>
<p>
	A new empty 'scribe offers Genius and Musixmatch inline. Your last deliberate choice becomes the
	default for the next new 'scribe. Once you write lyrics or apply semantic formatting, that main
	format stays fixed, even after clearing the lyrics.
</p>
<p>
	Use <strong>Export to Genius</strong> or <strong>Export to Musixmatch</strong> for the other format.
	The dialog contains separate editable output. Copy and Download .txt use exactly that output; Edit lyrics
	returns to the main draft. Output edits are remembered through closing, reload and switching drafts
	until you edit the original lyrics or their formatting details. Changing a title or moving the caret
	keeps your edited output.
</p>
<p>
	Beside the output, the dialog reviews it against the format you are exporting to, since the main
	draft is only checked in its own. Each finding is underlined in the output; open one to see why,
	then fix it there or ignore it for this export. Fixes change the output only. A Musixmatch export
	also lists its section tags in order, because Musixmatch takes structure as tags and not as text.
</p>
<p>
	If you paste Genius lyrics into a Musixmatch 'scribe, the paste stays exact and LyricLint offers
	<strong>Convert to sections</strong>. One press keeps every recognized header such as
	<code>[Chorus: Mira]</code> as a section with its label and performers, and Undo brings the
	bracketed lines back. The same action stays on the bracketed-label finding in Review.
</p>

<h2 id="copy">Copy the lyrics</h2>
<p>
	Press <strong>Copy Genius</strong> or <strong>Copy Musixmatch</strong> in the toolbar to copy the
	whole 'scribe. The button reads
	<strong>Lyrics copied</strong> for a moment once the lyrics are on the clipboard. If the browser refuses,
	a message asks you to check its clipboard permission.
</p>
<p>
	The copy is exactly the text in the editor, character for character. Performer formatting stays as
	the literal markup Genius uses, such as <code>&lt;i&gt;</code> and <code>&lt;b&gt;</code>, and
	annotation markup stays as it was.
</p>
<p>
	Nothing LyricLint draws on top of the lyrics is copied: not the underlines, not a fix preview, not
	the performer colors or the line times in the margin. What you paste into Genius is only the
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
	remembers the pasted page text, and <strong>Change baseline</strong> replaces it when the page has moved
	on.
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
	<Keys combo="Mod-a" /> and paste over it. Where LyricLint can match the new sections to the old ones
	by their headers and lyrics, your <a href={resolve('docs/section-links/')}>linked sections</a> stay
	linked. The pasted words themselves are not changed.
</p>

<div>
	<h2 id="bookmarklet">Open Genius lyrics with a bookmarklet</h2>
	<p>
		The <strong>Open in LyricLint</strong> bookmarklet opens the lyrics you are editing on Genius as
		a new 'scribe in a new tab. The 'scribe you have open stays as it was.
	</p>
	<p class="bookmarklet__phone">
		It needs a desktop browser's bookmarks bar, so open this page on a computer to add it.
	</p>
	<p class="bookmarklet__desktop">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a bookmarklet is dragged to the bookmarks bar, not followed. -->
		<a class="button" href={handoffBookmarklet()}>Open in LyricLint</a>
	</p>
	<ol class="bookmarklet__desktop">
		<li>Drag <strong>Open in LyricLint</strong> to your browser's bookmarks bar.</li>
		<li>On a Genius lyrics editing page, click into the lyrics box.</li>
		<li>Press <strong>Open in LyricLint</strong> in the bookmarks bar.</li>
	</ol>
	<p>The lyrics travel inside the link to the new tab and reach no server.</p>
	<p>
		To put the corrected lyrics back, press <strong>Copy lyrics</strong>, follow
		<strong>Open Genius page</strong> in the Song panel, and paste them into the lyrics box.
	</p>
</div>

<h2 id="between">Between 'scribes</h2>
<p>
	Copy a passage from one 'scribe with <Keys combo="Mod-c" /> and paste it into another, and more than
	the words comes along:
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
		<strong>Streaming audio.</strong> When the copy carries line times or links, it also carries the 'scribe's
		streaming source. If the 'scribe you paste into has no audio yet, it takes that source, ready to start
		with one press. Audio already attached is never replaced, and local files do not travel this way.
	</li>
</ul>
<p>
	Pasted anywhere else, the same copy is plain lyrics. <strong>Copy Genius</strong> or
	<strong>Copy Musixmatch</strong> in the toolbar never carries any of this.
</p>
<p>
	To copy a whole 'scribe, use <strong>Duplicate</strong> in the
	<a href={resolve('docs/scribes/')}>'scribes list</a>. To move one to another browser, export it as
	a Scribe file.
</p>

<style>
	/*
	 * A bookmarks bar belongs to a desktop browser and is filled by dragging with
	 * a mouse, so phones, in either orientation, and narrow windows get the
	 * heading and a pointer to a computer instead of the link. The heading stays
	 * so that docs search never leads to nothing. The first query is
	 * `PHONE_LAYOUT_QUERY`.
	 */
	.bookmarklet__phone {
		display: none;
	}
	@media (pointer: coarse) and (max-width: 68rem), (max-width: 40rem) {
		.bookmarklet__phone {
			display: block;
		}
		.bookmarklet__desktop {
			display: none;
		}
	}
</style>
