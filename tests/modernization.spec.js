import { expect, test } from './fixtures/test.js';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let server, baseUrl, requestCounts;

const alpineStubSource = `
window.Alpine = {
    reactive(value) { return value; }, effect(callback) { callback(); return callback; }, release() {},
    nextTick(callback) { Promise.resolve().then(callback); }, destroyTree() {},
    store() {}, initTree() {}
};`;

test.beforeAll(async () => {
    // Prepare the test group
    requestCounts = new Map();
    server = createServer(async (request, response) => {
        // Handle the HTTP request
        const url = new URL(request.url, `http://${request.headers.host}`);
        requestCounts.set(url.pathname, (requestCounts.get(url.pathname) || 0) + 1);
        if (url.pathname === '/blank') {
            response.writeHead(200, { 'content-type': 'text/html' });
            response.end('<!doctype html><html lang="en"><title>ACL modernization</title><body></body></html>');
            return;
        }
        if (url.pathname === '/trusted-types') {
            response.writeHead(200, {
                'content-type': 'text/html',
                'content-security-policy':
                    "default-src 'self'; script-src 'self'; require-trusted-types-for 'script'; trusted-types acl",
            });
            response.end(
                '<!doctype html><html lang="en"><title>Trusted Types</title><body><script type="module" src="/fixtures/trusted-types.js"></script></body></html>',
            );
            return;
        }
        if (url.pathname === '/fixtures/trusted-types.js') {
            response.writeHead(200, { 'content-type': 'text/javascript' });
            response.end(`
                import Loader from '/src/index.js';
                ${alpineStubSource}
                const wait = element => new Promise(resolve => element.addEventListener('acl:error', event => resolve(event.detail.error), { once: true }));
                await Loader.define('tt-missing-card', '/templates/trusted.html', { shadow: true });
                await Loader.start();
                const missing = document.createElement('tt-missing-card'), missingResult = wait(missing);
                document.body.appendChild(missing);
                const missingError = await missingResult;
                const policy = trustedTypes.createPolicy('acl', { createHTML: value => value });
                Loader.config({ security: { trustedTypesPolicy: policy } });
                await Loader.define('tt-policy-card', '/templates/trusted.html', { shadow: true });
                const accepted = document.createElement('tt-policy-card');
                document.body.appendChild(accepted);
                await new Promise(resolve => accepted.addEventListener('loaded', resolve, { once: true }));
                window.trustedTypesResult = {
                    code: missingError.code,
                    accepted: accepted.shadowRoot.querySelector('[data-trusted]')?.textContent,
                };
            `);
            return;
        }
        if (url.pathname === '/templates/trusted.html') {
            response.writeHead(200, { 'content-type': 'text/html' });
            response.end('<p data-trusted>trusted policy accepted</p>');
            return;
        }
        if (url.pathname === '/templates/hydrate.html') {
            await new Promise(
                // Settle the asynchronous operation
                (resolveDelay) => setTimeout(resolveDelay, 60),
            );
            response.writeHead(200, { 'content-type': 'text/html' });
            response.end(
                '<button data-client-template x-data="{ open: false }" @click="open = !open"><span x-text="open ? \'Open\' : \'Closed\'"></span><slot name="action"></slot></button>',
            );
            return;
        }
        if (url.pathname === '/templates/fallback-ok.html') {
            response.writeHead(200, { 'content-type': 'text/html' });
            response.end('<p data-fallback-ok>Safe fallback</p>');
            return;
        }
        if (url.pathname === '/api/hydrate') {
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ source: 'client data' }));
            return;
        }
        if (url.pathname === '/assets/modern.css') {
            response.writeHead(200, { 'content-type': 'text/css' });
            response.end(':host{display:block}');
            return;
        }
        if (url.pathname === '/assets/modern.js') {
            response.writeHead(200, { 'content-type': 'text/javascript' });
            response.end('window.__modernExternalScript = (window.__modernExternalScript || 0) + 1;');
            return;
        }
        if (/^\/(?:src|node_modules)\//.test(url.pathname)) {
            // Guard the operation against runtime failures
            try {
                const path = resolve(projectRoot, `.${url.pathname}`),
                    type = extname(path) === '.js' ? 'text/javascript' : 'application/octet-stream';
                response.writeHead(200, { 'content-type': type });
                response.end(await readFile(path));
            } catch {
                response.writeHead(404).end('not found');
            }
            return;
        }
        response.writeHead(404).end('not found');
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

const prepareStubPage = async (page) => {
    // Prepare stub page
    await page.goto(`${baseUrl}/blank`);
    await page.addScriptTag({ content: alpineStubSource });
};

test('recursive sanitizer rejects executable descendants, templates, SVG, navigation, and encoded URLs', async ({
    page,
}) => {
    // Exercise the test scenario
    await prepareStubPage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
            import Loader from '${baseUrl}/src/index.js';
            const template = document.createElement('template');
            template.innerHTML = \`
                <section data-safe="yes" aria-label="Safe" style="color:green" x-data="{}">
                    <a id="encoded" href="java&#x0A;script:alert(1)">bad</a>
                    <img id="set" srcset="safe.png 1x, JAVASCRIPT:alert(1) 2x" src="safe.png" onerror="alert(1)">
                    <form id="form" action=" vbscript:bad"><button formaction="data:text/html,bad">go</button></form>
                    <iframe id="frame" srcdoc="<script>bad</script>"></iframe>
                    <base href="https://evil.test/"><meta http-equiv="refresh" content="0;url=javascript:bad">
                    <svg><script>bad()</script><a id="svg-link" xlink:href="javascript:bad">svg</a></svg>
                    <template id="nested"><div onclick="bad()"><script>bad()</script><a href="javascript:bad">nested</a></div></template>
                </section>\`;
            await Loader.define('modern-secure-card', template, { shadow: true, sanitize: true });
            await Loader.start();
            const card = document.createElement('modern-secure-card');
            document.body.appendChild(card);
            await new Promise(resolve => card.addEventListener('loaded', resolve, { once: true }));
            const root = card.shadowRoot, nested = root.querySelector('#nested').content;
            window.sanitizerResult = {
                scripts: root.querySelectorAll('script').length + nested.querySelectorAll('script').length,
                base: root.querySelectorAll('base').length,
                refresh: root.querySelectorAll('meta[http-equiv]').length,
                encoded: root.querySelector('#encoded').hasAttribute('href'),
                srcset: root.querySelector('#set').hasAttribute('srcset'),
                handler: root.querySelector('#set').hasAttribute('onerror'),
                action: root.querySelector('#form').hasAttribute('action'),
                formaction: root.querySelector('#form button').hasAttribute('formaction'),
                srcdoc: root.querySelector('#frame').hasAttribute('srcdoc'),
                svg: root.querySelector('#svg-link').hasAttribute('xlink:href'),
                nestedHandler: nested.querySelector('div').hasAttribute('onclick'),
                nestedHref: nested.querySelector('a').hasAttribute('href'),
                safe: root.querySelector('section').getAttribute('data-safe'),
                alpine: root.querySelector('section').hasAttribute('x-data'),
            };
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.sanitizerResult,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.sanitizerResult,
        ),
    ).toEqual({
        scripts: 0,
        base: 0,
        refresh: 0,
        encoded: false,
        srcset: false,
        handler: false,
        action: false,
        formaction: false,
        srcdoc: false,
        svg: false,
        nestedHandler: false,
        nestedHref: false,
        safe: 'yes',
        alpine: true,
    });
});

test('URL policies can narrow built-in safety and custom sanitizers retain their return contract', async ({ page }) => {
    // Exercise the test scenario
    await page.goto(`${baseUrl}/blank`);
    await page.addScriptTag({
        type: 'module',
        content: `
            import { applySanitizer, htmlToFragment, sanitizeNodeTree } from '${baseUrl}/src/runtime/rendering.js';
            const policyCalls = [];
            const fragment = htmlToFragment('<a id="blocked" href="https://blocked.test/path">blocked</a><a id="executable" href="javascript:alert(1)">bad</a>');
            sanitizeNodeTree(fragment, { security: { urlPolicy(url, context) {
                policyCalls.push({ url, attribute: context.attribute });
                return !url.includes('blocked.test') || url.startsWith('javascript:');
            } } });
            const custom = await applySanitizer(htmlToFragment('<p>original</p>'), {
                sanitize: () => '<section data-custom-sanitizer>replacement</section>', security: {},
            }, { tagName: 'custom-sanitizer-card' });
            const disabled = await applySanitizer(htmlToFragment('<script data-preserved></script>'), {
                sanitize: false,
            }, {});
            window.urlPolicyResult = {
                blocked: fragment.querySelector('#blocked').hasAttribute('href'),
                executable: fragment.querySelector('#executable').hasAttribute('href'),
                calls: policyCalls.length,
                custom: custom.querySelector('[data-custom-sanitizer]')?.textContent,
                disabled: Boolean(disabled.querySelector('[data-preserved]')),
            };
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.urlPolicyResult,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.urlPolicyResult,
        ),
    ).toEqual({
        blocked: false,
        executable: false,
        calls: 1,
        custom: 'replacement',
        disabled: true,
    });
});

