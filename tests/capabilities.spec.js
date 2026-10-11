import { test, expect, preparePage } from './fixtures/loader.js';

// Exercise both native ESM delivery families
for (const suffix of ['.js', '.min.js']) {
    // Verify explicit startup and shared default ownership
    test(`explicit core shares ownership and activates discovery only on request ${suffix}`, async ({
        page,
        loaderServer,
    }) => {
        await preparePage(
            page,
            '<template x-acl="explicit-discovery-card"><p>Discovered</p></template><explicit-discovery-card></explicit-discovery-card>',
        );
        const result = await page.evaluate(
            // Compare core startup with later compatibility discovery
            async ({ base, suffix }) => {
                const family = suffix === '.js' ? 'src' : 'dist',
                    core = await import(`${base}/${family}/core${suffix}`),
                    Loader = core.default;
                await Loader.start();
                const absent = !customElements.get('explicit-discovery-card');

                const main = await import(`${base}/${family}/index${suffix}`);

                const shared = main.default.globalConfig === Loader.globalConfig;
                await main.default.start();
                await customElements.whenDefined('explicit-discovery-card');
                const host = document.querySelector('explicit-discovery-card');
                if (host._state !== 'ready')
                    // Wait for actual component readiness
                    await new Promise((resolve, reject) => {
                        host.addEventListener('acl:loadend', resolve, { once: true });
                        // Surface asynchronous component initialization errors
                        host.addEventListener('acl:error', (event) => reject(event.detail.error), { once: true });
                    });
                await main.default.dispose({ clearPersistentCaches: false });
                return {
                    absent,
                    shared,
                    exports: Object.keys(core).sort(),
                };
            },
            {
                base: loaderServer.baseUrl,
                suffix,
            },
        );
        expect(result).toEqual({
            absent: true,
            shared: true,
            exports: ['ACLLoadError', 'default'],
        });
    });

    // Verify shared implementation URLs and independent loader state
    test(`multiple loaders share implementations and retain independent data and template caches ${suffix}`, async ({
        page,
        loaderServer,
    }) => {
        await preparePage(page);
        const result = await page.evaluate(
            // Exercise identical definitions through separate loader contexts
            async ({ base, suffix }) => {
                const { createLoader } = await import(`${base}/dist/index${suffix}`);

                const first = createLoader({
                        config: {
                            cacheTemplates: false,
                            observability: true,
                        },
                    }),
                    second = createLoader({
                        config: {
                            cacheTemplates: false,
                            observability: true,
                        },
                    });
                await Promise.all([
                    first.define('first-context-card', `${base}/templates/simple.html`, {
                        data: { src: `${base}/api/count` },
                    }),
                    second.define('second-context-card', `${base}/templates/simple.html`, {
                        data: { src: `${base}/api/count` },
                    }),
                ]);
                await Promise.all([first.start(), second.start()]);
                // Construct one host for each owning loader
                const hosts = ['first-context-card', 'second-context-card'].map((tag) => document.createElement(tag));

                const ready = Promise.all(
                    hosts.map(
                        // Await completion independently for each component
                        (host) =>
                            // Subscribe before inserting the component
                            new Promise((resolve, reject) => {
                                host.addEventListener('acl:loadend', resolve, { once: true });
                                // Fail the test on component initialization errors
                                host.addEventListener('acl:error', (event) => reject(event.detail.error), {
                                    once: true,
                                });
                            }),
                    ),
                );
                document.body.append(...hosts);
                await ready;
                const independent =
                    first.globalConfig !== second.globalConfig &&
                    first.getRegisteredTags().length === 1 &&
                    second.getRegisteredTags().length === 1;

                const before = second.getDataCacheSize();
                first.clearDataCache();
                await first.dispose({ clearPersistentCaches: false });
                const retained = second.getDataCacheSize(),
                    state = hosts[1]._state;
                await hosts[1].reload({
                    clearTemplate: false,
                    clearData: false,
                });
                await second.dispose({ clearPersistentCaches: false });
                return {
                    independent,
                    before,
                    retained,
                    state,
                };
            },
            {
                base: loaderServer.baseUrl,
                suffix,
            },
        );
        expect(result).toEqual({
            independent: true,
            before: 1,
            retained: 1,
            state: 'ready',
        });
        // Collect shared implementation URL identities
        const urls = loaderServer.moduleRequests.filter((url) => url.includes('/runtime/'));
        // Reject query-specific copies of implementation modules
        expect(urls.every((url) => !url.includes('acl-instance'))).toBe(true);
        expect(new Set(urls).size, JSON.stringify(urls)).toBe(urls.length);
    });
}

