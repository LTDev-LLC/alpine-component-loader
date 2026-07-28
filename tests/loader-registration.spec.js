import { expect, test, preparePage, alpineStubSource, projectRoot, featureLabPath } from './fixtures/loader.js';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

let baseUrl, counts;
test.beforeAll(async ({ loaderServer }) => {
    // Prepare the test group
    ({ baseUrl, counts } = loaderServer);
});

test('imports dist loader and debugger modules', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/dist/index.js';
        import Debugger from '${baseUrl}/dist/debugger.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        Debugger.inject(Loader);
        window.__imports = {
            start: typeof Loader.start,
            toggleDebug: typeof Loader.toggleDebug
        };
    `,
    });

    await expect
        .poll(
            // Read the state under test
            () =>
                page.evaluate(
                    // Read the browser state
                    () => window.__imports,
                ),
        )
        .toEqual({
            start: 'function',
            toggleDebug: 'function',
        });
});

test('core entry queues component definitions and registers them only after explicit start', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page, '<queued-card></queued-card>');
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        const first = Loader.define('queued-card', '${baseUrl}/templates/simple.html');
        const second = Loader.define('queued-card', '${baseUrl}/templates/simple.html');
        const [firstConstructor, secondConstructor] = await Promise.all([first, second]);
        window.Loader = Loader;
        window.__queuedConstructorsMatch = firstConstructor === secondConstructor;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.Loader,
    );
    await page.evaluate(
        // Read the browser state
        () =>
            new Promise(
                // Settle the asynchronous operation
                (resolve) => queueMicrotask(resolve),
            ),
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                builtInDefined: Boolean(customElements.get('acl-component')),
                componentDefined: Boolean(customElements.get('queued-card')),
                constructorsMatch: window.__queuedConstructorsMatch,
                registered: window.Loader.has('queued-card'),
            }),
        ),
    ).toEqual({
        builtInDefined: false,
        componentDefined: false,
        constructorsMatch: true,
        registered: true,
    });

    await page.evaluate(
        // Read the browser state
        () => window.Loader.start(),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => document.querySelector('queued-card')?._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                builtInDefined: Boolean(customElements.get('acl-component')),
                componentDefined: Boolean(customElements.get('queued-card')),
            }),
        ),
    ).toEqual({
        builtInDefined: false,
        componentDefined: true,
    });
});

test('start surfaces settled queued definition failures and permits a corrected retry', async ({ page }) => {
    // Exercise startup after a queued definition has already rejected
    await preparePage(page);
    const result = await page.evaluate(
        // Register one invalid definition before starting and then recover
        async (baseUrl) => {
            const { default: Loader } = await import(`${baseUrl}/src/index.js`);
            let defineError = null,
                startError = null;
            // Capture the asynchronous definition failure without hiding it from startup
            try {
                await Loader.define('invalid', '/templates/simple.html');
            } catch (error) {
                defineError = error.message;
            }
            // Verify startup surfaces the previously settled queued failure
            try {
                await Loader.start();
            } catch (error) {
                startError = error.message;
            }
            const template = document.createElement('template');
            template.innerHTML = '<p>recovered</p>';
            await Loader.define('recovered-card', template);
            await Loader.start();
            return {
                defineError,
                startError,
                recovered: Boolean(customElements.get('recovered-card')),
            };
        },
        baseUrl,
    );
    expect(result).toEqual({
        defineError: expect.stringContaining('Invalid custom element name'),
        startError: expect.stringContaining('Invalid custom element name'),
        recovered: true,
    });
});

test('start registers definitions that arrive while cache pruning is pending', async ({ page }) => {
    // Exercise a definition racing with the asynchronous startup cleanup phase
    await preparePage(page);
    const registered = await page.evaluate(
        // Pause pruning, add a late definition, and complete the shared startup transaction
        async (baseUrl) => {
            const [{ default: Loader }, { default: RuntimeLoader }] = await Promise.all([
                    import(`${baseUrl}/src/index.js`),
                    import(`${baseUrl}/src/runtime/loader.js`),
                ]),
                initialTemplate = document.createElement('template'),
                lateTemplate = document.createElement('template');
            initialTemplate.innerHTML = '<p>initial</p>';
            lateTemplate.innerHTML = '<p>late</p>';
            await Loader.define('initial-race-card', initialTemplate);
            let releasePruning, signalPruning;
            const pruningEntered = new Promise((resolve) => {
                // Expose the point where startup begins asynchronous pruning
                signalPruning = resolve;
            });
            RuntimeLoader.pruneCaches = () =>
                new Promise((resolve) => {
                    // Hold the startup transaction while the late definition arrives
                    releasePruning = resolve;
                    signalPruning();
                });
            const starting = Loader.start();
            await pruningEntered;
            const defining = Loader.define('late-race-card', lateTemplate);
            releasePruning([]);
            await Promise.all([starting, defining]);
            return Boolean(customElements.get('late-race-card'));
        },
        baseUrl,
    );
    expect(registered).toBe(true);
});

test('auto entry registers built-in elements present in browser environments', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page, '<acl-component></acl-component><acl-dynamic></acl-dynamic>');
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/auto.js';
        window.Loader = Loader;
    `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => Boolean(customElements.get('acl-component')) && Boolean(customElements.get('acl-dynamic')),
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.Loader.globalConfig.autoStart,
        ),
    ).toBe(true);
});

