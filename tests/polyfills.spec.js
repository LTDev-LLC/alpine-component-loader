import { test, expect, preparePage } from './fixtures/loader.js';

// Exercise the maintained polyfill code in both native module delivery families
for (const suffix of ['.js', '.min.js']) {
    // Keep native browsers free of polyfill downloads
    test(`polyfills are optional and skip supported native APIs ${suffix}`, async ({ page, loaderServer }) => {
        await preparePage(page);
        const result = await page.evaluate(
            // Exercise readiness and capture the observable result
            async ({ base, suffix }) => {
                const { default: loadPolyfills, waitForWebComponents } = await import(
                    `${base}/dist/polyfills${suffix}`
                );
                await loadPolyfills();
                // Exercise readiness and capture the observable result
                const value = await waitForWebComponents(async () => 'ready');
                return {
                    value,
                    scripts: document.querySelectorAll('script[src*="webcomponents"]').length,
                    requested: performance
                        .getEntriesByType('resource')
                        // Inspect implementation and upstream bundle requests
                        .some((entry) => entry.name.includes('/node_modules/@webcomponents/')),
                };
            },
            {
                base: loaderServer.baseUrl,
                suffix,
            },
        );
        expect(result).toEqual({
            value: 'ready',
            scripts: 0,
            requested: false,
        });
    });

    // Hold the upstream loader to prove concurrent ACL operations cannot import constructors prematurely
    test(`asynchronous polyfill startup gates registration and shares downloads ${suffix}`, async ({
        page,
        loaderServer,
    }) => {
        await preparePage(page);
        let release;
        // Exercise readiness and capture the observable result
        const held = new Promise((resolve) => {
            release = resolve;
        });
        // Hold the upstream script until the test releases it
        await page.route('**/webcomponents-loader.js', async (route) => {
            await held;
            await route.continue();
        });
        await page.evaluate(
            // Exercise readiness and capture the observable result
            async ({ base, suffix }) => {
                const { default: loadPolyfills } = await import(`${base}/dist/polyfills${suffix}`),
                    { createLoader } = await import(`${base}/dist/index${suffix}`);
                window.ShadyDOM = { force: true };
                window.customElements.forcePolyfill = true;
                window.polyfillOwner = createLoader({ config: { autoStart: false } });
                const first = loadPolyfills({
                        url: `${base}/node_modules/@webcomponents/webcomponentsjs/webcomponents-loader.js`,
                    }),
                    second = loadPolyfills();
                window.sharedPolyfillPromise = first === second;
                window.pendingPolyfills = first;
                window.pendingDefinition = window.polyfillOwner.define('polyfilled-shadow-card', {
                    template:
                        '<style>:host { display: block; } p { color: rgb(12, 34, 56); }</style><p x-text="$props.label"></p><slot></slot>',
                    shadow: true,
                    attributes: { label: String },
                });
                window.pendingStart = window.polyfillOwner.start();
            },
            {
                base: loaderServer.baseUrl,
                suffix,
            },
        );
        expect(
            // Run the compatibility scenario in the browser realm
            await page.evaluate(() => ({
                shared: window.sharedPolyfillPromise,
                defined: Boolean(customElements.get('polyfilled-shadow-card')),
                // Inspect implementation and upstream bundle requests
                runtime: performance.getEntriesByType('resource').some((entry) => /runtime\/loader/.test(entry.name)),
            })),
        ).toEqual({
            shared: true,
            defined: false,
            runtime: false,
        });
        release();
        // Run the compatibility scenario in the browser realm
        const result = await page.evaluate(async () => {
            await window.pendingPolyfills;
            await window.pendingDefinition;
            await window.pendingStart;
            const first = document.createElement('polyfilled-shadow-card'),
                second = document.createElement('polyfilled-shadow-card'),
                outside = document.createElement('p');
            first.setAttribute('label', 'First');
            second.setAttribute('label', 'Second');
            first.innerHTML = '<span>Projected</span>';
            const done = Promise.all(
                [first, second].map(
                    // Exercise readiness and capture the observable result
                    (host) =>
                        // Exercise readiness and capture the observable result
                        new Promise((resolve, reject) => {
                            host.addEventListener('acl:loadend', resolve, { once: true });
                            // Capture the failure contract for assertions
                            host.addEventListener('acl:error', (event) => reject(event.detail.error), { once: true });
                        }),
                ),
            );
            document.body.append(first, second, outside);
            await done;
            window.ShadyDOM.flush();
            const result = {
                ready: window.WebComponents.ready,
                shady: window.ShadyDOM.inUse,
                text: [
                    first.shadowRoot.querySelector('p').textContent,
                    second.shadowRoot.querySelector('p').textContent,
                ],
                color: getComputedStyle(first.shadowRoot.querySelector('p')).color,
                outsideColor: getComputedStyle(outside).color,
                loaderRequests: performance
                    .getEntriesByType('resource')
                    // Inspect implementation and upstream bundle requests
                    .filter((entry) => entry.name.endsWith('/webcomponents-loader.js')).length,
                // Inspect implementation and upstream bundle requests
                htmlImports: performance.getEntriesByType('resource').some((entry) => /html-imports/.test(entry.name)),
            };
            await window.polyfillOwner.dispose({ clearPersistentCaches: false });
            return result;
        });
        expect(result).toMatchObject({
            ready: true,
            shady: true,
            text: ['First', 'Second'],
            color: 'rgb(12, 34, 56)',
            loaderRequests: 1,
            htmlImports: false,
        });
        expect(result.outsideColor).not.toBe('rgb(12, 34, 56)');
    });
}

