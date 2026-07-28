import {
    expect,
    test,
    preparePage,
    alpineStub,
    alpineStubSource,
    projectRoot,
    featureLabPath,
} from './fixtures/loader.js';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

let baseUrl, counts;
test.beforeAll(async ({ loaderServer }) => {
    // Prepare the test group
    ({ baseUrl, counts } = loaderServer);
});

test('reload during an active load cancels stale work and performs one fresh winning request', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        window.seenCounts = [];
        await Loader.define('reload-race-card', '${baseUrl}/templates/slow-template.html', {
            data: {
                src: '${baseUrl}/api/slow?delay=120&name=reload-race',
                target: 'payload'
            },
            hooks: { afterFetch(data) { window.seenCounts.push(data.count); return data; } }
        });
        const el = document.createElement('reload-race-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Wait until the initial request is active before replacing it
        () => window.el?.$props.$loading,
    );
    await page.evaluate(() => {
        // Exercise consecutive reload requests against active work
        void window.el.reload();
        void window.el.reload();
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready' && window.el.$props.payload?.count >= 2,
    );
    const state = await page.evaluate(
        // Read the browser state
        () => ({
            count: window.el.$props.payload.count,
            seenCounts: window.seenCounts,
            loading: ['deferred', 'loading'].includes(window.el._state),
            error: window.el.$props.$error,
        }),
    );
    expect(state.count).toBe(2);
    expect(state.seenCounts).toEqual([2]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
});

test('template cache expiry deletes the request key', async ({ page }) => {
    // Exercise the test scenario
    await page.goto(`${baseUrl}/blank`);
    await page.addScriptTag({ content: alpineStub().replace(/<\/?script>/g, '') });
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        window.Loader = Loader;
    `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.Loader,
    );

    const deleteArg = await page.evaluate(async (templateUrl) => {
        // Read the browser state
        const cacheName = 'alpine-component-loader-test-cache',
            cache = await caches.open(cacheName);
        await cache.put(
            templateUrl,
            new Response('<div>stale</div>', {
                headers: {
                    'acl__fetched-at__': '1',
                    'content-type': 'text/html',
                },
            }),
        );

        const originalDelete = Cache.prototype.delete;
        Cache.prototype.delete = function (request, options) {
            // Read the browser state
            window.__deleteArg = request;
            return originalDelete.call(this, request, options);
        };

        await window.Loader.loadTemplate(templateUrl, {
            cacheTemplates: true,
            _templateCacheKey: cacheName,
            _templateCacheExpire: 1,
        });

        Cache.prototype.delete = originalDelete;
        await caches.delete(cacheName);
        return window.__deleteArg;
    }, `${baseUrl}/templates/cache.html`);

    expect(deleteArg).toBe(`${baseUrl}/templates/cache.html`);
});

test('data params merge with existing query strings without double encoding', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('query-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/echo?existing=yes',
                params: { term: 'a b' }
            }
        });
        const el = document.createElement('query-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.el.$props.$data.query,
        ),
    ).toEqual({
        existing: 'yes',
        term: 'a b',
    });
});

test('data-fetch-timeout attribute controls timeout errors', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('timeout-card', '${baseUrl}/templates/data.html', {
            data: { src: '${baseUrl}/api/slow?delay=100' }
        });
        const el = document.createElement('timeout-card');
        el.setAttribute('data-fetch-timeout', '20');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.el.$props.$error,
        ),
    ).toBe('Request timed out after 20ms');
});

test('initial data failure renders fallback, later failures keep error state', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('initial-fallback-card', '${baseUrl}/templates/data.html', {
            shadow: true,
            data: { src: '${baseUrl}/api/error' },
            fallback: '${baseUrl}/templates/fallback.html'
        });
        await Loader.define('later-error-card', '${baseUrl}/templates/data.html', {
            shadow: true,
            data: { src: '${baseUrl}/api/count?name=later' },
            fallback: '${baseUrl}/templates/fallback.html'
        });
        const initial = document.createElement('initial-fallback-card');
        const later = document.createElement('later-error-card');
        document.body.append(initial, later);
        window.initial = initial;
        window.later = later;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.initial?._state === 'ready' && window.later?._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.initial.shadowRoot.textContent.includes('fallback loaded'),
        ),
    ).toBe(true);

    await page.evaluate(
        // Read the browser state
        () => window.later.setAttribute('data-src', `${location.origin}/api/error`),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.later.$props.$error,
    );
    const laterState = await page.evaluate(
        // Read the browser state
        () => ({
            hasFallback: window.later.shadowRoot.textContent.includes('fallback loaded'),
            error: window.later.$props.$error,
        }),
    );
    expect(laterState.hasFallback).toBe(false);
    expect(laterState.error).toBe('API Error: 500');
});

test('polling restarts when data-fetch-poll changes', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('poll-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/count?name=poll',
                poll: 500
            }
        });
        const el = document.createElement('poll-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready' && window.el._pollTimer,
    );
    const changed = await page.evaluate(() => {
        // Read the browser state
        const oldTimer = window.el._pollTimer;
        window.el.setAttribute('data-fetch-poll', '50');
        return oldTimer !== window.el._pollTimer;
    });

    expect(changed).toBe(true);
});

test('polling runs only while an opted-in component intersects the viewport', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.evaluate(() => {
        // Read the browser state
        window.pollIntersectionObservers = [];
        window.IntersectionObserver = class {
            constructor(callback) {
                // Initialize class state
                this.callback = callback;
                this.target = null;
                this.disconnected = false;
                window.pollIntersectionObservers.push(this);
            }

            observe(target) {
                // Track the element observed by the fixture
                this.target = target;
            }

            disconnect() {
                // Record observer disconnection for cleanup assertions
                this.disconnected = true;
            }

            emit(isIntersecting) {
                // Emit one synthetic intersection change
                this.callback([
                    {
                        target: this.target,
                        isIntersecting,
                    },
                ]);
            }
        };
    });
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('viewport-poll-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/count?name=viewport-poll',
                poll: 25,
                cacheStrategy: 'no-store',
                pauseWhenHidden: false,
                pauseWhenOffline: false
            }
        });
        const el = document.createElement('viewport-poll-card');
        el.setAttribute('pause-polling-when-offscreen', 'true');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready' && window.el.$props.$data?.count === 1,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                observers: window.pollIntersectionObservers.length,
                timer: window.el._pollTimer,
            }),
        ),
    ).toEqual({
        observers: 1,
        timer: null,
    });
    await page.waitForTimeout(80);
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.el.$props.$data.count,
        ),
    ).toBe(1);

    await page.evaluate(
        // Read the browser state
        () => window.pollIntersectionObservers[0].emit(true),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el.$props.$data?.count >= 2,
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el.$props.$loading === false,
    );
    await page.evaluate(
        // Read the browser state
        () => window.pollIntersectionObservers[0].emit(false),
    );
    const offscreenCount = await page.evaluate(
        // Read the browser state
        () => window.el.$props.$data.count,
    );
    await page.waitForTimeout(80);
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.el.$props.$data.count,
        ),
    ).toBe(offscreenCount);

    await page.evaluate(
        // Read the browser state
        () => window.pollIntersectionObservers[0].emit(true),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        (count) => window.el.$props.$data?.count > count,
        offscreenCount,
    );
    await page.evaluate(
        // Read the browser state
        () => window.el.remove(),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el._state === 'destroyed',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                disconnected: window.pollIntersectionObservers[0].disconnected,
                observer: window.el._pollIntersectionObserver,
                cleanups: window.el._pollSignalCleanups?.length || 0,
            }),
        ),
    ).toEqual({
        disconnected: true,
        observer: null,
        cleanups: 0,
    });
});

test('reload clears resolved data cache entries', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('reload-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/count?name=reload',
                params: { term: 'a b' }
            }
        });
        const el = document.createElement('reload-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready' && window.el.$props.$data?.count === 1,
    );
    await page.evaluate(
        // Read the browser state
        () => window.el.reload(),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready' && window.el.$props.$data?.count === 2,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.el.$props.$data.query,
        ),
    ).toEqual({
        name: 'reload',
        term: 'a b',
    });
});

test('retry refetches data without remounting the component template', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        window.retryLifecycle = { mounts: 0, cleanups: 0 };
        await Loader.define('retry-card', '${baseUrl}/templates/data.html', {
            shadow: true,
            data: {
                src: '${baseUrl}/api/count?name=retry-only',
                cacheStrategy: 'no-store'
            },
            hooks: {
                mounted() {
                    window.retryLifecycle.mounts++;
                    return () => window.retryLifecycle.cleanups++;
                }
            }
        });
        const el = document.createElement('retry-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready' && window.el.$props.$data?.count === 1,
    );
    await page.evaluate(() => {
        // Read the browser state
        window.initialRetryRoot = window.el.shadowRoot.firstElementChild;
        return window.el.retry();
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el.$props.$data?.count === 2,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                ...window.retryLifecycle,
                sameRoot: window.el.shadowRoot.firstElementChild === window.initialRetryRoot,
            }),
        ),
    ).toEqual({
        mounts: 1,
        cleanups: 0,
        sameRoot: true,
    });
});

test('simultaneous first template loads are deduped without Cache API storage', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('dedupe-card', '${baseUrl}/templates/cache.html', {
            cacheTemplates: false
        });
        const a = document.createElement('dedupe-card');
        const b = document.createElement('dedupe-card');
        document.body.append(a, b);
        window.cards = [a, b];
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.cards?.every(
                // Process the current value
                (el) => el._state === 'ready',
            ),
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () =>
                window.cards.map(
                    // Transform the current item
                    (el) => el.querySelector('#cache-count').textContent,
                ),
        ),
    ).toEqual(['1', '1']);
});

test('shared data fetches keep running for remaining subscribers after one timeout', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('shared-fetch-card', '${baseUrl}/templates/data.html', {
            data: { src: '${baseUrl}/api/slow?delay=80' }
        });
        const fastTimeout = document.createElement('shared-fetch-card');
        const patient = document.createElement('shared-fetch-card');
        fastTimeout.setAttribute('data-fetch-timeout', '20');
        patient.setAttribute('data-fetch-timeout', '300');
        document.body.append(fastTimeout, patient);
        window.fastTimeout = fastTimeout;
        window.patient = patient;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.fastTimeout?._state === 'ready' && window.patient?._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.fastTimeout.$props.$error,
        ),
    ).toBe('Request timed out after 20ms');
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.patient.$props.$data,
        ),
    ).toEqual({ delayed: true });
});

test('global cache eviction lets active shared subscribers finish while future consumers refetch', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('shared-eviction-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/slow?delay=100&name=shared-eviction',
                target: 'payload'
            }
        });
        const first = document.createElement('shared-eviction-card');
        const second = document.createElement('shared-eviction-card');
        document.body.append(first, second);
        window.Loader = Loader;
        window.cards = [first, second];
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.Loader?.getDataCacheInfo()?.size === 1 &&
            window.Loader.getDataCacheInfo(window.cards[0]._aclDebug.dataCacheKey)?.subscribers === 2,
    );
    await page.evaluate(
        // Read the browser state
        () => window.Loader.clearDataCache(),
    );
    await page.evaluate(() => {
        // Read the browser state
        const third = document.createElement('shared-eviction-card');
        document.body.appendChild(third);
        window.cards.push(third);
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.cards.every(
                // Check every item
                (card) => card._state === 'ready' && card.$props.payload,
            ),
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () =>
                window.cards.map(
                    // Transform the current item
                    (card) => card.$props.payload.count,
                ),
        ),
    ).toEqual([1, 1, 2]);
});

test('data.cacheTtl zero dedupes only in-flight requests and does not retain data', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('ttl-zero-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/count?name=ttl-zero',
                cacheTtl: 0
            }
        });
        const first = document.createElement('ttl-zero-card');
        document.body.appendChild(first);
        window.first = first;
        window.Loader = Loader;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.first?._state === 'ready' && window.first.$props.$data?.count === 1,
    );
    await page.evaluate(
        // Read the browser state
        () =>
            new Promise(
                // Settle the asynchronous operation
                (resolve) => setTimeout(resolve, 0),
            ),
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.Loader.getDataCacheSize(),
        ),
    ).toBe(0);

    await page.evaluate(() => {
        // Read the browser state
        const second = document.createElement('ttl-zero-card');
        document.body.appendChild(second);
        window.second = second;
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.second?._state === 'ready' && window.second.$props.$data?.count === 2,
    );
});

test('custom fetch headers deep-merge with the default Accept header', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('header-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/headers',
                options: { headers: { 'x-custom': 'yes' } }
            }
        });
        const el = document.createElement('header-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.el.$props.$data.headers,
        ),
    ).toEqual({
        accept: 'application/json',
        custom: 'yes',
    });
});

test('external dependency URLs are detected without selector interpolation', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('weird-deps-card', '${baseUrl}/templates/simple.html', {
            externalCss: ['${baseUrl}/style/weird.css?q=%22%5D'],
            externalScripts: ['${baseUrl}/script/weird.js?q=%22%5D']
        });
        const el = document.createElement('weird-deps-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.__weirdScriptLoaded,
        ),
    ).toBe(true);
});

test('zero-sized runtime cache still awaits external dependencies', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        import { scriptLoadCache, styleLoadPromiseCache } from '${baseUrl}/src/runtime/caches.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false, runtimeCacheMax: 0 });
        await Loader.start();
        await Loader.define('uncached-deps-card', '${baseUrl}/templates/simple.html', {
            externalCss: ['${baseUrl}/style/slow.css'],
            externalScripts: ['${baseUrl}/script/slow.js'],
            attributes: { label: String },
            hooks: {
                mounted() {
                    window.__scriptWasReadyAtMount = window.__slowScriptLoaded === true;
                    window.__styleWasReadyAtMount = getComputedStyle(document.body)
                        .getPropertyValue('--acl-slow-css').trim() === 'ready';
                }
            }
        });
        const el = document.createElement('uncached-deps-card');
        el.setAttribute('label', 'ready');
        document.body.appendChild(el);
        window.el = el;
        window.scriptLoadCache = scriptLoadCache;
        window.styleLoadPromiseCache = styleLoadPromiseCache;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                readyAtMount: window.__scriptWasReadyAtMount,
                styleReadyAtMount: window.__styleWasReadyAtMount,
                scriptCacheSize: window.scriptLoadCache.size,
                styleCacheSize: window.styleLoadPromiseCache.size,
            }),
        ),
    ).toEqual({
        readyAtMount: true,
        styleReadyAtMount: true,
        scriptCacheSize: 0,
        styleCacheSize: 0,
    });
});

test('data cache keys include request semantics but dedupe across target props', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('request-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/request',
                method: 'POST',
                body: { variant: 'a' },
                target: 'result',
                options: { headers: { 'x-custom': 'one' } }
            }
        });
        const first = document.createElement('request-card');
        const second = document.createElement('request-card');
        const third = document.createElement('request-card');
        second.setAttribute('data-body', '{"variant":"b"}');
        third.setAttribute('data-target', 'otherResult');
        document.body.append(first, second, third);
        window.cards = [first, second, third];
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.cards?.every(
                // Process the current value
                (el) => el._state === 'ready',
            ),
    );
    const state = await page.evaluate(
        // Read the browser state
        () => ({
            first: window.cards[0].$props.result,
            second: window.cards[1].$props.result,
            third: window.cards[2].$props.otherResult,
            cacheSize: window.Loader?.getDataCacheSize?.(),
        }),
    );

    expect(JSON.parse(state.first.body)).toEqual({ variant: 'a' });
    expect(JSON.parse(state.second.body)).toEqual({ variant: 'b' });
    expect(JSON.parse(state.third.body)).toEqual({ variant: 'a' });
    expect(state.first.count).toBe(1);
    expect(state.second.count).toBe(1);
    expect(state.third.count).toBe(1);
});

test('mutable prop defaults and cached responses are isolated per component', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('isolated-card', '${baseUrl}/templates/data.html', {
            attributes: { config: { type: Object, default: { nested: { value: 1 } } } },
            data: { src: '${baseUrl}/api/count?name=isolated' }
        });
        const first = document.createElement('isolated-card');
        const second = document.createElement('isolated-card');
        document.body.append(first, second);
        window.cards = [first, second];
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.cards?.every(
                // Process the current value
                (el) => el._state === 'ready',
            ),
    );
    const state = await page.evaluate(async () => {
        // Read the browser state
        window.cards[0].$props.config.nested.value = 9;
        window.cards[0].$props.$data.consumerMutation = true;
        const third = document.createElement('isolated-card');
        document.body.appendChild(third);
        await new Promise(
            // Settle the asynchronous operation
            (resolve) => third.addEventListener('loaded', resolve, { once: true }),
        );
        return {
            secondDefault: window.cards[1].$props.config.nested.value,
            secondCachedMutation: window.cards[1].$props.$data.consumerMutation || false,
            thirdCachedMutation: third.$props.$data.consumerMutation || false,
            thirdCount: third.$props.$data.count,
        };
    });

    expect(state).toEqual({
        secondDefault: 1,
        secondCachedMutation: false,
        thirdCachedMutation: false,
        thirdCount: 1,
    });
});

test('afterFetch may transform a response to a primitive value', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('primitive-card', '${baseUrl}/templates/data.html', {
            data: { src: '${baseUrl}/api/count?name=primitive' },
            hooks: { afterFetch() { return 0; } }
        });
        const el = document.createElement('primitive-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.el.$props.$data,
        ),
    ).toBe(0);
});

test('response parsing supports text, vendor JSON, auto detection, and custom parsers', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('text-card', '${baseUrl}/templates/data.html', {
            data: { src: '${baseUrl}/api/text', responseType: 'text' }
        });
        await Loader.define('vendor-card', '${baseUrl}/templates/data.html', {
            data: { src: '${baseUrl}/api/vendor-json', responseType: 'json' }
        });
        await Loader.define('auto-card', '${baseUrl}/templates/data.html', {
            data: { src: '${baseUrl}/api/text', responseType: 'auto' }
        });
        await Loader.define('parser-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/text',
                parser: async (response, context) => ({ text: await response.text(), tag: context.el.localName })
            }
        });
        window.cards = ['text-card', 'vendor-card', 'auto-card', 'parser-card'].map(tag => document.createElement(tag));
        document.body.append(...window.cards);
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.cards?.every(
                // Process the current value
                (el) => el._state === 'ready',
            ),
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () =>
                window.cards.map(
                    // Transform the current item
                    (el) => el.$props.$data,
                ),
        ),
    ).toEqual([
        'plain response',
        { vendor: true },
        'plain response',
        {
            text: 'plain response',
            tag: 'parser-card',
        },
    ]);
});

test('unsafe methods are not retried unless explicitly enabled and runtime events expose typed errors', async ({
    page,
}) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader, { ACLLoadError } from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('unsafe-retry-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/flaky?name=unsafe-policy&fail=3',
                method: 'POST', body: { value: true }, retries: 2, retryDelay: 1, retryJitter: 0
            }
        });
        const el = document.createElement('unsafe-retry-card');
        window.events = [];
        ['acl:loadstart', 'acl:loadend', 'acl:error'].forEach(name => el.addEventListener(name, event => {
            window.events.push({ name, code: event.detail.error?.code, typed: event.detail.error instanceof ACLLoadError });
        }));
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    expect(counts.get('unsafe-policy')).toBe(1);
    const events = await page.evaluate(
        // Read the browser state
        () => window.events,
    );
    expect(
        events.map(
            // Transform the current item
            (event) => event.name,
        ),
    ).toEqual(expect.arrayContaining(['acl:loadstart', 'acl:loadend', 'acl:error']));
    expect(
        events.find(
            // Find the matching item
            (event) => event.name === 'acl:error',
        ),
    ).toEqual({
        name: 'acl:error',
        code: 'ACL_HTTP_ERROR',
        typed: true,
    });
});

test('non-replayable FormData bodies bypass shared response caching', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        const makeBody = value => {
            const body = new FormData();
            body.append('value', new Blob([value], { type: 'text/plain' }), value + '.txt');
            return body;
        };
        await Loader.define('form-one-card', '${baseUrl}/templates/data.html', {
            data: { src: '${baseUrl}/api/request', method: 'POST', options: { body: makeBody('one') } }
        });
        await Loader.define('form-two-card', '${baseUrl}/templates/data.html', {
            data: { src: '${baseUrl}/api/request', method: 'POST', options: { body: makeBody('two') } }
        });
        const first = document.createElement('form-one-card');
        const second = document.createElement('form-two-card');
        document.body.append(first, second);
        window.cards = [first, second];
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.cards?.every(
                // Process the current value
                (el) => el._state === 'ready',
            ),
    );
    const state = await page.evaluate(
        // Read the browser state
        () =>
            window.cards.map(
                // Transform the current item
                (el) => ({
                    body: el.$props.$data.body,
                    strategy: el._aclDebug.dataCacheStrategy,
                }),
            ),
    );
    expect(state[0].body).toContain('one');
    expect(state[1].body).toContain('two');
    expect(
        state.map(
            // Transform the current item
            (item) => item.strategy,
        ),
    ).toEqual(['no-store', 'no-store']);
});

test('component cache helper clears exact request-aware data cache entry', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('clear-request-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/request',
                method: 'POST',
                body: { variant: 'clear' },
                target: 'result',
                options: { headers: { 'x-custom': 'clear' } }
            }
        });
        const el = document.createElement('clear-request-card');
        document.body.appendChild(el);
        window.el = el;
        window.Loader = Loader;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready' && window.el.$props.result?.count === 1,
    );
    const cleared = await page.evaluate(async () => {
        // Read the browser state
        const before = window.Loader.getDataCacheInfo(),
            result = await window.el.$props.$cache.clearData(),
            after = window.Loader.getDataCacheInfo();
        return {
            result,
            beforeSize: before.size,
            afterSize: after.size,
            payload: window.el.$props.result,
        };
    });

    expect(cleared.result).toBe(true);
    expect(cleared.beforeSize).toBe(1);
    expect(cleared.afterSize).toBe(0);
    expect(cleared.payload.count).toBe(1);

    await page.evaluate(
        // Read the browser state
        () => window.el.reload(),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el.$props.result?.count === 2,
    );
});

test('cache clearing evicts active entries and suppresses detached network-first fallbacks', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('active-clear-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/slow?delay=100&name=active-clear',
                target: 'payload',
                cacheStrategy: 'cache-first'
            }
        });
        await Loader.define('network-clear-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/network-clear-race?name=detached-fallback',
                target: 'payload',
                cacheStrategy: 'network-first'
            }
        });
        const active = document.createElement('active-clear-card');
        document.body.appendChild(active);
        window.Loader = Loader;
        window.active = active;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.active?.$props.$loading &&
            window.Loader.getDataCacheInfo(window.active._aclDebug.dataCacheKey)?.pending,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.active.$props.$cache.clearData(),
        ),
    ).toBe(true);
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => !window.active.$props.$loading && window.active.$props.payload?.delayed,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                payload: window.active.$props.payload,
                error: window.active.$props.$error,
                cacheSize: window.Loader.getDataCacheSize(),
            }),
        ),
    ).toEqual({
        payload: {
            delayed: true,
            count: 1,
        },
        error: null,
        cacheSize: 0,
    });

    await page.evaluate(() => {
        // Read the browser state
        const network = document.createElement('network-clear-card');
        document.body.appendChild(network);
        window.network = network;
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.network?._state === 'ready' && window.network.$props.payload?.count === 1,
    );
    await page.evaluate((url) => {
        // Read the browser state
        window.networkRefresh = window.network._fetchData(url);
    }, `${baseUrl}/api/network-clear-race?name=detached-fallback`);
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.network.$props.$loading &&
            window.Loader.getDataCacheInfo(window.network._aclDebug.dataCacheKey)?.pending,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.network.$props.$cache.clearData(),
        ),
    ).toBe(true);
    await page.evaluate(
        // Read the browser state
        () => window.networkRefresh,
    );

    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                payload: window.network.$props.payload,
                error: window.network.$props.$error,
                cacheSize: window.Loader.getDataCacheSize(),
                detachedEntries: window.Loader._detachedDataEntries.size,
            }),
        ),
    ).toEqual({
        payload: null,
        error: null,
        cacheSize: 0,
        detachedEntries: 0,
    });
});

test('post body retries and custom target prop work through grouped data config', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('retry-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/flaky?name=retry&fail=1',
                method: 'POST',
                body: { ok: true },
                target: 'payload',
                retries: 1,
                retryDelay: 5,
                retryUnsafeMethods: true
            }
        });
        const el = document.createElement('retry-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.el.$props.payload,
        ),
    ).toEqual({
        ok: true,
        attempt: 2,
    });
});

test('data cache strategies support no-store and network-first fallback', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        window.Loader = Loader;
        await Loader.define('no-store-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/count?name=no-store',
                cacheStrategy: 'no-store'
            }
        });
        await Loader.define('network-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/count?name=network-first',
                cacheStrategy: 'network-first'
            }
        });
        const a = document.createElement('no-store-card');
        const b = document.createElement('no-store-card');
        const network = document.createElement('network-card');
        document.body.append(a, b, network);
        window.cards = [a, b, network];
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.cards?.every(
                // Process the current value
                (el) => el._state === 'ready',
            ),
    );
    const [firstNoStore, secondNoStore, networkFirst] = await page.evaluate(
        // Read the browser state
        () =>
            window.cards.map(
                // Transform the current item
                (el) => el.$props.$data.count,
            ),
    );
    expect(
        [firstNoStore, secondNoStore].sort(
            // Compare the current items
            (a, b) => a - b,
        ),
    ).toEqual([1, 2]);
    expect(networkFirst).toBe(1);
    await page.evaluate(
        // Read the browser state
        () => window.cards[2].reload(),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.cards[2].$props.$data.count === 2,
    );
});

test('template cache strategy no-store bypasses cached templates', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('template-no-store-card', '${baseUrl}/templates/cache.html', {
            templateCacheStrategy: 'no-store'
        });
        const el = document.createElement('template-no-store-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.el.querySelector('#cache-count').textContent,
        ),
    ).toBe('1');
    await page.evaluate(
        // Read the browser state
        () => window.el.reload(),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el.querySelector('#cache-count')?.textContent === '2',
    );
});

test('loadingHtml renders while data loads and is replaced by final content', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('loading-card', '${baseUrl}/templates/data.html', {
            data: { src: '${baseUrl}/api/slow?delay=80' },
            loadingHtml: '<div id="loading-state">Loading...</div>'
        });
        const el = document.createElement('loading-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?.querySelector('#loading-state'),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                loading: Boolean(window.el.querySelector('#loading-state')),
                ready: Boolean(window.el.querySelector('#ready')),
                data: window.el.$props.$data,
            }),
        ),
    ).toEqual({
        loading: false,
        ready: true,
        data: { delayed: true },
    });
});

test('loadingTemplate resolves remote sources through the component definition resolver', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('loading-template-card', '${baseUrl}/templates/data.html', {
            data: { src: '${baseUrl}/api/slow?delay=80' },
            loadingTemplate: 'alias:loading',
            sourceResolver(source, context) {
                if (source !== 'alias:loading') return source;
                window.loadingResolverContext = {
                    tagName: context.tagName,
                    loadingTemplate: context.config.loadingTemplate,
                    hasGlobalConfig: Boolean(context.globalConfig),
                    sameLoader: context.loader === Loader
                };
                return '${baseUrl}/templates/fallback.html';
            }
        });
        const el = document.createElement('loading-template-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?.querySelector('#fallback')?.hasAttribute('data-acl-loading'),
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.loadingResolverContext,
        ),
    ).toEqual({
        tagName: 'loading-template-card',
        loadingTemplate: 'alias:loading',
        hasGlobalConfig: true,
        sameLoader: true,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                loading: Boolean(window.el.querySelector('#fallback')),
                ready: Boolean(window.el.querySelector('#ready')),
                data: window.el.$props.$data,
            }),
        ),
    ).toEqual({
        loading: false,
        ready: true,
        data: { delayed: true },
    });
});

test('generated skeleton manifests provide fallback loading UI without overriding authored UI', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('late-skeleton-card', '${baseUrl}/templates/data.html', {
            data: { src: '${baseUrl}/api/slow?delay=100' }
        });
        window.registeredSkeletons = await Loader.registerSkeletonManifest({
            version: 1,
            skeletons: {
                'generated-loading-card': { html: '<div id="generated-skeleton">Generated</div>' },
                'authored-loading-card': { html: '<div id="ignored-skeleton">Ignored</div>' },
                'late-skeleton-card': { html: '<div id="late-skeleton">Late</div>' }
            }
        });
        await Loader.define('generated-loading-card', '${baseUrl}/templates/data.html', {
            data: { src: '${baseUrl}/api/slow?delay=100' }
        });
        await Loader.define('authored-loading-card', '${baseUrl}/templates/data.html', {
            data: { src: '${baseUrl}/api/slow?delay=100' },
            loadingHtml: '<div id="authored-skeleton">Authored</div>'
        });
        window.generatedCard = document.body.appendChild(document.createElement('generated-loading-card'));
        window.authoredCard = document.body.appendChild(document.createElement('authored-loading-card'));
        window.lateCard = document.body.appendChild(document.createElement('late-skeleton-card'));
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.generatedCard?.querySelector('#generated-skeleton') &&
            window.authoredCard?.querySelector('#authored-skeleton') &&
            window.lateCard?.querySelector('#late-skeleton'),
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                registered: window.registeredSkeletons,
                ignored: Boolean(window.authoredCard.querySelector('#ignored-skeleton')),
            }),
        ),
    ).toEqual({
        registered: ['generated-loading-card', 'authored-loading-card', 'late-skeleton-card'],
        ignored: false,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.generatedCard?._state === 'ready' &&
            window.authoredCard?._state === 'ready' &&
            window.lateCard?._state === 'ready',
    );
});
