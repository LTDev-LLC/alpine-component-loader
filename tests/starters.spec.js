import { expect, test } from './fixtures/test.js';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { startACLDevServer } from '../server/dev-server.mjs';
import { alpineRuntime } from '../scripts/alpine-runtime.mjs';

let application;

const require = createRequire(import.meta.url),
    alpineModule = require.resolve('alpinejs-pinned/dist/module.esm.js');

test.beforeAll(async () => {
    // Serve the maintained starter with the same import-map injection used by generated applications
    application = await startACLDevServer({
        root: resolve('starters/vanilla'),
        port: 0,
        watchFiles: false,
    });
});

test.afterAll(async () => {
    // Release the starter's HTTP and HMR subscriptions after each worker finishes
    await application?.close();
});

// Exercise every documented startup link without relying on CDN network availability
for (const query of ['', '?entry=core', '?polyfills=1', '?entry=core&polyfills=1']) {
    test(`vanilla starter renders its manifest and boundary through ${query || 'default startup'}`, async ({
        page,
    }) => {
        // Render the actual starter and require its requested startup variant to finish
        const errors = [],
            requests = [];
        // Retain application failures independently of DOM rendering assertions
        page.on('pageerror', (error) => errors.push(error.message));
        // Record which optional public entries the application actually requests
        page.on('request', (request) => requests.push(request.url()));
        // Serve the real Alpine module locally while keeping the authored CDN module URL
        await page.route(alpineRuntime.esmUrl, async (route) => {
            await route.fulfill({
                contentType: 'text/javascript',
                body: await readFile(alpineModule, 'utf8'),
            });
        });
        // Keep native relative module imports in their authored family while substituting the local distribution
        await page.route('https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader/**', async (route) => {
            const modulePath = new URL(route.request().url()).pathname.split('/dist/')[1],
                response = await page.request.get(new URL(`/__acl_hmr/modules/${modulePath}`, application.url).href);
            await route.fulfill({ response });
        });

        await page.goto(`${application.url}${query}`);
        await expect(page.locator('hello-card h1')).toHaveText('Hello, World!');
        await expect(page.locator('#startup-status')).toHaveText('Greeting component ready');
        expect(errors).toEqual([]);
        expect(
            requests.some(
                // Identify only the explicit startup entry response
                (url) => /\/core\.min\.js$/.test(url),
            ),
        ).toBe(query.includes('entry=core'));
        expect(
            requests.some(
                // Require wrapper imports only when the polyfill variant was selected
                (url) => /\/polyfills\.min\.js$/.test(url),
            ),
        ).toBe(query.includes('polyfills=1'));
        expect(
            requests.filter(
                // Native engines must not download upstream classic polyfill scripts
                (url) => /webcomponents-(?:loader|bundle)\.js/.test(url),
            ),
        ).toEqual([]);
    });
}