test('parsed fragments use a two-entry definition LRU while sanitizers and Trusted Types remain per-instance', async ({
    page,
}) => {
    // Exercise fragment reuse and the per-instance safety boundaries
    await page.goto(`${baseUrl}/blank`);
    const result = await page.evaluate(async (moduleUrl) => {
        // Instrument browser parsing without changing the native parser result
        const { applySanitizer, cloneParsedFragment } = await import(moduleUrl),
            NativeDOMParser = window.DOMParser;
        let parses = 0,
            sanitizers = 0,
            policyCalls = 0;
        window.DOMParser = class extends NativeDOMParser {
            parseFromString(...args) {
                // Count each underlying browser parse
                parses++;
                return super.parseFromString(...args);
            }
        };
        const settings = {
            sanitize: async (fragment) => {
                // Mark each cloned fragment through an independent sanitizer call
                sanitizers++;
                fragment.firstElementChild?.setAttribute('data-sanitized', String(sanitizers));
                return fragment;
            },
            security: {},
        };
        // Render one instance through the shared clone-and-sanitize path
        const render = async (html) => {
            // Clone cached markup before applying the instance sanitizer
            return await applySanitizer(cloneParsedFragment(html, settings), settings, {});
        };
        // Render two identical instances before rotating the tiny LRU
        const first = await render('<p>alpha</p>'),
            second = await render('<p>alpha</p>');
        await render('<p>beta</p>');
        await render('<p>gamma</p>');
        await render('<p>alpha</p>');
        const trustedSettings = {
            sanitize: settings.sanitize,
            security: {
                trustedTypesPolicy: {
                    createHTML(value) {
                        // Count custom policy use while bypassing parsed-fragment reuse
                        policyCalls++;
                        return value;
                    },
                },
            },
        };
        cloneParsedFragment('<p>trusted</p>', trustedSettings);
        cloneParsedFragment('<p>trusted</p>', trustedSettings);
        window.DOMParser = NativeDOMParser;
        return {
            parses,
            sanitizers,
            policyCalls,
            isolated:
                first !== second &&
                first.firstElementChild !== second.firstElementChild &&
                first.firstElementChild?.getAttribute('data-sanitized') === '1' &&
                second.firstElementChild?.getAttribute('data-sanitized') === '2',
        };
    }, `${baseUrl}/src/runtime/rendering.js`);
    expect(result).toEqual({
        parses: 6,
        sanitizers: 5,
        policyCalls: 2,
        isolated: true,
    });
});

test('Trusted Types enforcement produces the typed error and accepts a configured policy', async ({
    page,
    browserName,
}) => {
    // Exercise the test scenario
    test.skip(browserName !== 'chromium', 'Trusted Types enforcement is a Chromium platform feature.');
    await page.goto(`${baseUrl}/trusted-types`);
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.trustedTypesResult,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.trustedTypesResult,
        ),
    ).toEqual({
        code: 'ACL_TRUSTED_TYPES_REQUIRED',
        accepted: 'trusted policy accepted',
    });
});

test('structured observability is ordered, bounded, redacted, measurable, and unsubscribe-safe', async ({ page }) => {
    // Exercise the test scenario
    await prepareStubPage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
            import Loader from '${baseUrl}/src/index.js';
            const received = [];
            Loader.config({ observability: { bufferSize: 2, logger: false, performanceMarks: true } });
            await Loader.define('observability-probe', document.createElement('template'));
            const unsubscribe = Loader.subscribe(record => received.push(record));
            await new Promise(resolve => setTimeout(resolve, 0));
            Loader._dispatchRuntimeEvent('fetchstart', { requestId: 'request-1', source: '/api/items?token=secret', headers: { authorization: 'secret' } });
            Loader._dispatchRuntimeEvent('fetchend', { requestId: 'request-1', duration: 12, status: 200, payload: { private: true } });
            unsubscribe();
            Loader._dispatchRuntimeEvent('cachehit', { source: '/api/items?password=secret' });
            window.observabilityResult = {
                received: received.map(record => record.sequence),
                metrics: Loader.getMetrics(),
                measures: performance.getEntriesByName('acl:request-1').length,
            };
            Loader.clearMetrics();
            window.observabilityCleared = Loader.getMetrics();
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.observabilityResult,
    );
    const result = await page.evaluate(
        // Read the browser state
        () => window.observabilityResult,
    );
    expect(result.received).toEqual([1, 2]);
    expect(result.metrics.recent).toHaveLength(2);
    expect(result.metrics.recent[0].detail.payload).toBe('[redacted]');
    expect(result.metrics.recent[1].detail.source).toContain('?[redacted]');
    expect(result.metrics.totals).toEqual({
        fetchstart: 1,
        fetchend: 1,
        cachehit: 1,
    });
    expect(result.metrics.durations.fetchend.average).toBe(12);
    expect(result.measures).toBe(1);
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.observabilityCleared.recent,
        ),
    ).toEqual([]);
});

