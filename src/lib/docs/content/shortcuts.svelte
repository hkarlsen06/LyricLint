<script lang="ts">
	import { resolve } from '$app/paths';
	import { shortcuts, type ShortcutSection } from '$lib/docs/shortcuts.js';
	import Keys from '$lib/ui/docs/Keys.svelte';
	import * as Table from '$lib/ui/primitives/table/index.js';
</script>

{#snippet table(section: ShortcutSection, caption: string)}
	<Table.Root>
		<Table.Caption>{caption}</Table.Caption>
		<Table.Header>
			<Table.Row>
				<Table.Head>Keys</Table.Head>
				<Table.Head>Action</Table.Head>
				<Table.Head>When</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each shortcuts[section] as shortcut (shortcut.action + shortcut.combos.join())}
				<Table.Row>
					<Table.Cell>
						{#each shortcut.combos as combo, index (combo)}{#if index > 0},&#32;{/if}<Keys
								{combo}
							/>{/each}
					</Table.Cell>
					<Table.Cell>{shortcut.action}</Table.Cell>
					<Table.Cell>{shortcut.context ?? ''}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{/snippet}

<p>
	Where a Mac uses different keys, both are shown: the Windows and Linux keys first, then the Mac
	keys. Hover a control in the workbench to see its shortcut in its tooltip.
</p>

<h2 id="editing">Editing</h2>
<p>
	These work with the caret in the lyrics, except find, which opens from anywhere. Standard text
	editing keys, such as selecting and moving by word, work as in any editor.
</p>
{@render table('editing', 'Editing shortcuts')}

<h2 id="findings">Findings</h2>
<p>
	Next and previous wrap around the ends of the 'scribe. See <a href={resolve('/docs/findings/')}
		>Findings and fixes</a
	>.
</p>
{@render table('findings', 'Finding shortcuts')}

<h2 id="playback">Playback</h2>
<p>
	The playback keys work from anywhere in the workbench while audio is attached, including while you
	type in the lyrics. Escape plays and pauses only when nothing else is open to close: a popover or
	the find bar takes the first press. On a Mac, Alt is the Option key.
</p>
<p>
	On keyboard layouts where Ctrl and Alt together (AltGr) type characters, use the Escape or function
	keys instead of Ctrl+Alt with J, K, and L. See <a
		href={resolve('/docs/audio/')}>Playing the song</a
	>.
</p>
{@render table('playback', 'Playback shortcuts')}

<h2 id="sync">Timing and sync</h2>
<p>
	The sync keys answer only during a sync run. At any other time, Space, Enter, Backspace, and the
	arrow keys edit as usual. See <a href={resolve('/docs/sync/')}>Synced lyrics</a>.
</p>
{@render table('sync', 'Timing and sync shortcuts')}
