import { expect, test } from './fixtures/test.js';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';
import { startACLDevServer } from '../server/dev-server.mjs';

// Exercise the example through its public controls and diagnostic globals
let application;

test.beforeAll(async () => {
    // Prepare the test group
    application = await startACLDevServer({
        root: resolve('examples/a11y'),
        port: 0,
        watchFiles: false,
    });
});

test.afterAll(async () => {
    // Clean up the completed test group
    await application?.close();
});

test('accessibility example introduces, reports, debugs, and fixes component violations', async ({ page }) => {
    // Exercise the test scenario
    const errors = [],
        packageRequests = [];
    page.on(
        'pageerror',
        // Handle the pageerror event
        (error) => errors.push(error.message),
    );
    page.on('console', (message) => {
        // Handle the console event
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('request', (request) => {
        // Record the package family selected by the checked-in import map
        const pathname = new URL(request.url()).pathname;
        if (pathname.startsWith('/__acl_hmr/modules/')) packageRequests.push(pathname);
    });

    await page.goto(application.url);
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.__aclA11yExample?.ready === true,
    );
    expect(packageRequests.length).toBeGreaterThan(8);
    expect(
        packageRequests.every(
            // Keep optional accessibility modules and their deferred descendants minified
            (pathname) => pathname.endsWith('.min.js'),
        ),
    ).toBe(true);
    await expect(page.locator('#audit-status')).toHaveText('0 violations');
    // Use Axe as an independent baseline around the demonstration workflow
    const initialAccessibility = await new AxeBuilder({ page }).analyze();
    expect(
        initialAccessibility.violations.filter(
            // Select matching items
            (item) => ['serious', 'critical'].includes(item.impact),
        ),
    ).toEqual([]);
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.__aclA11yExample.audits.getResults(window.__aclA11yExample.component)?.violations,
        ),
    ).toEqual([]);

    await page.getByRole('button', { name: 'Introduce issues' }).click();
    await expect(page.locator('#audit-status')).toHaveText('19 violations');
    expect(
        await page.evaluate(
            // Read the browser state
            () =>
                window.__aclA11yExample.latest.violations.map(
                    // Transform the current item
                    (item) => item.rule,
                ),
        ),
    ).toEqual([
        'image-alt',
        'control-name',
        'form-label',
        'duplicate-id',
        'aria-reference',
        'heading-order',
        'link-name',
        'positive-tabindex',
        'aria-hidden-focus',
        'interactive-nesting',
        'dialog-name',
        'fieldset-legend',
        'details-summary',
        'table-name',
        'table-headers',
        'graphic-name',
        'aria-value',
        'language-tag',
        'review-owner',
    ]);
    await expect(page.locator('#event-output')).toContainText('review-owner');

    await page.getByRole('button', { name: 'A11y Audit' }).click();
    await expect(page.locator('#acl-a11y-scanner-modal')).toBeVisible();
    await expect(page.locator('#acl-a11y-scanner-modal')).toContainText('review-owner');
    const scannerAccessibility = await new AxeBuilder({ page }).include('#acl-a11y-scanner-modal').analyze();
    expect(
        scannerAccessibility.violations.filter(
            // Select matching items
            (item) => ['serious', 'critical'].includes(item.impact),
        ),
    ).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.locator('#acl-a11y-scanner-modal')).toBeHidden();

    await page.getByRole('button', { name: 'Open debugger' }).click();
    await page.locator('#acl-debug-panel button[data-acl-debug-id]', { hasText: '<a11y-demo-card>' }).click();
    await expect(page.locator('#acl-debug-panel')).toContainText('review-owner');
    await page.evaluate(
        // Read the browser state
        () => window.AlpineComponentLoader.toggleDebug(),
    );

    await page.getByRole('button', { name: 'Fix issues' }).click();
    await expect(page.locator('#audit-status')).toHaveText('0 violations');
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                violations: window.__aclA11yExample.latest.violations,
                eventCount: window.__aclA11yExample.eventCount,
            }),
        ),
    ).toEqual({
        violations: [],
        eventCount: expect.any(Number),
    });
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.__aclA11yExample.eventCount,
        ),
    ).toBeGreaterThanOrEqual(3);
    const repairedAccessibility = await new AxeBuilder({ page }).exclude('#acl-debug-panel').analyze();
    expect(
        repairedAccessibility.violations.filter(
            // Select matching items
            (item) => ['serious', 'critical'].includes(item.impact),
        ),
    ).toEqual([]);
    expect(errors).toEqual([]);
});
