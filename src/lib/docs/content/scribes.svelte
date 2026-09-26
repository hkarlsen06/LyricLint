<script lang="ts">
	import { resolve } from '$app/paths';
	import DocsFigure from '$lib/ui/docs/DocsFigure.svelte';
	import Keys from '$lib/ui/docs/Keys.svelte';
</script>

<h2 id="autosave">Saving happens on its own</h2>
<p>
	A 'scribe saves to this browser a moment after you stop typing. There is no save button and
	nothing to press before closing the tab.
</p>
<p>
	Everything that belongs to the 'scribe is saved with it: the lyrics, the title, the language, the
	performers, line timings, section links, findings you ignored, and the audio you attached.
</p>
<p>
	While saving works, the toolbar shows nothing about it. If a save fails, <strong
		>Save failed</strong
	> appears beside the title with a warning mark.
</p>
<p>
	A new 'scribe is saved only once it has something in it. An empty one you abandon leaves nothing
	behind.
</p>
<p>
	The title field at the top left is the 'scribe's name. Type in it and press <Keys
		combo="Enter"
	/> to rename; <Keys combo="Escape" /> puts the old name back. An untitled 'scribe takes the song's
	name when you attach audio.
</p>

<h2 id="switching">Switching between 'scribes</h2>
<DocsFigure
	name="docs-scribes"
	alt="The Saved 'scribes menu open under the title, listing several 'scribes with their dates."
/>
<ol>
	<li>
		Press the chevron at the end of the title field. The <strong>Saved 'scribes</strong> list opens,
		most recently changed first.
	</li>
	<li>Press a 'scribe's name to open it.</li>
</ol>
<p>
	The small buttons at the end of each row are <strong>Rename</strong>,
	<strong>Duplicate</strong>, <strong>Export Scribe (.lls)</strong>, and <strong>Delete</strong>.
	They brighten when you point at or focus the row.
</p>
<p>
	Once you have five or more 'scribes, a search field at the top of the list finds them by title or
	by any words in the lyrics. When two 'scribes share a title, each row also shows its opening line.
</p>
<p>
	To start another, press <strong>New 'scribe</strong> (the plus beside the title). On a phone it is
	in the <strong>Document</strong> menu.
</p>
<p>
	When the editor is empty, the Review panel lists your <strong>Recent 'scribes</strong> as well.
</p>

<h2 id="recovery">Getting work back</h2>
<p>
	Reopen LyricLint after closing the tab, a crash, or a restart, and the 'scribe you were working
	on is back. Everything saved up to the last pause in your typing is there.
</p>
<p>
	If the workbench is already open in another tab, a second tab says so and waits. Two tabs saving
	at once would overwrite each other, so the first one keeps the workbench. Close it and the waiting
	tab takes over on its own.
</p>
<p>
	Within a session, <Keys combo="Mod-z" /> and <strong>Undo</strong> in the toolbar take back edits, including
	fixes.
</p>
<p>
	Browsers can clear site storage when the disk runs low. If yours treats LyricLint's storage as
	best-effort, <strong>Preferences</strong> then <strong>Local data</strong> offers
	<strong>Protect storage</strong>. A backup file is the durable copy either way.
</p>

<h2 id="backup">Keep a backup</h2>
<p>
	Open <strong>Preferences</strong> and expand <strong>Workspace backup</strong>. A backup holds every
	'scribe and its settings. Assistant chats are left out.
</p>
<ul>
	<li>
		Where the browser can write to a file you choose (Chrome, for example), press <strong
			>Choose backup file…</strong
		> once. LyricLint then keeps that file up to date as you work.
	</li>
	<li>Elsewhere, press <strong>Download backup</strong> to save a copy whenever you like.</li>
	<li>
		<strong>Import backup…</strong> adds a backup's 'scribes to this browser. Reconnect local audio files
		afterward.
	</li>
</ul>
<p>
	To move one 'scribe to another browser or person, use <strong>Export Scribe (.lls)</strong> on its
	row, and <strong>Import Scribe…</strong> at the top of the list on the other side.
</p>

<h2 id="deleting">Deleting a 'scribe</h2>
<ol>
	<li>Open the <strong>Saved 'scribes</strong> list.</li>
	<li>Press the trash button on the row. It turns into <strong>Delete</strong> and <strong
			>Cancel</strong
		>.</li>
	<li>Press <strong>Delete</strong> to confirm.</li>
</ol>
<p>
	Deleting cannot be undone. If you delete the 'scribe you have open, the most recent other one
	opens in its place.
</p>
<p>
	The list deletes one 'scribe at a time. To remove everything, see <a
		href={resolve('/docs/privacy-offline/')}>Offline and privacy</a
	>.
</p>