// Check feature exclusion before exercising content-dependent activation
test('a basic inline component excludes optional groups; authored content activates transformations', async ({
    page,
    loaderServer,
}) => {
    await preparePage(page);
    // Render the smallest required inline path
    await page.evaluate(async (base) => {
        const { default: Loader } = await import(`${base}/dist/index.js`);
        window.capabilityLoader = Loader;
        await Loader.define('plain-capability-card', { template: '<p>Plain</p>' });
        await Loader.start();
        const host = document.createElement('plain-capability-card');
        // Subscribe to completion before inserting the host
        const done = new Promise((resolve) => host.addEventListener('acl:loadend', resolve, { once: true }));
        document.body.append(host);
        await done;
    }, loaderServer.baseUrl);
    const excluded =
        /(?:template-loader|template-requests|template-cache|data-controller|fetch-cache|hydration|triggers|styles|slots|scripts|environment|initialization-scheduler)\./;
    // Assert that the basic component excluded every optional group
    expect(loaderServer.moduleRequests.some((url) => excluded.test(url))).toBe(false);
    // Render styles, projection, and explicitly enabled scripts together
    const result = await page.evaluate(async () => {
        const Loader = window.capabilityLoader;
        await Loader.define('transformation-card', {
            template:
                '<style>button { color: rgb(1, 2, 3); }</style><slot></slot><script>window.capabilityScriptCount = (window.capabilityScriptCount || 0) + 1;</script>',
            executeScripts: true,
            sanitize: false,
        });
        const host = document.createElement('transformation-card'),
            button = document.createElement('button');
        button.textContent = 'Projected';
        host.append(button);
        // Await completion of all ordered transformations
        const done = new Promise((resolve) => host.addEventListener('acl:loadend', resolve, { once: true }));
        document.body.append(host);
        await done;
        const result = {
            projected: host.querySelector('button') === button,
            scripts: window.capabilityScriptCount,
            color: getComputedStyle(button).color,
        };
        await Loader.dispose({ clearPersistentCaches: false });
        return result;
    });
    expect(result).toEqual({
        projected: true,
        scripts: 1,
        color: 'rgb(1, 2, 3)',
    });
    // Verify each requested transformation implementation was loaded
    for (const feature of ['styles', 'slots', 'scripts'])
        expect(loaderServer.moduleRequests).toContain(`/dist/runtime/component/${feature}.js`);
});

test('disposal while a transformation import is pending prevents a late DOM commit', async ({ page, loaderServer }) => {
    // Hold optional activation across teardown to check component ownership
    await preparePage(page);
    let release;
    const gate = new Promise((resolve) => {
        // Permit the test to release the delayed module response
        release = resolve;
    });
    await page.route('**/component/styles.js', async (route) => {
        // Keep the rendering phase suspended until disposal begins
        await gate;
        await route.continue();
    });
    const requested = page.waitForRequest('**/component/styles.js');
    await page.evaluate(async (base) => {
        // Insert a component whose safe renderer requires optional styles
        const { default: Loader } = await import(`${base}/dist/index.js`);
        window.capabilityLoader = Loader;
        await Loader.define('pending-style-card', { template: '<style>p { color: red; }</style><p>Late</p>' });
        await Loader.start();
        window.pendingHost = document.createElement('pending-style-card');
        document.body.append(window.pendingHost);
    }, loaderServer.baseUrl);
    await requested;
    await page.evaluate(() => {
        // Begin disposal without blocking release of the delayed response
        window.pendingDisposal = window.capabilityLoader.dispose({ clearPersistentCaches: false });
    });
    release();
    const result = await page.evaluate(async () => {
        // Await both teardown and the suspended component pipeline
        await window.pendingDisposal;
        await window.pendingHost._activeLoadPromise;
        return {
            content: window.pendingHost.textContent,
            state: window.pendingHost._state,
        };
    });
    expect(result.content).not.toContain('Late');
    expect(result.state).not.toBe('ready');
});

