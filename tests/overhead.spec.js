import { expect, preparePage, test } from './fixtures/loader.js';

// Keep visibility under test control while recording pool ownership
const installControlledObservers = () => {
    window.__pools = [];
    window.IntersectionObserver = class {
        constructor(callback) {
            // Retain callbacks without triggering visibility automatically
            this.callback = callback;
            this.targets = new Set();
            window.__pools.push(this);
        }

        observe(target) {
            // Track independent target subscriptions
            this.targets.add(target);
        }

        unobserve(target) {
            // Release one target without affecting its neighbors
            this.targets.delete(target);
        }

        disconnect() {
            // Release the final pool owner
            this.targets.clear();
        }
    };
};

test('disabled scheduling bypasses wrappers during hydration and fallback initialization', async ({
    page,
    loaderServer,
}) => {
    // Fail immediately if either default initialization phase invokes scheduling
    await preparePage(page, '<template id="disabled-fallback"><p>Fallback ready</p></template>');
    const result = await page.evaluate(async (baseUrl) => {
        // Share the private wrapper sentinel across normal and fallback phases
        const Loader = (await import(`${baseUrl}/dist/index.js`)).default,
            Hydrated = await Loader.define('disabled-hydrated-card', { template: '<p>Client</p>' }),
            Fallback = await Loader.define('disabled-fallback-card', {
                template: '<p>Fail once</p>',
                fallback: '#disabled-fallback',
            }),
            render = Fallback.prototype._renderSafe,
            failScheduling = () => {
                // Surface any wrapper invocation through readiness assertions
                throw new Error('Unexpected scheduling wrapper');
            };
        Hydrated.prototype._scheduleInitialization = failScheduling;
        Fallback.prototype._scheduleInitialization = failScheduling;
        Fallback.prototype._renderSafe = function (...args) {
            // Trigger a real fallback without changing its template resolution
            if (!this.__failed) {
                this.__failed = true;
                throw new Error('Expected rendering failure');
            }
            return render.apply(this, args);
        };
        await Loader.start();
        const inert = document.createElement('template');
        inert.innerHTML =
            '<disabled-hydrated-card data-acl-ssr="1" data-acl-revision=""><p>Server</p></disabled-hydrated-card>';
        const hosts = [inert.content.firstElementChild, document.createElement('disabled-fallback-card')],
            ready = hosts.map(
                (host) =>
                    new Promise((resolve) => {
                        // Fallback emits an expected error before its successful loadend
                        host.addEventListener('acl:loadend', (event) => resolve(event.detail.fallback), { once: true });
                    }),
            );
        document.body.append(...hosts);
        const fallbacks = await Promise.all(ready),
            hydrated = hosts[0].hasAttribute('data-acl-hydrated'),
            fallbackText = hosts[1].textContent;
        await Loader.dispose({ clearPersistentCaches: false });
        return {
            fallbacks,
            hydrated,
            fallbackText,
        };
    }, loaderServer.baseUrl);
    expect(result).toEqual({
        fallbacks: [false, true],
        hydrated: true,
        fallbackText: 'Fallback ready',
    });
});

// Verify both native delivery families use the same minimal eager closure
for (const suffix of ['.js', '.min.js']) {
    test(`core and eager delivery use three initial and at most eighteen eager requests ${suffix}`, async ({
        page,
        loaderServer,
    }) => {
        // Count actual requests and reject any use of the disabled scheduling wrapper
        await preparePage(page);
        await page.evaluate(
            async ({ baseUrl, suffix }) => {
                // Load only the facade before activating component construction
                window.__eagerLoader = (await import(`${baseUrl}/dist/index${suffix}?fixture=overhead`)).default;
            },
            {
                baseUrl: loaderServer.baseUrl,
                suffix,
            },
        );
        expect(loaderServer.moduleRequests).toHaveLength(3);
        await page.evaluate(async () => {
            // Make an accidental scheduling call fail the public readiness result
            const Loader = window.__eagerLoader,
                Element = await Loader.define('minimal-eager-card', { template: '<p>Ready</p>' });
            Element.prototype._scheduleInitialization = () => {
                // Disabled scheduling must never allocate or invoke a queued phase
                throw new Error('Unexpected scheduling wrapper');
            };
            await Loader.start();
            const host = document.createElement('minimal-eager-card'),
                ready = new Promise((resolve, reject) => {
                    // Wait for actual component readiness
                    host.addEventListener('acl:loadend', resolve, { once: true });
                    // Inspect the controlled fixture and its completion
                    host.addEventListener('acl:error', (event) => reject(event.detail.error), { once: true });
                });
            document.body.append(host);
            await ready;
            await Loader.dispose({ clearPersistentCaches: false });
        });
        expect(loaderServer.moduleRequests.length).toBeLessThanOrEqual(18);
        await test.info().attach('eager-module-requests', {
            body: JSON.stringify(loaderServer.moduleRequests),
            contentType: 'application/json',
        });
        // Inspect the controlled fixture and its completion
        expect(
            // Inspect the controlled fixture and its completion
            loaderServer.moduleRequests.every((url) => new URL(url, loaderServer.baseUrl).pathname.endsWith(suffix)),
        ).toBe(true);
        // Inspect the controlled fixture and its completion
        expect(
            // Inspect the controlled fixture and its completion
            loaderServer.moduleRequests.some((url) =>
                /environment|initialization-scheduler|generated-options/.test(url),
            ),
        ).toBe(false);
    });
}

