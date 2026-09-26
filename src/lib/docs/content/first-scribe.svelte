<script lang="ts">
	import { resolve } from '$app/paths';
	import DocsFigure from '$lib/ui/docs/DocsFigure.svelte';
	import Keys from '$lib/ui/docs/Keys.svelte';
</script>

<DocsFigure
	name="docs-first-scribe"
	alt="Lyrics are pasted into an empty 'scribe, findings appear in the Review panel, a fix is applied from one of them, and Copy lyrics is pressed."
/>

<h2 id="paste">Paste or type the lyrics</h2>
<p>
	Open the <a href={resolve('/workbench/')}>workbench</a>. A new 'scribe starts empty, with
	<em>Paste or type your lyrics here</em> in the editor.
</p>
<ol>
	<li>Copy the transcription from wherever it is now.</li>
	<li>
		Press <strong>Paste lyrics</strong> in the toolbar. If the browser does not allow LyricLint to read
		the clipboard, the caret moves into the editor and you paste with <Keys combo="Mod-v" /> instead.
	</li>
</ol>
<p>You can also type straight into the editor. There is no account and nothing to set up.</p>
<p>
	To look around before you have lyrics of your own, press <strong>Load a sample 'scribe</strong> in
	the Review panel.
</p>
<p>
	The toolbar shows the lyric language. If the lyrics are in another language, a finding offers to
	switch it for you, since section headers and several checks depend on it.
</p>

<h2 id="findings">Read the findings</h2>
<p>
	LyricLint checks the lyrics as you write. Each problem is underlined in the editor and listed as a
	finding in the <strong>Review</strong> panel beside it.
</p>
<p>
	A finding says what is wrong, which line it is on, and which Genius source it rests on. Open
	<strong>Sources</strong> on a finding to see them.
</p>
<p>
	Use <strong>Previous</strong> and <strong>Next</strong> at the top of the panel, or
	<Keys combo="Alt-Shift-ArrowUp" /> and <Keys combo="Alt-Shift-ArrowDown" />, to step through them.
	When the panel reads <strong>No issues found</strong>, every enabled rule passes.
</p>
<p>
	Some findings are judgment calls rather than errors, and they say so. You decide those. The
	<a href={resolve('/docs/findings/')}>findings page</a> explains severities, sources, and ignoring.
</p>

<h2 id="fix">Fix what is wrong</h2>
<p>
	Most findings carry a fix. Its button names the change, such as <strong>Replace with I'ma</strong
	>.
</p>
<ol>
	<li>Point at the fix button, or focus it, to preview the change in the lyrics.</li>
	<li>Press it to apply the change.</li>
	<li>
		If the same problem appears elsewhere, <strong>Fix all</strong> followed by a count applies it everywhere
		at once.
	</li>
</ol>
<p>
	From the keyboard, <Keys combo="Mod-." /> selects the nearest finding that has a fix, and pressing
	it again applies the fix.
</p>
<p>
	A fix is an ordinary edit. <Keys combo="Mod-z" /> or <strong>Undo</strong> in the toolbar takes it
	back. When a finding is wrong about your lyrics, press <strong>Ignore</strong> instead.
</p>

<h2 id="copy">Copy it back to Genius</h2>
<ol>
	<li>
		Press <strong>Copy lyrics</strong> in the toolbar. The button reads
		<strong>Lyrics copied</strong> for a moment when the lyrics are on the clipboard.
	</li>
	<li>Open the song's lyrics editor on Genius and paste over the old text.</li>
</ol>
<p>
	What you copy is exactly the text in the editor, including any literal markup such as
	<code>&lt;i&gt;</code> for performers. See <a href={resolve('/docs/copy-paste/')}
		>Copy and paste</a
	> for the details, and for <strong>Compare</strong>, which shows what will change on the page
	before you paste.
</p>
<p>
	Your 'scribe has been saving itself the whole time. <a href={resolve('/docs/scribes/')}
		>'Scribes and recovery</a
	> covers where it went and how to get back to it.
</p>
