import { defineConfig, devices } from '@playwright/test';

const port = Number.parseInt(process.env.PORT ?? '4173', 10);
const baseURL = `http://127.0.0.1:${port}`;
const prebuilt = process.env.PLAYWRIGHT_PREBUILT === '1';

export default defineConfig({
	testDir: './e2e',
	testMatch: '**/*.spec.ts',
	fullyParallel: true,
	workers: process.env.CI ? '100%' : undefined,
	retries: process.env.CI ? 2 : 0,
	forbidOnly: !!process.env.CI,
	use: {
		baseURL,
		trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure'
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
				command: `${prebuilt ? '' : 'bun run build && '}bun run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
				url: baseURL,
				// A prebuilt artifact must be served by this run, including outside CI.
				reuseExistingServer: !process.env.CI && !prebuilt,
				timeout: 120_000
			}
});