// Repair the recommended platform helpers using the actual full suite
test('full bundle repairs platform helpers before importing ACL', async ({ page, loaderServer }) => {
    await preparePage(page);
    // Run the compatibility scenario in the browser realm
    const result = await page.evaluate(async (base) => {
        // Exercise the fallback even when Array.from is missing before entry evaluation
        Array.from = undefined;
        const { loadPolyfills } = await import(`${base}/src/polyfills.js`);
        window.ShadyDOM = { force: true };
        window.customElements.forcePolyfill = true;
        window.Promise = window.URL = undefined;
        Array.from = Object.assign = undefined;
        window.CustomEvent = undefined;
        await loadPolyfills({ url: `${base}/node_modules/@webcomponents/webcomponentsjs/webcomponents-loader.js` });
        let finalCalled = false;
        // Preserve fulfillment and cleanup through the upstream Promise constructor
        const finalValue = await Promise.resolve('finally ready').finally(() => {
            // Observe cleanup before the asynchronous operation resolves
            finalCalled = true;
        });

        const query = new URL('/ready?old=1', base),
            params = query.searchParams;
        params.set('instance', 'one two');
        params.delete('old');
        query.search = '?changed=2';
        const liveQuery = params.get('changed');

        const { createLoader } = await import(`${base}/src/index.js`),
            Loader = createLoader({ config: { autoStart: false } });
        await Loader.define('platform-fallback-card', { template: '<p>Platform ready</p>' });
        await Loader.start();
        const host = document.createElement('platform-fallback-card'),
            // Exercise readiness and capture the observable result
            ready = new Promise((resolve) => host.addEventListener('acl:loadend', resolve, { once: true }));
        document.body.append(host);
        await ready;
        const urlTemplate = await Loader.loadTemplate(
            `${base}/templates/simple.html`,
            {
                ...Loader.globalConfig,
                cacheTemplates: false,
            },
            {
                signal: new AbortController().signal,
            },
        );

        const result = {
            text: host.textContent,
            promise: typeof Promise,
            url: new URL('/ready', base).pathname,
            // Exercise readiness and capture the observable result
            from: Array.from({ length: 1 }, () => 7)[0],
            assign: Object.assign({}, { ready: true }).ready,
            events: [new Event('ready').type, new CustomEvent('ready').type, new MouseEvent('ready').type],
            bundle: performance
                .getEntriesByType('resource')
                // Inspect implementation and upstream bundle requests
                .some((entry) => entry.name.endsWith('/webcomponents-bundle.js')),
            htmlImports: 'HTMLImports' in window,
            liveQuery,
            registered: Loader.getRegisteredTags(),
            finalCalled,
            finalValue,
            urlTemplate: typeof urlTemplate === 'string' && urlTemplate.length > 0,
        };
        await Loader.dispose({ clearPersistentCaches: false });
        return result;
    }, loaderServer.baseUrl);
    expect(result).toEqual({
        text: 'Platform ready',
        promise: 'function',
        url: '/ready',
        from: 7,
        assign: true,
        events: ['ready', 'ready', 'ready'],
        bundle: true,
        htmlImports: false,
        liveQuery: '2',
        registered: ['platform-fallback-card'],
        finalCalled: true,
        finalValue: 'finally ready',
        urlTemplate: true,
    });
});

