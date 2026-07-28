import { defineConfig } from '@playwright/test';

const skipPerformance = Boolean(process.env.ACL_BROWSER_COVERAGE_DIR) || process.env.ACL_SKIP_PERFORMANCE === '1';

// Run browser specifications in parallel across the supported engine matrix
export default defineConfig({
    testDir: './tests',
    testIgnore: [
        '**/unit/**',
        '**/types/**',
        // Performance budgets need an uninstrumented, uncontended browser process
        ...(skipPerformance ? ['**/performance.spec.js'] : []),
    ],
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
        // Split WebKit's long context sequence before its per-process navigation limit
        {
            name: 'webkit',
            workers: 2,
            use: { browserName: 'webkit' },
        },
    ],
});
