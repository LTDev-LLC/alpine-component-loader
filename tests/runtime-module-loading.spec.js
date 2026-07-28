import { expect, preparePage, test } from './fixtures/loader.js';

// Normalize recorded module requests to paths while retaining the original fixture log
const requestedPathnames = (loaderServer) =>
    loaderServer.moduleRequests.map(
        // Resolve the recorded request without coupling assertions to the fixture port
        (request) => new URL(request, loaderServer.baseUrl).pathname,
    );

// Check whether every requested module stayed in the generated minified family
const allPathsAreMinified = (paths) =>
    paths.every(
        // Check the current module path
        (path) => path.endsWith('.min.js'),
    );

// Check whether any requested module belongs to a package directory
const includesPathPrefix = (paths, prefix) =>
    paths.some(
        // Check the current module path
        (path) => path.startsWith(prefix),
    );

// Count requests for one module without relying on their ordering
const countPath = (paths, expected) =>
    paths.filter(
        // Select the requested module path
        (path) => path === expected,
    ).length;

// Define and connect one inline component through the asynchronous public facade
const mountInlineComponent = async (page, baseUrl, { tagName, fixture, config = {} }) => {
    // Mount the requested component in the current fixture document
    await page.evaluate(
        // Import the requested minified entry and connect its component
        async ({ baseUrl, tagName, fixture, config }) => {
            const { default: Loader } = await import(`${baseUrl}/dist/index.min.js?fixture=${fixture}`),
                template = document.createElement('template');
            template.innerHTML = '<p>runtime capability probe</p>';
            await Loader.define(tagName, template, {
                cacheTemplates: false,
                ...config,
            });
            await Loader.start();
            const element = document.createElement(tagName),
                loaded = new Promise((resolve, reject) => {
                    // Settle against the component's public lifecycle events
                    element.addEventListener(
                        'acl:loadend',
                        // Resolve the first completed component load
                        () => resolve(),
                        { once: true },
                    );
                    element.addEventListener(
                        'acl:error',
                        // Surface runtime import and lifecycle failures in the test result
                        (event) => reject(event.detail?.error || new Error('Component loading failed.')),
                        { once: true },
                    );
                });
            document.body.appendChild(element);
            await loaded;
            if (element._state !== 'ready')
                throw new Error(`Component settled in unexpected state "${element._state}".`);
        },
        {
            baseUrl,
            tagName,
            fixture,
            config,
        },
    );
};

test('importing the core facade does not fetch runtime capabilities', async ({ page, loaderServer }) => {
    // Verify that a side-effect-free import stays within the facade layer
    await preparePage(page);

    await page.evaluate(
        // Import only the public facade without activating a loader operation
        async (baseUrl) => {
            const module = await import(`${baseUrl}/dist/index.js?fixture=facade-only`);
            window.__aclFacadeVersion = module.default.version;
        },
        loaderServer.baseUrl,
    );

    const paths = requestedPathnames(loaderServer);
    expect(loaderServer.moduleRequests[0]).toBe('/dist/index.js?fixture=facade-only');
    expect(includesPathPrefix(paths, '/dist/runtime/')).toBe(false);
    expect(includesPathPrefix(paths, '/dist/elements/')).toBe(false);
});

test('cache inspection does not fetch component construction modules', async ({ page, loaderServer }) => {
    // Verify an isolated runtime API loads its own capability without component controllers
    await preparePage(page);

    await page.evaluate(
        // Activate only persistent template-cache inspection
        async (baseUrl) => {
            const { default: Loader } = await import(`${baseUrl}/dist/index.min.js?fixture=min-cache-info`);
            await Loader.getTemplateCacheInfo();
        },
        loaderServer.baseUrl,
    );

    const paths = requestedPathnames(loaderServer);
    expect(paths).toContain('/dist/runtime/loader.min.js');
    expect(paths).toContain('/dist/runtime/template-cache.min.js');
    expect(includesPathPrefix(paths, '/dist/runtime/component/')).toBe(false);
    expect(includesPathPrefix(paths, '/dist/elements/')).toBe(false);
    expect(allPathsAreMinified(paths)).toBe(true);
});

