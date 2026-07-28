import { expect, test } from './fixtures/test.js';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Serve real Alpine distributions and strict CSP fixtures from one controlled origin
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
    };

let server, baseUrl;

const send = (response, status, body, type = 'text/plain', headers = {}) => {
    // Send
    response.writeHead(status, {
        'content-type': type,
        ...headers,
    });
    response.end(body);
};

test.beforeAll(async () => {
    // Prepare the test group
    server = createServer(async (request, response) => {
        // Handle the HTTP request
        const url = new URL(request.url, `http://${request.headers.host}`);
        if (url.pathname === '/blank') {
            send(
                response,
                200,
                '<!doctype html><html lang="en"><title>ACL real Alpine fixture</title><body></body></html>',
                'text/html',
            );
            return;
        }
        if (url.pathname === '/csp') {
            send(
                response,
                200,
                `<!doctype html>
                <html lang="en">
                    <head><meta charset="utf-8"><title>ACL CSP fixture</title></head>
                    <body>
                        <script defer src="/tests/fixtures/csp-bootstrap.js"></script>
                        <script defer src="/node_modules/@alpinejs/csp/dist/cdn.min.js"></script>
                        <script type="module" src="/tests/fixtures/csp-app.js"></script>
                    </body>
                </html>`,
                'text/html',
                {
                    'content-security-policy':
                        "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'",
                },
            );
            return;
        }
        if (/^\/(?:dist|src|tests\/fixtures|node_modules)\//.test(url.pathname)) {
            const filePath = resolve(projectRoot, `.${url.pathname}`);
            if (!filePath.startsWith(`${projectRoot}/`)) {
                send(response, 403, 'forbidden');
                return;
            }
            // Guard the operation against runtime failures
            try {
                send(
                    response,
                    200,
                    await readFile(filePath),
                    mimeTypes[extname(filePath)] || 'application/octet-stream',
                );
            } catch {
                send(response, 404, 'not found');
            }
            return;
        }
        send(response, 404, 'not found');
    });
    await new Promise(
        // Settle the asynchronous operation
        (resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise),
    );
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
    // Clean up the completed test group
    await new Promise(
        // Settle the asynchronous operation
        (resolvePromise) => server.close(resolvePromise),
    );
});

