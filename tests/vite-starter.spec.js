import { expect, test } from './fixtures/test.js';
import { cp, mkdir, mkdtemp, rm, symlink, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
// Run the maintained starter against the same pinned Vite package as the compatibility matrix
const { createServer, build, preview } = await import(process.env.ACL_VITE_PACKAGE || 'vite');
import { alpineComponentLoader } from '../server/vite-plugin.mjs';

let root, development, origin;
const repository = resolve('.');
test.beforeAll(async () => {
    // Exercise the actual starter sources with installed packages rather than generated fixture JavaScript
    root = await realpath(await mkdtemp(join(tmpdir(), 'acl-vite-starter-')));
    await cp(resolve('starters/vite'), root, {
        recursive: true,
        // Exclude local installs and generated output from the maintained source fixture
        filter: (path) =>
            !path.startsWith(resolve('starters/vite/node_modules')) && !path.startsWith(resolve('starters/vite/dist')),
    });
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await symlink(repository, join(root, 'node_modules/alpine-component-loader'), 'dir');
    await symlink(resolve('node_modules/alpinejs-pinned'), join(root, 'node_modules/alpinejs'), 'dir');
    await cp(resolve('dist'), join(root, 'public/external/v1.2.0'), { recursive: true });
    development = await createServer({
        root,
        base: '/demo/',
        configFile: false,
        logLevel: 'silent',
        server: {
            host: '127.0.0.1',
            port: 0,
            fs: { allow: [root, repository] },
        },
        plugins: [
            alpineComponentLoader({
                configFile: './acl.config.mjs',
                preload: {
                    entry: 'core',
                    tags: ['home-dashboard'],
                    features: ['boundary', 'styles', 'slots'],
                },
            }),
        ],
    });
    await development.listen();
    origin = 'http://127.0.0.1:' + development.httpServer.address().port;
});
test.afterAll(async () => {
    // Remove every server and disposable starter checkout
    await development?.close();
    if (root)
        await rm(root, {
            recursive: true,
            force: true,
        });
});

const exercise = async (page, base, query) => {
    // Require actual route initialization before navigating or inspecting the DOM
    const failures = [];
    // Verify and release the starter fixture
    page.on('pageerror', (error) => failures.push(error.message));
    await page.goto(base + query);
    await expect(page.locator('#route-status')).toContainText('Home dashboard ready');
    await expect(page.locator('home-dashboard')).toContainText('Vite developer');
    await page.locator('[data-route="account"]').focus();
    // Rapid navigation releases old readiness waits and preserves startup query selections
    await page.evaluate(() => {
        document.querySelector('[data-route="account"]').click();
        document.querySelector('[data-route="home"]').click();
        document.querySelector('[data-route="account"]').click();
    });
    await expect(page.locator('#route-status')).toContainText('Account dashboard ready');
    await expect(page.locator('account-dashboard')).toContainText('acct-2048');
    await expect(page.locator('home-dashboard')).toHaveCount(0);
    expect(new URL(page.url()).search).toBe(query);
    expect(failures).toEqual([]);
};

// Test each public startup choice at a non-root Vite development base
for (const query of ['', '?entry=core', '?polyfills=1', '?entry=core&polyfills=1']) {
    test('Vite starter development routes and readiness ' + (query || 'default'), async ({ page }) => {
        // Verify the HTML hook emits explicit core hints without changing the selected application import
        const html = await (await page.request.get(origin + '/demo/')).text();
        expect(html).toContain('rel="modulepreload"');
        await exercise(page, origin + '/demo/', query);
    });
}
// Build the actual starter through both delivery modes and serve its real output
for (const delivery of ['copy', 'external']) {
    test('Vite starter production ' + delivery + ' delivery supports core and polyfills', async ({ page }) => {
        // External URLs remain native imports served from the same local versioned module family
        test.slow();
        const output = join(root, 'production-' + delivery);
        await build({
            root,
            base: '/demo/',
            configFile: false,
            logLevel: 'silent',
            build: { outDir: output },
            plugins: [
                alpineComponentLoader({
                    configFile: './acl.config.mjs',
                    moduleDelivery: delivery,
                    ...(delivery === 'external' ? { moduleBase: '/demo/external/v1.2.0/' } : {}),
                    preload: {
                        entry: 'core',
                        tags: ['home-dashboard'],
                        features: ['boundary', 'styles', 'slots', 'polyfills'],
                    },
                }),
            ],
        });
        const html = await readFile(join(output, 'index.html'), 'utf8');
        expect(html).toContain('core.js');
        const application = await preview({
            root,
            base: '/demo/',
            configFile: false,
            build: { outDir: output },
            preview: {
                host: '127.0.0.1',
                port: 0,
            },
        });
        // Verify and release the starter fixture
        try {
            await exercise(
                page,
                'http://127.0.0.1:' + application.httpServer.address().port + '/demo/',
                '?entry=core&polyfills=1',
            );
        } finally {
            // Verify and release the starter fixture
            await new Promise((resolveServer) => application.httpServer.close(resolveServer));
        }
    });
}
