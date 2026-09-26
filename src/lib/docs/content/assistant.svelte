<script lang="ts">
	import { resolve } from '$app/paths';
	import DocsFigure from '$lib/ui/docs/DocsFigure.svelte';
	import Keys from '$lib/ui/docs/Keys.svelte';
</script>

<h2 id="ask">Ask a question</h2>
<p>
	The rules assistant answers questions about Genius transcription conventions, proofreading,
	grammar, and wording. It is optional, and it is the one part of LyricLint that uses AI. The checks
	themselves are reviewed rules that run in your browser.
</p>
<ul>
	<li>
		In the workbench, open the <strong>Assistant</strong> tab beside Review and Linking. On a phone, it
		is under <strong>Tools</strong>.
	</li>
	<li>
		On the <a href={resolve('/guidelines/')}>guidelines</a> pages, press
		<strong>Ask a question</strong> to open <strong>Ask LyricLint</strong>.
	</li>
</ul>
<ol>
	<li>
		Type into <strong>Ask about the guidelines or proofreading…</strong>, or press one of the suggested
		questions.
	</li>
	<li>
		Press <Keys combo="Enter" /> or <strong>Ask</strong>. <Keys combo="Shift-Enter" /> starts a new line.
	</li>
</ol>
<p>
	A question can be up to 2,000 characters. The first question of a session may ask you to complete
	a quick check before it is sent, and each browser has a daily number of questions. The assistant
	tells you when only a few are left.
</p>
<p>
	When a reviewed LyricLint rule applies, the answer cites it, and you can open that check's page
	from the answer. If a question does not get an answer, it stays in the conversation with a
	<strong>Retry</strong> button.
</p>
<DocsFigure
	name="docs-assistant"
	alt="The Assistant tab with one question about headers after a blank line. The answer cites the check for a section with no header, with its severity and its two Genius sources."
/>

<h2 id="what-it-sees">What it can see</h2>
<p>
	The assistant receives what you type into it, with the recent turns of the same conversation. When
	older messages were left out of that context, a line in the conversation says so.
</p>
<p>
	It cannot see your 'scribe unless you allow it. When a question needs the lyrics, the assistant
	asks first: <em>The assistant would like to read this 'scribe to answer your question.</em>
</p>
<ul>
	<li><strong>Allow</strong> shares this 'scribe with it when it asks to read it.</li>
	<li><strong>Deny</strong> keeps this 'scribe private.</li>
</ul>
<p>
	Your answer is remembered for that 'scribe alone, so another 'scribe is asked separately. To
	change it, press <strong>New chat</strong>. Under the suggested questions, <strong
		>Stop sharing this 'scribe</strong
	> takes back an Allow, and <strong>Ask again before sharing this 'scribe</strong> undoes a Deny.
</p>
<p>
	From the guidelines pages, the assistant has no 'scribe to read. Messages are processed by OpenAI
	through Cloudflare. The <a href={resolve('/privacy/')}>privacy page</a> says exactly what is sent
	and kept.
</p>

<h2 id="edits">Suggested edits</h2>
<p>
	With permission to read, the assistant can point at lines in your 'scribe and suggest changes.
	Nothing changes until you approve it.
</p>
<ul>
	<li>
		<strong>Quoted lines.</strong> Press a quote to show it in the editor.
	</li>
	<li>
		<strong>Proposed edits.</strong> Each shows the removed and added text and a note. Point at it, or focus
		it, to preview the change in the editor. <strong>Approve</strong> applies it as one edit, and
		<strong>Reject</strong> sets it aside.
	</li>
	<li>
		<strong>Section links.</strong> The assistant can also propose linking or unlinking
		<a href={resolve('/docs/section-links/')}>repeated sections</a>, with the same
		<strong>Approve</strong> and <strong>Reject</strong>.
	</li>
</ul>
<p>
	An approved edit is an ordinary edit, so <Keys combo="Mod-z" /> takes it back. If the lyrics changed
	since the suggestion, it may not apply, and the card says <strong>Failed.</strong> with the reason.
</p>

<h2 id="conversations">Conversations</h2>
<p>
	Conversations are saved in this browser, never on a server, and are not part of a workspace
	backup.
</p>
<ul>
	<li><strong>New chat</strong> (the plus) starts a blank conversation.</li>
	<li>
		<strong>Conversations</strong> (the clock) lists earlier ones. Press one to open it again.
	</li>
	<li>
		To delete one, press the trash button on its row, then <strong>Delete</strong>.
	</li>
</ul>
<p>
	Opening a different 'scribe starts a blank chat. Earlier conversations stay under
	<strong>Conversations</strong>, and you can open any of them with the current 'scribe.
</p>
