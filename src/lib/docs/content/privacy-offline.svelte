<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Alert from '$lib/ui/primitives/alert/index.js';
</script>

<h2 id="local">What stays on your device</h2>
<p>LyricLint has no account and no server copy of your work. These stay in your browser:</p>
<ul>
	<li>Every 'scribe, with its performers, line timings, and section links.</li>
	<li>Your preferences and your rules assistant conversations.</li>
	<li>
		Audio files. LyricLint keeps a handle to the file on your disk, never its contents, and never
		uploads it.
	</li>
	<li>
		Checking. The rules and the grammar checker both run inside your browser, so the lyrics are
		never sent anywhere to be checked.
	</li>
</ul>
<p>
	Because nothing is stored elsewhere, clearing this site's data in your browser deletes your
	'scribes. <a href="{resolve('/docs/scribes/')}#backup">Keep a backup</a> if they matter to you.
</p>

<h2 id="network">What reaches the network</h2>
<p>Only what you ask for:</p>
<ul>
	<li>
		<strong>Streaming audio.</strong> Choosing a streaming service such as YouTube or Apple Music as
		a 'scribe's audio contacts that service for its player and the song's details. A search in the
		audio picker sends your search words to the service you search. Where Apple Music is offered, opening
		<strong>Add audio source</strong> loads Apple's music script, so it is ready if you pick it.
	</li>
	<li>
		<strong>The rules assistant.</strong> Asking a question sends it, with the recent turns of that
		conversation, to LyricLint's answering service. Your 'scribe is sent only if the assistant asks
		to read it and you press <strong>Allow</strong>.
	</li>
</ul>
<Alert.Root>
	<Alert.Title>Your lyrics are never sent on their own</Alert.Title>
	<Alert.Description>
		Writing, checking, fixing, and copying all happen in your browser. The one way a 'scribe leaves
		it is your <strong>Allow</strong> in the rules assistant, which you can take back at any time.
	</Alert.Description>
</Alert.Root>
<p>
	The <a href={resolve('/privacy/')}>privacy page</a> lists exactly what the assistant's service
	receives and keeps, and who processes it. <a href={resolve('/docs/assistant/')}
		>The rules assistant</a
	> explains the permission.
</p>

<h2 id="offline">Working offline</h2>
<p>
	After your first visit, the workbench opens and works without a connection. You can write, check,
	fix, copy, and switch between 'scribes offline, and everything still saves.
</p>
<p>
	If your browser offers to install LyricLint as an app, the installed app works offline the same
	way.
</p>
<p>A few things need the network:</p>
<ul>
	<li>Playback from a streaming service. Audio from a local file plays offline.</li>
	<li>The rules assistant.</li>
	<li>
		Grammar checking, the first time only. Its checker downloads when the workbench first uses it,
		then stays available offline.
	</li>
	<li>
		Reference pages you have not opened yet. Rule and guideline pages you have read stay readable
		offline.
	</li>
</ul>
<p>
	When a new version of LyricLint is published, it arrives the next time you load a page. It never
	reloads the workbench while you are working.
</p>

<h2 id="reset">Deleting everything</h2>
<ol>
	<li>In the workbench, open <strong>Preferences</strong> and expand <strong>Local data</strong>.</li>
	<li>Press <strong>Reset LyricLint…</strong>.</li>
	<li>Read the warning, then press <strong>Reset LyricLint</strong> to confirm.</li>
</ol>
<p>
	This deletes every 'scribe and every assistant conversation in this browser and resets all
	settings. It cannot be undone. Backup files you saved stay on your disk.
</p>
<p>
	To delete a single conversation, use its delete button under <strong>Conversations</strong> in the
	assistant.
</p>