test('adaptive prefetch expands groups, handles focus and dynamic targets, skips constrained networks, and disconnects', async ({
    page,
}) => {
    // Exercise the test scenario
    await prepareStubPage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
            import Loader from '${baseUrl}/src/index.js';
            import RuntimeLoader from '${baseUrl}/src/runtime/loader.js';
            const template = document.createElement('template'); template.innerHTML = '<p>prefetched</p>';
            await Promise.all([
                Loader.define('prefetch-alpha', template),
                Loader.define('prefetch-beta', template),
            ]);
            await Loader.start();
            RuntimeLoader._manifestGroups.set('cards', ['prefetch-alpha', 'prefetch-beta']);
            const calls = [], skips = [];
            const original = RuntimeLoader.prefetchGraph;
            RuntimeLoader.prefetchGraph = async (tags, options) => {
                calls.push({ tags, options });
                return Object.fromEntries(tags.map(tag => [tag, { status: 'fulfilled', value: '<p>ok</p>' }]));
            };
            document.addEventListener('acl:prefetchskip', event => skips.push(event.detail));
            const controller = await Loader.observePrefetch({ triggers: ['focus'], concurrency: 1 });
            const group = document.createElement('button'); group.setAttribute('data-acl-prefetch', 'cards');
            document.body.appendChild(group); group.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));
            const own = document.createElement('prefetch-alpha'); own.setAttribute('data-acl-prefetch', '');
            document.body.appendChild(own); own.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
            await controller.prefetch('prefetch-beta');
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
            controller.disconnect(); controller.disconnect();
            group.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));
            RuntimeLoader.prefetchGraph = original;
            window.prefetchResult = { calls, skips };
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.prefetchResult,
    );
    const result = await page.evaluate(
        // Read the browser state
        () => window.prefetchResult,
    );
    expect(result.calls).toEqual([
        {
            tags: ['prefetch-alpha', 'prefetch-beta'],
            options: { concurrency: 1 },
        },
    ]);
    expect(
        result.skips.some(
            // Check the current item
            (item) => item.reason === 'offline',
        ),
    ).toBe(true);
});

test('adaptive prefetch covers hover, viewport, idle, mutation, saver, unknown, and repeated observer paths', async ({
    page,
}) => {
    // Exercise the test scenario
    await prepareStubPage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
            import { createAdaptivePrefetchController } from '${baseUrl}/src/runtime/adaptive-prefetch.js';
            const calls = [], events = [], known = new Set(['hover-card', 'visible-card', 'idle-card', 'dynamic-card', 'own-card']);
            let intersection, mutation, idleCallback;
            class TestIntersectionObserver {
                constructor(callback, options) { this.callback = callback; this.options = options; this.targets = new Set(); this.disconnected = false; intersection = this; }
                observe(target) { this.targets.add(target); }
                unobserve(target) { this.targets.delete(target); }
                disconnect() { this.disconnected = true; this.targets.clear(); }
            }
            class TestMutationObserver {
                constructor(callback) { this.callback = callback; this.disconnected = false; mutation = this; }
                observe() {}
                disconnect() { this.disconnected = true; }
            }
            window.IntersectionObserver = TestIntersectionObserver;
            window.MutationObserver = TestMutationObserver;
            window.requestIdleCallback = callback => { idleCallback = callback; return 42; };
            window.cancelIdleCallback = id => events.push({ type: 'cancel-idle', id });
            const loader = {
                _manifestGroups: new Map([['bundle', ['hover-card', 'visible-card']]]),
                has: tag => known.has(tag),
                _dispatchRuntimeEvent: (type, detail) => events.push({ type, ...detail }),
                prefetchGraph: async (tags, options) => {
                    calls.push({ tags, concurrency: options.concurrency });
                    return Object.fromEntries(tags.map(tag => [tag, { status: 'fulfilled', value: tag }]));
                },
            };
            const root = document.createElement('section');
            const hover = document.createElement('button'); hover.dataset.aclPrefetch = 'hover-card';
            const visible = document.createElement('button'); visible.dataset.aclPrefetch = 'visible-card';
            const idle = document.createElement('button'); idle.dataset.aclPrefetch = 'idle-card';
            const own = document.createElement('own-card'); own.setAttribute('data-acl-prefetch', '');
            root.append(hover, visible, idle, own); document.body.appendChild(root);
            const controller = createAdaptivePrefetchController(loader, { root, triggers: ['hover', 'viewport', 'idle'], hoverDelay: 1, concurrency: 3, respectDataSaver: false });
            hover.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 5));
            intersection.callback([{ target: visible, isIntersecting: true }, { target: own, isIntersecting: false }]);
            await new Promise(resolve => setTimeout(resolve, 0));
            idleCallback(); await new Promise(resolve => setTimeout(resolve, 0));
            const dynamic = document.createElement('button'); dynamic.dataset.aclPrefetch = 'dynamic-card'; root.appendChild(dynamic);
            mutation.callback([{ addedNodes: [dynamic], removedNodes: [] }]);
            const removed = document.createElement('button'); removed.dataset.aclPrefetch = 'hover-card'; root.appendChild(removed);
            mutation.callback([{ addedNodes: [removed], removedNodes: [] }]);
            removed.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
            removed.remove();
            mutation.callback([{ addedNodes: [], removedNodes: [removed] }]);
            const removedReleased = !intersection.targets.has(removed);
            root.appendChild(removed);
            mutation.callback([{ addedNodes: [removed], removedNodes: [] }]);
            const reinsertedObserved = intersection.targets.has(removed);
            intersection.callback([{ target: dynamic, isIntersecting: true }]);
            await controller.prefetch('missing-card');
            Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, effectiveType: '4g' } });
            const saver = createAdaptivePrefetchController(loader, { root, triggers: [], respectDataSaver: true });
            await saver.prefetch('own-card'); saver.disconnect();
            Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: false, effectiveType: '2g' } });
            const constrained = createAdaptivePrefetchController(loader, { root, triggers: [], respectDataSaver: true });
            await constrained.prefetch('own-card'); constrained.disconnect();
            controller.disconnect(); controller.disconnect();
            window.adaptiveMatrix = { calls, events, intersectionDisconnected: intersection.disconnected, mutationDisconnected: mutation.disconnected, removedReleased, reinsertedObserved };
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.adaptiveMatrix,
    );
    const result = await page.evaluate(
        // Read the browser state
        () => window.adaptiveMatrix,
    );
    expect(
        result.calls.flatMap(
            // Expand the current item
            (call) => call.tags,
        ),
    ).toEqual(expect.arrayContaining(['hover-card', 'visible-card', 'idle-card', 'own-card', 'dynamic-card']));
    expect(
        result.calls.every(
            // Check every item
            (call) => call.concurrency === 3,
        ),
    ).toBe(true);
    expect(
        result.events.some(
            // Check the current item
            (item) => item.reason === 'unknown-target',
        ),
    ).toBe(true);
    expect(
        result.events.some(
            // Check the current item
            (item) => item.reason === 'save-data',
        ),
    ).toBe(true);
    expect(
        result.events.some(
            // Check the current item
            (item) => item.reason === 'constrained-network',
        ),
    ).toBe(true);
    expect(result.intersectionDisconnected).toBe(true);
    expect(result.mutationDisconnected).toBe(true);
    expect(result.removedReleased).toBe(true);
    expect(result.reinsertedObserved).toBe(true);
});

