import { expect, test } from './fixtures/test.js';
import { createServer } from 'node:http';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateOfflineBundle } from '../server/offline-generator.mjs';

// Build a temporary dependency graph that is isolated from checked-in examples
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let projectRoot, server, baseUrl;

// Expand built runtime assets for explicit service worker precaching
const walk = async (directory) => {
    // Walk
    const files = [];
    // Process each entry
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...(await walk(path)));
        else if (entry.isFile()) files.push(path);
    }
    return files;
};

test.beforeAll(async () => {
    // Prepare the test group
    projectRoot = await mkdtemp(join(tmpdir(), 'acl-offline-browser-'));
    await mkdir(join(projectRoot, 'components'));
    await writeFile(join(projectRoot, 'components', 'offline-base.html'), '<p data-base>Base offline</p>');
    await writeFile(
        join(projectRoot, 'components', 'offline-child.html'),
        '<section><offline-base></offline-base><p data-child>Child offline</p></section>',
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
        },
        groups: { critical: ['offline-child'] },
    };
    await writeFile(join(projectRoot, 'acl-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(
        join(projectRoot, 'index.html'),
        `<!doctype html><html lang="en"><title>ACL offline</title><body>
        <script defer src="/node_modules/alpinejs-315/dist/cdn.min.js"></script>
        <script type="module">
            import Loader from '/src/index.js';
            import { registerOfflineWorker } from '/src/offline.js';
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
    await cp(resolve(repositoryRoot, 'src'), join(projectRoot, 'src'), { recursive: true });
    await mkdir(join(projectRoot, 'node_modules', 'alpinejs-315', 'dist'), { recursive: true });
    await cp(
        resolve(repositoryRoot, 'node_modules', 'alpinejs-315', 'dist', 'cdn.min.js'),
        join(projectRoot, 'node_modules', 'alpinejs-315', 'dist', 'cdn.min.js'),
    );

    const distAssets = (await walk(resolve(repositoryRoot, 'dist'))).map(
            // Transform the current item
            (path) => relative(repositoryRoot, path),
        ),
        sourceAssets = (await walk(resolve(repositoryRoot, 'src'))).map(
            // Transform the current item
            (path) => relative(repositoryRoot, path),
        ),
        alpineAsset = 'node_modules/alpinejs-315/dist/cdn.min.js';
    // Generate the exact worker users receive from the offline command
    await generateOfflineBundle({
        manifestFile: join(projectRoot, 'acl-manifest.json'),
        outDir: projectRoot,
        groups: ['critical'],
        assets: ['index.html', 'acl-manifest.json', alpineAsset, ...distAssets, ...sourceAssets],
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
    await context.setOffline(false);
});
