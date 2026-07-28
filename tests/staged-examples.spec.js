import { expect, test } from './fixtures/test.js';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { stageExamples } from '../scripts/stage-example.mjs';
import { getSeriousAccessibilityViolations } from './fixtures/accessibility.js';

const repositoryRoot = resolve('.'),
    alpineUrl = 'https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js',
    contentTypes = {
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.md': 'text/markdown; charset=utf-8',
    };

// Serve one staged artifact without development transformations
const startStaticServer = async (root) => {
    const server = createServer(async (request, response) => {
        // Serve only physical artifact files without development transformations
        // Resolve and return one contained artifact request
        try {
            const url = new URL(request.url || '/', 'http://localhost'),
                pathname = decodeURIComponent(url.pathname),
                requested = pathname.endsWith('/') ? `${pathname}index.html` : pathname,
                requestedPath = resolve(root, requested.replace(/^\/+/, '')),
                containedPath = relative(resolve(root), requestedPath);
            if (!containedPath || containedPath.startsWith('..') || isAbsolute(containedPath)) {
                response.writeHead(403);
                response.end('Forbidden');
                return;
            }
            const requestedStats = await stat(requestedPath),
                path = requestedStats.isDirectory() ? resolve(requestedPath, 'index.html') : requestedPath,
                fileStats = await stat(path);
            if (!fileStats.isFile())
                throw Object.assign(new Error('Not found'), {
                    code: 'ENOENT',
                });
            const body = await readFile(path);
            response.writeHead(200, {
                'content-length': body.length,
                'content-type': contentTypes[extname(path)] || 'application/octet-stream',
                'x-content-type-options': 'nosniff',
            });
            response.end(body);
        } catch (error) {
            response.writeHead(error?.code === 'ENOENT' ? 404 : 500);
            response.end(error?.code === 'ENOENT' ? 'Not found' : 'Server error');
        }
    });
    await new Promise(
        // Bind an isolated origin for the staged artifact
        (resolveReady) => server.listen(0, '127.0.0.1', resolveReady),
    );
    const origin = `http://127.0.0.1:${server.address().port}`;
    return {
        origin,
        // Close the plain server after the current artifact
        close: async () =>
            await new Promise(
                // Release the plain static server
                (resolveClose, reject) =>
                    server.close((error) => {
                        // Settle the close operation
                        if (error) reject(error);
                        else resolveClose();
                    }),
            ),
    };
};