test('a data source added after initialization activates shared data behavior', async ({ page, loaderServer }) => {
    // Verify that initially absent data remains lazy until an observed attribute requests it
    await preparePage(page);
    await page.evaluate(async (base) => {
        // Complete the ordinary inline path before adding the source attribute
        const { default: Loader } = await import(`${base}/dist/index.js`);
        window.capabilityLoader = Loader;
        await Loader.define('late-data-card', { template: '<p>Data</p>' });
        await Loader.start();
        const host = document.createElement('late-data-card');

        const done = new Promise((resolve) => {
            // Await actual readiness before requesting data
            host.addEventListener('acl:loadend', resolve, { once: true });
        });
        document.body.append(host);
        await done;
        window.lateDataHost = host;
    }, loaderServer.baseUrl);
    expect(
        loaderServer.moduleRequests.some((url) => {
            // Reject eager data implementation activation
            return url.includes('data-controller');
        }),
    ).toBe(false);
    await page.evaluate(async (base) => {
        // Attribute reactions must activate data without a component reload
        const host = window.lateDataHost;

        host.setAttribute('data-src', `${base}/api/count`);
    }, loaderServer.baseUrl);
    await expect
        .poll(() => {
            // Wait for the attribute-triggered data request to settle
            return page.evaluate(() => {
                // Observe the published reactive result
                return Boolean(window.lateDataHost.$props.$data);
            });
        })
        .toBe(true);
    await page.evaluate(() => {
        // Release resources after late data activation
        return window.capabilityLoader.dispose({ clearPersistentCaches: false });
    });
    expect(
        loaderServer.moduleRequests.some((url) => {
            // Confirm activation on explicit data demand
            return url.includes('data-controller');
        }),
    ).toBe(true);
});

// Exercise failed feature activation and retry recovery
test('styles import failure retries with a fresh module identity', async ({ page, loaderServer }) => {
    await preparePage(page);
    let failures = 1;
    // Fail the first stylesheet import without affecting the retry URL
    await page.route('**/runtime/component/styles.js*', async (route) => {
        if (failures > 0) {
            failures--;
            await route.abort('failed');
        } else await route.continue();
    });
    // Reload a component after its optional implementation import fails
    await page.evaluate(async (base) => {
        const { default: Loader } = await import(`${base}/dist/index.js`);
        window.capabilityLoader = Loader;
        await Loader.define('retry-style-card', { template: '<style>p { color: red; }</style><p>Retry</p>' });
        await Loader.start();
        const host = document.createElement('retry-style-card');
        window.retryHost = host;
        // Wait for the structured feature import error
        const done = new Promise((resolve) => host.addEventListener('acl:error', resolve, { once: true }));
        document.body.append(host);
        await done;
        await host.reload({
            clearTemplate: false,
            clearData: false,
        });
    }, loaderServer.baseUrl);
    // Check successful component completion after retry
    expect(await page.evaluate(() => window.retryHost._state)).toBe('ready');
    // Verify a fresh URL identity recovered the failed import
    expect(loaderServer.moduleRequests.some((url) => url.includes('styles.js?acl-retry=1'))).toBe(true);
    // Release the loader resources after the test
    await page.evaluate(() => window.capabilityLoader.dispose({ clearPersistentCaches: false }));
});

// Retain interactions that arrive before trigger implementation activation
test('an interaction during a pending trigger import is retained once', async ({ page, loaderServer }) => {
    await preparePage(page);
    let release;
    // Hold the implementation response until after the interaction
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    // Delay trigger activation while the early listeners remain installed
    await page.route('**/component/triggers.js', async (route) => {
        await gate;
        await route.continue();
    });
    // Dispatch an interaction during deferred hydration setup
    await page.evaluate(async (base) => {
        const { default: Loader } = await import(`${base}/dist/index.js`);
        window.capabilityLoader = Loader;
        await Loader.define('interaction-capability-card', {
            template: '<p>Hydrated</p>',
            hydrate: 'interaction',
        });
        await Loader.start();
        const host = document.createElement('interaction-capability-card');
        host.setAttribute('data-acl-ssr', '');
        host.setAttribute('data-acl-revision', '');
        host.innerHTML = '<p>SSR</p>';
        document.body.append(host);
        window.interactionHost = host;
        host.dispatchEvent(new Event('focusin', { bubbles: true }));
    }, loaderServer.baseUrl);
    release();
    // Wait for the retained interaction to complete hydration
    await expect.poll(() => page.evaluate(() => window.interactionHost._state)).toBe('ready');
    // Release the activated loader and trigger subscriptions
    await page.evaluate(() => window.capabilityLoader.dispose({ clearPersistentCaches: false }));
});

