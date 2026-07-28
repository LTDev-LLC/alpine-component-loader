// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

import { test as base, expect } from '@playwright/test';
// Execute browser-harness operations through one serializable Playwright callback
const runHarnessOperation = async ({ operation, url = null })=>{
    if (operation === 'install') {
        const { createACLTestHarness } = await import(/* @vite-ignore */ url);
        globalThis.__aclTestHarness = createACLTestHarness();
        return null;
    }
    if (operation === 'reset') return await globalThis.__aclTestHarness.reset();
    if (operation === 'metrics') return globalThis.__aclTestHarness.loader.getMetrics();
    if (operation === 'cleanup') return await globalThis.__aclTestHarness?.cleanup();
    throw new TypeError(`[ACL Testing] Unsupported harness operation "${operation}".`);
};
// Create a Playwright test with an optional local ACL server and automatic browser cleanup
export const createACLPlaywrightTest = ({ server = false, route = '/', moduleUrl = null } = {})=>base.extend({
        aclServer: [
            async ({}, use)=>{
                if (!server) {
                    await use(null);
                    return;
                }
                const { startACLTestServer } = await import('../server/testing-server.mjs'), app = await startACLTestServer(typeof server === 'object' ? server : {});
                // Run this operation
                try {
                    await use(app);
                } finally{
                    await app.close();
                }
            },
            {
                scope: 'worker'
            }
        ],
        acl: async ({ page, aclServer }, use)=>{
            if (aclServer && route) await page.goto(new URL(route, aclServer.url).href);
            const entry = moduleUrl || (aclServer ? `${aclServer.origin}/__acl_hmr/modules/testing.js` : null);
            if (!entry) throw new TypeError('[ACL Testing] createACLPlaywrightTest() requires server options or moduleUrl.');
            await page.evaluate(runHarnessOperation, {
                operation: 'install',
                url: entry
            });
            const fixture = {
                page,
                server: aclServer,
                // Run this operation
                async reset () {
                    // Run this operation
                    await page.evaluate(runHarnessOperation, {
                        operation: 'reset'
                    });
                },
                // Run this operation
                async metrics () {
                    // Run this operation
                    return await page.evaluate(runHarnessOperation, {
                        operation: 'metrics'
                    });
                }
            };
            // Run this operation
            try {
                await use(fixture);
            } finally{
                await page.evaluate(runHarnessOperation, {
                    operation: 'cleanup'
                });
            }
        }
    });
export { expect };
export default {
    // Expose the fixture factory and Playwright assertion surface
    createACLPlaywrightTest,
    expect
};