test('pending environmental activation preserves current owners and ignores disconnected, reloaded, and disposed hosts', async ({
    page,
    loaderServer,
}) => {
    // Hold the single shared import while independently invalidating its component owners
    await preparePage(page);
    await page.evaluate(installControlledObservers);
    let release;
    const gate = new Promise((resolve) => {
        // Release the import only after all ownership changes are complete
        release = resolve;
    });
    await page.route('**/runtime/environment.js', async (route) => {
        // Keep the module request pending through teardown and reload
        await gate;
        await route.continue();
    });
    await page.evaluate(async (baseUrl) => {
        // Use separate loaders to exercise shared helper identities across instances
        const { createLoader } = await import(`${baseUrl}/dist/index.js`),
            Loader = createLoader({ config: { autoStart: false } }),
            disposed = createLoader({ config: { autoStart: false } });
        await Loader.define('pending-visible-card', {
            template: '<p>Hydrated</p>',
            hydrate: 'visible',
        });
        await Loader.define('pending-poll-card', {
            template: '<p>Polling</p>',
            data: { poll: 100000 },
        });
        await disposed.define('disposed-lazy-card', {
            template: '<p>Disposed</p>',
            loading: 'lazy',
        });
        await Promise.all([Loader.start(), disposed.start()]);
        const visible = Array.from({ length: 4 }, () => {
                // Build server-rendered hosts that wait for visible hydration
                const inert = document.createElement('template');
                inert.innerHTML =
                    '<pending-visible-card data-acl-ssr="1" data-acl-revision=""><p>Server</p></pending-visible-card>';
                return inert.content.firstElementChild;
            }),
            poll = document.createElement('pending-poll-card'),
            canceledPoll = document.createElement('pending-poll-card'),
            lazy = document.createElement('disposed-lazy-card');
        document.body.append(...visible, poll, canceledPoll, lazy);
        window.__activation = {
            Loader,
            disposed,
            visible,
            poll,
            canceledPoll,
            lazy,
        };
    }, loaderServer.baseUrl);
    await page.waitForFunction(
        // Inspect the controlled fixture and its completion
        () => window.__activation.poll._pollSetupPending && window.__activation.canceledPoll._pollSetupPending,
    );
    // Inspect the controlled fixture and its completion
    await page.evaluate(async () => {
        // Coalesce polling setup, then remove independent pending ownership
        const { Loader, disposed, visible, poll, canceledPoll } = window.__activation;
        poll._startPolling();
        poll._startPolling();
        visible[0].remove();
        await visible[1].reload({
            clearTemplate: false,
            clearData: false,
        });
        canceledPoll.setAttribute('data-fetch-poll', '0');
        await disposed.dispose({ clearPersistentCaches: false });
        window.__activation.disposedState = disposed.globalConfig.cacheNamespace;
        window.__activation.Loader = Loader;
    });
    release();
    // Inspect the controlled fixture and its completion
    await page.waitForFunction(() => window.__activation.visible[2]._observer && window.__activation.poll._pollTimer);
    // Inspect the controlled fixture and its completion
    const result = await page.evaluate(async () => {
        // Inspect installed ownership before releasing every remaining resource
        const { Loader, visible, poll, canceledPoll, lazy } = window.__activation,
            result = {
                pools: window.__pools.length,
                targets: window.__pools[0].targets.size,
                stale: [visible[0], visible[1], lazy].some((host) => Boolean(host._observer)),
                subscriptions: poll._pollSignalCleanups.length,
                canceledTimer: Boolean(canceledPoll._pollTimer),
                canceledSubscriptions: Boolean(canceledPoll._pollSignalCleanups),
            };
        visible[2].remove();
        result.remainingTargets = window.__pools[0].targets.size;
        await Loader.dispose({ clearPersistentCaches: false });
        result.retainedTargets = window.__pools.reduce((count, pool) => count + pool.targets.size, 0);
        // Inspect the controlled fixture and its completion
        result.retainedSubscriptions = Boolean(poll._pollSignalCleanups);
        return result;
    });
    expect(result).toEqual({
        pools: 1,
        targets: 2,
        stale: false,
        subscriptions: 2,
        canceledTimer: false,
        canceledSubscriptions: false,
        remainingTargets: 1,
        retainedTargets: 0,
        retainedSubscriptions: false,
    });
    // Inspect the controlled fixture and its completion
    expect(loaderServer.moduleRequests.filter((url) => url.includes('/environment.js'))).toEqual([
        '/dist/runtime/environment.js',
    ]);
    // Verify one shared controller identity across isolated loader instances
    expect(loaderServer.moduleRequests.filter((url) => url.includes('/component/lifecycle-controller.js'))).toEqual([
        '/dist/runtime/component/lifecycle-controller.js',
    ]);
    // Inspect the controlled fixture and its completion
});

