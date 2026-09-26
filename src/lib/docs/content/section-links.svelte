<script lang="ts">
	import { resolve } from '$app/paths';
	import DocsFigure from '$lib/ui/docs/DocsFigure.svelte';
	import Keys from '$lib/ui/docs/Keys.svelte';
	import * as Accordion from '$lib/ui/primitives/accordion/index.js';
</script>

<h2 id="link">Link repeated sections</h2>

<p>
	A chorus usually comes back with the same words. Linking its copies means a correction typed in
	one reaches the others, so no copy is left with the old spelling.
</p>

<ol>
	<li>Open the <strong>Linking</strong> tab in the right panel.</li>
	<li>
		Under <strong>Available to link</strong>, find the repeated sections and press
		<strong>Set up link</strong>.
	</li>
	<li>Under <strong>Sections to link</strong>, check that every copy you want in the group is ticked.</li>
	<li>Press <strong>Link sections</strong>. The button names how many, such as “Link 3 sections”.</li>
</ol>

<p>
	LyricLint also notices repeats on its own. When the same part appears more than once, the
	suggestion <strong>Link these repeats so one correction reaches them all.</strong> carries a
	<strong>Manage linking</strong> button that opens the same view.
</p>

<p>
	Linking never changes lyrics by itself. Copies that are sung a little differently keep their
	differences, and only the words they share are tied together.
</p>

<p>
	You can write a chorus once, add empty <code>[Chorus]</code> headers where it repeats, and link
	them. The button then reads <strong>Fill … and link</strong>, and copies the written chorus into
	the empty ones.
</p>

<h2 id="mirror">Edits reach every copy</h2>

<p>
	Type in a linked section and the same change appears in every copy that shares those words. The
	whole change is one step, so a single undo takes it back everywhere.
</p>

<DocsFigure
	name="docs-section-links"
	alt="A word is corrected in the first of two linked choruses, and the same correction appears in the second chorus as it is typed."
/>

<p>
	A linked header carries two small buttons after its closing bracket. While the cursor is in that
	section, a note beside them says where your next edit will land:
</p>

<ul>
	<li><strong>Also edits …</strong> names the copies that will change with this one.</li>
	<li>
		<strong>Only this section</strong> means the cursor is in words this copy does not share, such as
		an ad-lib only sung here.
	</li>
</ul>

<p>
	Lyrics that belong to one copy only are marked with a dotted underline. The underline is a
	decoration and is never copied.
</p>

<p>
	Assigning a performer to shared words applies to the linked copies too. See <a
		href={resolve('/docs/performers/')}>Performers</a
	>.
</p>

<Accordion.Root type="multiple">
	<Accordion.Item value="adlib">
		<Accordion.Trigger>What happens to an ad-lib that only one chorus has?</Accordion.Trigger>
		<Accordion.Content>
			<p>
				It stays in that chorus. Linking ties the words the copies share and leaves each copy's own
				words where they are.
			</p>
		</Accordion.Content>
	</Accordion.Item>
	<Accordion.Item value="delete-header">
		<Accordion.Trigger>What if I delete a linked section's header?</Accordion.Trigger>
		<Accordion.Content>
			<p>
				That section leaves the group, and its lyrics stay as they are. A group needs at least two
				sections, so deleting one header of a pair ends the link.
			</p>
		</Accordion.Content>
	</Accordion.Item>
	<Accordion.Item value="undo">
		<Accordion.Trigger>Does undo reverse the change in every copy?</Accordion.Trigger>
		<Accordion.Content>
			<p>Yes. An edit and the copies it updated are one step, so one undo reverses all of them.</p>
		</Accordion.Content>
	</Accordion.Item>
</Accordion.Root>

<h2 id="one-copy">Change one copy only</h2>

<p>
	Sometimes one chorus really is sung differently. To change that copy without touching the others:
</p>

<ol>
	<li>Put the cursor in the linked section you want to change.</li>
	<li>
		Press <Keys combo="Mod-Shift-l" />, or press the pencil button after the section's header (its
		name is <strong>Edit this section only</strong>).
	</li>
	<li>
		The header now reads <strong>Editing this section only</strong>. Everything you type in that
		section stays there.
	</li>
	<li>Press <Keys combo="Mod-Shift-l" /> or the pencil button again when you are done.</li>
</ol>

<p>
	Moving the cursor elsewhere does not turn the mode off. When no audio is attached, <Keys
		combo="Escape"
	/> also turns it off; with audio attached, <Keys combo="Escape" /> controls playback instead.
</p>

<p>
	The words you changed stay separate afterwards, and the rest of the section goes back to updating
	its linked copies.
</p>

<h2 id="linking-panel">The Linking panel</h2>

<p>
	The <strong>Linking</strong> tab lists <strong>Linked sections</strong> first, then sections that are
	<strong>Available to link</strong>. Each group names its sections, and a <strong>Line</strong> button
	beside each one takes you to it in the lyrics.
</p>

<p>The button on each group says what it will do:</p>

<ul>
	<li><strong>Set up link</strong> starts a new group.</li>
	<li><strong>Add sections</strong> adds new copies to a group that already exists.</li>
	<li><strong>Combine groups</strong> joins groups that already exist into one.</li>
	<li><strong>Manage</strong> opens an existing group.</li>
</ul>

<p>
	The link button after a linked header opens that group here too. In a group, each section is
	marked <strong>✓ Same lyrics</strong> or <strong>≠ Differs</strong>.
</p>

<h3>Choose wording where copies differ</h3>

<p>
	Differences are kept by default, and reviewing them is optional. Press <strong
		>Review differences</strong
	> to see each one, then pick an approach:
</p>

<ul>
	<li><strong>Choose wording per difference</strong> keeps or changes individual passages.</li>
	<li><strong>Use one section’s full version</strong> makes the selected sections identical.</li>
</ul>

<p>
	Nothing changes until you press the button, which then counts your choices, such as “Apply 2
	changes”. <strong>Cancel</strong> clears them.
</p>

<h3>Unlink or reconnect</h3>

<p>
	To take sections out of a group, open it, untick them, and press <strong>Update links</strong>.
	When only the section you started from is left, the button reads <strong
		>Unlink this section</strong
	>. Unlinking keeps every section's lyrics as written.
</p>

<p>
	If copies you edited separately match again, <strong>Link matching lyrics again</strong> appears in
	the group. It shows the lyrics it would reconnect, and <strong>Link these lyrics again</strong> ties
	them without changing any words.
</p>

<p>
	When you open a group from the link button after its header, the view also has an <strong
		>Edit this section only</strong
	> switch, the same setting as the pencil button.
</p>
