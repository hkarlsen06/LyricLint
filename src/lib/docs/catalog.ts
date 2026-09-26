/** Decision record: docs/subsystems/docs.md
 * The product documentation's table of contents. The sidebar, the index, the
 * search dialog, the pager, the sitemap and the prerendered routes all read
 * this list, so its order is the reading order everywhere.
 */

export type DocsGroup = 'Get started' | 'Editor' | 'Audio' | 'Reference';

export interface DocsSection {
	/** The `id` of the `<h2>` the page's content draws for this section. */
	id: string;
	title: string;
}

export interface DocsPage {
	slug: string;
	group: DocsGroup;
	title: string;
	/** One sentence: the index row, the lede under the title, and the meta description. */
	summary: string;
	sections: readonly DocsSection[];
	/** Extra words a reader might search for that the title and sections do not say. */
	keywords?: readonly string[];
}

export const docsGroups: readonly DocsGroup[] = ['Get started', 'Editor', 'Audio', 'Reference'];

export const docsPages: readonly DocsPage[] = [
	{
		slug: 'first-scribe',
		group: 'Get started',
		title: "Your first 'scribe",
		summary: 'Paste a transcription, read what LyricLint finds, fix it, and copy it back to Genius.',
		sections: [
			{ id: 'paste', title: 'Paste or type the lyrics' },
			{ id: 'findings', title: 'Read the findings' },
			{ id: 'fix', title: 'Fix what is wrong' },
			{ id: 'copy', title: 'Copy it back to Genius' }
		],
		keywords: ['start', 'begin', 'tutorial', 'workbench', 'quick start']
	},
	{
		slug: 'scribes',
		group: 'Get started',
		title: "'Scribes and recovery",
		summary: "Every 'scribe saves itself as you type and comes back after a closed tab or a crash.",
		sections: [
			{ id: 'autosave', title: 'Saving happens on its own' },
			{ id: 'switching', title: "Switching between 'scribes" },
			{ id: 'recovery', title: 'Getting work back' },
			{ id: 'backup', title: 'Keep a backup' },
			{ id: 'deleting', title: "Deleting a 'scribe" }
		],
		keywords: [
			'draft',
			'save',
			'autosave',
			'restore',
			'crash',
			'lost work',
			'another tab',
			'rename',
			'duplicate',
			'export',
			'import',
			'lls'
		]
	},
	{
		slug: 'privacy-offline',
		group: 'Get started',
		title: 'Offline and privacy',
		summary:
			'Your lyrics stay in your browser unless you choose to share them, and the editor keeps working without a connection.',
		sections: [
			{ id: 'local', title: 'What stays on your device' },
			{ id: 'network', title: 'What reaches the network' },
			{ id: 'offline', title: 'Working offline' },
			{ id: 'reset', title: 'Deleting everything' }
		],
		keywords: [
			'privacy',
			'network',
			'local',
			'install',
			'data',
			'service worker',
			'storage',
			'reset'
		]
	},
	{
		slug: 'sections',
		group: 'Editor',
		title: 'Section headers',
		summary: 'Insert the song part headers Genius expects, for the language the lyrics are written in.',
		sections: [
			{ id: 'insert', title: 'Insert a header' },
			{ id: 'numbering', title: 'Numbering and repeats' },
			{ id: 'languages', title: 'Headers in other languages' }
		],
		keywords: ['verse', 'chorus', 'bridge', 'header', 'song part', 'intro', 'outro', 'language']
	},
	{
		slug: 'section-links',
		group: 'Editor',
		title: 'Linked sections',
		summary: 'Link repeated choruses so a correction in one reaches every copy.',
		sections: [
			{ id: 'link', title: 'Link repeated sections' },
			{ id: 'mirror', title: 'Edits reach every copy' },
			{ id: 'one-copy', title: 'Change one copy only' },
			{ id: 'linking-panel', title: 'The Linking panel' }
		],
		keywords: ['chorus', 'repeat', 'mirror', 'sync', 'edit this section only', 'unlink', 'ad-lib']
	},
	{
		slug: 'performers',
		group: 'Editor',
		title: 'Performers',
		summary: 'Tag who sings each passage without hand-writing the formatting Genius uses.',
		sections: [
			{ id: 'roster', title: 'Build the roster' },
			{ id: 'assign', title: 'Assign a passage' },
			{ id: 'rename', title: 'Rename a performer' },
			{ id: 'gutter', title: 'See who sings each line' }
		],
		keywords: ['artist', 'feature', 'vocalist', 'italic', 'bold', 'credits', 'voice', 'unknown voice', 'merge']
	},
	{
		slug: 'findings',
		group: 'Editor',
		title: 'Findings and fixes',
		summary: 'Every finding names the source behind it, and most carry a fix you can preview.',
		sections: [
			{ id: 'read', title: 'Read a finding' },
			{ id: 'apply', title: 'Apply a fix' },
			{ id: 'batch', title: 'Fix every occurrence' },
			{ id: 'ignore', title: 'Ignore a finding' },
			{ id: 'grammar', title: 'Grammar and spelling' }
		],
		keywords: ['diagnostic', 'warning', 'error', 'lint', 'harper', 'severity', 'suggestion', 'review', 'restore']
	},
	{
		slug: 'copy-paste',
		group: 'Editor',
		title: 'Copy and paste',
		summary: 'What you copy is exactly the lyrics, ready to paste into the Genius editor.',
		sections: [
			{ id: 'copy', title: 'Copy the lyrics' },
			{ id: 'paste', title: 'Paste from Genius' },
			{ id: 'between', title: "Between 'scribes" }
		],
		keywords: ['clipboard', 'export', 'import', 'markup', 'html']
	},
	{
		slug: 'audio',
		group: 'Audio',
		title: 'Playing the song',
		summary: 'Attach the track you are transcribing and control it without leaving the lyrics.',
		sections: [
			{ id: 'attach', title: 'Attach audio' },
			{ id: 'transport', title: 'Pause, replay, and step' },
			{ id: 'loop', title: 'Repeat a passage' },
			{ id: 'local-files', title: 'Local files' }
		],
		keywords: ['player', 'transport', 'escape', 'replay', 'mp3', 'media', 'loop', 'speed', 'slow']
	},
	{
		slug: 'audio-sources',
		group: 'Audio',
		title: 'YouTube, Apple Music, and Spotify',
		summary: 'Play the song from a streaming service instead of a file, and copy its details.',
		sections: [
			{ id: 'sources', title: 'Choose a source' },
			{ id: 'song-details', title: 'Song details and artwork' },
			{ id: 'loading', title: 'Loading a remembered song' }
		],
		keywords: ['youtube', 'spotify', 'apple music', 'streaming', 'cover art', 'metadata']
	},
	{
		slug: 'sync',
		group: 'Audio',
		title: 'Synced lyrics',
		summary: 'Tap along with the song to time each line, then jump to any line to hear it.',
		sections: [
			{ id: 'sync-mode', title: 'Sync the lyrics' },
			{ id: 'anchors', title: 'Line times' },
			{ id: 'jump', title: 'Jump to a line' },
			{ id: 'export', title: 'Export the timings' }
		],
		keywords: ['timestamp', 'anchor', 'timing', 'gutter', 'lrc', 'srt', 'vtt', 'tap']
	},
	{
		slug: 'shortcuts',
		group: 'Reference',
		title: 'Keyboard shortcuts',
		summary: 'Every key LyricLint answers to, on a Mac and everywhere else.',
		sections: [
			{ id: 'editing', title: 'Editing' },
			{ id: 'findings', title: 'Findings' },
			{ id: 'playback', title: 'Playback' },
			{ id: 'sync', title: 'Timing and sync' }
		],
		keywords: ['keys', 'hotkeys', 'keybindings', 'mac', 'windows', 'linux']
	},
	{
		slug: 'preferences',
		group: 'Reference',
		title: 'Preferences',
		summary: 'Turn grammar checking on or off, back up your workspace, and manage what this browser stores.',
		sections: [
			{ id: 'grammar', title: 'Grammar checking' },
			{ id: 'backup', title: 'Workspace backup' },
			{ id: 'local-data', title: 'Local data' },
			{ id: 'rules', title: 'Reviewed rules' }
		],
		keywords: ['settings', 'options', 'harper', 'spelling', 'backup', 'import', 'reset', 'storage']
	},
	{
		slug: 'assistant',
		group: 'Reference',
		title: 'The rules assistant',
		summary:
			"Ask about Genius conventions or proofreading. It reads your 'scribe only after you allow it.",
		sections: [
			{ id: 'ask', title: 'Ask a question' },
			{ id: 'what-it-sees', title: 'What it can see' },
			{ id: 'edits', title: 'Suggested edits' },
			{ id: 'conversations', title: 'Conversations' }
		],
		keywords: ['ai', 'chat', 'question', 'help', 'ask', 'permission', 'proofread', 'openai']
	},
	{
		slug: 'phone',
		group: 'Reference',
		title: 'On a phone',
		summary: 'Write, review, and play the song on a phone, one task at a time.',
		sections: [
			{ id: 'views', title: 'One task at a time' },
			{ id: 'touch', title: 'Selecting and assigning by touch' },
			{ id: 'audio', title: 'Audio on a phone' }
		],
		keywords: ['mobile', 'iphone', 'android', 'touch', 'tablet']
	}
];

export function docsPage(slug: string): DocsPage | undefined {
	return docsPages.find((page) => page.slug === slug);
}

export function docsPagesIn(group: DocsGroup): DocsPage[] {
	return docsPages.filter((page) => page.group === group);
}

/** The neighbors in reading order, for the pager at the foot of each page. */
export interface DocsNeighbors {
	previous?: DocsPage;
	next?: DocsPage;
}

export function docsNeighbors(slug: string): DocsNeighbors {
	const index = docsPages.findIndex((page) => page.slug === slug);
	return { previous: docsPages[index - 1], next: docsPages[index + 1] };
}