// Exercise retry independently for deferred rendering and already-ready polling
for (const polling of [false, true]) {
    test(`environmental import failures remain retryable ${polling ? 'polling' : 'lazy'}`, async ({
        page,
        loaderServer,
    }) => {
        // Reject the first transport while allowing the next ownership attempt to succeed
        await preparePage(page);
        await page.evaluate(installControlledObservers);
        // Inspect the controlled fixture and its completion
        await page.route('**/runtime/environment.min.js', (route) => route.abort(), { times: 1 });
        // Inspect the controlled fixture and its completion
        await page.evaluate(
            async ({ baseUrl, polling }) => {
                // Capture structured import errors without rejecting the component's initial ready event
                const Loader = (await import(`${baseUrl}/dist/index.min.js`)).default;
                await Loader.define('retry-environment-card', {
                    template: '<p>Retry</p>',
                    loading: polling ? 'eager' : 'lazy',
                    data: { poll: polling ? 100000 : null },
                });
                await Loader.start();
                const host = document.createElement('retry-environment-card');
                host.addEventListener('acl:error', (event) => {
                    // Preserve the structured error for the assertion
                    window.__environmentError = {
                        code: event.detail.error.code,
                        phase: event.detail.phase,
                        retryable: event.detail.error.retryable,
                    };
                });
                window.__retryEnvironment = {
                    host,
                    Loader,
                };
                document.body.append(host);
            },
            {
                baseUrl: loaderServer.baseUrl,
                polling,
            },
        );
        // Inspect the controlled fixture and its completion
        await page.waitForFunction(() => window.__environmentError);
        // Inspect the controlled fixture and its completion
        expect(await page.evaluate(() => window.__environmentError)).toEqual({
            code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
            phase: 'runtime-import',
            retryable: true,
        });
        // Inspect the controlled fixture and its completion
        expect(await page.evaluate(() => Boolean(window.__retryEnvironment.host._pollTimer))).toBe(false);
        // Inspect the controlled fixture and its completion
        await page.evaluate((polling) => {
            // Retry using a fresh deferred connection or another polling setup attempt
            const { host } = window.__retryEnvironment;
            if (polling) host._startPolling();
            else {
                host.remove();
                document.body.append(host);
            }
        }, polling);
        await page.waitForFunction((polling) => {
            // Wait for resources installed by the successful retry
            const { host } = window.__retryEnvironment;
            return polling ? Boolean(host._pollTimer) : Boolean(host._observer);
        }, polling);
        // Inspect the controlled fixture and its completion
        expect(await page.evaluate(() => window.__pools.length)).toBe(polling ? 0 : 1);
        // Inspect the controlled fixture and its completion
        await page.evaluate(() => window.__retryEnvironment.Loader.dispose({ clearPersistentCaches: false }));
        // Inspect the controlled fixture and its completion
    });
}
