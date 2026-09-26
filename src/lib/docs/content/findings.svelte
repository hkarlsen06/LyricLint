<script lang="ts">
	import { resolve } from '$app/paths';
	import DocsFigure from '$lib/ui/docs/DocsFigure.svelte';
	import Keys from '$lib/ui/docs/Keys.svelte';
	import * as Table from '$lib/ui/primitives/table/index.js';
</script>

<h2 id="read">Read a finding</h2>

<p>
	LyricLint checks the lyrics as you type and lists what it finds in the <strong>Review</strong> tab
	of the right panel. The same findings are underlined in the lyrics.
</p>

<DocsFigure
	name="docs-findings"
	alt="The Review tab with one finding expanded. It shows the message, the line number and cited source, an explanation, and a fix button, while the lyrics show the fix as a preview."
/>

<p>Each finding starts with one line of facts:</p>

<ul>
	<li>A mark for how serious it is (see the table below).</li>
	<li>The line it is on.</li>
	<li>
		The source it relies on, as a link. Point at the link or focus it to see which part of the page
		is cited and when LyricLint last checked it. When a finding cites several sources, they fold
		behind <strong>Sources</strong>.
	</li>
</ul>

<p>
	Some findings also say <strong>LyricLint reading</strong>. That marks a check that is LyricLint's
	own interpretation of the sources cited after it, rather than something a source states outright.
</p>

<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head>Severity</Table.Head>
			<Table.Head>Mark</Table.Head>
			<Table.Head>What it means</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		<Table.Row>
			<Table.Cell>Error</Table.Cell>
			<Table.Cell>Cross in a circle</Table.Cell>
			<Table.Cell>
				The markup is broken, such as an unclosed bracket or a performer tag Genius does not support.
			</Table.Cell>
		</Table.Row>
		<Table.Row>
			<Table.Cell>Warning</Table.Cell>
			<Table.Cell>Exclamation mark in a triangle</Table.Cell>
			<Table.Cell>The lyrics depart from a reviewed Genius convention.</Table.Cell>
		</Table.Row>
		<Table.Row>
			<Table.Cell>Suggestion</Table.Cell>
			<Table.Cell><i>i</i> in a circle</Table.Cell>
			<Table.Cell>
				A judgment call or readability preference. Worth a look, and often fine to leave.
			</Table.Cell>
		</Table.Row>
		<Table.Row>
			<Table.Cell>Manual review</Table.Cell>
			<Table.Cell>Check mark in a circle</Table.Cell>
			<Table.Cell>
				LyricLint cannot tell whether this is right, such as a custom section header. Check it
				yourself.
			</Table.Cell>
		</Table.Row>
	</Table.Body>
</Table.Root>

<p>
	The chips above the list (<strong>Errors</strong>, <strong>Warnings</strong>, <strong
		>Suggestions</strong
	>, <strong>Manual review</strong>) show how many of each there are. Press a chip to hide or show
	that kind.
</p>

<p>
	Press a finding to open it and read the explanation. In the lyrics, point at an underline to see
	the same finding in a popover. When a line has several findings, a count at the end of the line
	lists them.
</p>

<p>To move between findings from the keyboard:</p>

<ul>
	<li>
		In the lyrics, <Keys combo="F2" /> goes to the next finding and <Keys combo="Shift-F2" /> to the
		previous one.
	</li>
	<li>
		In the <strong>Review</strong> tab, use <strong>Previous</strong> and <strong>Next</strong>, or
		<Keys combo="Alt-Shift-ArrowUp" /> and <Keys combo="Alt-Shift-ArrowDown" />.
	</li>
</ul>

<p>
	Each of LyricLint's own checks has a page in the <a href={resolve('/guidelines/')}
		>transcription guide</a
	> with examples and the reasoning behind it.
</p>

<h2 id="apply">Apply a fix</h2>

<p>
	When you open a finding that has a fix, the lyrics show the fix as a preview: struck-out text for
	what goes, and new text for what arrives. Nothing changes until you choose.
</p>

