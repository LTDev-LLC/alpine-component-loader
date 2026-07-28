import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createACLPlaywrightTest, expect } from '../src/testing-playwright.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    test = createACLPlaywrightTest({
        server: {
            root: projectRoot,
            index: 'tests/fixtures/testing-integration.html',
        },
        route: '/tests/fixtures/testing-integration.html',
        moduleUrl: '/src/testing.js',
    });

test('Playwright fixture provides isolated state with automatic reset and cleanup', async ({ acl, page }) => {
    // Exercise the ready-made fixture through its public browser surface
    const initial = await acl.metrics();
    expect(initial.totals).toEqual({});
    await page.evaluate(() => {
        // Capture one ACL event inside the isolated browser harness
        const recorder = globalThis.__aclTestHarness.record(document, ['acl:loadstart']);
        document.dispatchEvent(new CustomEvent('acl:loadstart'));
        globalThis.__aclFixtureRecords = recorder.records.length;
    });
    await acl.reset();
    const result = await page.evaluate(
        // Read fixture state after automatic resource reset
        () => ({
            records: globalThis.__aclFixtureRecords,
            active: Boolean(globalThis.__aclTestHarness.loader),
        }),
    );
    expect(result).toEqual({
        records: 1,
        active: true,
    });
});
