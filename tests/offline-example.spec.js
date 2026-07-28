import { expect, test } from './fixtures/test.js';
import AxeBuilder from '@axe-core/playwright';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startACLDevServer } from '../server/dev-server.mjs';
import { getSeriousAccessibilityViolations } from './fixtures/accessibility.js';

// Serve the checked-in example exactly as users run it from the repository
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let application;

test.beforeAll(async () => {
    // Prepare the test group
    application = await startACLDevServer({
        root: repositoryRoot,
        index: 'examples/offline/serve.html',
        port: 0,
        watchFiles: false,
    });
});

test.afterAll(async () => {
    // Clean up the completed test group
    await application?.close();
});

test('checked-in offline command example survives a complete offline reload', async ({
    page,
    context,
    browserName,
}) => {
    // Exercise the test scenario
    test.skip(browserName !== 'chromium', 'Detailed service-worker offline behavior is budgeted in Chromium.');
    const failures = [],
        packageRequests = [];
    page.on(
        'pageerror',
        // Handle the pageerror event
        (error) => failures.push(`pageerror: ${error.message}`),
    );
    page.on('requestfailed', (request) => {
        // Handle the requestfailed event
        return failures.push(`requestfailed: ${request.url()} (${request.failure()?.errorText})`);
    });
    page.on('request', (request) => {
        // Record the package family used before and after service-worker control
        const pathname = new URL(request.url()).pathname;
        if (pathname.startsWith('/dist/') || pathname.startsWith('/__acl_hmr/modules/')) packageRequests.push(pathname);
    });
    page.on('console', (message) => {
        // Handle the console event
        if (message.type() === 'error') failures.push(`console: ${message.text()}`);
    });
    await page.goto(`${application.origin}/examples/offline/index.html`);
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.__aclOfflineExample?.ready === true,
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => navigator.serviceWorker.controller,
    );
    expect(packageRequests.length).toBeGreaterThan(10);
    expect(
        packageRequests.every(
            // Match the exact minified URLs published by the generated precache
            (pathname) => pathname.endsWith('.min.js'),
        ),
    ).toBe(true);

    await expect(page.locator('offline-demo-shell h2')).toHaveText('The component tree is precached');
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(getSeriousAccessibilityViolations(accessibility)).toEqual([]);
    await page.getByRole('button', { name: 'Run a local check' }).click();
    await expect(page.locator('offline-demo-status strong')).toHaveText('1');

    // Cut the browser network before reload to prove the worker owns every request
    await context.setOffline(true);
    await page.waitForFunction(
        // Wait for the current document to observe the emulated network transition
        () => navigator.onLine === false,
    );
    await page.reload();
    await page
        .waitForFunction(
            // Check whether the expected browser state is ready
            () => window.__aclOfflineExample?.ready === true,
            null,
            { timeout: 10_000 },
        )
        .catch((error) => {
            // Handle the rejected operation
            throw new Error(`${error.message}\n${failures.join('\n')}`);
        });
    await expect(page.locator('#service-worker-status')).toHaveText('Ready for offline reload');
    await expect(page.locator('offline-demo-shell h2')).toHaveText('The component tree is precached');
    await page.getByRole('button', { name: 'Run a local check' }).click();
    await expect(page.locator('offline-demo-status strong')).toHaveText('1');
    expect(failures).toEqual([]);
    expect(
        packageRequests.every(
            // Keep service-worker-backed reload requests on the same minified identity
            (pathname) => pathname.endsWith('.min.js'),
        ),
    ).toBe(true);
    await context.setOffline(false);
});