// Preserve upstream upgrade batching and callback result/error contracts
test('external asynchronous loader receives the full application callback promise', async ({ page, loaderServer }) => {
    await preparePage(page);
    // Run the compatibility scenario in the browser realm
    const result = await page.evaluate(async (base) => {
        const { waitForWebComponents } = await import(`${base}/src/polyfills.js`),
            callbacks = [];
        window.WebComponents = {
            ready: false,
            // Exercise readiness and capture the observable result
            waitFor(callback) {
                callbacks.push(callback);
            },
        };
        let finish,
            settled = false;
        const operation = waitForWebComponents(
            // Exercise readiness and capture the observable result
            () =>
                // Exercise readiness and capture the observable result
                new Promise((resolve) => {
                    finish = resolve;
                }),
            // Exercise readiness and capture the observable result
        ).then((value) => {
            settled = true;
            return value;
        });
        await Promise.resolve();
        const upstream = callbacks.shift()();
        await Promise.resolve();
        const before = settled;
        finish(42);
        await upstream;
        const value = await operation;
        window.WebComponents.ready = true;
        // Exercise readiness and capture the observable result
        const failure = await waitForWebComponents(() => {
            throw new Error('callback failed');
            // Capture the failure contract for assertions
        }).catch((error) => error.message);
        return {
            before,
            settled,
            value,
            failure,
        };
    }, loaderServer.baseUrl);
    expect(result).toEqual({
        before: false,
        settled: true,
        value: 42,
        failure: 'callback failed',
    });
});

// Clean failed script ownership and allow another bootstrap attempt
test('failed downloads are structured and retryable', async ({ page, loaderServer }) => {
    await preparePage(page);
    // Run the compatibility scenario in the browser realm
    const result = await page.evaluate(async (base) => {
        const { loadPolyfills } = await import(`${base}/src/polyfills.js`);
        window.ShadyDOM = { force: true };
        const denied = await loadPolyfills({
            url: `${base}/node_modules/@webcomponents/webcomponentsjs/webcomponents-loader.js`,
            trustedTypesPolicy: {
                createScriptURL() {
                    // Reject the injected URL before any script transport starts
                    throw new TypeError('Denied script URL.');
                },
            },
        }).catch((error) => {
            // Capture synchronous injection failures through the asynchronous result
            return error.code;
        });
        // Capture the failure contract for assertions
        const error = await loadPolyfills({ url: `${base}/missing-polyfill.js` }).catch((error) => ({
            code: error.code,
            phase: error.phase,
            retryable: error.retryable,
        }));
        await loadPolyfills({
            url: `${base}/node_modules/@webcomponents/webcomponentsjs/webcomponents-loader.js`,
            nonce: 'polyfill-test',
        });
        return {
            denied,
            error,
            ready: window.WebComponents.ready,
            failedScript: Boolean(document.querySelector('script[src*="missing-polyfill"]')),
            nonce: document.querySelector('script[src*="webcomponents-loader.js"]').nonce,
        };
    }, loaderServer.baseUrl);
    expect(result).toEqual({
        denied: 'ACL_POLYFILL_LOAD_FAILED',
        error: {
            code: 'ACL_POLYFILL_LOAD_FAILED',
            phase: 'polyfills',
            retryable: true,
        },
        ready: true,
        failedScript: false,
        nonce: 'polyfill-test',
    });
});

// Stop waiting and release listeners when an external suite never reports readiness
test('polyfill timeout cleans ownership and a ready external suite needs no new script', async ({
    page,
    loaderServer,
}) => {
    await preparePage(page);
    // Run the compatibility scenario in the browser realm
    const result = await page.evaluate(async (base) => {
        const { loadPolyfills, waitForWebComponents } = await import(`${base}/src/polyfills.js`);
        window.WebComponents = {
            ready: false,
            waitFor() {
                // Leave readiness pending to exercise timeout cleanup
            },
        };
        // Capture the failure contract for assertions
        const code = await loadPolyfills({ timeout: 10 }).catch((error) => error.code);
        window.WebComponents.ready = true;
        await loadPolyfills({ timeout: 0 });
        delete window.WebComponents.waitFor;
        window.WebComponents.ready = false;
        // Exercise readiness and capture the observable result
        const wait = waitForWebComponents(() => 'event ready');
        await Promise.resolve();
        window.WebComponents.ready = true;
        document.dispatchEvent(new CustomEvent('WebComponentsReady'));
        return {
            code,
            value: await wait,
            scripts: document.querySelectorAll('script[src*="webcomponents"]').length,
        };
    }, loaderServer.baseUrl);
    expect(result).toEqual({
        code: 'ACL_POLYFILL_TIMEOUT',
        value: 'event ready',
        scripts: 0,
    });
});

