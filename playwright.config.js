import { defineConfig } from '@playwright/test';

// Run browser specifications in parallel across the supported engine matrix
export default defineConfig({
    testDir: './tests',
    testIgnore: ['**/unit/**', '**/types/**'],
    fullyParallel: true,
    preserveOutput: 'always',
    reporter: 'list',
    use: {
        headless: true,
    },
    projects: [
        {
            name: 'chromium',
            use: { browserName: 'chromium' },
        },
        {
            name: 'firefox',
            workers: 1,
            use: { browserName: 'firefox' },
        },
        // Keep the expanded WebKit suite below its per-process navigation limit
        {
            name: 'webkit',
            workers: 3,
            use: { browserName: 'webkit' },
        },
    ],
});
