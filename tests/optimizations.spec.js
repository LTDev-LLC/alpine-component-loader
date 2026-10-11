import { test, expect, preparePage } from './fixtures/loader.js';

let baseUrl;
test.beforeAll(async ({ loaderServer }) => {
    // Resolve the fixture server's native module base
    ({ baseUrl } = loaderServer);
});

test('component teardown releases shared template ownership and a fresh load can retry', async ({ page }) => {
    // Use controlled response completion to assert teardown ownership independently of timing
    await preparePage(page);
    const result = await page.evaluate(async (base) => {
        // Keep unrelated native module requests on the original transport
        const { createLoader } = await import(`${base}/src/index.js`),
            Loader = createLoader({
                config: {
                    autoStart: false,
                    cacheTemplates: false,
                    templateTimeout: 0,
                },
            }),
            nativeFetch = window.fetch,
            requests = [];
        // Inspect the controlled fixture and its completion
        window.fetch = (url, options) =>
            String(url).endsWith('/owned.html')
                ? // Inspect the controlled fixture and its completion
                  new Promise((resolve) =>
                      requests.push({
                          resolve,
                          signal: options.signal,
                      }),
                  )
                : nativeFetch(url, options);
        await Loader.define('owned-template-card', `${base}/owned.html`);
        await Loader.start();
        const first = document.createElement('owned-template-card'),
            second = document.createElement('owned-template-card');
        document.body.append(first, second);
        // Let both component subscriptions reach the held transport
        while (requests.length < 1) await new Promise((resolve) => setTimeout(resolve, 0));
        first.remove();
        // Inspect the controlled fixture and its completion
        await new Promise((resolve) => setTimeout(resolve, 0));
        const shared = !requests[0].signal.aborted,
            // Inspect the controlled fixture and its completion
            ready = new Promise((resolve) => second.addEventListener('acl:loadend', resolve, { once: true }));
        requests[0].resolve(new Response('<p>Shared response</p>'));
        await ready;
        const rendered = second.textContent;
        second.remove();
        const third = document.createElement('owned-template-card');
        document.body.append(third);
        // Wait for a new ownership transaction before canceling its only host
        while (requests.length < 2) await new Promise((resolve) => setTimeout(resolve, 0));
        third.remove();
        // Inspect the controlled fixture and its completion
        await new Promise((resolve) => setTimeout(resolve, 0));
        const finalOwnerAborted = requests[1].signal.aborted;
        await Loader.dispose({ clearPersistentCaches: false });
        return {
            shared,
            rendered,
            finalOwnerAborted,
            requests: requests.length,
        };
    }, baseUrl);
    expect(result).toEqual({
        shared: true,
        rendered: 'Shared response',
        finalOwnerAborted: true,
        requests: 2,
    });
});

test('nested inert templates are fully sanitized and scheduled components signal actual readiness', async ({
    page,
}) => {
    // Traverse nested template contents while running the opt-in initialization budget
    await preparePage(page);
    // Inspect the controlled fixture and its completion
    const result = await page.evaluate(async (base) => {
        const { createLoader } = await import(`${base}/src/index.js`),
            Loader = createLoader({
                config: {
                    autoStart: false,
                    hydrationScheduler: {
                        budgetMs: 8,
                        maxTasksPerTurn: 1,
                    },
                },
            });
        let html = '<a href="javascript:alert(1)" onclick="alert(1)">unsafe</a><script>alert(1)</script>';
        // Exercise more nested inert roots than a shallow querySelectorAll can visit
        for (let index = 0; index < 100; index++) html = `<template>${html}</template>`;
        await Loader.define('nested-scheduled-card', { template: html });
        await Loader.start();
        const host = document.createElement('nested-scheduled-card'),
            // Inspect the controlled fixture and its completion
            ready = new Promise((resolve) => host.addEventListener('acl:loadend', resolve, { once: true }));
        document.body.append(host);
        const immediate = host.hasAttribute('data-acl-ready');
        await ready;
        let root = host;
        // Enter each inert content fragment and inspect the deepest sanitized markup
        for (let index = 0; index < 100; index++) root = root.querySelector('template').content;
        const result = {
            immediate,
            script: Boolean(root.querySelector('script')),
            href: root.querySelector('a').getAttribute('href'),
            onclick: root.querySelector('a').getAttribute('onclick'),
        };
        await Loader.dispose({ clearPersistentCaches: false });
        return result;
    }, baseUrl);
    expect(result).toEqual({
        immediate: false,
        script: false,
        href: null,
        onclick: null,
    });
});

test('cached bodies obey request limits and clearing caches suppresses pending writes', async ({ page }) => {
    // Keep cache invalidation independent of active subscribers that can still receive complete HTML
    await preparePage(page);
    // Inspect the controlled fixture and its completion
    const result = await page.evaluate(async (base) => {
        const { createLoader } = await import(`${base}/src/index.js`),
            Loader = createLoader({
                config: {
                    autoStart: false,
                    templateTimeout: 0,
                },
            }),
            nativeFetch = window.fetch;
        let starts = 0,
            release;
        // Inspect the controlled fixture and its completion
        window.fetch = (url, options) => {
            if (!String(url).endsWith('/cache-owned.html')) return nativeFetch(url, options);
            starts++;
            // Inspect the controlled fixture and its completion
            return starts === 1
                ? Promise.resolve(new Response('123456789'))
                : new Promise((resolve) => {
                      release = resolve;
                  });
        };
        const source = `${base}/cache-owned.html`;
        await Loader.loadTemplate(source, { templateMaxBytes: 100 });
        let code;
        // Release resources on both success and failure
        try {
            await Loader.loadTemplate(source, { templateMaxBytes: 4 });
        } catch (error) {
            code = error.code;
        }
        const pending = Loader.loadTemplate(source, { templateCacheStrategy: 'network-first' });
        // Hold the fresh download while invalidating its persistent cache identity
        while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
        await Loader.clearTemplate(source);
        release(new Response('fresh'));
        const html = await pending,
            info = await Loader.getTemplateCacheInfo(source);
        await Loader.dispose({ clearPersistentCaches: true });
        return {
            code,
            starts,
            html,
            info,
        };
    }, baseUrl);
    expect(result).toEqual({
        code: 'ACL_TEMPLATE_TOO_LARGE',
        starts: 2,
        html: 'fresh',
        info: null,
    });
});