test('public testing utilities mount, update, record, abort mock fetches, and clean up idempotently', async ({
    page,
}) => {
    // Exercise the test scenario
    await page.goto(`${baseUrl}/blank`);
    await page.addScriptTag({ url: `${baseUrl}/node_modules/alpinejs-315/dist/cdn.min.js` });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.Alpine,
    );
    await page.addScriptTag({
        type: 'module',
        content: `
            import { installFetchMock, mountComponent, recordACLEvents } from '${baseUrl}/src/testing.js';
            const recorder = recordACLEvents(document);
            const handle = await mountComponent({
                template: '<div x-data="{ count: 1 }"><span data-label x-text="$el.parentElement.$props.label"></span><slot></slot></div>',
                options: { shadow: true, attributes: { label: String } },
                attributes: { label: 'first' }, slots: { default: '<b data-slot>slot</b>' },
            });
            await handle.update({ attributes: { label: 'second' } });
            const originalFetch = globalThis.fetch, mock = installFetchMock([{
                url: '${baseUrl}/mock-delay', method: 'GET', delay: 100, body: { ok: true },
            }]);
            const abort = new AbortController(), request = fetch('${baseUrl}/mock-delay', { signal: abort.signal }).catch(error => error.name);
            abort.abort('test cleanup');
            const abortName = await request;
            mock.restore(); mock.restore();
            const result = {
                tag: handle.element.localName,
                label: handle.element.getAttribute('label'),
                rendered: handle.element.shadowRoot.querySelector('[data-label]').textContent,
                slot: handle.element.querySelector('[data-slot]').textContent,
                events: recorder.records.map(event => event.type),
                abortName, requests: mock.requests.length,
                restored: globalThis.fetch === originalFetch,
            };
            await handle.unmount(); await handle.unmount(); recorder.stop(); recorder.stop();
            window.testingResult = { ...result, connected: handle.element.isConnected };
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.testingResult,
    );
    const result = await page.evaluate(
        // Read the browser state
        () => window.testingResult,
    );
    expect(result.tag).toMatch(/^acl-test-/);
    expect(result.label).toBe('second');
    expect(result.rendered).toBe('second');
    expect(result.slot).toBe('slot');
    expect(result.events).toContain('acl:loadend');
    expect(result).toMatchObject({
        abortName: 'AbortError',
        requests: 1,
        restored: true,
        connected: false,
    });
});

test('testing utilities support CSP Alpine, concurrent mounts, failed-mount cleanup, cancellation, and stopped waiters', async ({
    page,
}) => {
    // Exercise the test scenario
    await page.goto(`${baseUrl}/blank`);
    await page.addScriptTag({ url: `${baseUrl}/node_modules/@alpinejs/csp/dist/cdn.min.js` });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.Alpine,
    );
    await page.addScriptTag({
        type: 'module',
        content: `
            import { mountComponent, recordACLEvents, waitForComponent } from '${baseUrl}/src/testing.js';
            const [first, second] = await Promise.all([
                mountComponent({ template: '<p data-csp-one>one</p>' }),
                mountComponent({ template: '<p data-csp-two>two</p>' }),
            ]);
            const abort = new AbortController(); abort.abort('cancelled wait');
            const cancelled = await waitForComponent(document.createElement('div'), { signal: abort.signal }).catch(error => error.name);
            const beforeFailure = document.querySelectorAll('[data-acl-component]').length;
            const failed = await mountComponent({
                template: '<p>failed</p>', timeout: 30,
                options: { hooks: { mounted() { throw new Error('expected mount failure'); } } },
            }).then(() => false, () => true);
            const afterFailure = document.querySelectorAll('[data-acl-component]').length;
            const recorder = recordACLEvents(document, ['acl:never']);
            const stoppedWaiter = recorder.waitFor('acl:never', { timeout: 1000 }).catch(error => error.message);
            recorder.stop();
            const stopMessage = await stoppedWaiter;
            const tags = [first.element.localName, second.element.localName];
            await Promise.all([first.unmount(), second.unmount()]);
            window.testingCleanupMatrix = {
                tags, unique: tags[0] !== tags[1], csp: Boolean(window.Alpine), cancelled,
                failed, removedFailedHost: afterFailure === beforeFailure,
                stopped: stopMessage.includes('stopped'), remaining: document.querySelectorAll('[data-acl-component]').length,
            };
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.testingCleanupMatrix,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.testingCleanupMatrix,
        ),
    ).toMatchObject({
        unique: true,
        csp: true,
        cancelled: 'AbortError',
        failed: true,
        removedFailedHost: true,
        stopped: true,
        remaining: 0,
    });
});

test('reload-state helpers preserve keyed controls, focus, scroll, and public props', async ({ page }) => {
    // Exercise the test scenario
    await prepareStubPage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
            import { captureReloadState, restoreReloadDomState, restoreReloadProps } from '${baseUrl}/src/runtime/hmr.js';
            const host = document.createElement('section');
            host.innerHTML = '<div data-acl-preserve-key="scroll"><input id="named" value="before"><textarea name="notes">note</textarea><select><option>one</option><option selected>two</option></select></div>';
            document.body.appendChild(host);
            const scroller = host.firstElementChild, input = host.querySelector('input'), textarea = host.querySelector('textarea');
            Object.defineProperties(scroller, { scrollTop: { configurable: true, writable: true, value: 12 }, scrollLeft: { configurable: true, writable: true, value: 3 } });
            Object.defineProperties(host, { scrollTop: { configurable: true, writable: true, value: 8 }, scrollLeft: { configurable: true, writable: true, value: 2 } });
            input.focus(); input.setSelectionRange(1, 3);
            const snapshot = captureReloadState(host, host, { count: 2, nested: { ok: true }, $error: 'skip', helper() {} });
            host.innerHTML = '<div data-acl-preserve-key="scroll"><input id="named"><textarea name="notes"></textarea><select><option>one</option><option>two</option></select></div>';
            const props = { count: 0 }; restoreReloadProps(props, snapshot); restoreReloadDomState(host, host, snapshot);
            const restoredInput = host.querySelector('input');
            window.hmrHelperResult = {
                props, value: restoredInput.value, focus: document.activeElement === restoredInput,
                selection: [restoredInput.selectionStart, restoredInput.selectionEnd],
                textarea: host.querySelector('textarea').value,
                selected: host.querySelector('select').selectedIndex,
            };
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.hmrHelperResult,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.hmrHelperResult,
        ),
    ).toEqual({
        props: {
            count: 2,
            nested: { ok: true },
        },
        value: 'before',
        focus: true,
        selection: [1, 3],
        textarea: 'note',
        selected: 1,
    });
});