// Run this operation
test('createLoader isolates configuration, registries, metrics, caches, and disposal', async ({
    page,
    loaderServer,
}) => {
    await preparePage(page);
    // Run this operation
    const result = await page.evaluate(async (baseUrl) => {
        const { createLoader } = await import(`${baseUrl}/dist/index.js?fixture=isolated-loaders`),
            first = createLoader({
                config: {
                    // Configure a visibly distinct first instance
                    debug: true,
                    cacheNamespace: 'first',
                },
            }),
            second = createLoader({
                config: {
                    // Configure a visibly distinct second instance
                    debug: false,
                    cacheNamespace: 'second',
                },
            }),
            // Run this operation
            template = (value) => {
                const element = document.createElement('template');
                element.innerHTML = `<p>${value}</p>`;
                return element;
            };
        await Promise.all([
            first.define('isolated-first-card', template('first'), { cacheTemplates: false }),
            second.define('isolated-second-card', template('second'), { cacheTemplates: false }),
        ]);
        await Promise.all([first.start(), second.start()]);
        const firstElement = document.createElement('isolated-first-card'),
            secondElement = document.createElement('isolated-second-card'),
            // Run this operation
            loaded = (element) =>
                // Run this operation
                new Promise((resolve, reject) => {
                    element.addEventListener('loaded', resolve, { once: true });
                    // Run this operation
                    element.addEventListener('acl:error', (event) => reject(event.detail.error), { once: true });
                });
        document.body.append(firstElement, secondElement);
        await Promise.all([loaded(firstElement), loaded(secondElement)]);
        let conflict = null,
            disposed = null;
        // Run this operation
        try {
            await second.define('isolated-first-card', template('conflict'));
        } catch (error) {
            conflict = error.code;
        }
        const registries = [first.getRegisteredTags(), second.getRegisteredTags()];
        await first.dispose();
        // Run this operation
        try {
            await first.define('isolated-after-dispose', template('disposed'));
        } catch (error) {
            disposed = error.code;
        }
        return {
            configs: [first.globalConfig.cacheNamespace, second.globalConfig.cacheNamespace],
            registries,
            firstConnected: firstElement.isConnected,
            secondConnected: secondElement.isConnected,
            secondState: secondElement._state,
            conflict,
            disposed,
        };
    }, loaderServer.baseUrl);

    expect(result.configs).toEqual(['first', 'second']);
    expect(result.registries[0]).toContain('isolated-first-card');
    expect(result.registries[0]).not.toContain('isolated-second-card');
    expect(result.registries[1]).toContain('isolated-second-card');
    expect(result.firstConnected).toBe(false);
    expect(result.secondConnected).toBe(true);
    expect(result.secondState).toBe('ready');
    expect(result.conflict).toBe('ACL_TAG_OWNERSHIP_CONFLICT');
    expect(result.disposed).toBe('ACL_LOADER_DISPOSED');
});

test('the auto entry does not register unused built-in elements', async ({ page, loaderServer }) => {
    // Verify discovery before and after a single built-in tag is inserted
    await preparePage(page);

    await page.evaluate(
        // Let auto-start scan a document that contains no ACL built-in tags
        async (baseUrl) => {
            const { startAutoLoader } = await import(`${baseUrl}/dist/auto.min.js?fixture=min-auto`);
            await startAutoLoader();
        },
        loaderServer.baseUrl,
    );

    const paths = requestedPathnames(loaderServer);
    expect(loaderServer.moduleRequests[0]).toBe('/dist/auto.min.js?fixture=min-auto');
    expect(allPathsAreMinified(paths)).toBe(true);
    expect(includesPathPrefix(paths, '/dist/runtime/')).toBe(false);
    expect(includesPathPrefix(paths, '/dist/elements/')).toBe(false);

    await page.evaluate(
        // Insert one built-in tag after startup and await its asynchronous discovery
        async () => {
            const element = document.createElement('acl-component');
            element.setAttribute('src', '/templates/simple.html');
            element.setAttribute('tag', 'acl-auto-runtime-probe');
            document.body.appendChild(element);
            await customElements.whenDefined('acl-component');
        },
    );

    const activatedPaths = requestedPathnames(loaderServer);
    expect(activatedPaths).toContain('/dist/elements/declarative.min.js');
    expect(activatedPaths).not.toContain('/dist/elements/dynamic.min.js');
    expect(allPathsAreMinified(activatedPaths)).toBe(true);
});