// Disposal cancels facade ownership without canceling the document's shared polyfill installation
test('disposal during polyfill startup does not install stale definitions', async ({ page, loaderServer }) => {
    await preparePage(page);
    // Run the compatibility scenario in the browser realm
    const result = await page.evaluate(async (base) => {
        const { createLoader } = await import(`${base}/src/index.js`);
        let callback;
        window.WebComponents = {
            ready: false,
            // Exercise readiness and capture the observable result
            waitFor(value) {
                callback = value;
            },
        };
        const Loader = createLoader(),
            pending = Loader.define('disposed-polyfill-card', { template: '<p>Stale</p>' }).catch(
                // Capture the failure contract for assertions
                (error) => error.code,
            );
        await Loader.dispose({ clearPersistentCaches: false });
        window.WebComponents.ready = true;
        await callback();
        return {
            code: await pending,
            defined: Boolean(customElements.get('disposed-polyfill-card')),
        };
    }, loaderServer.baseUrl);
    expect(result).toEqual({
        code: 'ACL_LOADER_DISPOSED',
        defined: false,
    });
});

// Avoid the upstream document.write path while a page is still being parsed
test('dynamic bootstrap waits for DOM parsing without replacing document content', async ({ page, loaderServer }) => {
    await preparePage(page, '<p id="preserved">Keep me</p>');
    const result = await page.evaluate(async (base) => {
        // Hold only DOM readiness while retaining the real classic loader
        const { loadPolyfills } = await import(`${base}/src/polyfills.js`);
        window.ShadyDOM = { force: true };
        Object.defineProperty(document, 'readyState', {
            configurable: true,
            value: 'loading',
        });
        const pending = loadPolyfills({
                url: `${base}/node_modules/@webcomponents/webcomponentsjs/webcomponents-loader.js`,
            }),
            before = document.querySelectorAll('script[src*="webcomponents"]').length;
        delete document.readyState;
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await pending;
        return {
            before,
            preserved: document.querySelector('#preserved').textContent,
            ready: window.WebComponents.ready,
        };
    }, loaderServer.baseUrl);
    expect(result).toEqual({
        before: 0,
        preserved: 'Keep me',
        ready: true,
    });
});

// Hydration uses the same sanitized ShadyCSS preparation as client-side rendering
test('fallback shadow hydration scopes server styles and preserves sanitizer execution', async ({
    page,
    loaderServer,
}) => {
    await preparePage(page);
    const result = await page.evaluate(async (base) => {
        // Activate the real fallback before parsing and upgrading server content
        const { loadPolyfills } = await import(`${base}/src/polyfills.js`);
        window.ShadyDOM = { force: true };
        customElements.forcePolyfill = true;
        await loadPolyfills({ url: `${base}/node_modules/@webcomponents/webcomponentsjs/webcomponents-loader.js` });
        const { createLoader } = await import(`${base}/src/index.js`),
            { sanitizeNodeTree } = await import(`${base}/src/runtime/rendering.js`),
            Loader = createLoader({ config: { autoStart: false } });
        let sanitizers = 0;
        await Loader.define('polyfill-ssr-card', {
            template: '<p>Client fallback</p>',
            shadow: true,
            sanitize(fragment, context) {
                // Keep custom policy execution observable on hydrated content
                sanitizers++;
                return sanitizeNodeTree(fragment, Loader.globalConfig, context);
            },
        });
        await Loader.start();
        const template = document.createElement('template');
        template.innerHTML =
            '<polyfill-ssr-card data-acl-ssr="1" data-acl-revision=""><template data-acl-ssr-shadow shadowrootmode="open"><style>p { color: rgb(22, 44, 66); }</style><p onclick="window.unsafe = true">Server content</p><script>window.unsafe = true;</script></template></polyfill-ssr-card>';
        const host = template.content.firstElementChild,
            // Wait until sanitization, style preparation, and Alpine initialization are complete
            ready = new Promise((resolve, reject) => {
                host.addEventListener('acl:loadend', resolve, { once: true });
                // Surface any failed hydration phase
                host.addEventListener('acl:error', (event) => reject(event.detail.error), { once: true });
            });
        document.body.append(host);
        await ready;
        window.ShadyDOM.flush();
        const result = {
            text: host.shadowRoot.querySelector('p').textContent,
            color: getComputedStyle(host.shadowRoot.querySelector('p')).color,
            script: Boolean(host.shadowRoot.querySelector('script')),
            onclick: host.shadowRoot.querySelector('p').getAttribute('onclick'),
            sanitizers,
        };
        await Loader.dispose({ clearPersistentCaches: false });
        return result;
    }, loaderServer.baseUrl);
    expect(result).toEqual({
        text: 'Server content',
        color: 'rgb(22, 44, 66)',
        script: false,
        onclick: null,
        sanitizers: 1,
    });
});

