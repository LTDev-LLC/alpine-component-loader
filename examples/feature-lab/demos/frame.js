// Load implementations only after a visitor selects an experiment
const query = new URLSearchParams(location.search || location.hash.slice(1)),
    runtime = new URL(query.get('runtime') || '/dist/index.min.js', location.href),
    coreUrl = new URL('core.min.js', runtime),
    demo = query.get('demo') || 'core',
    controls = document.querySelector('#controls'),
    fixture = document.querySelector('#fixture'),
    status = document.querySelector('#status'),
    report = document.querySelector('#report'),
    nativeFetch = window.fetch.bind(window),
    owners = new Set();
let sequence = 0;

// Reload the isolated realm while keeping offline selections out of the network URL
const restart = (options) => {
    const params = new URLSearchParams(query);
    // Preserve the selected runtime and experiment across the fresh document
    for (const [name, value] of Object.entries(options)) params.set(name, value);
    if (location.search) {
        const url = new URL(location.href);
        url.search = params.toString();
        location.replace(url);
    } else {
        location.hash = params.toString();
        location.reload();
    }
};

// Show diagnostic module bodies separately from HTML, Alpine, and browser overhead
const modules = () =>
    performance.getEntriesByType('resource').filter((entry) => /\/(?:dist|modules)\/.*\.js/.test(entry.name));
// Keep every diagnostic assertion available without exposing private component fields
const show = (value) => {
    report.textContent = JSON.stringify(
        {
            ...value,
            moduleRequests: modules().length,
            modules: modules().map((entry) => new URL(entry.name).pathname),
        },
        null,
        2,
    );
    window.demoResult = value;
};
// Surface operation failures accessibly and allow another click to retry
const button = (label, run) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.addEventListener('click', async () => {
        // Prevent duplicate work while preserving cancellation controls on other buttons
        element.disabled = true;
        status.textContent = 'Working…';
        // Surface errors without creating an unhandled rejection
        try {
            await run();
            status.textContent = 'Operation completed';
        } catch (error) {
            status.textContent = error.code || error.message;
            show({ error: error.code || error.message });
        } finally {
            element.disabled = false;
        }
    });
    controls.append(element);
};
// Allow a fixture callback to cooperate with cancellation
const delay = (ms, signal) =>
    new Promise((resolve, reject) => {
        const finish = () => {
                // Release the listener before completing the fixture
                signal?.removeEventListener('abort', abort);
                resolve();
            },
            timer = setTimeout(finish, ms),
            abort = () => {
                // Cancel only this controlled fixture subscription
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                reject(signal.reason || new DOMException('Canceled', 'AbortError'));
            };
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
    });
// Load pinned Alpine after platform repairs, from the precached URL used by static examples
const loadAlpine = () =>
    new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = location.pathname.startsWith('/__acl_hmr/')
            ? '/__acl_hmr/alpine.js'
            : 'https://cdn.jsdelivr.net/npm/alpinejs@3.17.4/dist/cdn.min.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Alpine could not load'));
        document.head.append(script);
    });
// Create a loader owner with independent configuration and deterministic teardown
const owner = async (config = {}) => {
    const { createLoader, default: defaultLoader } = await import(runtime.href),
        loader = createLoader
            ? createLoader({
                  config: {
                      autoStart: false,
                      cacheTemplates: false,
                      ...config,
                  },
              })
            : defaultLoader;
    if (!createLoader)
        loader.config({
            autoStart: false,
            cacheTemplates: false,
            ...config,
        });
    await loader.ready;
    owners.add(loader);
    return loader;
};
// Await public completion before reporting any component as ready
const mount = async (loader, options, content = '') => {
    const tag = 'capability-demo-' + ++sequence;
    await loader.define(tag, options);
    await loader.start();
    const host = document.createElement(tag),
        ready = new Promise((resolve, reject) => {
            // Register listeners before the host connects
            host.addEventListener('loaded', resolve, { once: true });
            // Handle the lifecycle event and release owned work
            host.addEventListener('acl:error', (event) => reject(event.detail.error), { once: true });
        });
    host.innerHTML = content;
    fixture.append(host);
    await ready;
    return host;
};
// Remove rendered hosts after the owning loader has released asynchronous work
const dispose = async () => {
    // Release every isolated owner even if a different one has already been disposed
    for (const loader of owners) await loader.dispose({ clearPersistentCaches: false });
    owners.clear();
    fixture.replaceChildren();
};
window.addEventListener(
    'pagehide',
    // Complete the current demonstration operation
    () => {
        void dispose();
    },
    { once: true },
);