test('a minified core entry propagates its suffix only to required definition modules', async ({
    page,
    loaderServer,
}) => {
    // Verify the minimal definition path separately from optional component features
    await preparePage(page);

    const constructorType = await page.evaluate(
        // Activate the component-definition path through the public API
        async (baseUrl) => {
            const { default: Loader } = await import(`${baseUrl}/dist/index.min.js?fixture=min-definition`),
                template = document.createElement('template');
            template.innerHTML = '<p>min runtime probe</p>';
            const constructor = await Loader.define('acl-min-runtime-probe', template, {
                cacheTemplates: false,
            });
            return typeof constructor;
        },
        loaderServer.baseUrl,
    );

    const paths = requestedPathnames(loaderServer),
        descendants = paths.filter(
            // Exclude the public entry from its descendant count
            (path) => path !== '/dist/index.min.js',
        );
    expect(constructorType).toBe('function');
    expect(loaderServer.moduleRequests[0]).toBe('/dist/index.min.js?fixture=min-definition');
    expect(descendants.length).toBeGreaterThan(0);
    expect(allPathsAreMinified(paths)).toBe(true);
    expect(paths).not.toContain('/dist/runtime/adaptive-prefetch.min.js');
    expect(paths).not.toContain('/dist/runtime/assets.min.js');
    expect(paths).not.toContain('/dist/runtime/caches.min.js');
    expect(paths).not.toContain('/dist/runtime/component/data-controller.min.js');
    expect(paths).not.toContain('/dist/runtime/fetch-cache.min.js');
    expect(paths).not.toContain('/dist/runtime/hmr.min.js');
    expect(paths).not.toContain('/dist/runtime/observability.min.js');
    expect(paths).not.toContain('/dist/runtime/persistence.min.js');
    expect(paths).not.toContain('/dist/runtime/registry.min.js');
    expect(paths).not.toContain('/dist/runtime/rendering.min.js');
    expect(paths).not.toContain('/dist/runtime/template-cache.min.js');
    expect(includesPathPrefix(paths, '/dist/elements/')).toBe(false);
});

test('connecting an inline component loads rendering without unrelated capabilities', async ({
    page,
    loaderServer,
}) => {
    // Verify the first connected render as a separate demand-loading boundary
    await preparePage(page);
    await mountInlineComponent(page, loaderServer.baseUrl, {
        tagName: 'acl-min-inline-probe',
        fixture: 'min-inline',
    });

    const paths = requestedPathnames(loaderServer);
    expect(paths).toContain('/dist/runtime/rendering.min.js');
    expect(paths).not.toContain('/dist/runtime/adaptive-prefetch.min.js');
    expect(paths).not.toContain('/dist/runtime/assets.min.js');
    expect(paths).not.toContain('/dist/runtime/caches.min.js');
    expect(paths).not.toContain('/dist/runtime/component/data-controller.min.js');
    expect(paths).not.toContain('/dist/runtime/fetch-cache.min.js');
    expect(paths).not.toContain('/dist/runtime/hmr.min.js');
    expect(paths).not.toContain('/dist/runtime/observability.min.js');
    expect(paths).not.toContain('/dist/runtime/persistence.min.js');
    expect(paths).not.toContain('/dist/runtime/registry.min.js');
    expect(paths).not.toContain('/dist/runtime/template-cache.min.js');
    expect(includesPathPrefix(paths, '/dist/elements/')).toBe(false);
    expect(allPathsAreMinified(paths)).toBe(true);
});

test('a configured data source activates only the data capability modules', async ({ page, loaderServer }) => {
    // Verify data module activation from the existing component configuration API
    await preparePage(page);
    await mountInlineComponent(page, loaderServer.baseUrl, {
        tagName: 'acl-min-data-probe',
        fixture: 'min-data',
        config: {
            data: {
                src: '/api/echo',
            },
        },
    });

    const paths = requestedPathnames(loaderServer);
    expect(paths).toContain('/dist/runtime/component/data-controller.min.js');
    expect(paths).toContain('/dist/runtime/fetch-cache.min.js');
    expect(paths).not.toContain('/dist/runtime/assets.min.js');
    expect(paths).not.toContain('/dist/runtime/hmr.min.js');
    expect(paths).not.toContain('/dist/runtime/persistence.min.js');
    expect(allPathsAreMinified(paths)).toBe(true);
});

test('persistence configuration activates only the persistence capability module', async ({ page, loaderServer }) => {
    // Verify persistence module activation from the existing component option
    await preparePage(page);
    await mountInlineComponent(page, loaderServer.baseUrl, {
        tagName: 'acl-min-persistence-probe',
        fixture: 'min-persistence',
        config: {
            persist: true,
        },
    });

    const paths = requestedPathnames(loaderServer);
    expect(paths).toContain('/dist/runtime/persistence.min.js');
    expect(paths).not.toContain('/dist/runtime/assets.min.js');
    expect(paths).not.toContain('/dist/runtime/component/data-controller.min.js');
    expect(paths).not.toContain('/dist/runtime/fetch-cache.min.js');
    expect(paths).not.toContain('/dist/runtime/hmr.min.js');
    expect(allPathsAreMinified(paths)).toBe(true);
});