// Run the same integration contract against every supported Alpine minor line
for (const [label, packageName] of [
    ['Alpine 3.14', 'alpinejs-314'],
    ['Alpine 3.15', 'alpinejs-315'],
]) {
    test(`${label} initializes reactive light and shadow components`, async ({ page }) => {
        // Exercise the test scenario
        const errors = [];
        page.on(
            'pageerror',
            // Handle the pageerror event
            (error) => errors.push(error.message),
        );
        await page.goto(`${baseUrl}/blank`);
        await page.evaluate(() => {
            // Let Alpine initialize an outer scope before component instances mount
            document.body.innerHTML = '<main id="component-mount" x-data="{ outerLabel: \'Outer\' }"></main>';
        });
        await page.addScriptTag({ url: `${baseUrl}/node_modules/${packageName}/dist/cdn.min.js` });
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => window.Alpine?.version,
        );
        await page.addScriptTag({
            type: 'module',
            content: `
                import Loader from '${baseUrl}/dist/index.js';
                Loader.config({ autoStart: false });
                const template = document.createElement('template');
                template.id = 'real-alpine-template';
                template.innerHTML = '<section x-data="{ count: 1, initialLabel: $props.label, props: $el.$props }"><button type="button" @click="count++">Increment</button><output data-count aria-live="polite" x-text="count"></output><span data-init-prop x-text="initialLabel"></span><span data-scoped-props x-text="$props.label"></span><span data-legacy-props x-text="props.label"></span><span data-outer-scope x-text="outerLabel"></span></section><p data-scoped-without-data x-text="$props.label"></p>';
                document.body.appendChild(template);
                Loader.define('real-light-card', '#real-alpine-template', {
                    attributes: { label: String },
                });
                Loader.define('real-shadow-card', '#real-alpine-template', {
                    shadow: true,
                    attributes: { label: String },
                });
                await Loader.start();
                const light = document.createElement('real-light-card');
                const shadow = document.createElement('real-shadow-card');
                light.setAttribute('label', 'Light');
                shadow.setAttribute('label', 'Shadow');
                document.getElementById('component-mount').append(light, shadow);
                await Promise.all([light, shadow].map(element => new Promise(resolve => element.addEventListener('loaded', resolve, { once: true }))));
                window.__realAlpine = { light, shadow, version: window.Alpine.version };
            `,
        });
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => window.__realAlpine,
        );

        await page.locator('real-light-card button').click();
        await page.locator('real-shadow-card').locator('button').click();
        await expect(page.locator('real-light-card [data-count]')).toHaveText('2');
        await expect(page.locator('real-shadow-card').locator('[data-count]')).toHaveText('2');
        await expect(page.locator('real-light-card [data-init-prop]')).toHaveText('Light');
        await expect(page.locator('real-light-card [data-scoped-props]')).toHaveText('Light');
        await expect(page.locator('real-light-card [data-legacy-props]')).toHaveText('Light');
        await expect(page.locator('real-light-card [data-scoped-without-data]')).toHaveText('Light');
        await expect(page.locator('real-light-card [data-outer-scope]')).toHaveText('Outer');
        await expect(page.locator('real-shadow-card').locator('[data-scoped-props]')).toHaveText('Shadow');
        await expect(page.locator('real-shadow-card').locator('[data-init-prop]')).toHaveText('Shadow');
        await expect(page.locator('real-shadow-card').locator('[data-legacy-props]')).toHaveText('Shadow');
        await expect(page.locator('real-shadow-card').locator('[data-scoped-without-data]')).toHaveText('Shadow');
        await expect(page.locator('real-shadow-card').locator('[data-outer-scope]')).toHaveText('Outer');
        await page.evaluate(() => {
            // Verify both access paths retain the same reactive props reference
            window.__realAlpine.light.label = 'Updated light';
            window.__realAlpine.shadow.label = 'Updated shadow';
        });
        await expect(page.locator('real-light-card [data-scoped-props]')).toHaveText('Updated light');
        await expect(page.locator('real-light-card [data-legacy-props]')).toHaveText('Updated light');
        await expect(page.locator('real-light-card [data-scoped-without-data]')).toHaveText('Updated light');
        await expect(page.locator('real-shadow-card').locator('[data-scoped-props]')).toHaveText('Updated shadow');
        await expect(page.locator('real-shadow-card').locator('[data-legacy-props]')).toHaveText('Updated shadow');
        await expect(page.locator('real-shadow-card').locator('[data-scoped-without-data]')).toHaveText(
            'Updated shadow',
        );
        expect(
            await page.evaluate(
                // Read the browser state
                () => window.__realAlpine.version,
            ),
        ).toMatch(/^3\.(14|15)\./);
        expect(errors).toEqual([]);
    });
}

test('the CSP Alpine build works without unsafe-eval', async ({ page }) => {
    // Exercise the test scenario
    const errors = [],
        consoleErrors = [];
    page.on(
        'pageerror',
        // Handle the pageerror event
        (error) => errors.push(error.message),
    );
    page.on('console', (message) => {
        // Handle the console event
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto(`${baseUrl}/csp`);
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.__cspReady === true,
    );
    await page.locator('csp-counter button').click();
    await expect(page.locator('csp-counter output')).toHaveText('2');
    await expect(page.locator('csp-counter [data-prop]')).toHaveText('CSP');
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
});

test('rendered component controls have no serious Axe violations', async ({ page }) => {
    // Exercise the test scenario
    await page.goto(`${baseUrl}/csp`);
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.__cspReady === true,
    );
    const results = await new AxeBuilder({ page }).include('csp-counter').analyze();
    expect(
        results.violations.filter(
            // Select matching items
            (violation) => ['serious', 'critical'].includes(violation.impact),
        ),
    ).toEqual([]);
});