test('asset descriptors normalize, deduplicate, discover, and apply browser metadata', async ({ page }) => {
    // Exercise the test scenario
    await prepareStubPage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
            import * as assets from '${baseUrl}/src/runtime/assets.js';
            const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/theme.css'; document.head.appendChild(link);
            const script = document.createElement('script'); script.src = '/entry.js'; document.head.appendChild(script);
            const descriptor = { url: '/module.js', nonce: 'nonce', crossOrigin: 'anonymous', referrerPolicy: 'no-referrer', integrity: 'sha256-test', type: 'module' };
            const target = document.createElement('script'); assets.applyAssetDescriptor(target, descriptor);
            const styleTarget = document.createElement('link'); assets.applyAssetDescriptor(styleTarget, { media: 'print' });
            window.assetHelperResult = {
                style: assets.hasExternalStyle('/theme.css'), script: assets.hasExternalScript('/entry.js'),
                invalid: assets.normalizeAssetUrl('https://['),
                normalized: assets.normalizeAssetList(['/a.css', '/a.css', { href: '/b.css', timeout: -1, media: 'print' }, null], 'style'),
                target: { nonce: target.nonce, crossOrigin: target.crossOrigin, referrerPolicy: target.referrerPolicy, integrity: target.integrity, type: target.type },
                media: styleTarget.media,
            };
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.assetHelperResult,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.assetHelperResult,
        ),
    ).toMatchObject({
        style: true,
        script: true,
        invalid: 'https://[',
        media: 'print',
        normalized: [
            {
                url: '/a.css',
                timeout: 30000,
            },
            {
                href: '/b.css',
                timeout: 0,
                media: 'print',
                url: '/b.css',
            },
        ],
        target: {
            nonce: 'nonce',
            crossOrigin: 'anonymous',
            referrerPolicy: 'no-referrer',
            integrity: 'sha256-test',
            type: 'module',
        },
    });
});

test('offline helpers expose unsupported and registered service-worker state', async ({ page }) => {
    // Exercise the test scenario
    await prepareStubPage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
            import { getOfflineStatus, registerOfflineWorker } from '${baseUrl}/src/offline.js';
            const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'serviceWorker');
            Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
            const unsupported = await getOfflineStatus();
            let unavailable = ''; try { await registerOfflineWorker(); } catch (error) { unavailable = error.message; }
            const listeners = {}, registration = { scope: '${baseUrl}/scope/', active: { state: 'activated' }, waiting: null, installing: { state: 'installing' }, addEventListener(type, listener) { listeners[type] = listener; } };
            Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
                controller: {}, register: async () => registration, getRegistrations: async () => [registration],
            } });
            const events = []; window.addEventListener('acl:offline-registered', event => events.push(event.type)); window.addEventListener('acl:offline-updatefound', event => events.push(event.type));
            await registerOfflineWorker('/worker.js', { scope: '/scope/' }); listeners.updatefound();
            const supported = await getOfflineStatus();
            if (original) Object.defineProperty(Navigator.prototype, 'serviceWorker', original);
            window.offlineHelperResult = { unsupported, unavailable, supported, events };
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.offlineHelperResult,
    );
    const result = await page.evaluate(
        // Read the browser state
        () => window.offlineHelperResult,
    );
    expect(result.unsupported).toEqual({
        supported: false,
        controlled: false,
        registrations: [],
    });
    expect(result.unavailable).toContain('not available');
    expect(result.supported).toMatchObject({
        supported: true,
        controlled: true,
        registrations: [
            {
                active: 'activated',
                waiting: null,
                installing: 'installing',
            },
        ],
    });
    expect(result.events).toEqual(['acl:offline-registered', 'acl:offline-updatefound']);
});

