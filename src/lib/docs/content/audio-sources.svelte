<script lang="ts">
	import { resolve } from '$app/paths';
	import DocsFigure from '$lib/ui/docs/DocsFigure.svelte';
	import Keys from '$lib/ui/docs/Keys.svelte';
	import * as Tabs from '$lib/ui/primitives/tabs/index.js';
</script>

<h2 id="sources">Choose a source</h2>
<p>
	Open the audio dialog with the music note at the top right of the editor (<strong
		>Add audio source</strong
	>). Each streaming source has its own field, and under each field a line of facts says what using
	it involves. Nothing contacts a streaming service until you press a button in its row, with one
	exception, noted under Apple Music.
</p>
<Tabs.Root value="youtube">
	<Tabs.List>
		<Tabs.Trigger value="youtube">YouTube</Tabs.Trigger>
		<Tabs.Trigger value="apple">Apple Music</Tabs.Trigger>
		<Tabs.Trigger value="spotify">Spotify</Tabs.Trigger>
	</Tabs.List>
	<Tabs.Content value="youtube">
		<p>YouTube needs no account.</p>
		<ol>
			<li>
				In <strong>Search YouTube, or paste a link</strong>, type the song's name and press
				<strong>Search</strong>, then pick a result. A pasted video link attaches straight away. (A
				copy of LyricLint built without YouTube search shows a link field and a
				<strong>Use video</strong> button instead.)
			</li>
			<li>
				The video plays in a small frame at the bottom right of the editor. YouTube's terms require
				the player to stay visible, so it cannot be hidden.
			</li>
		</ol>
		<p>
			A search sends your words to Google. Playback loads YouTube's player from
			youtube-nocookie.com and needs a connection. Your press on a video is your permission for
			YouTube to load, and it lasts until you close the tab.
		</p>
		<p>
			When there is no search, or it finds nothing, a <strong>Search YouTube</strong> link under the
			field looks the song up on youtube.com in a new tab, so you can copy a link from there.
		</p>
	</Tabs.Content>
	<Tabs.Content value="apple">
		<p>Apple Music plays full songs for Apple Music subscribers.</p>
		<ol>
			<li>
				Type the song's name, or paste an Apple Music link, into the Apple Music field and press
				<strong>Search</strong>. Searching needs no account.
			</li>
			<li>
				Pick a result. The first time, Apple asks you to sign in with your Apple Account in a pop-up
				window. If your browser blocks it, allow pop-ups for LyricLint and press the result again.
			</li>
		</ol>
		<p>
			So that the sign-in window can open on your press, opening the audio dialog loads Apple's
			MusicKit script. A search sends your words to Apple's catalogue.
		</p>
		<p>
			Apple Music appears only while this copy of LyricLint holds a valid Apple Music key. The
			public site does.
		</p>
	</Tabs.Content>
	<Tabs.Content value="spotify">
		<p>
			The public LyricLint site does not offer Spotify. It appears only in copies of LyricLint set up
			with their own Spotify app, and even there only accounts that app allows can sign in.
		</p>
		<ol>
			<li>
				Type the song's name, or paste a Spotify link, into the Spotify field and press
				<strong>Search</strong>.
			</li>
			<li>
				The first time, LyricLint takes you to Spotify to sign in, then brings you back to your
				search, or attaches the song if you pasted a link.
			</li>
		</ol>
		<p>
			Spotify needs a Premium account. It has no speed control, so the speed menu offers only 1×
			while a Spotify song is attached. The sign-in lasts until you close the tab.
		</p>
	</Tabs.Content>
</Tabs.Root>
<p>
	Whichever source you choose, the player and its keys work the same way. See <a
		href={resolve('/docs/audio/')}>Playing the song</a
	>.
</p>

<h2 id="song-details">Song details and artwork</h2>
<p>
	A song from Apple Music or Spotify brings its cover art and name, shown above the player. Press
	the cover to see it larger.
</p>
<p>
	The <strong>Song</strong> tab lists what the catalogue knows about the song under
	<strong>Song metadata</strong>. From Apple Music that can be the release date, writers, album,
	label, and ISRC. Press any value to copy it; each writer's name copies on its own. These are the
	facts you fill in on a Genius song page.
</p>
<DocsFigure
	name="workbench-song"
	alt="The Song panel shows release date, writers, album, and label. Clicking Avery Lane copies that writer's name. Copy image URL confirms the artwork link was copied, then Download album art saves the cover."
/>
<p>
	For the cover, <strong>Copy image URL</strong> copies its address and
	<strong>Download album art</strong> saves the image. With a YouTube video, the Song tab offers
	<strong>Copy YouTube link</strong> instead.
</p>

<h2 id="loading">Loading a remembered song</h2>
<p>
	A 'scribe remembers its streaming song, but LyricLint does not contact the service again until
	you ask. When you reopen the 'scribe, the player shows <strong>Load audio</strong> with the song's
	name. Press it, or <Keys combo="Escape" />, to load the song where you left it.
</p>
<p>
	Within one visit, a YouTube video you already allowed, or a Spotify song while you are still signed
	in, loads without asking. Apple Music always waits for your press.
</p>
