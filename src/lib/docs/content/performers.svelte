<script lang="ts">
	import { resolve } from '$app/paths';
	import DocsFigure from '$lib/ui/docs/DocsFigure.svelte';
	import Keys from '$lib/ui/docs/Keys.svelte';
	import * as Tabs from '$lib/ui/primitives/tabs/index.js';
</script>

<h2 id="roster">Build the roster</h2>

<p>
	The roster is the list of people who sing on the song. Each 'scribe has its own, in the
	<strong>Performers</strong> tab of the right panel.
</p>

<ol>
	<li>Open the <strong>Performers</strong> tab.</li>
	<li>Type a name in the <strong>Performer name</strong> field.</li>
	<li>Press <strong>Add</strong>.</li>
</ol>

<p>
	You rarely need to start from nothing. When you paste lyrics whose headers already name
	performers, such as <code>[Verse 1: Avery]</code>, those names join the roster on their own.
</p>

<p>
	The roster lists performers in the order they first sing. Performers who are not in the lyrics
	yet follow, in the order you added them.
</p>

<p>
	If two names look like the same person (a different capitalization, say), they appear under <strong
		>Possible duplicates</strong
	> with a <strong>Merge into …</strong> button. LyricLint never merges names without asking.
</p>

<p>
	To remove a performer, press the trash button on their row, then <strong>Remove</strong> to confirm.
	This takes them off the roster only. Lyrics already formatted for them keep their markup.
</p>

<h2 id="assign">Assign a passage</h2>

<p>
	Genius shows who sings what with two pieces of markup: the section header lists the voices, and
	each voice's lyrics carry a style. In <code>[Chorus: Avery, &lt;i&gt;Blair&lt;/i&gt;]</code>, Avery's
	lines are plain and Blair's are wrapped in <code>&lt;i&gt;…&lt;/i&gt;</code>. LyricLint writes both
	for you.
</p>

<Tabs.Root value="pointer">
	<Tabs.List>
		<Tabs.Trigger value="pointer">Mouse</Tabs.Trigger>
		<Tabs.Trigger value="keyboard">Keyboard</Tabs.Trigger>
		<Tabs.Trigger value="phone">Phone</Tabs.Trigger>
	</Tabs.List>
	<Tabs.Content value="pointer">
		<ol>
			<li>Select the words with the mouse. The performer picker opens beside the selection.</li>
			<li>Press the performer who sings them. Press more than one for a passage sung together.</li>
			<li>Press <strong>Apply</strong>.</li>
		</ol>
	</Tabs.Content>
	<Tabs.Content value="keyboard">
		<ol>
			<li>Select the words, for example with <Keys combo="Shift-ArrowRight" />.</li>
			<li>Press <Keys combo="Ctrl-Alt-p" /> to open the performer picker.</li>
			<li>
				Move between performers with the arrow keys and press <Keys combo="Space" /> to pick one. Pick
				more than one for a passage sung together.
			</li>
			<li>Press <Keys combo="Enter" /> to apply, or <Keys combo="Escape" /> to cancel.</li>
		</ol>
	</Tabs.Content>
	<Tabs.Content value="phone">
		<ol>
			<li>Select the words with the selection handles.</li>
			<li>Press <strong>Assign voices</strong> in the editor's action bar.</li>
			<li>Press the performer who sings them, then <strong>Apply</strong>.</li>
		</ol>
		<p>More about touch editing is in <a href={resolve('/docs/phone/')}>On a phone</a>.</p>
	</Tabs.Content>
</Tabs.Root>

<DocsFigure
	name="workbench-performers"
	alt="Words are selected in the editor and assigned to Avery. The rest of the section is assigned to Avery and Blair together. LyricLint adds the performer names to the header and wraps the selected words in italics markup. Coloured marks beside the lines show who sings them."
/>

<p>
	If you assign part of a section that has no performers yet, the picker asks two questions: <strong
		>Who sings this?</strong
	>, then <strong>Next</strong> and <strong>Who sings the rest?</strong>. Answer with
	<strong>Apply</strong>, or press <strong>Skip</strong> to name the rest later.
</p>

<p>A few more things the picker does:</p>

<ul>
	<li><strong>Add voice</strong> adds a new performer to the roster without leaving the picker.</li>
	<li>
		Unpicking everyone turns the button into <strong>Remove formatting</strong>, which takes the
		passage back to plain text.
	</li>
	<li>
		<strong>Use new unknown voice</strong> marks a different singer you cannot name yet. It writes the
		style without a name in the header, so you can name the voice later.
	</li>
</ul>

<p>
	Each assignment is one step you can undo. The selection must sit inside one section that has a
	header, and the header gets updated in the same step. A section can hold four voices, because
	Genius has four styles: plain, <code>&lt;i&gt;</code>, <code>&lt;b&gt;</code>, and
	<code>&lt;i&gt;&lt;b&gt;</code>. A fifth is refused rather than rewriting the others.
</p>

<p>
	Some findings about performers carry an <strong>Assign section performers</strong> button that opens
	the picker for the right section. The guide's <a href={resolve('/guidelines/section-headers/')}
		>section headers</a
	> topic covers the convention in full.
</p>

<h2 id="rename">Rename a performer</h2>

<ol>
	<li>In the <strong>Performers</strong> tab, press the performer's name.</li>
	<li>Edit the name.</li>
	<li>Press <strong>Save</strong>, or <strong>Cancel</strong> to keep the old one.</li>
</ol>

<p>Every header that names them changes in one step you can undo.</p>

<p>
	You can also rename someone by editing their name inside any header. The other headers and the
	roster follow as you type.
</p>

<h2 id="gutter">See who sings each line</h2>

<p>
	A coloured bar in the margin beside each lyric line shows its main performer. Point at the bar to
	see the name.
</p>

<p>
	When a line has more than one voice, each voice's words get a soft tint in that performer's
	colour. Names in headers wear the same colours, so the header works as a key.
</p>

<p>
	Colour is only a visual aid. The styles and header names say who sings, and a screen reader
	announces the performer when the cursor enters their passage.
</p>

<p>
	For an overview of the whole song, open <strong>Performers by section</strong> at the foot of the
	<strong>Performers</strong> tab. Sections with the same arrangement are grouped together.
</p>

<p>
	None of this changes the lyrics. What you copy is only the Genius markup. See <a
		href={resolve('/docs/copy-paste/')}>Copy and paste</a
	>.
</p>