<ol>
	<li>Open the finding in the <strong>Review</strong> tab, or point at its underline.</li>
	<li>
		Read the preview. The fix button is labelled with the change itself, such as <strong
			>Replace with I'ma</strong
		>.
	</li>
	<li>Press the button.</li>
</ol>

<p>
	The fix is one step you can undo, and the next finding opens so you can keep going. When a finding
	offers more than one fix, the first is the recommended one. Point at or focus any of them to
	preview it.
</p>

<p>
	From the keyboard, <Keys combo="Mod-." /> opens the nearest finding that has a fix, with its fix button
	focused. Press <Keys combo="Mod-." /> again to apply it.
</p>

<p>Some findings need a decision rather than a replacement, so they carry a different button:</p>

<ul>
	<li><strong>Choose header</strong> opens the section header picker.</li>
	<li><strong>Assign section performers</strong> opens the performer picker.</li>
	<li><strong>Manage linking</strong> opens the Linking panel.</li>
	<li><strong>Set language to …</strong> changes the 'scribe's lyric language.</li>
</ul>

<p>A finding with no button explains what to change, and leaves the change to you.</p>

<h2 id="batch">Fix every occurrence</h2>

<p>
	When the same fix applies in several places, a <strong>Fix all</strong> button appears beside it
	with the count, such as <strong>Fix all 3</strong>. It applies that exact change, from that check,
	everywhere it appears, as one step you can undo.
</p>

<p>
	At the top of the <strong>Review</strong> tab, <strong>Fix … issues automatically</strong> applies
	every such fix in the list at once. The note beside it says how many findings still need a decision.
</p>

<p>
	Both use only fixes that were reviewed as safe to apply without looking at each one. Fixes that
	need your judgment are applied one at a time. Findings you have hidden with the
	chips are left alone.
</p>

<h2 id="ignore">Ignore a finding</h2>

<p>
	If a finding is wrong for this song, press <strong>Ignore</strong>. It disappears for this 'scribe
	only, and a message offers <strong>Undo</strong>.
</p>

<p>
	An ignored finding stays hidden even if you delete the text and type it again later. Other
	'scribes still show it.
</p>

<p>Some findings ask a question instead, and answering it hides the finding in the same way:</p>

<ul>
	<li><strong>It's correct</strong>, for a custom section header you meant to use.</li>
	<li><strong>It really is unintelligible</strong>, for an unknown-lyric marker.</li>
	<li><strong>The performer is unknown</strong>, for a styled voice you cannot name.</li>
</ul>

<p>
	To bring one back, open the ignored list at the foot of the <strong>Review</strong> tab (it reads,
	for example, “2 diagnostics ignored”). Each entry shows where it is, and <strong>Restore</strong> returns
	it to the list.
</p>

<h2 id="grammar">Grammar and spelling</h2>

<p>
	For English lyrics, LyricLint also checks spelling and grammar with Harper, a proofreader that
	runs in your browser. Your lyrics are not sent anywhere for this.
</p>

<DocsFigure
	name="workbench-harper"
	alt="The line 'I has counted every streetlight' has a wavy underline. Hovering opens a Harper suggestion that explains the grammar mistake and asks you to review it in context. The preview strikes out 'has' and adds 'have'. Pressing Replace with have fixes the line and removes the underline."
/>

<p>
	Lyrics bend grammar on purpose, so every Harper finding is a <strong>Suggestion</strong> and cites
	Harper as its source. Harper findings are listed after LyricLint's own, and their fixes are applied
	one at a time, never in bulk.
</p>

<p>Harper is tuned for lyrics:</p>

<ul>
	<li>Names on the roster count as known words.</li>
	<li>Dropped endings written with an apostrophe, such as <code>runnin'</code>, are left alone.</li>
	<li>
		Checks that would contradict Genius conventions, such as censoring words or regional spellings,
		are off.
	</li>
	<li>Where one of LyricLint's own checks covers the same words, only that finding shows.</li>
</ul>

<p>
	To turn it off, switch off <strong>Grammar checking</strong> in <a
		href={resolve('/docs/preferences/')}>Preferences</a
	>. The switch appears while the lyric language is English.
</p>