// Observe only ACL-owned environmental resources, keeping this instrumentation inside the demo realm
const trackEnvironment = () => {
    const Original = window.IntersectionObserver,
        observers = new Set(),
        subscriptions = new Map();
    window.IntersectionObserver = class extends Original {
        constructor(callback, options) {
            // Retain the real browser's intersection behavior
            super(callback, options);
        }

        observe(target) {
            // Count observers that own at least one target
            observers.add(this);
            (subscriptions.get(this) || subscriptions.set(this, new Set()).get(this)).add(target);
            super.observe(target);
        }

        unobserve(target) {
            // Removing one target must preserve the other subscriptions
            subscriptions.get(this)?.delete(target);
            if (!subscriptions.get(this)?.size) observers.delete(this);
            super.unobserve(target);
        }

        disconnect() {
            // Release all targets of an idle observer
            subscriptions.delete(this);
            observers.delete(this);
            super.disconnect();
        }
    };
    const watched = new Map(),
        originals = [];
    // Track the event families owned by environmental pooling
    for (const [target, event] of [
        [document, 'visibilitychange'],
        [window, 'online'],
    ]) {
        const add = target.addEventListener,
            remove = target.removeEventListener,
            callbacks = new Set();
        watched.set(event, callbacks);
        target.addEventListener = function (type, callback, options) {
            // Preserve native listener behavior while counting the selected family
            if (type === event) callbacks.add(callback);
            return add.call(this, type, callback, options);
        };
        target.removeEventListener = function (type, callback, options) {
            // Count only matching environmental listener removals
            if (type === event) callbacks.delete(callback);
            return remove.call(this, type, callback, options);
        };
        originals.push(() => {
            // Restore the document surface after the experiment finishes
            target.addEventListener = add;
            target.removeEventListener = remove;
        });
    }
    return {
        counts: () => ({
            observers: observers.size,
            targets: [...subscriptions.values()].reduce((sum, values) => sum + values.size, 0),
            listeners: [...watched.values()].reduce((sum, values) => sum + values.size, 0),
        }),
        restore: () => {
            window.IntersectionObserver = Original;
            originals.forEach((restore) => restore());
        },
    };
};

const explanations = {
    core: [
        'Explicit core startup',
        'Core registers queued definitions without scanning the document. Discovery happens only when explicitly requested.',
    ],
    polyfills: [
        'Web Components readiness',
        'Native browsers skip vendor scripts. The fallback fixture forces ShadyDOM in this separate document before importing Alpine or ACL.',
    ],
    transformations: [
        'Capabilities loaded on demand',
        'Start with inline HTML, then activate styles, slots, scripts, data, or networking. The request list records actual first-use imports.',
    ],
    requests: [
        'Shared request cancellation',
        'Two independently cancellable consumers share one template transaction. Canceling the final owner aborts the fixture transport.',
    ],
    limits: [
        'Template timeout and size limits',
        'Controlled delayed and streamed bodies exercise the real template request layer. Defaults are 10 seconds and 1 MiB; limits can be explicitly disabled.',
    ],
    prefetch: [
        'Prefetch coordination',
        'Two overlapping batches share the loader-wide cap. A foreground request promotes queued work; cancellation releases speculative ownership.',
    ],
    scheduler: [
        'Cooperative initialization',
        'Compare readiness and animation frames with scheduling disabled or enabled. A single DOM operation cannot be preempted; these are diagnostic timings.',
    ],
    resources: [
        'Pooled resources and cleanup',
        'Matching deferred targets share one observer. Polling shares visibility/online listeners. Removing one target keeps the others subscribed.',
    ],
    loaders: [
        'Shared implementation, isolated state',
        'Two owners use separate tags and data caches. Disposal of one owner leaves the other operational while implementations are shared.',
    ],
    security: [
        'Nested template sanitization',
        'Inert templates are entered during sanitization. Repeated renders receive their own props and projected slot content.',
    ],
};

const [title, explanation] = explanations[demo] || explanations.core;
document.querySelector('#title').textContent = title;
document.querySelector('#explanation').textContent = explanation;