test('declarative loader parses props, options, lists, hooks, and forwarded events', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(
        page,
        `
        <acl-component
            src="${baseUrl}/templates/data.html"
            tag="declarative-card"
            shadow="true"
            acl-props='{ "label": "String", "count": "Number" }'
            label="Hello"
            count="3"
            data-src="${baseUrl}/api/echo?existing=yes"
            data-fetch-params='{ "term": "a b" }'
            data-fetch-options='{ "headers": { "x-from-attr": "yes" } }'
            external-scripts='["${baseUrl}/script/one.js", "${baseUrl}/script/two.js"]'
            forward-events='["saved"]'
            hooks="TestHooks"
        ></acl-component>
    `,
    );
    await page.evaluate(() => {
        // Read the browser state
        window.TestHooks = {
            beforeFetch(options) {
                // Run the before fetch operation
                window.__hookCalled = true;
                options.headers = {
                    ...options.headers,
                    'x-from-hook': 'yes',
                };
                return options;
            },
            afterFetch(data) {
                // Run the after fetch operation
                data.afterFetch = true;
                return data;
            },
        };
    });
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        window.Loader = Loader;
    `,
    });

    await expect
        .poll(
            // Check whether the expected browser state is ready
            () => page.evaluate(() => document.querySelector('declarative-card')?._state === 'ready'),
        )
        .toBe(true);

    const state = await page.evaluate(() => {
        // Read the browser state
        const el = document.querySelector('declarative-card');
        let forwarded = false;
        el.addEventListener(
            'saved',
            // Handle the saved event
            (e) => (forwarded = e.detail.ok),
        );
        el.shadowRoot.getElementById('emit').dispatchEvent(
            new CustomEvent('saved', {
                bubbles: true,
                detail: { ok: true },
            }),
        );
        return {
            label: el.$props.label,
            count: el.$props.count,
            data: el.$props.$data,
            hookCalled: window.__hookCalled,
            scriptOrder: window.__scriptOrder,
            forwarded,
        };
    });

    expect(state.label).toBe('Hello');
    expect(state.count).toBe(3);
    expect(state.data.query).toEqual({
        existing: 'yes',
        term: 'a b',
    });
    expect(state.data.headers).toEqual({
        fromAttr: 'yes',
        fromHook: 'yes',
    });
    expect(state.data.afterFetch).toBe(true);
    expect(state.hookCalled).toBe(true);
    expect(state.scriptOrder).toEqual([1, 2]);
    expect(state.forwarded).toBe(true);
});

test('declarative data controls stay wired to runtime attributes and cache bounds', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(
        page,
        `
        <acl-component
            src="${baseUrl}/templates/data.html"
            tag="declarative-advanced-card"
            data-src="${baseUrl}/api/text"
            data-target="payload"
            data-response-type="text"
            data-fetch-cache-ttl="0"
            data-fetch-cache-max="0"
            data-cache-key="declarative-advanced"
            data-retry-max-delay="25"
            data-retry-jitter="0"
            data-retry-unsafe-methods="false"
            pause-polling-when-hidden="false"
            pause-polling-when-offline="false"
            pause-polling-when-offscreen="false"
            persist-version="2"
        ></acl-component>
    `,
    );
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
        () => document.querySelector('declarative-advanced-card')?._state === 'ready',
    );
    const initial = await page.evaluate(() => {
        // Read the browser state
        const el = document.querySelector('declarative-advanced-card'),
            ctor = customElements.get('declarative-advanced-card');
        return {
            payload: el.$props.payload,
            cacheSize: window.Loader.getDataCacheSize(),
            observed: ctor.observedAttributes,
            responseType: window.Loader.getDefinition('declarative-advanced-card').settings.data.responseType,
            persistVersion: window.Loader.getDefinition('declarative-advanced-card').settings.persistVersion,
        };
    });
    expect(initial.payload).toBe('plain response');
    expect(initial.cacheSize).toBe(0);
    expect(initial.responseType).toBe('text');
    expect(initial.persistVersion).toBe(2);
    expect(initial.observed).toEqual(
        expect.arrayContaining([
            'data-response-type',
            'data-fetch-cache-ttl',
            'data-fetch-cache-max',
            'data-cache-key',
            'data-retry-max-delay',
            'data-retry-jitter',
            'data-retry-unsafe-methods',
            'pause-polling-when-hidden',
            'pause-polling-when-offline',
            'pause-polling-when-offscreen',
            'persist-version',
        ]),
    );

    await page.evaluate(() => {
        // Read the browser state
        const el = document.querySelector('declarative-advanced-card');
        el.setAttribute('data-src', location.origin + '/api/vendor-json');
        el.setAttribute('data-response-type', 'json');
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => document.querySelector('declarative-advanced-card')?.$props.payload?.vendor === true,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.Loader.getDataCacheSize(),
        ),
    ).toBe(0);
});

test('registry APIs expose definitions, prefetch all components, and ignore duplicate defines', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        const first = await Loader.define('registry-card', '${baseUrl}/templates/simple.html', {
            attributes: { label: String }
        });
        const second = await Loader.define('registry-card', '${baseUrl}/templates/simple.html', {
            attributes: { label: String }
        });
        window.registryState = {
            has: Loader.has('registry-card'),
            tags: Loader.getRegisteredTags(),
            definition: Loader.getDefinition('registry-card'),
            sameConstructor: first === second,
        };
        window.prefetched = await Loader.prefetchAll(['registry-card']);
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.prefetched,
    );
    const state = await page.evaluate(
        // Read the browser state
        () => ({
            ...window.registryState,
            prefetchStatus: window.prefetched['registry-card'].status,
            prefetchedType: typeof window.prefetched['registry-card'].value,
        }),
    );

    expect(state.has).toBe(true);
    expect(state.tags).toContain('registry-card');
    expect(state.definition.source).toBe(`${baseUrl}/templates/simple.html`);
    expect(state.sameConstructor).toBe(true);
    expect(state.prefetchStatus).toBe('fulfilled');
    expect(state.prefetchedType).toBe('string');
});

test('declared host props are inherited enumerable prototype accessors with reflection parity', async ({ page }) => {
    // Exercise reflected props before and after component activation
    await preparePage(page);
    const state = await page.evaluate(async () => {
        // Inspect the generated component prototype and lazy instance fields
        const { default: Loader } = await import('/src/index.js'),
            template = document.createElement('template');
        template.innerHTML = '<p>prototype props</p>';
        await Loader.define('prototype-prop-card', template, {
            attributes: {
                count: {
                    type: Number,
                    reflect: true,
                },
                active: {
                    type: Boolean,
                    reflect: true,
                },
            },
        });
        await Loader.start();
        const element = document.createElement('prototype-prop-card');
        // Snapshot lazily allocated fields before connecting the component
        const lazyBeforeActivation = {
            scope: element._scopeId,
            slots: element._lightSlotNodes,
            hydration: element._hydrationCleanups,
            polling: element._pollSignalCleanups,
            cleanups: element._cleanups,
            forwarding: element._forwardEventCleanups,
            diagnostics: element._aclDebugState,
        };
        document.body.appendChild(element);
        element.count = 4;
        element.active = true;
        let owner = Object.getPrototypeOf(element),
            descriptor = null;
        // Find the accessor across the generated mixin prototype chain
        while (owner && !descriptor) {
            descriptor = Object.getOwnPropertyDescriptor(owner, 'count');
            owner = Object.getPrototypeOf(owner);
        }
        return {
            own: Object.prototype.hasOwnProperty.call(element, 'count'),
            inherited: 'count' in element,
            configurable: descriptor?.configurable,
            enumerable: descriptor?.enumerable,
            getter: typeof descriptor?.get,
            setter: typeof descriptor?.set,
            count: element.$props.count,
            reflectedCount: element.getAttribute('count'),
            reflectedBoolean: element.hasAttribute('active'),
            lazyBeforeActivation: Object.values(lazyBeforeActivation).every(
                // Verify every deferred field starts unallocated
                (value) => value === null,
            ),
        };
    });
    expect(state).toEqual({
        own: false,
        inherited: true,
        configurable: true,
        enumerable: true,
        getter: 'function',
        setter: 'function',
        count: 4,
        reflectedCount: '4',
        reflectedBoolean: true,
        lazyBeforeActivation: true,
    });
});

test('configuration validation, inheritance, cache namespaces, and definition snapshots are deterministic', async ({
    page,
}) => {
    // Exercise the test scenario
    const pageErrors = [];
    page.on(
        'pageerror',
        // Handle the pageerror event
        (error) => pageErrors.push(error.message),
    );
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({
            autoStart: false,
            cacheNamespace: 'Dashboard App',
            executeScripts: false, sanitize: true,
            fallback: '${baseUrl}/templates/fallback.html',
            persist: 'session',
            bindStore: 'shared',
            attributes: { globalLabel: { type: String, default: 'global' } }
        });
        window.Alpine.store('shared', {});
        Loader.config({ executeScripts: true, sanitize: false });
        await Loader.define('config-card', '${baseUrl}/templates/simple.html', {
            attributes: { label: { type: String, default: 'local' } }
        });
        const definition = Loader.getDefinition('CONFIG-CARD');
        definition.settings.attributes.label.default = 'mutated snapshot';
        window.state = {
            version: Loader.version,
            cacheKey: Loader.globalConfig._templateCacheKey,
            executeScripts: Loader.globalConfig.executeScripts,
            sanitize: Loader.globalConfig.sanitize,
            inheritedFallback: Loader.getDefinition('config-card').settings.fallback,
            inheritedPersist: Loader.getDefinition('config-card').settings.persist,
            inheritedStore: Loader.getDefinition('config-card').settings.bindStore,
            snapshotDefault: Loader.getDefinition('config-card').settings.attributes.label.default,
            hasGlobalAttribute: Boolean(Loader.getDefinition('config-card').settings.attributes.globalLabel),
        };
        try { await Loader.define('invalid', '${baseUrl}/templates/simple.html'); }
        catch (error) { window.state.invalidName = error instanceof TypeError; }
        try { Loader.config({ templateCacheStrategy: 'mystery' }); }
        catch (error) { window.state.invalidStrategy = error instanceof TypeError; }
        try { Loader.config({ data: { responseType: 'yaml' } }); }
        catch (error) { window.state.invalidGroupedResponse = error instanceof TypeError; }
        try { Loader.config({ data: { retryJitter: 2 } }); }
        catch (error) { window.state.invalidRetryJitter = error instanceof TypeError; }
        try { Loader.config({ persistVersion: 0 }); }
        catch (error) { window.state.invalidPersistVersion = error instanceof TypeError; }
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.state,
    );
    const state = await page.evaluate(
        // Read the browser state
        () => window.state,
    );
    if (!state) throw new Error(pageErrors.join('\n') || 'Configuration test module did not finish.');
    expect(state.cacheKey).toBe(`alpine-component-loader-dashboard-app-${state.version}`);
    expect(state).toEqual({
        version: 'development',
        cacheKey: 'alpine-component-loader-dashboard-app-development',
        executeScripts: true,
        sanitize: false,
        inheritedFallback: `${baseUrl}/templates/fallback.html`,
        inheritedPersist: 'session',
        inheritedStore: 'shared',
        snapshotDefault: 'local',
        hasGlobalAttribute: true,
        invalidName: true,
        invalidStrategy: true,
        invalidGroupedResponse: true,
        invalidRetryJitter: true,
        invalidPersistVersion: true,
    });
});

test('versioned manifests register grouped components and prefetch with bounded settled results', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        window.Loader = Loader;
        window.manifestResult = await Loader.registerManifest({
            version: 1,
            basePath: '${baseUrl}/templates/',
            components: {
                'manifest-base': 'simple.html',
                'manifest-good': { source: 'simple.html', dependencies: ['manifest-base'], options: { attributes: { label: String } } },
                'manifest-bad': 'missing.html'
            },
            groups: { route: ['manifest-good', 'manifest-bad'] }
        }, { prefetch: ['route'], concurrency: 1 });
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.manifestResult,
    );
    const state = await page.evaluate(
        // Read the browser state
        () => ({
            registered: window.manifestResult.registered,
            goodStatus: window.manifestResult.prefetched['manifest-good'].status,
            badStatus: window.manifestResult.prefetched['manifest-bad'].status,
            source: window.Loader.getDefinition('manifest-good').source,
            dependencies: window.Loader.getDependencies('manifest-good', { transitive: true }),
        }),
    );
    expect(state).toEqual({
        registered: ['manifest-base', 'manifest-good', 'manifest-bad'],
        goodStatus: 'fulfilled',
        badStatus: 'rejected',
        source: `${baseUrl}/templates/simple.html`,
        dependencies: ['manifest-base'],
    });
});

test('template observation registers templates added after startup and can be stopped', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.registerTemplates();
        window.stopTemplateObserver = Loader.observeTemplates();
        const template = document.createElement('template');
        template.setAttribute('acl-component', 'observed-card');
        template.innerHTML = '<span>observed</span>';
        document.body.appendChild(template);
        window.Loader = Loader;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.Loader?.has('observed-card'),
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => Boolean(customElements.get('observed-card')),
        ),
    ).toBe(true);
    await page.evaluate(() => {
        // Read the browser state
        window.stopTemplateObserver();
        const template = document.createElement('template');
        template.setAttribute('acl-component', 'ignored-card');
        template.innerHTML = '<span>ignored</span>';
        document.body.appendChild(template);
    });
    await page.waitForTimeout(30);
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.Loader.has('ignored-card'),
        ),
    ).toBe(false);
});

test('development client invalidates and reloads only components using changed templates', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        import { connectACLDevServer } from '${baseUrl}/src/dev.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('hmr-card', '${baseUrl}/templates/cache.html');
        await Loader.define('hmr-untouched', '${baseUrl}/templates/simple.html');
        class FakeEventSource extends EventTarget {
            constructor(url) { super(); this.url = url; window.__fakeEventSource = this; }
            sendMessage(message) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) })); }
            close() {}
        }
        const changed = document.createElement('hmr-card');
        const untouched = document.createElement('hmr-untouched');
        window.devReloads = [];
        window.addEventListener('acl:dev-reload', event => window.devReloads.push(event.detail));
        document.body.append(changed, untouched);
        window.hmr = { changed, untouched };
        window.devConnection = connectACLDevServer({ url: '/acl-events', EventSourceImpl: FakeEventSource });
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.hmr?.changed._state === 'ready' && window.hmr.untouched._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.hmr.changed.querySelector('#cache-count').textContent,
        ),
    ).toBe('1');
    await page.evaluate(
        // Read the browser state
        (source) =>
            window.__fakeEventSource.sendMessage({
                type: 'acl:template-changed',
                source,
            }),
        `${baseUrl}/templates/cache.html`,
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.devReloads.length === 1 && window.hmr.changed.querySelector('#cache-count')?.textContent === '2',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.devReloads[0],
        ),
    ).toEqual({
        sources: [`${baseUrl}/templates/cache.html`],
        tags: ['hmr-card'],
        reloaded: 1,
        failed: 0,
    });
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.hmr.untouched._hasLoadedOnce,
        ),
    ).toBe(true);
    await page.evaluate(
        // Read the browser state
        () => window.devConnection.close(),
    );
});

test('development client releases its EventSource listener and closes only once', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import { connectACLDevServer } from '${baseUrl}/src/dev.js';
        class FakeEventSource extends EventTarget {
            constructor(url) {
                super();
                this.url = url;
                this.listenerBalance = 0;
                this.closeCalls = 0;
                window.fakeEventSources.push(this);
            }
            addEventListener(...args) { this.listenerBalance++; return super.addEventListener(...args); }
            removeEventListener(...args) { this.listenerBalance--; return super.removeEventListener(...args); }
            close() { this.closeCalls++; }
        }
        window.fakeEventSources = [];
        window.connection = connectACLDevServer({
            url: '/acl-events', EventSourceImpl: FakeEventSource
        });
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.fakeEventSources?.length === 1,
    );
    const state = await page.evaluate(() => {
        // Read the browser state
        const source = window.fakeEventSources[0];
        window.connection.close();
        window.connection.close();
        return {
            eventSourceIsNull: window.connection.eventSource === null,
            listenerBalance: source.listenerBalance,
            closeCalls: source.closeCalls,
            sourceCount: window.fakeEventSources.length,
        };
    });
    expect(state).toEqual({
        eventSourceIsNull: true,
        listenerBalance: 0,
        closeCalls: 1,
        sourceCount: 1,
    });
});

test('declarative fetch attributes reject expressions and keep JSON values', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false });
        await Loader.start();
        await Loader.define('csp-card', '${baseUrl}/templates/data.html', {
            data: {
                src: '${baseUrl}/api/echo',
                params: { safe: 'yes' }
            }
        });
        const el = document.createElement('csp-card');
        el.setAttribute('data-fetch-params', '() => ({ unsafe: "no" })');
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
    ).toEqual({ safe: 'yes' });
});
