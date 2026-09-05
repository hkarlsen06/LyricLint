import { defineConfig, devices } from '@playwright/test';

const port = Number.parseInt(process.env.PORT ?? '4173', 10);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './e2e',
	testMatch: '**/*.spec.ts',
	fullyParallel: true,
	retries: process.env.CI ? 2 : 0,
	forbidOnly: !!process.env.CI,
	use: {
		baseURL,
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			testIgnore: '**/mobile-workbench.spec.ts',
			use: { browserName: 'chromium', permissions: ['clipboard-read', 'clipboard-write'] }
		},
		{
			name: 'mobile-webkit',
			testMatch: '**/mobile-workbench.spec.ts',
			use: { ...devices['iPhone 13'], browserName: 'webkit' }
		}
	],
	webServer: process.env.PORT
		? undefined
		: {
				command: `bun run build && bun run preview -- --host 127.0.0.1 --port ${port}`,
				url: baseURL,
				reuseExistingServer: !process.env.CI,
				timeout: 120_000
			}
});
