<script lang="ts">
	import { resolve } from '$app/paths';
	import DocsFigure from '$lib/ui/docs/DocsFigure.svelte';
	import Keys from '$lib/ui/docs/Keys.svelte';
	import * as Table from '$lib/ui/primitives/table/index.js';
</script>

<h2 id="insert">Insert a header</h2>

<p>
	A section is a header followed by its lyrics, such as <code>[Verse 1]</code> or
	<code>[Chorus]</code>. A blank line ends one section and starts the next.
</p>

<p>There are three ways to add a header:</p>

<ul>
	<li>
		After a blank line, the new section shows a <strong>+ Add section header</strong> row above its first
		line. Press it.
	</li>
	<li>
		Put the cursor in the section and press <Keys combo="Mod-Shift-h" />, or press the
		<code>[+]</code> <strong>Section header</strong> button in the editor's action bar.
	</li>
	<li>
		On the finding <strong>This lyric section has no header.</strong>, press
		<strong>Choose header</strong>.
	</li>
</ul>

<p>Each one opens the same picker:</p>

<ol>
	<li>Type to filter the list, or move through it with the arrow keys.</li>
	<li>Press <Keys combo="Enter" /> or click a header to insert it.</li>
	<li>
		To leave the lyrics unchanged, press <Keys combo="Escape" /> or <strong>Cancel</strong>.
	</li>
</ol>

<DocsFigure
	name="docs-sections"
	alt="The section header picker open above a lyric section, with a search field and a list of headers in song order: Intro, Verse, Pre-Chorus, Chorus, and so on."
/>

<p>
	The list follows a typical song, from Intro to Outro, and filtering never reorders it. For a
	header that is not in the list, type it and choose <strong>Use “…”</strong>.
</p>

<p>
	The header goes in as one step you can undo, and the cursor moves to the line below it, ready
	for lyrics. If the section already has a header, <Keys combo="Mod-Shift-h" /> starts a new section
	at the cursor's line instead of replacing it.
</p>

<p>
	A header that no reviewed list contains becomes a <strong>Manual review</strong> finding, in case
	it is a typo. If you meant it, press <strong>It's correct</strong>.
</p>

<h2 id="numbering">Numbering and repeats</h2>

<p>
	Genius numbers verses and nothing else. Every chorus is <code>[Chorus]</code>, however many times
	it comes back.
</p>

<ul>
	<li>
		The picker suggests the next verse number from the verses above the cursor, so a second verse
		is offered as <code>Verse 2</code>.
	</li>
	<li>Inserting a verse between two others renumbers the verses after it in the same step.</li>
	<li>
		Once two verses have different words, a finding offers <strong>Number the verses</strong> for any
		that are still unnumbered or out of order.
	</li>
	<li>A song with only one distinct verse leaves it unnumbered, even when that verse repeats.</li>
	<li>An exact repeat of a verse keeps the number of its first appearance.</li>
</ul>

<p>
	Write repeated lyrics out in full. A placeholder such as <code>[Chorus x2]</code> or
	<code>(Repeat chorus)</code> is a warning, and LyricLint does not expand it for you, because it cannot
	know which earlier section you mean.
</p>

<p>
	When a part repeats immediately, keep both copies under one header with no blank line between
	them. Two identical sections back to back get a warning that says so.
</p>

<p>
	To keep repeated choruses identical while you correct them, <a
		href={resolve('/docs/section-links/')}>link them</a
	>. The checks behind this section are
	<a href={resolve('/guidelines/checks/section-verse-numbering/')}>verse numbering</a>,
	<a href={resolve('/guidelines/checks/repeat-placeholder/')}>repeat placeholders</a>, and
	<a href={resolve('/guidelines/checks/section-immediate-repeat-spacing/')}>immediate repeats</a>.
</p>

<h2 id="languages">Headers in other languages</h2>

<p>
	The picker lists headers for the 'scribe's lyric language. Change it with the language button in
	the toolbar, which shows the current language. If the lyrics look like a different language, a
	finding offers <strong>Set language to …</strong>.
</p>

<p>These languages have reviewed header lists:</p>

<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head>Language</Table.Head>
			<Table.Head>Headers</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		<Table.Row>
			<Table.Cell>English</Table.Cell>
			<Table.Cell><code>Verse</code>, <code>Chorus</code>, <code>Bridge</code></Table.Cell>
		</Table.Row>
		<Table.Row>
			<Table.Cell>Norwegian</Table.Cell>
			<Table.Cell>
				<code>Vers</code>, <code>Refreng</code>, <code>Bro</code>. Use <code>Chorus</code> instead of
				<code>Refreng</code> when the song also has a <code>Pre-Chorus</code> or <code>Post-Chorus</code>.
			</Table.Cell>
		</Table.Row>
		<Table.Row>
			<Table.Cell>German</Table.Cell>
			<Table.Cell>
				<code>Part</code> and <code>Hook</code> (common in rap) or <code>Strophe</code> and
				<code>Refrain</code>. Both pairs are accepted.
			</Table.Cell>
		</Table.Row>
		<Table.Row>
			<Table.Cell>Spanish</Table.Cell>
			<Table.Cell><code>Verso</code>, <code>Coro</code> or <code>Estribillo</code>, <code>Puente</code></Table.Cell>
		</Table.Row>
		<Table.Row>
			<Table.Cell>French</Table.Cell>
			<Table.Cell><code>Couplet</code>, <code>Refrain</code>, <code>Pont</code></Table.Cell>
		</Table.Row>
		<Table.Row>
			<Table.Cell>Arabic</Table.Cell>
			<Table.Cell>
				<code lang="ar" dir="rtl">المقطع</code>, <code lang="ar" dir="rtl">اللازمة</code>,
				<code lang="ar" dir="rtl">جسر</code>
			</Table.Cell>
		</Table.Row>
		<Table.Row>
			<Table.Cell>Japanese</Table.Cell>
			<Table.Cell>English headers, as Genius Japan requires.</Table.Cell>
		</Table.Row>
		<Table.Row>
			<Table.Cell>Korean</Table.Cell>
			<Table.Cell>
				English headers for original songs. Hangul terms such as <code lang="ko">코러스</code> are also
				accepted, for translations.
			</Table.Cell>
		</Table.Row>
	</Table.Body>
</Table.Root>

<p>
	If a header uses another language's word for the part, such as <code>[Chorus]</code> in a Spanish
	'scribe, a finding offers the reviewed term for the 'scribe's language.
</p>

<p>
	For any other language, the picker has no list yet. Type the header and choose <strong
		>Use “…”</strong
	>. The guide's <a href={resolve('/guidelines/non-english/')}>non-English songs</a> and
	<a href={resolve('/guidelines/section-headers/')}>section headers</a> topics explain the conventions.
</p>
