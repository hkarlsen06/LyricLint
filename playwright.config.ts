import { defineConfig } from '@playwright/test';

const port = Number.parseInt(process.env.PORT ?? '4173', 10);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './e2e',
	testMatch: '**/*.spec.ts',
	fullyParallel: true,
	use: {
		baseURL,
		permissions: ['clipboard-read', 'clipboard-write'],
		trace: 'retain-on-failure'
	},
	webServer: process.env.PORT
		? undefined
		: {
				command: `bun run build && bun run preview -- --host 127.0.0.1 --port ${port}`,
				url: baseURL,
				reuseExistingServer: true,
				timeout: 120_000
			}
});