test('facade diagnostics and cache APIs cover validation, discovery, and eviction boundaries', async ({ page }) => {
    // Exercise the test scenario
    await prepareStubPage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
            import Loader from '${baseUrl}/src/index.js';
            import RuntimeLoader from '${baseUrl}/src/runtime/loader.js';
            import { dataFetchCache } from '${baseUrl}/src/runtime/fetch-cache.js';
            import { createTemplateCacheResponse, getTemplateCacheRequestKey } from '${baseUrl}/src/runtime/template-cache.js';
            const errors = [];
            for (const options of [null, [], { templateCacheStrategy: 'invalid' }, { loading: 'later' }, { persistDebounce: -1 }, { keepAliveMax: -1 }]) {
                try { Loader.config(options); } catch (error) { errors.push(error.message); }
            }
            Loader.config({ cacheNamespace: 'Modern Tests', _templateCacheVersion: '1.1.0', observability: false });
            const inline = document.createElement('template'); inline.innerHTML = '<p>inline</p>';
            await Loader.define('cache-api-card', inline, { attributes: { count: Number } });
            const badTemplate = document.createElement('template'); badTemplate.setAttribute('acl-component', 'bad-props-card'); badTemplate.setAttribute('acl-props', '{bad}'); badTemplate.innerHTML = '<p>bad props fallback</p>';
            document.body.appendChild(badTemplate); await Loader.registerTemplates(badTemplate);
            const dependency = document.createElement('template'); dependency.innerHTML = '<p>dependency</p>';
            await Loader.define('dependency-card', dependency); RuntimeLoader._manifestDependencies.set('cache-api-card', ['dependency-card']);
            await Loader.start();
            let invalidSource = '', invalidConfig = '';
            try { await Loader.define('empty-source-card', ''); } catch (error) { invalidSource = error.message; }
            try { await Loader.define('bad-config-card', inline, []); } catch (error) { invalidConfig = error.message; }
            const definitions = { has: Loader.has('CACHE-API-CARD'), missing: Loader.getDefinition('missing-card'), tags: Loader.getRegisteredTags(), direct: Loader.getDependencies('cache-api-card'), transitive: Loader.getDependencies('cache-api-card', { transitive: true }) };
            const missingSelector = await Loader.loadTemplate('#missing-template').catch(error => error.message);
            const wrong = document.createElement('div'); wrong.id = 'wrong-template'; document.body.appendChild(wrong);
            const wrongSelector = await Loader.loadTemplate('#wrong-template').catch(error => error.message);
            const inlineResult = await Loader.loadTemplate(inline);
            const unknownPrefetch = await Loader.prefetch('missing-card');

            const cache = await caches.open(Loader.globalConfig._templateCacheKey), source = '/cached-modern.html',
                request = getTemplateCacheRequestKey(source, 'one');
            await cache.put(request, createTemplateCacheResponse('<p>cached</p>', null, { source, revision: 'one', ttl: 60_000 }));
            const info = await Loader.getTemplateCacheInfo(source), allInfo = await Loader.getTemplateCacheInfo(), cleared = await Loader.clearTemplate(source), afterClear = await Loader.getTemplateCacheInfo(source);
            const controller = new AbortController(), detached = { cacheKey: 'detached', finalUrl: '/detached', subscribers: 0, settled: false, controller, invalidated: false };
            const activeController = new AbortController(), active = { finalUrl: '/active', subscribers: 1, settled: false, controller: activeController, invalidated: false };
            const cacheCard = document.createElement('cache-api-card'); await cacheCard._ensureDataRuntime();
            dataFetchCache.set('active-key', active); RuntimeLoader._detachedDataEntries.add(detached);
            const activeInfo = Loader.getDataCacheInfo('/active'), clearedActive = Loader.clearDataCache('/active'), clearedDetached = Loader.clearDataCache('detached'), missingData = Loader.getDataCacheInfo('missing');
            Loader.clearDataCache();
            window.facadeBoundaryResult = {
                errors: errors.length, namespace: Loader.globalConfig.cacheNamespace, invalidSource, invalidConfig,
                definitionCount: definitions.tags.length, has: definitions.has, missing: definitions.missing,
                direct: definitions.direct, transitive: definitions.transitive,
                missingSelector, wrongSelector, inlineText: inlineResult.textContent, unknownPrefetch,
                infoSource: info.source, allSize: allInfo.size, cleared, afterClear,
                activeInfo: activeInfo.finalUrl, clearedActive, clearedDetached, missingData,
                detachedAborted: controller.signal.aborted, activeAborted: activeController.signal.aborted,
            };
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.facadeBoundaryResult,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.facadeBoundaryResult,
        ),
    ).toMatchObject({
        errors: 6,
        namespace: 'modern-tests',
        invalidSource: expect.stringContaining('requires a non-empty source'),
        invalidConfig: expect.stringContaining('must be an object'),
        has: true,
        missing: null,
        direct: ['dependency-card'],
        transitive: ['dependency-card'],
        missingSelector: expect.stringContaining('not found'),
        wrongSelector: expect.stringContaining('not a <template>'),
        inlineText: 'inline',
        unknownPrefetch: undefined,
        infoSource: '/cached-modern.html',
        allSize: 1,
        cleared: true,
        afterClear: null,
        activeInfo: '/active',
        clearedActive: true,
        clearedDetached: true,
        missingData: null,
        detachedAborted: true,
        activeAborted: false,
    });
});

test('auto entry handles deferred boot, explicit disablement, configuration, and startup errors', async ({ page }) => {
    // Exercise the test scenario
    await prepareStubPage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
            const originalReadyState = Object.getOwnPropertyDescriptor(Document.prototype, 'readyState'), originalAdd = window.addEventListener;
            let deferred = null;
            try { Object.defineProperty(document, 'readyState', { configurable: true, value: 'loading' }); } catch {}
            window.addEventListener = function(type, listener, options) {
                if (type === 'DOMContentLoaded') deferred = listener;
                return originalAdd.call(this, type, listener, options);
            };
            window.AlpineComponentLoaderConfig = { autoStart: false, cacheNamespace: 'auto-test' };
            const auto = await import('${baseUrl}/src/auto.js?deferred');
            deferred?.(); await Promise.resolve();
            const disabled = auto.default.globalConfig.autoStart === false;
            auto.default.config({ autoStart: true, defaultComponentName: 'invalid' });
            await auto.startAutoLoader();
            auto.default.config({ defaultComponentName: 'acl-component', autoStart: true });
            await auto.startAutoLoader();
            auto.default.config({ autoStart: false });
            window.addEventListener = originalAdd;
            if (originalReadyState) Object.defineProperty(Document.prototype, 'readyState', originalReadyState);
            window.autoBoundaryResult = { disabled, namespace: auto.default.globalConfig.cacheNamespace, deferred: typeof deferred === 'function' };
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.autoBoundaryResult,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.autoBoundaryResult,
        ),
    ).toEqual({
        disabled: true,
        namespace: 'auto-test',
        deferred: true,
    });
});

test('component runtime loads shadow assets, executes opted-in scripts, reflects props, and isolates cleanup failures', async ({
    page,
}) => {
    // Exercise the test scenario
    await prepareStubPage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
            import Loader from '${baseUrl}/src/index.js';
            import RuntimeLoader from '${baseUrl}/src/runtime/loader.js';
            const reports = [], originalReport = RuntimeLoader._report; RuntimeLoader._report = (...args) => { reports.push(args[1]); return originalReport.apply(RuntimeLoader, args); };
            const template = document.createElement('template'); template.innerHTML = '<style>:host{color:green}</style><button data-action>asset</button><script>window.__modernInlineScript = (window.__modernInlineScript || 0) + 1;</script>';
            await Loader.define('asset-runtime-card', template, {
                shadow: true, sanitize: false, executeScripts: true,
                externalCss: [{ url: '${baseUrl}/assets/modern.css', timeout: 1000 }],
                externalScripts: [{ url: '${baseUrl}/assets/modern.js', timeout: 1000, type: 'text/javascript' }],
                attributes: {
                    enabled: { type: Boolean, reflect: true },
                    payload: { type: Object, reflect: true },
                    items: { type: Array, reflect: true },
                    label: { type: String, reflect: true },
                },
            });
            await Loader.start();
            const card = document.createElement('asset-runtime-card'); document.body.appendChild(card);
            await new Promise(resolve => card.addEventListener('loaded', resolve, { once: true }));
            card.enabled = true; card.enabled = false; card.payload = { ok: true }; card.items = [1, 2]; card.label = 'ready'; card.label = null;
            let emitted = null; card.addEventListener('custom-ready', event => { emitted = event.detail; }); card.$props.$emit('custom-ready', { ok: true });
            const removeCleanup = card._addCleanup(() => {}); removeCleanup(); card._addCleanup(null); card._addCleanup(() => { throw new Error('cleanup expected'); }); card._runCleanups();
            const firstStyle = card.shadowRoot.querySelector('link[rel="stylesheet"]');
            window.runtimeBranchResult = {
                external: window.__modernExternalScript, inline: window.__modernInlineScript,
                style: firstStyle?.href, emitted,
                enabled: card.hasAttribute('enabled'), payload: card.getAttribute('payload'), items: card.getAttribute('items'), label: card.hasAttribute('label'),
                cleanupReported: reports.some(message => message.includes('Cleanup failed')),
            };
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.runtimeBranchResult,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.runtimeBranchResult,
        ),
    ).toMatchObject({
        external: 1,
        inline: 1,
        style: `${baseUrl}/assets/modern.css`,
        emitted: { ok: true },
        enabled: false,
        payload: '{"ok":true}',
        items: '[1,2]',
        label: false,
        cleanupReported: true,
    });
});

