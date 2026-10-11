import { expect, test } from './fixtures/test.js';
import { createServer } from 'node:http';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateOfflineBundle } from '../server/offline-generator.mjs';

// Build a temporary dependency graph that is isolated from checked-in examples
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let projectRoot, server, baseUrl;

test.beforeAll(async () => {
    // Prepare the test group
    projectRoot = await mkdtemp(join(tmpdir(), 'acl-offline-browser-'));
    await mkdir(join(projectRoot, 'components'));
    await writeFile(join(projectRoot, 'components', 'offline-base.html'), '<p data-base>Base offline</p>');
    await writeFile(
        join(projectRoot, 'components', 'offline-child.html'),
        '<section><offline-base></offline-base><p data-child>Child offline</p></section>',
    );
    await writeFile(
        join(projectRoot, 'components', 'offline-transform.html'),
        '<style>p { color: rgb(1, 2, 3); }</style><slot><p>Fallback</p></slot><script>window.__offlineScript = true;</script>',
    );
    const manifest = {
        version: 1,
        basePath: '/components/',
        components: {
            'offline-base': 'offline-base.html',
            'offline-child': {
                source: 'offline-child.html',
                dependencies: ['offline-base'],
            },
            'offline-visible': {
                source: 'offline-base.html',
                options: { hydrate: 'visible' },
            },
            'offline-transform': {
                source: 'offline-transform.html',
                options: {
                    sanitize: false,
                    executeScripts: true,
                },
            },
        },
        groups: { critical: ['offline-child', 'offline-visible', 'offline-transform'] },
    };
    await writeFile(join(projectRoot, 'acl-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(
        join(projectRoot, 'index.html'),
        `<!doctype html><html lang="en"><title>ACL offline</title><body>
        <script defer src="/node_modules/alpinejs-pinned/dist/cdn.min.js"></script>
        <script type="module">
            import Loader from '/dist/core.js';
            import { registerOfflineWorker } from '/dist/offline.js';
            const manifest = await (await fetch('/acl-manifest.json')).json();
            await Loader.registerManifest(manifest);
            await Loader.start();
            const card = document.createElement('offline-child');
            document.body.appendChild(card);
            await new Promise(resolve => card.addEventListener('loaded', resolve, { once: true }));
            if (!await navigator.serviceWorker.getRegistration('/'))
                await registerOfflineWorker('/acl-sw.js');
            await navigator.serviceWorker.ready;
            window.__offlineReady = true;
        </script>
    </body></html>`,
    );

    await cp(resolve(repositoryRoot, 'dist'), join(projectRoot, 'dist'), { recursive: true });
    await mkdir(join(projectRoot, 'node_modules', 'alpinejs-pinned', 'dist'), { recursive: true });
    await cp(
        resolve(repositoryRoot, 'node_modules', 'alpinejs-pinned', 'dist', 'cdn.min.js'),
        join(projectRoot, 'node_modules', 'alpinejs-pinned', 'dist', 'cdn.min.js'),
    );

    const alpineAsset = 'node_modules/alpinejs-pinned/dist/cdn.min.js';
    // Generate the exact worker users receive from the offline command
    await generateOfflineBundle({
        manifestFile: join(projectRoot, 'acl-manifest.json'),
        outDir: projectRoot,
        groups: ['critical'],
        assets: ['index.html', 'acl-manifest.json', alpineAsset],
        runtime: {
            entryUrl: '/dist/core.js',
            features: ['offline', 'environment'],
        },
    });

    server = createServer(async (request, response) => {
        // Handle the HTTP request
        const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname),
            relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''),
            path = resolve(projectRoot, relativePath);
        // Guard the operation against runtime failures
        try {
            const type =
                extname(path) === '.js'
                    ? 'text/javascript'
                    : extname(path) === '.json'
                      ? 'application/json'
                      : extname(path) === '.html'
                        ? 'text/html'
                        : 'application/octet-stream';
            response.writeHead(200, { 'content-type': type });
            response.end(await readFile(path));
        } catch {
            response.writeHead(404).end('not found');
        }
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
    await rm(projectRoot, {
        recursive: true,
        force: true,
    });
});

test('generated service worker renders a selected dependency graph after an offline reload', async ({
    page,
    context,
    browserName,
}) => {
    // Exercise the test scenario
    test.skip(browserName !== 'chromium', 'Detailed service-worker offline behavior is budgeted in Chromium.');
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.__offlineReady,
    );
    await page.reload();
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => navigator.serviceWorker.controller && window.__offlineReady,
    );
    // Reload after disconnecting the network to verify nested dependencies render
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('offline-child [data-child]')).toHaveText('Child offline');
    await expect(page.locator('offline-base [data-base]')).toHaveText('Base offline');
    await page.evaluate(async () => {
        // Activate both manifest-selected visible hydration and imperative lazy loading offline
        const inert = document.createElement('template');
        inert.innerHTML =
            '<offline-visible data-acl-ssr="1" data-acl-revision=""><p data-visible>Server</p></offline-visible>';
        const visible = inert.content.firstElementChild,
            lazy = document.createElement('offline-base'),
            transformation = document.createElement('offline-transform'),
            projected = document.createElement('p'),
            hosts = [visible, lazy, transformation],
            ready = hosts.map(
                (host) =>
                    new Promise((resolve, reject) => {
                        // Await actual initialization with networking disabled
                        host.addEventListener('acl:loadend', resolve, { once: true });
                        // Inspect the controlled fixture and its completion
                        host.addEventListener('acl:error', (event) => reject(event.detail.error), { once: true });
                    }),
            );
        lazy.setAttribute('loading', 'lazy');
        projected.textContent = 'Projected offline';
        transformation.append(projected);
        document.body.append(...hosts);
        await Promise.all(ready);
    });
    await expect(page.locator('offline-visible')).toHaveAttribute('data-acl-hydrated', '');
    await expect(page.locator('offline-transform p')).toHaveText('Projected offline');
    expect(
        await page.evaluate(() => {
            // Verify all content-dependent groups activated without networking
            return {
                scripts: window.__offlineScript,
                color: getComputedStyle(document.querySelector('offline-transform p')).color,
            };
        }),
    ).toEqual({
        scripts: true,
        color: 'rgb(1, 2, 3)',
    });
    await context.setOffline(false);
});