test('reload renews data activation ownership while its shared import is pending', async ({ page, loaderServer }) => {
    // A new load generation must not inherit cancellation from the superseded activation
    await preparePage(page);
    let release;
    const gate = new Promise((resolve) => {
        // Keep the first data implementation response suspended across reload
        release = resolve;
    });
    await page.route('**/component/data-controller.js', async (route) => {
        // Release the single shared response after the replacement load has started
        await gate;
        await route.continue();
    });
    const requested = page.waitForRequest('**/component/data-controller.js');
    await page.evaluate(async (base) => {
        // Start a data-enabled component without waiting for the held capability
        const { default: Loader } = await import(`${base}/dist/index.js`);
        window.capabilityLoader = Loader;
        await Loader.define('pending-data-card', {
            template: '<p>Data</p>',
            data: { src: `${base}/api/count` },
        });
        await Loader.start();
        window.pendingDataHost = document.createElement('pending-data-card');
        document.body.append(window.pendingDataHost);
    }, loaderServer.baseUrl);
    await requested;
    await page.evaluate(() => {
        // Supersede the component load while reusing the shared implementation request
        window.pendingDataReload = window.pendingDataHost.reload({
            clearTemplate: false,
            clearData: false,
        });
    });
    release();
    const result = await page.evaluate(async () => {
        // Await the current generation rather than the canceled original load
        await window.pendingDataReload;
        const state = window.pendingDataHost._state;
        await window.capabilityLoader.dispose({ clearPersistentCaches: false });
        return state;
    });
    expect(result).toBe('ready');
    expect(
        loaderServer.moduleRequests.filter((url) => {
            // Concurrent generations must share the one successful implementation URL
            return url.includes('data-controller');
        }),
    ).toHaveLength(1);
});

test('core preserves configuration, explicit observation, diagnostics, and disposal contracts', async ({
    page,
    loaderServer,
}) => {
    // Exercise the additive entry through its public facade rather than assuming root-entry parity
    await preparePage(page);
    const result = await page.evaluate(async (base) => {
        // Use a legacy entry identity while its implementation dependencies remain shared
        const { default: Loader } = await import(`${base}/src/core.js?acl-instance=core-contract`);

        const before = {
            registered: Loader.getRegisteredTags(),
            has: Loader.has('core-contract-card'),
            definition: Loader.getDefinition('core-contract-card'),
            dependencies: Loader.getDependencies('core-contract-card'),
            size: Loader.getDataCacheSize(),
            data: Loader.getDataCacheInfo(),
            missing: Loader.getDataCacheInfo('missing'),
            template: Loader.getTemplateLoadInfo('#core-contract-template'),
        };
        Loader.clearMetrics();
        Loader.clearDataCache();
        Loader.getMetrics();
        Loader.stopObservingPrefetch();
        const callback = (value) => {
            // Preserve the application callback identity through synchronous configuration
            return value;
        };
        Loader.config({
            hooks: { afterFetch: callback },
            data: { options: { headers: { global: 'yes' } } },
        });
        let rejected = false;
        // Require validation errors before any asynchronous implementation activation
        try {
            // Validation remains synchronous before runtime activation
            Loader.config({ templateTimeout: -1 });
        } catch (error) {
            rejected = error instanceof TypeError;
        }
        const unsubscribe = Loader.subscribe(() => {
            // Own a diagnostics subscription independently from component readiness
        });
        Loader._report = () => {
            // Keep intentionally triggered validation diagnostics local to this test
        };
        await Loader.define('core-contract-card', { template: '<p>Core contract</p>' });
        await Loader.start();
        Loader.config({ debug: false });
        const identity = Loader.getDefinition('core-contract-card').settings.hooks.afterFetch === callback;

        const template = document.createElement('template');
        template.id = 'core-contract-template';
        template.setAttribute('x-acl', 'core-observed-card');
        template.innerHTML = '<p>Observed explicitly</p>';
        const stop = Loader.observeTemplates({ root: document.body });
        document.body.append(template);
        await customElements.whenDefined('core-observed-card');
        stop();
        Loader.stopObservingTemplates();
        await Loader.registerTemplates(template);
        await Loader.registerManifest({
            version: 1,
            components: { 'core-manifest-card': '#core-contract-template' },
        });
        await Loader.prefetchGraph('core-manifest-card');
        await Loader.loadTemplate('#core-contract-template');
        await Loader.getTemplateCacheInfo();
        await Loader.pruneTemplateCache();
        await Loader.clearTemplate('#core-contract-template');
        await Loader.clearTemplateCaches();
        await Loader.pruneCaches();
        Loader._dispatchRuntimeEvent('core-contract', {});
        Loader.getMetrics();
        Loader.clearMetrics();
        Loader.clearDataCache();
        Loader.getDataCacheInfo();
        Loader.getDataCacheSize();
        Loader.getDependencies('core-manifest-card');
        Loader._manifestDependencies;
        Loader._manifestGroups;
        Loader._detachedDataEntries;
        Loader._report;
        Loader.toggleDebug();
        unsubscribe();
        await Loader.dispose({ clearPersistentCaches: false });
        await Loader.dispose();
        let disposed = false;
        // Require mutating calls to reject immediately after disposal
        try {
            // Isolated mutating facade calls retain synchronous disposed errors
            Loader.define('disposed-core-card', { template: '<p>Disposed</p>' });
        } catch (error) {
            disposed = error.code === 'ACL_LOADER_DISPOSED';
        }
        return {
            before,
            rejected,
            identity,
            disposed,
        };
    }, loaderServer.baseUrl);
    expect(result).toEqual({
        before: {
            registered: [],
            has: false,
            definition: null,
            dependencies: [],
            size: 0,
            data: {
                size: 0,
                keys: [],
            },
            missing: null,
            template: null,
        },
        rejected: true,
        identity: true,
        disposed: true,
    });
});