test('component load failures render successful fallbacks and safe default error UI when fallback also fails', async ({
    page,
}) => {
    // Exercise the test scenario
    await prepareStubPage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
            import Loader from '${baseUrl}/src/index.js';
            await Promise.all([
                Loader.define('successful-fallback-card', '${baseUrl}/templates/missing-primary.html', { shadow: true, cacheTemplates: false, fallback: '${baseUrl}/templates/fallback-ok.html' }),
                Loader.define('failed-fallback-card', '${baseUrl}/templates/missing-secondary.html', { shadow: true, cacheTemplates: false, fallback: '${baseUrl}/templates/missing-fallback.html' }),
            ]);
            await Loader.start();
            const success = document.createElement('successful-fallback-card'), failed = document.createElement('failed-fallback-card');
            const events = [];
            for (const element of [success, failed]) element.addEventListener('acl:loadend', event => events.push({ tag: element.localName, fallback: event.detail.fallback }));
            document.body.append(success, failed);
            await Promise.all([
                new Promise(resolve => success.addEventListener('loaded', resolve, { once: true })),
                new Promise(resolve => failed.addEventListener('acl:loadend', resolve, { once: true })),
            ]);
            window.fallbackBranchResult = {
                success: success.shadowRoot.querySelector('[data-fallback-ok]')?.textContent,
                successState: success._state, failedState: failed._state,
                alert: failed.shadowRoot.querySelector('[role="alert"]')?.textContent,
                events,
            };
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.fallbackBranchResult,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.fallbackBranchResult,
        ),
    ).toMatchObject({
        success: 'Safe fallback',
        successState: 'ready',
        failedState: 'idle',
        alert: expect.stringContaining('Fallback also failed'),
        events: expect.arrayContaining([
            {
                tag: 'successful-fallback-card',
                fallback: true,
            },
            {
                tag: 'failed-fallback-card',
                fallback: false,
            },
        ]),
    });
});

test('component helper matrix covers prop defaults, validation, fetch options, response modes, and cache settings', async ({
    page,
}) => {
    // Exercise the test scenario
    await prepareStubPage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
            import Loader from '${baseUrl}/src/index.js';
            try {
            const template = document.createElement('template'); template.innerHTML = '<p>helpers</p>';
            await Loader.define('helper-matrix-card', template, {
                strictProps: false,
                attributes: {
                    defaulted: { type: String, default() { return 'default-value'; } },
                    required: { type: String, required: true }, nullable: { type: String, nullable: true },
                    coerced: { type: String, coerce: value => value.toUpperCase() }, enabled: Boolean,
                    amount: Number, object: Object, items: Array,
                    optioned: { type: String, options: ['one', 'two'], default: 'one' },
                    optionNoDefault: { type: String, options: ['yes'] },
                    shaped: { type: Object, schema: { id: Number }, default: { id: 1 } },
                    shapedNoDefault: { type: Object, schema: { id: Number } },
                    validated: { type: Number, validator: value => value > 0, default: 1 },
                    validatedNoDefault: { type: Number, validator: value => value > 0 },
                },
                data: {
                    method: 'POST', body: { value: 1 }, responseType: 'auto', cacheStrategy: 'cache-first',
                    params: context => ({ from: context.el.localName }), keys: { id: 'a b' }, target: 'result',
                    options: { headers: { 'x-base': 'yes' } },
                },
                hooks: { beforeFetch(options) { return { ...options, headers: { ...options.headers, 'x-hook': 'yes' } }; } },
            });
            await Loader.start();
            const card = document.createElement('helper-matrix-card');
            await card._ensureDataRuntime();
            card._updateProp('data-src', '/ignored');
            card._updateProp('defaulted', null); card._updateProp('required', null); card._updateProp('nullable', null);
            card._updateProp('nullable', 'null'); card._updateProp('coerced', 'upper'); card._updateProp('enabled', 'false');
            card._updateProp('amount', 'not-a-number'); card._updateProp('object', '{bad}'); card._updateProp('object', '[]');
            card._updateProp('items', ''); card._updateProp('items', '{}');
            card._updateProp('optioned', 'three'); card._updateProp('optionNoDefault', 'no');
            card._updateProp('shaped', '{"id":"bad"}'); card._updateProp('shapedNoDefault', '{"id":"bad"}');
            card._updateProp('validated', '-1'); card._updateProp('validatedNoDefault', '-1');
            card.setAttribute('data-fetch-params', 'not-json');
            const invalidFetchValue = await card._resolveFetchValue('data-fetch-params', null);
            card.setAttribute('data-fetch-params', '{"page":2}');
            const dataUrl = await card._resolveDataUrl('${baseUrl}/api/:id');
            const post = await card._buildDataFetchOptions();
            card.setAttribute('data-method', 'GET'); const get = await card._buildDataFetchOptions();
            const parsed = {};
            card.setAttribute('data-response-type', 'auto');
            parsed.json = await card._parseDataResponse(new Response('{"ok":true}', { headers: { 'content-type': 'application/problem+json' } }));
            parsed.text = await card._parseDataResponse(new Response('hello', { headers: { 'content-type': 'text/plain' } }));
            parsed.blob = (await card._parseDataResponse(new Response('bytes', { headers: { 'content-type': 'application/octet-stream' } }))).size;
            card.setAttribute('data-response-type', 'arrayBuffer'); parsed.buffer = (await card._parseDataResponse(new Response('abc'))).byteLength;
            card.setAttribute('data-response-type', 'stream'); parsed.stream = Boolean(await card._parseDataResponse(new Response('stream')));
            card.setAttribute('data-response-type', 'json'); parsed.invalidJson = await card._parseDataResponse(new Response('no', { headers: { 'content-type': 'text/plain' } })).catch(error => error.code);
            card.setAttribute('data-cache-strategy', 'invalid'); const cacheDefault = card._getDataCacheStrategy(); const noStore = card._getDataCacheStrategy(true);
            card._setFetchedData('$data', { root: true }); card._setFetchedData('result', 2); card._clearFetchedData('$data'); card._clearFetchedData('result');
            window.helperMatrixResult = {
                props: {
                    defaulted: card.$props.defaulted, required: card.$props.required, nullable: card.$props.nullable,
                    coerced: card.$props.coerced, enabled: card.$props.enabled, amount: card.$props.amount,
                    object: card.$props.object, items: card.$props.items, optioned: card.$props.optioned,
                    optionNoDefault: card.$props.optionNoDefault, shaped: card.$props.shaped,
                    shapedNoDefault: card.$props.shapedNoDefault, validated: card.$props.validated,
                    validatedNoDefault: card.$props.validatedNoDefault,
                }, invalidFetchValue, dataUrl, post, getHasBody: 'body' in get, parsed, cacheDefault, noStore,
                target: card._getDataTarget(), timeout: card._getDataFetchTimeout(), responseFallback: (card.setAttribute('data-response-type', 'bad'), card._getDataResponseType()),
            };
            } catch (error) { window.helperMatrixError = error.stack || error.message; }
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.helperMatrixResult || window.helperMatrixError,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.helperMatrixError,
        ),
    ).toBeUndefined();
    const result = await page.evaluate(
        // Read the browser state
        () => window.helperMatrixResult,
    );
    expect(result.props).toMatchObject({
        defaulted: 'default-value',
        required: '',
        nullable: null,
        coerced: 'UPPER',
        enabled: false,
        amount: 0,
        object: {},
        items: [],
        optioned: 'one',
        optionNoDefault: '',
        shaped: { id: 1 },
        shapedNoDefault: {},
        validated: 1,
        validatedNoDefault: 0,
    });
    expect(result.invalidFetchValue).toEqual({});
    expect(result.dataUrl).toContain('/api/a%20b?page=2&from=helper-matrix-card');
    expect(result.post).toMatchObject({
        method: 'POST',
        body: '{"value":1}',
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-base': 'yes',
            'x-hook': 'yes',
        },
    });
    expect(result.getHasBody).toBe(false);
    expect(result.parsed).toMatchObject({
        json: { ok: true },
        text: 'hello',
        blob: 5,
        buffer: 3,
        stream: true,
        invalidJson: 'ACL_INVALID_RESPONSE',
    });
    expect(result).toMatchObject({
        cacheDefault: 'cache-first',
        noStore: 'no-store',
        target: 'result',
        timeout: 30000,
        responseFallback: 'json',
    });
});

