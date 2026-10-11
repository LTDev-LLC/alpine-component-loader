import { expect, test } from './fixtures/test.js';
import { startACLDevServer } from '../server/dev-server.mjs';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

let application;
test.beforeAll(async () => {
    // Exercise the same shared-asset route used by every maintained example
    application = await startACLDevServer({
        root: resolve('examples/feature-lab'),
        port: 0,
        watchFiles: false,
    });
});
// Verify the browser behavior at this boundary
test.afterAll(async () => {
    await application?.close();
});
// Open a fresh browser document for each capability so activation results are not contaminated
const openDemo = async (page, name, extra = '') => {
    await page.goto(
        application.origin +
            '/__acl_hmr/examples/frame.html?runtime=' +
            encodeURIComponent(application.origin + '/__acl_hmr/modules/index.min.js') +
            '&demo=' +
            name +
            extra,
    );
    await expect(page.locator('#controls button').first()).toBeVisible();
};

// Verify the browser behavior at this boundary
test('core demo requires explicit discovery and excludes optional implementations', async ({ page }) => {
    await openDemo(page, 'core');
    await expect(page.locator('#report')).toContainText('"discovered": false');
    await page.getByRole('button', { name: 'Register queued component' }).click();
    await expect(page.locator('#report')).toContainText('"discovered": false');
    await page.getByRole('button', { name: 'Discover templates explicitly' }).click();
    await expect(page.locator('#report')).toContainText('"discovered": true');
});
// Verify the browser behavior at this boundary
test('limits demo reports streamed oversize, timeout, opt-outs, and retry', async ({ page }) => {
    await openDemo(page, 'limits');
    await page
        .getByRole('button', {
            name: 'streamed',
            exact: true,
        })
        .click();
    await expect(page.locator('#report')).toContainText('ACL_TEMPLATE_TOO_LARGE');
    await page.getByRole('button', { name: 'misleading-header' }).click();
    await expect(page.locator('#report')).toContainText('ACL_TEMPLATE_TOO_LARGE');
    await page.getByRole('button', { name: 'delayed' }).click();
    await expect(page.locator('#report')).toContainText('ACL_TEMPLATE_TIMEOUT');
    await page
        .getByRole('button', {
            name: 'retry',
            exact: true,
        })
        .click();
    await expect(page.locator('#report')).toContainText('"retrySucceeded": true');
    await page.getByRole('button', { name: 'Explicit opt-outs' }).click();
    await expect(page.locator('#report')).toContainText('"byteLimitDisabled": true');
});
// Verify the browser behavior at this boundary
test('shared cancellation demo keeps the transport until its final owner leaves', async ({ page }) => {
    await openDemo(page, 'requests');
    await page.getByRole('button', { name: 'Start two consumers' }).click();
    await expect(page.locator('#report')).toContainText('"starts": 1');
    await page
        .getByRole('button', {
            name: 'Cancel first',
            exact: true,
        })
        .click();
    await expect(page.locator('#report')).toContainText('"aborts": 0');
    await page.getByRole('button', { name: 'Cancel final owner' }).click();
    await expect(page.locator('#report')).toContainText('"aborts": 1');
    await expect(page.locator('#report')).toContainText('ACL_LOAD_CANCELED');
});
// Verify the browser behavior at this boundary
test('optional transformations and isolated loaders activate through real component readiness', async ({ page }) => {
    await openDemo(page, 'transformations');
    await expect(page.locator('#report')).toContainText('"activated": "plain"');
    await page.getByRole('button', { name: 'Activate slots' }).click();
    await expect(page.locator('#fixture')).toContainText('Projected consumer content');
    await page.getByRole('button', { name: 'Activate scripts' }).click();
    // Verify the browser behavior at this boundary
    await expect.poll(() => page.evaluate(() => window.demoScriptOrder)).toEqual([1, 2]);
    await openDemo(page, 'loaders');
    await page.getByRole('button', { name: 'Dispose first and reload second' }).click();
    await expect(page.locator('#report')).toContainText('"secondReady": true');
});
// Verify the browser behavior at this boundary
test('pooling and scheduling demos release ownership after actual completion', async ({ page }) => {
    await openDemo(page, 'resources');
    await page.getByRole('button', { name: 'Mount 100 deferred targets' }).click();
    await expect(page.locator('#report')).toContainText('"observers": 1');
    await page.getByRole('button', { name: 'Remove one target' }).click();
    await expect(page.locator('#report')).toContainText('"targets": 99');
    await page.getByRole('button', { name: 'Activate two polling subscribers' }).click();
    await expect(page.locator('#report')).toContainText('"listeners": 2');
    await page.getByRole('button', { name: 'Dispose all' }).click();
    await expect(page.locator('#report')).toContainText('"observers": 0');
    await expect(page.locator('#report')).toContainText('"listeners": 0');
    await openDemo(page, 'scheduler');
    await page.getByRole('button', { name: 'Mount 200 with scheduling' }).click();
    await expect(page.locator('#report')).toContainText('"readyComponents": 200');
});
// Verify the browser behavior at this boundary
test('prefetch and preload inspectors demonstrate bounded ownership and explicit selection', async ({ page }) => {
    await openDemo(page, 'prefetch');
    await page.getByRole('button', { name: 'Start overlapping batches' }).click();
    await expect(page.locator('#report')).toContainText('"peak": 4');
    await page.getByRole('button', { name: 'Request queued template now' }).click();
    await expect(page.locator('#report')).toContainText('"foregroundCompleted": true');
    await page.getByRole('button', { name: 'Cancel speculative work' }).click();
    await expect(page.locator('#report')).toContainText('"active": 0');
    await openDemo(page, 'preloads');
    await page.getByRole('button', { name: 'Inspect visible' }).click();
    await expect(page.locator('#report')).toContainText('environment.min.js');
});
// Verify the browser behavior at this boundary
test('polyfill fixture uses self-hosted bundles and can recover from a failed bootstrap', async ({ page }) => {
    await openDemo(page, 'polyfills', '&fallback=1&failure=1');
    await expect(page.locator('#report')).toContainText('"retried": true');
    await expect(page.locator('#report')).toContainText('"fallback": true');
});