test('the static catalog navigates to every bundled backend-free example', async ({ browser, page }, testInfo) => {
    // Stage and boot every supported example through one plain file server
    test.slow();
    const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'acl-staged-browser-')),
        alpineSource = await readFile(resolve('node_modules/alpinejs-315/dist/cdn.min.js'), 'utf8'),
        requests = [],
        developmentRequests = [],
        names = ['playground', 'feature-lab', 'a11y', 'offline'],
        outputRoot = resolve(temporaryRoot, testInfo.project.name);
    await page.route(alpineUrl, (route) => {
        // Fulfill the exact CDN request from the pinned local test dependency
        requests.push(route.request().url());
        return route.fulfill({
            body: alpineSource,
            contentType: 'text/javascript',
        });
    });
    await page.route(
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
        // Fulfill the optional Feature Lab stylesheet deterministically
        (route) =>
            route.fulfill({
                body: '.fa-brands{display:inline-block}',
                contentType: 'text/css',
            }),
    );
    await page.route(
        'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js',
        // Fulfill the optional Feature Lab script deterministically
        (route) =>
            route.fulfill({
                body: 'window.confetti = function () {};',
                contentType: 'text/javascript',
            }),
    );
    page.on('request', (request) => {
        // Record any accidental dependency on development-only routes
        const pathname = new URL(request.url()).pathname;
        if (pathname.startsWith('/__acl_hmr/')) developmentRequests.push(pathname);
    });

    // Preserve cleanup when the staged catalog or any example fails
    try {
        await stageExamples(
            {
                names,
                root: repositoryRoot,
                outputRoot,
            },
            {
                browserType: browser.browserType(),
                // Suppress generator milestones inside the browser test reporter
                onProgress() {},
            },
        );
        const skeletonSelectors = {
            a11y: 'a11y-demo-card:not(:defined)',
            'feature-lab': 'advanced-fetch:not(:defined)',
            offline: 'offline-demo-shell:not(:defined)',
            playground: 'acl-playground-app:not(:defined)',
        };
        // Verify every selected project owns a generated stylesheet before serving it
        for (const name of names) {
            const skeletonSource = await readFile(
                resolve(outputRoot, 'examples', name, 'skeletons/acl-skeletons.css'),
                'utf8',
            );
            expect(skeletonSource).toContain(skeletonSelectors[name]);
        }
        const application = await startStaticServer(outputRoot),
            stagedFailures = [],
            stagedRequests = [],
            recordStagedResponse = (response) => {
                // Track all physical staged resources and any failed response
                if (!response.url().startsWith(application.origin)) return;
                const pathname = new URL(response.url()).pathname;
                if (pathname !== '/favicon.ico') stagedRequests.push(pathname);
                if (pathname !== '/favicon.ico' && response.status() >= 400)
                    stagedFailures.push({
                        pathname,
                        status: response.status(),
                    });
            };
        page.on('response', recordStagedResponse);
        // Release the isolated catalog origin after every readiness assertion
        try {
            await page.goto(application.origin);
            await expect(page).toHaveURL(`${application.origin}/`);
            await expect(page.getByRole('heading', { level: 1 })).toHaveText('AlpineComponentLoader');
            await expect(page.locator('.site-header .subtitle')).toContainText(
                'A lightweight, build-free component loader for Alpine.js',
            );
            await expect(page.locator('.site-header .github-link')).toHaveText('View on GitHub');
            await expect(page.locator('.site-footer .meta')).toContainText(
                'AlpineComponentLoader - A lightweight, build-free component loader for Alpine.js.',
            );
            await expect(page.locator('.site-footer nav a')).toHaveText([
                'GitHub',
                'Issues',
                'Alpine.js',
                'Back to top',
            ]);
            await expect(page.locator('.example-card')).toHaveCount(names.length);
            const cardNames = await page.locator('.example-card').evaluateAll(
                // Collect catalog cards in their rendered order
                (cards) => cards.map((card) => card.dataset.example),
            );
            expect(cardNames).toEqual(names);
            await expect(page.getByRole('link', { name: 'Open example' })).toHaveCount(names.length);
            await expect(page.getByRole('link', { name: 'Read guide' })).toHaveCount(names.length);
            await expect(page.locator('meta[http-equiv="refresh"]')).toHaveCount(0);
            await expect(page.locator('script')).toHaveCount(0);
            await expect(page.locator('style[data-acl-stage-catalog]')).toHaveCount(1);
            await expect(page.locator('link[rel="stylesheet"]')).toHaveCount(0);
            const mainWidth = await page.locator('main').evaluate(
                // Measure the generated Feature Lab content boundary
                (element) => element.getBoundingClientRect().width,
            );
            expect(mainWidth).toBeLessThanOrEqual(1180);
            const catalogAppearance = await page.evaluate(() => {
                // Read the visual contracts that distinguish a styled catalog
                return {
                    bodyBackground: getComputedStyle(document.body).backgroundColor,
                    cardRadius: getComputedStyle(document.querySelector('.example-card')).borderRadius,
                    cardDirection: getComputedStyle(document.querySelector('.example-card')).flexDirection,
                    gridDisplay: getComputedStyle(document.querySelector('.example-grid')).display,
                    gridDirection: getComputedStyle(document.querySelector('.example-grid')).flexDirection,
                    overviewBackground: getComputedStyle(document.querySelector('.catalog-overview')).backgroundImage,
                };
            });
            expect(catalogAppearance).toEqual({
                bodyBackground: 'rgb(243, 244, 246)',
                cardRadius: '12px',
                cardDirection: 'row',
                gridDisplay: 'flex',
                gridDirection: 'column',
                overviewBackground: 'linear-gradient(135deg, rgb(15, 23, 42), rgb(30, 58, 138))',
            });
            const accessibility = await new AxeBuilder({ page }).analyze();
            expect(getSeriousAccessibilityViolations(accessibility)).toEqual([]);
            expect(requests).toEqual([]);

            // Open every application from its ordered catalog card and return
            for (const name of names) {
                await page
                    .locator(`.example-card[data-example="${name}"]`)
                    .getByRole('link', {
                        name: 'Open example',
                    })
                    .click();
                await page.waitForURL(`**/examples/${name}/index.html`);
                if (name === 'a11y')
                    await page.waitForFunction(
                        // Wait for the accessibility application to publish readiness
                        () => window.__aclA11yExample?.ready === true,
                    );
                else if (name === 'feature-lab')
                    await page.waitForFunction(
                        // Wait for a file-backed showcase to complete through the staged runtime
                        () => document.querySelector('advanced-fetch')?._state === 'ready',
                    );
                else if (name === 'offline')
                    await page.waitForFunction(
                        // Wait for staged application and worker setup
                        () => window.__aclOfflineExample?.ready === true,
                    );
                else {
                    await expect(page.locator('#status')).toHaveText(/Ready · Full render · \d+ms/);
                    await expect(page.frameLocator('#preview').locator('h1')).toHaveText('Good morning, Maya.');
                }
                await expect(
                    page.getByRole('heading', {
                        level: 1,
                        name: 'AlpineComponentLoader',
                    }),
                ).toBeVisible();
                await expect(page.locator('link[data-acl-stage-skeletons]')).toHaveAttribute(
                    'href',
                    './skeletons/acl-skeletons.css',
                );
                expect(stagedRequests).toContain(`/examples/${name}/skeletons/acl-skeletons.css`);
                await expect(page.getByRole('link', { name: 'View on GitHub' })).toBeVisible();
                await expect(page.getByRole('navigation', { name: 'Footer' }).getByRole('link')).toHaveText([
                    'GitHub',
                    'Issues',
                    'Alpine.js',
                    'Back to top',
                ]);
                await expect(
                    page.getByText(
                        'AlpineComponentLoader - A lightweight, build-free component loader for Alpine.js.',
                        { exact: false },
                    ),
                ).toBeVisible();
                await page.goBack();
                await expect(page).toHaveURL(`${application.origin}/`);
                await expect(page.locator('.example-card')).toHaveCount(names.length);
            }
            expect(stagedFailures).toEqual([]);

            await page.evaluate(async () => {
                // Force clean-URL navigation to prove physical template path resolution
                const names = await caches.keys();
                await Promise.all(
                    names.map(
                        // Remove one template or offline cache
                        (name) => caches.delete(name),
                    ),
                );
            });
            stagedFailures.length = 0;
            stagedRequests.length = 0;
            await page.goto(`${application.origin}/examples/feature-lab`);
            await expect(page.locator('base')).toHaveAttribute('href', '/examples/feature-lab/index.html');
            await expect(page.locator('link[rel="stylesheet"]').first()).toHaveAttribute('href', './styles.css');
            expect(
                await page
                    .locator('link[rel="stylesheet"]')
                    .first()
                    .evaluate(
                        // Resolve the authored relative stylesheet through the staged base
                        (element) => element.href,
                    ),
            ).toBe(`${application.origin}/examples/feature-lab/styles.css`);
            await page.waitForFunction(
                // Wait for clean-URL navigation to load a file-backed component
                () => document.querySelector('advanced-fetch')?._state === 'ready',
            );
            expect(stagedRequests).toContain('/examples/feature-lab/styles.css');
            expect(stagedRequests).toContain('/examples/feature-lab/components/shadow-card.html');
            expect(
                stagedRequests.some(
                    // Reject the one-directory-high path from clean-URL navigation
                    (pathname) => pathname.startsWith('/examples/components/'),
                ),
            ).toBe(false);
            expect(stagedFailures).toEqual([]);
            expect(developmentRequests).toEqual([]);
        } finally {
            page.off('response', recordStagedResponse);
            await application.close();
        }
        expect(requests.length).toBeGreaterThanOrEqual(5);
        expect(new Set(requests)).toEqual(new Set([alpineUrl]));
    } finally {
        await rm(temporaryRoot, {
            recursive: true,
            force: true,
        });
    }
});