test('matching SSR markup hydrates without a template request and mismatch preserves content until fallback rendering', async ({
    page,
}) => {
    // Exercise the test scenario
    requestCounts.set('/templates/hydrate.html', 0);
    requestCounts.set('/api/hydrate', 0);
    await page.goto(`${baseUrl}/blank`);
    await page.addScriptTag({ url: `${baseUrl}/node_modules/alpinejs-315/dist/cdn.min.js` });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.Alpine,
    );
    await page.addScriptTag({
        type: 'module',
        content: `
            import Loader from '${baseUrl}/src/index.js';
            import { waitForComponent } from '${baseUrl}/src/testing.js';
            document.body.insertAdjacentHTML('beforeend', \`
                <hydrated-modern-card count="3" data-src="${baseUrl}/api/hydrate" data-acl-ssr="1" data-acl-revision="revision-1">
                    <template data-acl-ssr-shadow shadowrootmode="open" shadowrootserializable>
                        <button data-server-template x-data="{ open: false }" @click="open = !open"><span data-state x-text="open ? 'Open' : 'Closed'"></span><slot name="action"></slot></button>
                    </template><b slot="action">Action</b>
                </hydrated-modern-card>
                <light-hydrated-modern-card data-src="${baseUrl}/api/hydrate" data-acl-ssr="1" data-acl-revision="light-1">
                    <article data-light-server x-data><span data-light-data x-text="$props.$data.source"></span></article>
                    <script type="application/json" data-acl-ssr-data>{"source":"server data"}</script>
                </light-hydrated-modern-card>
                <mismatch-modern-card data-acl-ssr="1" data-acl-revision="old"><template data-acl-ssr-shadow shadowrootmode="open"><p data-stale>Server stays visible</p></template></mismatch-modern-card>\`);
            await Loader.define('hydrated-modern-card', '${baseUrl}/templates/hydrate.html', {
                shadow: true, templateRevision: 'revision-1', attributes: { count: Number }, data: { target: 'payload' },
            });
            await Loader.define('light-hydrated-modern-card', '${baseUrl}/templates/hydrate.html', {
                shadow: false, templateRevision: 'light-1',
            });
            await Loader.define('mismatch-modern-card', '${baseUrl}/templates/hydrate.html', { shadow: true, templateRevision: 'revision-2' });
            const hydrated = document.querySelector('hydrated-modern-card'),
                light = document.querySelector('light-hydrated-modern-card'),
                mismatch = document.querySelector('mismatch-modern-card');
            await Loader.start();
            const visibleDuringFallback = mismatch.shadowRoot?.querySelector('[data-stale]')?.textContent;
            await Promise.all([waitForComponent(hydrated), waitForComponent(light), waitForComponent(mismatch)]);
            hydrated.shadowRoot.querySelector('button').click(); await Alpine.nextTick();
            window.hydrationResult = {
                hydrated: hydrated.hasAttribute('data-acl-hydrated'),
                serverTemplate: Boolean(hydrated.shadowRoot.querySelector('[data-server-template]')),
                clientTemplate: Boolean(hydrated.shadowRoot.querySelector('[data-client-template]')),
                state: hydrated.shadowRoot.querySelector('[data-state]').textContent,
                slot: hydrated.shadowRoot.querySelector('slot').assignedElements()[0]?.textContent,
                prop: hydrated.$props.count,
                data: hydrated.$props.payload,
                lightHydrated: light.hasAttribute('data-acl-hydrated'),
                lightServer: Boolean(light.querySelector('[data-light-server]')),
                lightData: light.querySelector('[data-light-data]').textContent,
                lightDataScript: Boolean(light.querySelector('[data-acl-ssr-data]')),
                visibleDuringFallback,
                mismatchClient: Boolean(mismatch.shadowRoot.querySelector('[data-client-template]')),
            };
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.hydrationResult,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.hydrationResult,
        ),
    ).toMatchObject({
        hydrated: true,
        serverTemplate: true,
        clientTemplate: false,
        state: 'Open',
        slot: 'Action',
        prop: 3,
        data: { source: 'client data' },
        lightHydrated: true,
        lightServer: true,
        lightData: 'server data',
        lightDataScript: false,
        visibleDuringFallback: 'Server stays visible',
        mismatchClient: true,
    });
    expect(requestCounts.get('/templates/hydrate.html')).toBe(1);
    expect(requestCounts.get('/api/hydrate')).toBe(1);
});
