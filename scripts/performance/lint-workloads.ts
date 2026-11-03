const lines = [
	'I walk through the city when the sun goes down',
	'And all of the people keep on moving around',
	'We find a little moment in the middle of the night',
	'You know I wanna stay until the morning light',
	'<i>Shawdy, take me home (yeah)</i>',
	'Idk if tommorrow will ever feel alright',
	'You bring the light, Yeah',
	"I keep runnin' until the stars fade out"
];
export const lintWorkloads = [3, 10, 100].map((sections) => ({
	name: `${sections * lines.length} lyric lines`,
	texts: Array.from({ length: 12 }, (_, revision) =>
		Array.from(
			{ length: sections },
			(_, section) =>
				`[Verse ${section + 1}]\n${lines.join('\n')}${section === 0 ? ' tonight'.slice(0, revision) : ''}`
		).join('\n\n')
	)
}));
// More distinct lines than the cache can hold: every pass must
// recompute the spelling lookup, exercising cold imports and cache eviction.
function uniqueWord(value: number): string {
	let word = 'zz';
	for (let digit = 0; digit < 5; digit += 1) {
		word += String.fromCharCode(97 + (value % 26));
		value = Math.floor(value / 26);
	}
	return word;
}
lintWorkloads.push({
	name: '240 unique-token lines (cache churn)',
	texts: Array.from(
		{ length: 12 },
		(_, revision) =>
			'[Verse]\n' +
			Array.from({ length: 240 }, (_, line) =>
				Array.from({ length: 6 }, (_, word) => uniqueWord(revision * 1440 + line * 6 + word)).join(
					' '
				)
			).join('\n')
	)
});
