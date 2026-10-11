import { expect, test } from './fixtures/test.js';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { createMinifiedJavaScriptReader } from '../server/javascript-minifier.mjs';

let server, origin;
const root = resolve('.'),
    minifier = createMinifiedJavaScriptReader();
test.beforeAll(async () => {
    // Serve the authored offline page without injecting uncached development clients
    server = createServer(async (request, response) => {
        const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
        try {
            if (!path.startsWith(root + '/')) {
                response.writeHead(403).end();
                return;
            }
            let body;
            // Settle owned HTTP resources
            try {
                body = await readFile(path);
            } catch (error) {
                if (error.code !== 'ENOENT' || !path.endsWith('.min.js')) throw error;
                body = await minifier.read(path.replace(/\.min\.js$/, '.js'));
            }
            response.setHeader(
                'content-type',
                {
                    '.js': 'text/javascript',
                    '.json': 'application/json',
                    '.html': 'text/html',
                    '.css': 'text/css',
                }[extname(path)] || 'application/octet-stream',
            );
            response.end(body);
        } catch {
            response.writeHead(404).end();
        }
    });
    // Settle owned HTTP resources
    await new Promise((resolveServer) => server.listen(0, '127.0.0.1', resolveServer));
    origin = 'http://127.0.0.1:' + server.address().port;
});
test.afterAll(async () => {
    // Release the generated module reader and server after the browser fixture
    minifier.clear();
    // Settle owned HTTP resources
    await new Promise((resolveServer) => server.close(resolveServer));
});

// Match the worker's graph to the selected default or explicit core startup
for (const entry of ['default', 'core']) {
    test(`offline example activates late capabilities and fallback bundles with ${entry}`, async ({
        page,
        context,
        browserName,
    }) => {
        // Browser service-worker network checks run in the same engine as existing offline coverage
        test.skip(browserName !== 'chromium', 'Offline service-worker delivery is exercised in Chromium.');
        test.slow();
        await page.goto(origin + '/examples/offline/index.html?entry=' + entry);
        await expect(page.locator('#service-worker-status')).toHaveText('Ready for offline reload', { timeout: 30000 });
        await context.setOffline(true);
        await page.reload();
        await expect(page.locator('#service-worker-status')).toHaveText('Ready for offline reload');
        await page
            .getByRole('button', {
                name: 'Optional capabilities',
                exact: true,
            })
            .click();
        const frame = page.frameLocator('[data-demo-outlet] iframe');
        await expect(frame.locator('#report')).toContainText('"activated": "plain"');
        await frame.getByRole('button', { name: 'Activate styles' }).click();
        await expect(frame.locator('#report')).toContainText('"activated": "styles"');
        await frame.getByRole('button', { name: 'Activate slots' }).click();
        await expect(frame.locator('#fixture')).toContainText('Projected consumer content');
        await page
            .getByRole('button', {
                name: 'Polyfill readiness',
                exact: true,
            })
            .click();
        await frame.getByRole('button', { name: 'Fallback fixture' }).click();
        await expect(frame.locator('#report')).toContainText('"fallback": true');
        await expect(frame.locator('#report')).toContainText('"componentReady": true');
    });
}