test('hydration passes the current host to per-instance custom sanitizers', async ({ page, loaderServer }) => {
    // Preserve callback context and sanitizer execution during optional SSR initialization
    await preparePage(page);
    const result = await page.evaluate(async (base) => {
        // Hydrate a server host without requesting its unused URL template
        const { default: Loader } = await import(`${base}/src/core.js`);
        let calls = 0,
            matched = false;
        await Loader.define('sanitized-hydration-card', `${base}/templates/unused.html`, {
            sanitize(fragment, context) {
                // Verify that the extracted capability retained the public host context
                calls++;
                matched = context.el === document.querySelector('sanitized-hydration-card');
                return fragment;
            },
        });
        await Loader.start();
        const inert = document.createElement('template');
        inert.innerHTML =
            '<sanitized-hydration-card data-acl-ssr="1" data-acl-revision=""><p>Server</p></sanitized-hydration-card>';
        const host = inert.content.firstElementChild;

        const ready = new Promise((resolve) => {
            // Await completion of sanitizer and Alpine initialization
            host.addEventListener('acl:loadend', resolve, { once: true });
        });
        document.body.append(host);
        await ready;
        await Loader.dispose({ clearPersistentCaches: false });
        return {
            calls,
            matched,
        };
    }, loaderServer.baseUrl);
    expect(result).toEqual({
        calls: 1,
        matched: true,
    });
    expect(
        loaderServer.moduleRequests.some((url) => {
            // The hydration-only path must exclude template networking
            return url.includes('template-loader');
        }),
    ).toBe(false);
});

test('disposing a facade during initial activation prevents late registration', async ({ page, loaderServer }) => {
    // Invalidate ownership before the shared runtime implementation has arrived
    await preparePage(page);
    let release;
    const gate = new Promise((resolve) => {
        // Hold the first runtime response until the facade is disposed
        release = resolve;
    });
    await page.route('**/runtime/loader.js', async (route) => {
        // The implementation may finish downloading but cannot register disposed work
        await gate;
        await route.continue();
    });
    const requested = page.waitForRequest('**/runtime/loader.js');
    await page.evaluate(async (base) => {
        // Begin explicit registration without waiting for its held implementation
        const { default: Loader } = await import(`${base}/src/core.js`);
        window.capabilityLoader = Loader;
        window.pendingDefinition = Loader.define('disposed-activation-card', { template: '<p>Late</p>' }).then(
            // Convert completion into an observable result without an unhandled rejection
            () => 'registered',
            // Preserve the public structured disposal code
            (error) => error.code,
        );
    }, loaderServer.baseUrl);
    await requested;
    await page.evaluate(() => {
        // Dispose before runtime activation can bind or install behavior
        return window.capabilityLoader.dispose({ clearPersistentCaches: false });
    });
    release();
    expect(
        await page.evaluate(() => {
            // Read the final registration result after activation was invalidated
            return window.pendingDefinition;
        }),
    ).toBe('ACL_LOADER_DISPOSED');
    expect(
        await page.evaluate(() => {
            // No constructor may be registered by the disposed operation
            return Boolean(customElements.get('disposed-activation-card'));
        }),
    ).toBe(false);
});
