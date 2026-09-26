<script lang="ts">
	import { resolve } from '$app/paths';
	import DocsFigure from '$lib/ui/docs/DocsFigure.svelte';
</script>

<p>
	Open the <strong>Preferences</strong> tab in the panel beside the editor. On a phone it is under
	<strong>Tools</strong>. Settings apply to the whole workbench, not to one 'scribe.
</p>
<DocsFigure
	name="docs-preferences"
	alt="The Preferences tab, listing Grammar checking with its switch, then Workspace backup, Local data, and Reviewed rules, with About LyricLint at the foot."
/>

<h2 id="grammar">Grammar checking</h2>
<p>
	The switch turns optional English spelling and grammar suggestions on or off. It is on until you
	turn it off. The suggestions come from a grammar checker that runs in your browser; see <a
		href={resolve('/docs/findings/')}>Findings and fixes</a
	>.
</p>
<p>
	The setting appears only while the 'scribe's language is English, because the checker reads only
	English. Your choice is kept when you switch to a 'scribe in another language and back.
</p>

<h2 id="backup">Workspace backup</h2>
<p>
	Expand <strong>Workspace backup</strong> to save every 'scribe and its settings to a file, or to
	import one. Rules assistant conversations are not included, and neither are local audio files, so
	reconnect those after an import. <a href="{resolve('/docs/scribes/')}#backup">Keep a backup</a> explains
	the buttons.
</p>
<p>If an automatic backup fails, the tab says so even while the section is closed.</p>

<h2 id="local-data">Local data</h2>
<p>
	Expand <strong>Local data</strong> to see how safely this browser is keeping your 'scribes. Where
	the browser may clear its storage when the disk runs low, <strong>Protect storage</strong> asks it
	not to.
</p>
<p>
	<strong>Reset LyricLint…</strong> deletes every 'scribe and conversation in this browser and resets
	all settings, after you confirm. See <a href="{resolve('/docs/privacy-offline/')}#reset"
		>Deleting everything</a
	>.
</p>

<h2 id="rules">Reviewed rules</h2>
<p>
	Expand <strong>Reviewed rules</strong> to see which version of LyricLint's rules you are running:
	its version, when it was published, and how many rules it holds. Below that are links to every
	reviewed Genius source the rules cite. The full list of rules is on <a href={resolve('/rules/')}
		>the rules page</a
	>.
</p>
<p><strong>About LyricLint</strong>, at the foot of the tab, opens the LyricLint home page.</p>