test('external styles activate only the asset and shared-cache capability modules', async ({ page, loaderServer }) => {
    // Verify asset module activation from the existing external CSS option
    await preparePage(page);
    await mountInlineComponent(page, loaderServer.baseUrl, {
        tagName: 'acl-min-assets-probe',
        fixture: 'min-assets',
        config: {
            externalCss: ['/style/weird.css'],
        },
    });

    const paths = requestedPathnames(loaderServer);
    expect(paths).toContain('/dist/runtime/assets.min.js');
    expect(paths).toContain('/dist/runtime/caches.min.js');
    expect(paths).not.toContain('/dist/runtime/component/data-controller.min.js');
    expect(paths).not.toContain('/dist/runtime/fetch-cache.min.js');
    expect(paths).not.toContain('/dist/runtime/hmr.min.js');
    expect(paths).not.toContain('/dist/runtime/persistence.min.js');
    expect(allPathsAreMinified(paths)).toBe(true);
});

test('preserved reload activates HMR while an ordinary reload does not', async ({ page, loaderServer }) => {
    // Verify the reload option boundary through the public element method
    await preparePage(page);
    await mountInlineComponent(page, loaderServer.baseUrl, {
        tagName: 'acl-min-hmr-probe',
        fixture: 'min-hmr',
    });

    await page.evaluate(
        // Run a normal reload without requesting state-capture support
        async () => {
            await document.querySelector('acl-min-hmr-probe').reload({
                preserveState: false,
                clearTemplate: false,
                clearData: false,
            });
        },
    );
    expect(requestedPathnames(loaderServer)).not.toContain('/dist/runtime/hmr.min.js');

    await page.evaluate(
        // Run the state-preserving path that owns the optional HMR module
        async () => {
            await document.querySelector('acl-min-hmr-probe').reload({
                preserveState: true,
                clearTemplate: false,
                clearData: false,
            });
        },
    );

    const paths = requestedPathnames(loaderServer);
    expect(paths).toContain('/dist/runtime/hmr.min.js');
    expect(countPath(paths, '/dist/runtime/hmr.min.js')).toBe(1);
    expect(paths).not.toContain('/dist/runtime/assets.min.js');
    expect(paths).not.toContain('/dist/runtime/component/data-controller.min.js');
    expect(paths).not.toContain('/dist/runtime/fetch-cache.min.js');
    expect(paths).not.toContain('/dist/runtime/persistence.min.js');
    expect(allPathsAreMinified(paths)).toBe(true);
});

test('the debugger panel remains deferred and preserves the minified module family', async ({ page, loaderServer }) => {
    // Verify that debugger utilities and UI have separate loading boundaries
    await preparePage(page);

    await page.evaluate(
        // Import debugger utilities without activating their optional panel
        async (baseUrl) => {
            const { default: ACLDebugger } = await import(`${baseUrl}/dist/debugger.min.js?fixture=min-debugger`),
                Loader = {
                    globalConfig: { debug: false },
                    getDataCacheInfo() {
                        // Return the empty cache projection expected by debugger rendering
                        return {
                            size: 0,
                            keys: [],
                        };
                    },
                    getRegisteredTags() {
                        // Return the empty registry projection expected by debugger rendering
                        return [];
                    },
                };
            ACLDebugger.inject(Loader);
            window.__aclDebuggerLoader = Loader;
        },
        loaderServer.baseUrl,
    );

    let paths = requestedPathnames(loaderServer);
    expect(loaderServer.moduleRequests[0]).toBe('/dist/debugger.min.js?fixture=min-debugger');
    expect(paths).toContain('/dist/runtime/overlay-utils.min.js');
    expect(paths).not.toContain('/dist/runtime/debugger-panel.min.js');
    expect(allPathsAreMinified(paths)).toBe(true);

    await page.evaluate(
        // Exercise the existing public toggle hook that owns the deferred panel
        async () => {
            await window.__aclDebuggerLoader.toggleDebug();
            await window.__aclDebuggerLoader.toggleDebug();
        },
    );

    paths = requestedPathnames(loaderServer);
    expect(paths).toContain('/dist/runtime/debugger-panel.min.js');
    expect(countPath(paths, '/dist/runtime/debugger-panel.min.js')).toBe(1);
    expect(allPathsAreMinified(paths)).toBe(true);
});