// Keep polyfill bootstrap before every application import
if (demo === 'polyfills') {
    const { loadPolyfills, waitForWebComponents } = await import(new URL('polyfills.min.js', runtime).href);
    // Complete the current demonstration operation
    button('Native detection', async () => {
        await loadPolyfills({ url: new URL('./vendor/webcomponents/webcomponents-loader.js', import.meta.url).href });
        await loadAlpine();
        await waitForWebComponents(async () => {
            // Return the full registration promise to an asynchronous upstream loader
            const { default: loader } = await import(runtime.href);
            owners.add(loader);
            await mount(loader, { template: '<p>Platform ready; component initialized</p>' });
        });
        show({
            native: !window.ShadyDOM?.inUse,
            ready: true,
            componentReady: true,
            upstreamScripts: [...document.scripts]
                // Select the values used by this demonstration
                .filter((script) => script.src.includes('/vendor/'))
                // Select the values used by this demonstration
                .map((script) => script.src),
        });
    });
    button('Fallback fixture', () => {
        // Force the upstream fallback only in a fresh, disposable realm
        restart({ fallback: '1' });
    });
    button('Failure then retry', async () => {
        // A forced fallback is needed to exercise transport failures on a native browser
        restart({
            fallback: '1',
            failure: '1',
        });
    });
    if (query.has('fallback')) {
        window.ShadyDOM = { force: true };
        // Exercise a missing URL once before retrying the pinned self-hosted suite
        try {
            if (query.has('failure'))
                await loadPolyfills({
                    url: new URL('./missing-loader.js', import.meta.url).href,
                    timeout: 1000,
                });
        } catch (error) {
            show({
                failed: error.code,
                retryable: error.retryable,
            });
        }
        await loadPolyfills({ url: new URL('./vendor/webcomponents/webcomponents-loader.js', import.meta.url).href });
        await loadAlpine();
        const { default: loader } = await import(runtime.href);
        owners.add(loader);
        await mount(loader, {
            template: '<p>Fallback ready</p>',
            shadow: true,
        });
        show({
            fallback: Boolean(window.ShadyDOM?.inUse),
            ready: true,
            componentReady: true,
            retried: query.has('failure'),
        });
        status.textContent = 'Fallback application ready';
    }
} else {
    await loadAlpine();
    // Configure only the experiment selected by the visitor
    if (demo === 'core') {
        const { default: loader } = await import(coreUrl.href);
        owners.add(loader);
        const template = document.createElement('template');
        template.setAttribute('x-acl', 'explicit-discovered-demo');
        template.innerHTML = '<p>Explicit discovery complete</p>';
        fixture.append(template);
        await loader.start();
        show({
            registered: loader.getRegisteredTags(),
            discovered: Boolean(customElements.get('explicit-discovered-demo')),
        });
        // Complete the current demonstration operation
        button('Register queued component', async () => {
            await mount(loader, { template: '<p>Explicitly registered and ready</p>' });
            show({
                registered: loader.getRegisteredTags(),
                discovered: Boolean(customElements.get('explicit-discovered-demo')),
            });
        });
        // Complete the current demonstration operation
        button('Discover templates explicitly', async () => {
            await loader.registerTemplates();
            const host = document.createElement('explicit-discovered-demo');
            fixture.append(host);
            show({ discovered: Boolean(customElements.get('explicit-discovered-demo')) });
        });
    } else if (demo === 'transformations') {
        const loader = await owner();
        await mount(loader, { template: '<p>Plain inline component</p>' });
        show({ activated: 'plain' });
        // Preserve transformation order while letting content activate each group
        for (const [name, options, content] of [
            ['styles', { template: '<style>p { color: rgb(37, 99, 235); }</style><p>Styled</p>' }, ''],
            ['slots', { template: '<slot><p>Fallback</p></slot>' }, '<p>Projected consumer content</p>'],
            [
                'scripts',
                {
                    template:
                        '<script>window.demoScriptOrder = (window.demoScriptOrder || []).concat(1);</script><script>window.demoScriptOrder.push(2);</script><p>Explicit script execution</p>',
                    sanitize: false,
                    executeScripts: true,
                },
                '',
            ],
            [
                'data',
                {
                    template: '<p>Data capability active</p>',
                    data: { src: '/demo-capability/data' },
                },
                '',
            ],
            ['networking', '/demo-capability/template', ''],
        ])
            // Complete the current demonstration operation
            button('Activate ' + name, async () => {
                // Complete the current demonstration operation
                window.fetch = (url, options) =>
                    String(url).includes('/demo-capability/')
                        ? Promise.resolve(
                              new Response(
                                  String(url).endsWith('/data') ? '{"value":"Fetched"}' : '<p>URL template</p>',
                                  {
                                      headers: {
                                          'content-type': String(url).endsWith('/data')
                                              ? 'application/json'
                                              : 'text/html',
                                      },
                                  },
                              ),
                          )
                        : nativeFetch(url, options);
                await mount(loader, options, content);
                show({
                    activated: name,
                    scriptOrder: window.demoScriptOrder,
                });
            });
    } else if (demo === 'requests') {
        const loader = await owner({ templateTimeout: 0 }),
            source = new URL('/demo-owned-template', location.href).href;
        let starts = 0,
            aborts = 0,
            first,
            second,
            pending;
        window.fetch = async (url, options) => {
            // Delay only the demo source and honor the shared transport signal
            if (String(url) !== source) return nativeFetch(url, options);
            starts++;
            options.signal.addEventListener(
                'abort',
                // Complete the current demonstration operation
                () => {
                    aborts++;
                },
                { once: true },
            );
            await delay(2500, options.signal);
            return new Response('<p>Shared complete response</p>');
        };
        // Complete the current demonstration operation
        button('Start two consumers', async () => {
            first = new AbortController();
            second = new AbortController();
            // Select the values used by this demonstration
            pending = [first, second].map((controller) =>
                loader.loadTemplate(source, {}, { signal: controller.signal }).then(
                    // Complete the current demonstration operation
                    () => 'fulfilled',
                    // Complete the current demonstration operation
                    (error) => error.code,
                ),
            );
            // Complete the current demonstration operation
            while (!starts) await delay(0);
            show({
                starts,
                aborts,
                activeConsumers: 2,
            });
        });
        // Complete the current demonstration operation
        button('Cancel first', async () => {
            first?.abort();
            await delay(0);
            show({
                starts,
                aborts,
                firstCanceled: true,
            });
        });
        // Complete the current demonstration operation
        button('Cancel final owner', async () => {
            second?.abort();
            const results = await Promise.all(pending || []);
            show({
                starts,
                aborts,
                results,
            });
        });
        // Complete the current demonstration operation
        button('Wait for completion', async () => {
            show({
                starts,
                aborts,
                results: await Promise.all(pending || []),
            });
        });
        // Complete the current demonstration operation
        button('Fresh retry', async () => {
            await loader.loadTemplate(source);
            show({
                starts,
                aborts,
                retried: true,
            });
        });
    } else if (demo === 'limits') {
        const loader = await owner(),
            source = new URL('/demo-limited-template', location.href).href;

        const timeout = document.createElement('input'),
            limit = document.createElement('input');
        timeout.type = limit.type = 'number';
        timeout.value = '100';
        limit.value = '64';
        timeout.setAttribute('aria-label', 'Template timeout in milliseconds, zero disables');
        limit.setAttribute('aria-label', 'Template byte limit');
        controls.append('Timeout ms ', timeout, ' Maximum bytes ', limit);
        // Exercise body consumption rather than only response headers
        for (const mode of ['delayed', 'streamed', 'misleading-header', 'retry'])
            // Complete the current demonstration operation
            button(mode, async () => {
                window.fetch = async (url, options) => {
                    // Keep module transport untouched while controlling this response body
                    if (String(url) !== source) return nativeFetch(url, options);
                    if (mode === 'delayed') await delay(500, options.signal);
                    if (mode === 'streamed' || mode === 'misleading-header')
                        return new Response(
                            new ReadableStream({
                                start(controller) {
                                    // Send enough actual bytes to exceed the configured small fixture limit
                                    controller.enqueue(new TextEncoder().encode('<p>' + 'x'.repeat(128) + '</p>'));
                                    controller.close();
                                },
                            }),
                            { headers: mode === 'misleading-header' ? { 'content-length': '1' } : {} },
                        );
                    return new Response('<p>Retry succeeds</p>');
                };
                const html = await loader.loadTemplate(source, {
                    templateTimeout: Number(timeout.value),
                    templateMaxBytes: Number(limit.value),
                });
                show({
                    mode,
                    html,
                    retrySucceeded: mode === 'retry',
                });
            });
        // Complete the current demonstration operation
        button('Explicit opt-outs', async () => {
            // Complete the current demonstration operation
            window.fetch = (url, options) =>
                String(url) === source
                    ? Promise.resolve(new Response('<p>No limits requested</p>'))
                    : nativeFetch(url, options);
            const html = await loader.loadTemplate(source, {
                templateTimeout: 0,
                templateMaxBytes: Infinity,
            });
            show({
                html,
                timeoutDisabled: true,
                byteLimitDisabled: true,
            });
        });
    } else if (demo === 'prefetch') {
        const loader = await owner({
            prefetchConcurrency: 4,
            templateTimeout: 0,
        });
        let active = 0,
            peak = 0,
            order = [],
            pending = [],
            controller;
        window.fetch = async (url, options) => {
            // Track total transport admission across both speculative batches
            if (!String(url).includes('/demo-prefetch/')) return nativeFetch(url, options);
            active++;
            peak = Math.max(peak, active);
            order.push(new URL(url).pathname);
            // Release transport accounting on both completion and cancellation
            try {
                await delay(600, options.signal);
                return new Response('<p>Prefetched</p>');
            } finally {
                active--;
            }
        };
        const sources = Array.from(
                { length: 10 },
                // Complete the current demonstration operation
                (_, index) => new URL('/demo-prefetch/' + index, location.href).href,
            ),
            // Select the values used by this demonstration
            tags = sources.map((source, index) => 'prefetch-demo-' + index);
        // Select the values used by this demonstration
        await Promise.all(tags.map((tag, index) => loader.define(tag, sources[index])));
        await loader.start();
        // Complete the current demonstration operation
        button('Start overlapping batches', async () => {
            controller = new AbortController();
            pending = [
                loader.prefetchAll(tags.slice(0, 7), {
                    concurrency: 4,
                    signal: controller.signal,
                }),
                loader.prefetchAll(tags.slice(4), {
                    concurrency: 4,
                    signal: controller.signal,
                }),
            ];
            // Settle feature activation and allow a clean retry
            pending.forEach((promise) => promise.catch(() => {}));
            await delay(100);
            show({
                active,
                peak,
                order,
                cap: 4,
            });
        });
        // Complete the current demonstration operation
        button('Request queued template now', async () => {
            await loader.loadTemplate(sources[9]);
            show({
                peak,
                order,
                foregroundCompleted: true,
                note: 'Foreground downloads bypass the speculative cap',
            });
        });
        // Complete the current demonstration operation
        button('Cancel speculative work', async () => {
            controller?.abort();
            await Promise.allSettled(pending);
            show({
                active,
                peak,
                order,
                canceled: true,
            });
        });
    } else if (demo === 'scheduler') {
        // Report animation frames alongside completion without imposing an absolute timing threshold
        for (const enabled of [false, true])
            // Complete the current demonstration operation
            button(enabled ? 'Mount 200 with scheduling' : 'Mount 200 directly', async () => {
                await dispose();
                const loader = await owner({
                        hydrationScheduler: enabled
                            ? {
                                  budgetMs: 8,
                                  maxTasksPerTurn: 4,
                              }
                            : false,
                    }),
                    started = performance.now();
                let frames = 0,
                    running = true;
                // Run tick for this example
                const tick = () => {
                    if (running) {
                        frames++;
                        requestAnimationFrame(tick);
                    }
                };
                requestAnimationFrame(tick);
                const tag = 'scheduled-demo-' + ++sequence;
                await loader.define(tag, { template: '<p>Cooperative initialization</p>' });
                await loader.start();
                const tasks = Array.from({ length: 200 }, () => {
                    // Wait for each host's actual initialization rather than registration
                    const host = document.createElement(tag),
                        ready = new Promise((resolve) => host.addEventListener('loaded', resolve, { once: true }));
                    fixture.append(host);
                    return ready;
                });
                await Promise.all(tasks);
                running = false;
                show({
                    scheduled: enabled,
                    readyComponents: tasks.length,
                    durationMs: performance.now() - started,
                    animationFrames: frames,
                });
            });
    } else if (demo === 'resources') {
        const tracker = trackEnvironment(),
            loader = await owner();
        let hosts = [];
        // Complete the current demonstration operation
        button('Mount 100 deferred targets', async () => {
            await loader.define('pooled-visible-demo', {
                template: '<p>Pooled target</p>',
                loading: 'lazy',
            });
            await loader.start();
            const region = document.createElement('div');
            region.style.marginTop = '2000px';
            // Complete the current demonstration operation
            hosts = Array.from({ length: 100 }, () => document.createElement('pooled-visible-demo'));
            region.append(...hosts);
            fixture.append(region);
            await delay(150);
            show(tracker.counts());
        });
        // Complete the current demonstration operation
        button('Remove one target', async () => {
            hosts.pop()?.remove();
            await delay(0);
            show(tracker.counts());
        });
        // Complete the current demonstration operation
        button('Activate two polling subscribers', async () => {
            // Complete the current demonstration operation
            window.fetch = (url, options) =>
                String(url).includes('/demo-poll')
                    ? Promise.resolve(new Response('{"value":1}', { headers: { 'content-type': 'application/json' } }))
                    : nativeFetch(url, options);
            await mount(loader, {
                template: '<p>Polling owner</p>',
                data: {
                    src: '/demo-poll',
                    poll: 1000,
                },
            });
            await mount(loader, {
                template: '<p>Second polling owner</p>',
                data: {
                    src: '/demo-poll',
                    poll: 1000,
                },
            });
            await delay(100);
            show(tracker.counts());
        });
        // Complete the current demonstration operation
        button('Dispose all', async () => {
            await dispose();
            await delay(50);
            show({
                ...tracker.counts(),
                disposed: true,
            });
            tracker.restore();
        });
    } else if (demo === 'loaders') {
        const first = await owner(),
            second = await owner();
        // Complete the current demonstration operation
        window.fetch = (url, options) =>
            String(url).includes('/demo-isolated-data')
                ? Promise.resolve(new Response('{"value":1}', { headers: { 'content-type': 'application/json' } }))
                : nativeFetch(url, options);
        await mount(first, {
            template: '<p>First loader</p>',
            data: { src: '/demo-isolated-data' },
        });
        const host = await mount(second, {
            template: '<p>Second loader</p>',
            data: { src: '/demo-isolated-data' },
        });
        show({
            independentConfiguration: first.globalConfig !== second.globalConfig,
            firstCache: first.getDataCacheSize(),
            secondCache: second.getDataCacheSize(),
        });
        // Complete the current demonstration operation
        button('Dispose first and reload second', async () => {
            await first.dispose({ clearPersistentCaches: false });
            await host.reload({
                clearData: false,
                clearTemplate: false,
            });
            show({
                firstDisposed: true,
                secondReady: true,
                secondCache: second.getDataCacheSize(),
                // Complete the current demonstration operation
                sharedImplementationUrls: modules().every((entry) => !entry.name.includes('acl-instance')),
            });
        });
    } else if (demo === 'preloads') {
        // Run data for this example
        const data = await nativeFetch(new URL('./preloads.json', import.meta.url)).then((response) => response.json());
        // Inspect generated selections without preloading unused implementations
        for (const name of Object.keys(data.variants))
            // Complete the current demonstration operation
            button('Inspect ' + name, () =>
                show({
                    selection: name,
                    ...data.variants[name],
                    manifest: data.manifest,
                }),
            );
        show({ instruction: 'Choose a manifest selection; generated hints do not initialize features' });
    } else if (demo === 'security') {
        const loader = await owner(),
            html =
                '<template><template><a href="javascript:alert(1)" onclick="alert(1)">Sanitized</a><script>window.demoUnsafe = true;</script></template></template><slot></slot>';

        const first = await mount(loader, { template: html }, '<p>First slot</p>'),
            second = await mount(loader, { template: html }, '<p>Second slot</p>');

        const inert = first.querySelector('template').content.querySelector('template').content;
        show({
            scriptsRemoved: !inert.querySelector('script'),
            unsafeUrlRemoved: !inert.querySelector('a').hasAttribute('href'),
            handlersRemoved: !inert.querySelector('a').hasAttribute('onclick'),
            first: first.textContent,
            second: second.textContent,
        });
    }
}