// Load real definitions inside the upstream callback without recursively starting another upgrade batch
test('external waitFor preserves upgrade batching through ACL definition and startup', async ({
    page,
    loaderServer,
}) => {
    await preparePage(page);
    let release;
    // Keep the real bundle pending until the application callback has been queued
    const held = new Promise((resolve) => {
        // Retain explicit ownership of the delayed test transport
        release = resolve;
    });
    await page.route('**/bundles/webcomponents-sd-ce.js', async (route) => {
        // Release the real upstream bundle only after the assertions below
        await held;
        await route.continue();
    });
    await page.evaluate(() => {
        // Force the external loader's Custom Elements and Shadow DOM selection
        window.ShadyDOM = { force: true };
        customElements.forcePolyfill = true;
    });
    await page.addScriptTag({
        url: `${loaderServer.baseUrl}/node_modules/@webcomponents/webcomponentsjs/webcomponents-loader.js`,
    });
    const operation = page.evaluate(async (base) => {
        // Return every ACL registration operation to the upstream batching promise
        const { waitForWebComponents } = await import(`${base}/src/polyfills.js`);
        window.applicationCallbackQueued = true;
        return waitForWebComponents(async () => {
            // Avoid requesting a nested readiness batch while the outer callback owns upgrades
            const { default: Loader } = await import(`${base}/src/core.js`);
            await Loader.define('external-batched-card', { template: '<p>Defined</p>' });
            await Loader.start();
            return {
                defined: Boolean(customElements.get('external-batched-card')),
                readyDuringCallback: window.WebComponents.ready,
            };
        });
    }, loaderServer.baseUrl);
    await expect
        .poll(() => {
            // Confirm the callback is queued before allowing platform installation
            return page.evaluate(() => {
                // Read the application-side readiness subscription
                return Boolean(window.applicationCallbackQueued);
            });
        })
        .toBe(true);
    expect(
        await page.evaluate(() => {
            // Definitions remain absent while the upstream bundle is pending
            return Boolean(customElements.get('external-batched-card'));
        }),
    ).toBe(false);
    release();
    expect(await operation).toEqual({
        defined: true,
        readyDuringCallback: false,
    });
    await expect
        .poll(() => {
            // Readiness follows the completed callback and document upgrade batch
            return page.evaluate(() => {
                // Read the upstream suite's completed upgrade state
                return Boolean(window.WebComponents.ready);
            });
        })
        .toBe(true);
});

// Enforce real script URL sinks while using the upstream loader's separate bundle policy
test('polyfill bootstrap accepts an explicit Trusted Types policy', async ({ page, loaderServer }) => {
    await preparePage(page);
    const supported = await page.evaluate(() => {
        // Keep this test scoped to engines implementing the Trusted Types platform API
        return Boolean(window.trustedTypes);
    });
    test.skip(!supported, 'Trusted Types is unavailable in this browser');
    const result = await page.evaluate(async (base) => {
        // Configure policy names before enabling the enforced script sink
        const { loadPolyfills } = await import(`${base}/src/polyfills.js`),
            policy = trustedTypes.createPolicy('acl-polyfills-test', {
                createScriptURL(value) {
                    // Permit only the explicitly authored local package URL
                    if (!value.startsWith(`${base}/node_modules/@webcomponents/webcomponentsjs/`))
                        throw new TypeError('Unexpected polyfill URL.');
                    return value;
                },
            }),
            meta = document.createElement('meta');
        meta.httpEquiv = 'Content-Security-Policy';
        meta.content = "require-trusted-types-for 'script'; trusted-types acl-polyfills-test webcomponents-loader";
        document.head.appendChild(meta);
        customElements.forcePolyfill = true;
        await loadPolyfills({
            url: `${base}/node_modules/@webcomponents/webcomponentsjs/webcomponents-loader.js`,
            trustedTypesPolicy: policy,
        });
        return window.WebComponents.ready;
    }, loaderServer.baseUrl);
    expect(result).toBe(true);
});
