import { expect, test } from './fixtures/test.js';
import AxeBuilder from '@axe-core/playwright';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startACLDevServer } from '../server/dev-server.mjs';
import { getSeriousAccessibilityViolations } from './fixtures/accessibility.js';

// Generate a disposable project so file watching exercises real filesystem events
let app, exampleApp, projectRoot, componentFile;

const createIndexHTML = (marker, inlineMarker = 'inline-first') => {
    // Create index html
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <script defer src="/__acl_hmr/alpine.js"></script>
    <script type="importmap">{"imports":{"alpine-component-loader":"/__acl_hmr/modules/index.min.js"}}</script>
</head>
<body data-index-marker="${marker}">
    <template acl-component="hmr-inline-card">
        <strong data-inline-template-marker>${inlineMarker}</strong>
    </template>
    <hmr-inline-card></hmr-inline-card>
    <hmr-test-card count="1"></hmr-test-card>
    <script type="module">
        import Loader from 'alpine-component-loader/auto';
        Loader.config({ autoStart: true });
        Loader.define('hmr-test-card', '/components/live-card.html', { shadow: true, attributes: { count: Number } });
        window.__pageIdentity = Math.random().toString(36);
        window.__pageLoadCount = Number(sessionStorage.getItem('acl-page-load-count') || 0) + 1;
        sessionStorage.setItem('acl-page-load-count', String(window.__pageLoadCount));
        window.addEventListener('acl:dev-reload', event => { window.__lastACLDevReload = event.detail; });
    </script>
</body>
</html>`;
};

test.beforeAll(async () => {
    // Prepare the test group
    projectRoot = await mkdtemp(join(tmpdir(), 'acl-hmr-browser-'));
    await mkdir(join(projectRoot, 'components'));
    componentFile = join(projectRoot, 'components', 'live-card.html');
    await writeFile(
        componentFile,
        '<article x-data="{ props: $el.$props }"><strong data-template-marker>first</strong><input data-acl-preserve-key="note"><span x-text="props.count"></span></article>',
    );
    await writeFile(join(projectRoot, 'index.html'), createIndexHTML('first'));
    app = await startACLDevServer({
        root: projectRoot,
        port: 0,
        watchDebounce: 20,
    });
    exampleApp = await startACLDevServer({
        root: resolve('examples/hmr'),
        port: 0,
        watchFiles: false,
    });
});

test.afterAll(async () => {
    // Clean up the completed test group
    await app?.close();
    await exampleApp?.close();
    if (projectRoot)
        await rm(projectRoot, {
            recursive: true,
            force: true,
        });
});

test('checked-in HMR page shell has no serious accessibility violations', async ({ page }) => {
    // Audit the maintained example rather than the disposable HMR fixture
    await page.goto(exampleApp.url);
    await expect(page.locator('#connection-status')).toHaveText('HMR connected');
    await expect(page.locator('hmr-demo-card')).toContainText('Live template');
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(getSeriousAccessibilityViolations(accessibility)).toEqual([]);
});

test('development server executes a synthesized minified package graph', async ({ page }) => {
    // Import from a same-origin fragment without connecting this page to HMR
    const moduleRequests = [];
    page.on('request', (request) => {
        // Record only the generated package-module family
        const url = new URL(request.url());
        if (url.pathname.startsWith('/__acl_hmr/modules/') && url.pathname.endsWith('.min.js'))
            moduleRequests.push(url.pathname);
    });
    await page.goto(`${app.origin}/components/live-card.html`);

    const result = await page.evaluate(async (origin) => {
        // Activate component construction through the minified entry
        const { default: Loader } = await import(`${origin}/__acl_hmr/modules/index.min.js?entry=local`),
            template = document.createElement('template');
        template.innerHTML = '<p>minified development runtime</p>';
        await Loader.define('local-minified-card', template);
        return {
            registered: Loader.has('local-minified-card'),
            version: Loader.version,
        };
    }, app.origin);

    expect(result.registered).toBe(true);
    expect(result.version).toBeTruthy();
    expect(moduleRequests).toContain('/__acl_hmr/modules/index.min.js');
    expect(moduleRequests).toContain('/__acl_hmr/modules/runtime/loader.min.js');
    expect(moduleRequests).toContain('/__acl_hmr/modules/runtime/component/factory.min.js');
    expect(moduleRequests.length).toBeGreaterThan(8);
    expect(
        moduleRequests.every(
            // Check every package request remains in the minified URL family
            (pathname) => pathname.endsWith('.min.js'),
        ),
    ).toBe(true);
});

test('generic server reloads a changed component through its injected SSE client', async ({ page }) => {
    // Exercise the test scenario
    const errors = [],
        moduleRequests = [];
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
        // Record injected and application package imports
        const pathname = new URL(request.url()).pathname;
        if (pathname.startsWith('/__acl_hmr/modules/')) moduleRequests.push(pathname);
    });

    await page.goto(app.url);
    const card = page.locator('hmr-test-card');
    await expect
        .poll(
            // Read the state under test
            () =>
                card.evaluate(
                    // Read the browser state
                    (element) => element._state === 'ready',
                ),
        )
        .toBe(true);
    await expect(card.locator('[data-template-marker]')).toHaveText('first');
    await expect
        .poll(
            // Read the state under test
            () => app.clients,
        )
        .toBe(1);
    expect(moduleRequests.length).toBeGreaterThan(8);
    expect(
        moduleRequests.every(
            // Check HMR and application imports share one minified module family
            (pathname) => pathname.endsWith('.min.js'),
        ),
    ).toBe(true);
    const pageIdentity = await page.evaluate(
        // Read the browser state
        () => window.__pageIdentity,
    );

    // Seed mutable props focus and selection before replacing the template
    await card.evaluate((element) => {
        // Read the browser state
        element.$props.count = 7;
        const input = element.shadowRoot.querySelector('input');
        input.value = 'preserved';
        input.focus();
        input.setSelectionRange(2, 5);
    });

    await writeFile(
        componentFile,
        '<article x-data="{ props: $el.$props }"><strong data-template-marker>second</strong><input data-acl-preserve-key="note"><span x-text="props.count"></span></article>',
    );
    await expect(card.locator('[data-template-marker]')).toHaveText('second');
    await expect(card.locator('span')).toHaveText('7');
    expect(
        await card.evaluate((element) => {
            // Read the browser state
            const input = element.shadowRoot.querySelector('input');
            return {
                value: input.value,
                focused: element.shadowRoot.activeElement === input,
                selection: [input.selectionStart, input.selectionEnd],
            };
        }),
    ).toEqual({
        value: 'preserved',
        focused: true,
        selection: [2, 5],
    });
    await expect
        .poll(
            // Read the state under test
            () =>
                page.evaluate(
                    // Read the browser state
                    () => window.__lastACLDevReload,
                ),
        )
        .toEqual({
            sources: [`${app.origin}/components/live-card.html`],
            tags: ['hmr-test-card'],
            reloaded: 1,
            failed: 0,
        });
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.__pageIdentity,
        ),
    ).toBe(pageIdentity);

    // Inline component content in the page updates without navigating or replacing its source template
    await writeFile(join(projectRoot, 'index.html'), createIndexHTML('first', 'inline-second'));
    await expect(page.locator('hmr-inline-card [data-inline-template-marker]')).toHaveText('inline-second');
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.__pageIdentity,
        ),
    ).toBe(pageIdentity);

    // Unknown component sources must fall back to a full page reload
    const fallbackNavigation = page.waitForEvent('framenavigated');
    app.broadcast({
        type: 'acl:template-changed',
        source: '/components/unknown.html',
        fallback: true,
    });
    await fallbackNavigation;
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.__pageLoadCount === 2,
    );
    await expect
        .poll(
            // Let the replacement document finish its component request before the next navigation
            () =>
                card.evaluate(
                    // Read the browser state
                    (element) => element._state === 'ready',
                ),
        )
        .toBe(true);
    const fallbackIdentity = await page.evaluate(
        // Read the browser state
        () => window.__pageIdentity,
    );
    expect(fallbackIdentity).not.toBe(pageIdentity);

    const indexNavigation = page.waitForEvent('framenavigated');
    await writeFile(join(projectRoot, 'index.html'), createIndexHTML('second', 'inline-second'));
    await indexNavigation;
    await expect(page.locator('body')).toHaveAttribute('data-index-marker', 'second');
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.__pageLoadCount === 3,
    );
    await expect
        .poll(
            // Include the final component request in the completed navigation contract
            () =>
                card.evaluate(
                    // Read the browser state
                    (element) => element._state === 'ready',
                ),
        )
        .toBe(true);
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.__pageIdentity,
        ),
    ).not.toBe(fallbackIdentity);
    expect(errors).toEqual([]);
});
