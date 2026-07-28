import { expect, test } from './fixtures/test.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSkeletons } from '../server/skeleton-generator.mjs';
import { startACLDevServer } from '../server/dev-server.mjs';

// Verify captured geometry excludes authored private text values and URLs
test('CLI capture generates private-data-free geometry that prevents loading layout shifts', async ({
    browser,
    page,
}) => {
    // Exercise the test scenario
    test.slow();
    const root = await mkdtemp(join(tmpdir(), 'acl-skeleton-browser-')),
        outDir = join(root, 'skeletons'),
        sentinelText = 'PRIVATE CUSTOMER NAME',
        sentinelValue = 'secret-form-value',
        sentinelUrl = '/private/customer-avatar.png';
    let application = null;
    // Guard the operation against runtime failures
    try {
        await writeFile(
            join(root, 'index.html'),
            `<!doctype html>
<html><head><meta charset="utf-8"><script defer src="/__acl_hmr/alpine.js"></script></head>
<body>
<style>.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;min-width:0}.grid>*{min-width:0}</style>
<template id="private-card-template">
  <style>
    :host { display: block; inline-size: 100%; }
    article { box-sizing: border-box; block-size: 180px; padding: 20px; border: 1px solid #ddd; border-radius: 12px; }
    img { display: block; inline-size: 48px; block-size: 48px; margin-inline: auto; border-radius: 50%; }
  </style>
  <article><h2>${sentinelText}</h2><img src="${sentinelUrl}" alt="Private avatar"><input value="${sentinelValue}"></article>
</template>
<div class="full"><private-card></private-card></div>
<div class="grid"><private-card></private-card><span></span></div>
<acl-dynamic data-acl-component="acl-dynamic" style="display:block;width:10px;height:10px"></acl-dynamic>
<script type="module">
  import Loader from 'alpine-component-loader';
  Loader.config({ autoStart: false });
  Loader.define('private-card', '#private-card-template', { shadow: true });
  await Loader.start();
  window.AlpineComponentLoader = Loader;
</script>
</body></html>`,
            'utf8',
        );

        const progress = [],
            result = await generateSkeletons(
                {
                    target: {
                        type: 'local',
                        root,
                        index: 'index.html',
                    },
                    outDir,
                    routes: [],
                    include: [],
                    exclude: [],
                    timeout: 10_000,
                    viewports: {
                        mobile: {
                            width: 390,
                            height: 844,
                        },
                        desktop: {
                            width: 1000,
                            height: 800,
                        },
                    },
                    breakpoint: 768,
                    allowPartial: false,
                    force: false,
                },
                {
                    browserType: browser.browserType(),
                    // Run the on progress operation
                    onProgress: (message) => progress.push(message),
                },
            );

        expect(result.components).toEqual(['private-card']);
        expect(result.mode).toBe('css');
        expect(result.files).toEqual([join(outDir, 'acl-skeletons.css')]);
        expect(progress.join('\n')).toContain('Ignoring 1 non-capturable wrapper type: <acl-dynamic>.');
        expect(progress.join('\n')).toContain('Captured 1 component type.');
        expect(progress.join('\n')).toContain('Wrote 1 generated file.');
        const generatedOutput = await readFile(result.cssSkeletonPath, 'utf8');
        expect(generatedOutput).not.toContain(sentinelText);
        expect(generatedOutput).not.toContain(sentinelValue);
        expect(generatedOutput).not.toContain(sentinelUrl);
        expect(generatedOutput).toContain('private-card:not(:defined)');
        expect(generatedOutput).toContain('max-width:767px');
        expect(generatedOutput).toContain('data:image/svg+xml');

        await writeFile(
            join(root, 'index.html'),
            `<!doctype html>
<html><head>
<meta charset="utf-8">
<link rel="stylesheet" href="/skeletons/acl-skeletons.css">
<script defer src="/__acl_hmr/alpine.js"></script>
</head><body>
<style>.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;min-width:0}.grid>*{min-width:0}</style>
<div class="full"><private-card></private-card></div>
<div class="grid"><private-card></private-card><span></span></div>
<script>
  setTimeout(async () => {
    const Loader = (await import('alpine-component-loader')).default;
    Loader.config({ autoStart: false });
    Loader.define('private-card', '/private-card.html', { shadow: true });
    await Loader.start();
  }, 500);
</script>
</body></html>`,
            'utf8',
        );
        application = await startACLDevServer({
            root,
            port: 0,
            watchFiles: false,
        });
        const pageErrors = [],
            requests = [];
        page.on(
            'pageerror',
            // Handle the pageerror event
            (error) => pageErrors.push(error.message),
        );
        page.on(
            'request',
            // Handle the request event
            (request) => requests.push(request.url()),
        );
        await page.addInitScript(() => {
            // Initialize browser test state
            window.__layoutShifts = [];
            new PerformanceObserver(
                // Process captured performance entries
                (list) =>
                    list.getEntries().forEach((entry) => {
                        // Process the current item
                        if (!entry.hadRecentInput)
                            window.__layoutShifts.push({
                                value: entry.value,
                                sources: entry.sources.map(
                                    // Transform the current item
                                    (source) => ({
                                        node: source.node?.localName || null,
                                        previousRect: source.previousRect.toJSON(),
                                        currentRect: source.currentRect.toJSON(),
                                    }),
                                ),
                            });
                    }),
            ).observe({
                type: 'layout-shift',
                buffered: true,
            });
        });
        await page.route('**/private-card.html', async (route) => {
            // Handle the routed request
            await new Promise(
                // Settle the asynchronous operation
                (resolvePromise) => setTimeout(resolvePromise, 800),
            );
            await route.fulfill({
                contentType: 'text/html',
                body: `<style>:host{display:block;inline-size:100%}article{box-sizing:border-box;block-size:180px;padding:20px;border:1px solid #ddd;border-radius:12px}</style><article><h2>Loaded</h2></article>`,
            });
        });
        await page.goto(application.url);
        await page.waitForTimeout(100);
        const initialStates = await page.evaluate(
                // Read the browser state
                () =>
                    Array.from(document.querySelectorAll('private-card')).map((element) => {
                        // Transform the current item
                        const style = getComputedStyle(element),
                            rect = element.getBoundingClientRect(),
                            parentRect = element.parentElement.getBoundingClientRect();
                        return {
                            defined: Boolean(customElements.get('private-card')),
                            state: element?._state || null,
                            rect: rect.toJSON(),
                            parentRect: parentRect.toJSON(),
                            maskImage: style.maskImage || style.webkitMaskImage,
                            maskSize: style.maskSize || style.webkitMaskSize,
                            maskPosition: style.maskPosition || style.webkitMaskPosition,
                            backgroundImage: style.backgroundImage,
                        };
                    }),
            ),
            [initialState, gridInitialState] = initialStates;
        expect(initialState.defined, pageErrors.join('\n')).toBe(false);
        expect(initialState.state).toBeNull();
        expect(initialState.rect.height).toBe(180);
        expect(initialState.maskImage).not.toBe('none');
        expect(initialState.backgroundImage).toContain('linear-gradient');
        expect(initialState.maskSize).toContain('48px 48px');
        expect(initialState.maskPosition).toContain('50%');
        expect(gridInitialState.rect.width).toBeLessThan(initialState.rect.width);
        expect(gridInitialState.rect.right).toBeLessThanOrEqual(gridInitialState.parentRect.right);
        expect(
            requests.some(
                // Check the current item
                (url) => url.includes('acl-skeletons.generated.js'),
            ),
        ).toBe(false);
        await page.evaluate(async () => {
            // Read the browser state
            await new Promise(
                // Settle the asynchronous operation
                (resolvePromise) =>
                    requestAnimationFrame(
                        // Run the scheduled animation task
                        () => requestAnimationFrame(resolvePromise),
                    ),
            );
            window.__layoutShifts = [];
        });

        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => document.querySelector('private-card')?._state === 'loading',
        );
        const loadingState = await page
            .locator('private-card')
            .first()
            .evaluate(
                // Read the browser state
                (element) => ({
                    height: element.getBoundingClientRect().height,
                    maskImage: getComputedStyle(element).maskImage || getComputedStyle(element).webkitMaskImage,
                    hasHtmlSkeleton: Boolean(element.shadowRoot?.querySelector('.acl-generated-skeleton')),
                }),
            );
        expect(loadingState.height).toBe(initialState.rect.height);
        expect(loadingState.maskImage).not.toBe('none');
        expect(loadingState.hasHtmlSkeleton).toBe(false);
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => document.querySelector('private-card')?._state === 'ready',
        );
        const readyStates = await page.evaluate(
            // Read the browser state
            () =>
                Array.from(document.querySelectorAll('private-card')).map(
                    // Transform the current item
                    (element) => ({
                        rect: element.getBoundingClientRect().toJSON(),
                        maskImage: getComputedStyle(element).maskImage || getComputedStyle(element).webkitMaskImage,
                    }),
                ),
        );
        expect(Math.abs(initialState.rect.height - readyStates[0].rect.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(initialState.rect.width - readyStates[0].rect.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(gridInitialState.rect.width - readyStates[1].rect.width)).toBeLessThanOrEqual(1);
        expect(readyStates[0].maskImage).toBe('none');
        expect(readyStates[1].maskImage).toBe('none');
        expect(
            await page.evaluate(
                // Read the browser state
                () => window.__layoutShifts || [],
            ),
        ).toEqual([]);
    } finally {
        await application?.close();
        await rm(root, {
            recursive: true,
            force: true,
        });
    }
});