test('the accessibility scanner dialog remains deferred until the scanner is mounted', async ({
    page,
    loaderServer,
}) => {
    // Verify that scanner logic and its interactive dialog have separate loading boundaries
    await preparePage(page);

    await page.evaluate(
        // Import scanner logic without mounting its optional dialog
        async (baseUrl) => {
            const { default: scanner } = await import(`${baseUrl}/dist/a11y-scanner.min.js?fixture=min-scanner`);
            window.__aclScannerModule = scanner;
        },
        loaderServer.baseUrl,
    );

    let paths = requestedPathnames(loaderServer);
    expect(loaderServer.moduleRequests[0]).toBe('/dist/a11y-scanner.min.js?fixture=min-scanner');
    expect(paths).toContain('/dist/a11y.min.js');
    expect(paths).toContain('/dist/runtime/overlay-utils.min.js');
    expect(paths).not.toContain('/dist/runtime/a11y-scanner-dialog.min.js');
    expect(allPathsAreMinified(paths)).toBe(true);

    await page.evaluate(
        // Mount through the public API, then close and release the activated UI
        async () => {
            const controller = window.__aclScannerModule.mount();
            await controller.open();
            controller.close();
            controller.destroy();
        },
    );

    paths = requestedPathnames(loaderServer);
    expect(paths).toContain('/dist/runtime/a11y-scanner-dialog.min.js');
    expect(countPath(paths, '/dist/runtime/a11y-scanner-dialog.min.js')).toBe(1);
    expect(allPathsAreMinified(paths)).toBe(true);
});

test('accessibility scanner dialog failures reject cleanly and a later operation retries', async ({
    page,
    loaderServer,
}) => {
    // Fail the initial dialog request, then allow a cache-busted minified retry
    await preparePage(page);
    const dialogRequests = [];
    await page.route('**/dist/runtime/a11y-scanner-dialog.min.js*', async (route) => {
        // Simulate one transient transport failure without changing the fixture server
        dialogRequests.push(route.request().url());
        if (dialogRequests.length === 1) {
            await route.abort('failed');
            return;
        }
        await route.continue();
    });

    const result = await page.evaluate(
        // Exercise both explicit operations against the shared failed mount, then retry
        async (baseUrl) => {
            const unhandled = [];
            window.addEventListener('unhandledrejection', (event) => {
                // Retain unexpected background failures for the test assertion
                unhandled.push({
                    name: event.reason?.name,
                    code: event.reason?.code,
                    message: event.reason?.message,
                });
            });
            const { default: scanner } = await import(`${baseUrl}/dist/a11y-scanner.min.js?fixture=min-scanner-retry`),
                controller = scanner.mount(),
                failures = await Promise.allSettled([controller.open(), controller.scan()]),
                retryResult = await controller.open();
            controller.destroy();
            await new Promise(
                // Let the browser deliver any unexpected unhandled rejection event
                (resolve) => setTimeout(resolve, 0),
            );
            return {
                failures: failures.map(
                    // Project rejection metadata across the page boundary
                    (failure) => ({
                        status: failure.status,
                        name: failure.reason?.name,
                        code: failure.reason?.code,
                        phase: failure.reason?.phase,
                        retryable: failure.reason?.retryable,
                    }),
                ),
                retryComponentCount: retryResult.componentCount,
                unhandled,
            };
        },
        loaderServer.baseUrl,
    );

    expect(result.failures).toEqual([
        {
            status: 'rejected',
            name: 'ACLLoadError',
            code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
            phase: 'runtime-import',
            retryable: true,
        },
        {
            status: 'rejected',
            name: 'ACLLoadError',
            code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
            phase: 'runtime-import',
            retryable: true,
        },
    ]);
    expect(result.retryComponentCount).toBe(0);
    expect(result.unhandled).toEqual([]);
    expect(dialogRequests).toHaveLength(2);
    expect(
        dialogRequests.every(
            // Keep the retry in the generated minified module family
            (request) => new URL(request).pathname.endsWith('.min.js'),
        ),
    ).toBe(true);
    expect(new URL(dialogRequests[1]).searchParams.get('acl-retry')).toBe('1');
    expect(allPathsAreMinified(requestedPathnames(loaderServer))).toBe(true);
});
