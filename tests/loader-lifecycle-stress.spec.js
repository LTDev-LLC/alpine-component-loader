import { expect, test, preparePage, alpineStubSource, projectRoot, featureLabPath } from './fixtures/loader.js';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

let baseUrl, counts;
test.beforeAll(async ({ loaderServer }) => {
    // Prepare the test group
    ({ baseUrl, counts } = loaderServer);
});

test.describe('isolated lifecycle stress coverage', () => {
    // Define the test group
    test.describe.configure({ mode: 'parallel' });

    test('lifecycle soak returns owned resources to baseline and bounds post-GC heap growth', async ({
        page,
        context,
        browserName,
    }) => {
        // Exercise the test scenario
        test.slow();
        await preparePage(page);
        await page.evaluate(() => {
            // Read the browser state
            const resources = (window.__aclResourceLedger = {
                    timers: new Set(),
                    frames: new Set(),
                    mutationObservers: 0,
                    resizeObservers: 0,
                    intersectionObservers: 0,
                }),
                nativeSetTimeout = window.setTimeout.bind(window),
                nativeClearTimeout = window.clearTimeout.bind(window),
                nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window),
                nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
            window.setTimeout = (callback, delay, ...args) => {
                // Read the browser state
                let id = null;
                id = nativeSetTimeout(() => {
                    // Run the original timer callback
                    resources.timers.delete(id);
                    callback(...args);
                }, delay);
                resources.timers.add(id);
                return id;
            };
            window.clearTimeout = (id) => {
                // Read the browser state
                resources.timers.delete(id);
                return nativeClearTimeout(id);
            };
            window.requestAnimationFrame = (callback) => {
                // Read the browser state
                let id = null;
                id = nativeRequestAnimationFrame((timestamp) => {
                    // Run the original animation callback
                    resources.frames.delete(id);
                    callback(timestamp);
                });
                resources.frames.add(id);
                return id;
            };
            window.cancelAnimationFrame = (id) => {
                // Read the browser state
                resources.frames.delete(id);
                return nativeCancelAnimationFrame(id);
            };

            const trackObserver = (name, NativeObserver, key) => {
                // Run the track observer operation
                Object.defineProperty(window, name, {
                    configurable: true,
                    writable: true,
                    value: class TrackingObserver extends NativeObserver {
                        constructor(callback, options) {
                            // Initialize class state
                            super(callback, options);
                            this.__aclActive = false;
                        }

                        observe(...args) {
                            // Count the fixture observer when it becomes active
                            if (!this.__aclActive) {
                                this.__aclActive = true;
                                resources[key]++;
                            }
                            return super.observe(...args);
                        }

                        disconnect() {
                            // Remove the fixture observer from the active count
                            if (this.__aclActive) {
                                this.__aclActive = false;
                                resources[key]--;
                            }
                            return super.disconnect();
                        }
                    },
                });
            };
            trackObserver('MutationObserver', window.MutationObserver, 'mutationObservers');
            trackObserver('ResizeObserver', window.ResizeObserver, 'resizeObservers');
            trackObserver('IntersectionObserver', window.IntersectionObserver, 'intersectionObservers');
        });
        await page.addScriptTag({
            type: 'module',
            content: `
        import Loader from '${baseUrl}/src/index.js';
        import ACLDebugger from '${baseUrl}/src/debugger.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false, runtimeCacheMax: 8 });
        await Loader.start();
        ACLDebugger.inject(Loader);
        const template = document.createElement('template');
        template.id = 'soak-template';
        template.innerHTML = '<div><slot></slot><span x-text="$props.label"></span></div>';
        document.body.appendChild(template);
        window.soakHookListeners = 0;
        window.soakCleanupCount = 0;
        window.soakDetachedHostRefs = [];
        await Loader.define('lifecycle-soak-card', '#soak-template', {
            attributes: { label: String },
            hooks: {
                mounted() {
                    const handler = () => {};
                    window.addEventListener('acl-soak-event', handler);
                    window.soakHookListeners++;
                    return () => {
                        window.removeEventListener('acl-soak-event', handler);
                        window.soakHookListeners--;
                        window.soakCleanupCount++;
                    };
                }
            }
        });
        window.soakMutationObserverBaseline = window.__aclResourceLedger.mutationObservers;
        window.Loader = Loader;
        window.runLifecycleSoakBatch = async count => {
            const cleanupStart = window.soakCleanupCount;
            await Loader.toggleDebug();
            const elements = Array.from({ length: count }, (_, index) => {
                const element = document.createElement('lifecycle-soak-card');
                element.setAttribute('label', String(index));
                element.append('slot-' + index);
                return element;
            });
            document.body.append(...elements);
            await Promise.all(elements.map(element => element._load()));
            await Promise.all(elements.map(element => element.reload()));
            elements.forEach(element => window.soakDetachedHostRefs.push(new WeakRef(element)));
            elements.forEach(element => element.remove());
            await new Promise(resolve => setTimeout(resolve, 350));
            await Loader.toggleDebug();
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const ledger = window.__aclResourceLedger;
            return {
                allDestroyed: elements.every(element => element._state === 'destroyed'),
                connectedHosts: document.querySelectorAll('lifecycle-soak-card').length,
                hookListeners: window.soakHookListeners,
                cleanups: window.soakCleanupCount - cleanupStart,
                ownedResourcesReleased: elements.every(element =>
                    element._activeLoadPromise === null &&
                    element._loadAbortController === null &&
                    element._fetchAbortController === null &&
                    element._observer === null &&
                    element._slotObserver === null &&
                    element._alpineWaitCleanup === null &&
                    element._persistenceDispose === null &&
                    element._pollTimer === null &&
                    (element._cleanups?.length || 0) === 0 &&
                    (element._forwardEventCleanups?.length || 0) === 0 &&
                    (element._pollSignalCleanups?.length || 0) === 0),
                dataCacheSize: Loader.getDataCacheSize(),
                detachedDataEntries: Loader._detachedDataEntries.size,
                timers: ledger.timers.size,
                frames: ledger.frames.size,
                mutationObservers: ledger.mutationObservers - window.soakMutationObserverBaseline,
                resizeObservers: ledger.resizeObservers,
                intersectionObservers: ledger.intersectionObservers,
                debuggerRows: document.querySelectorAll('#acl-debug-panel [data-acl-debug-id]').length,
            };
        };
    `,
        });

        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => typeof window.runLifecycleSoakBatch === 'function',
        );

        const assertBalanced = (state) => {
            // Run the assert balanced operation
            expect(state.allDestroyed).toBe(true);
            expect(state.connectedHosts).toBe(0);
            expect(state.hookListeners).toBe(0);
            expect(state.cleanups).toBeGreaterThan(0);
            expect(state.ownedResourcesReleased).toBe(true);
            expect(state.dataCacheSize).toBe(0);
            expect(state.detachedDataEntries).toBe(0);
            expect(state.timers).toBe(0);
            expect(state.frames).toBe(0);
            expect(state.mutationObservers).toBe(0);
            expect(state.resizeObservers).toBe(0);
            expect(state.intersectionObservers).toBe(0);
            expect(state.debuggerRows).toBe(0);
        };

        assertBalanced(
            await page.evaluate(
                // Read the browser state
                () => window.runLifecycleSoakBatch(50),
            ),
        );
        const cdp = browserName === 'chromium' ? await context.newCDPSession(page) : null,
            readHeap = async () => {
                // Read heap
                if (!cdp) return null;
                await cdp.send('HeapProfiler.collectGarbage');
                return (await cdp.send('Runtime.getHeapUsage')).usedSize;
            },
            baselineHeap = await readHeap(),
            heapSamples = [];

        // Iterate over the indexed values
        for (let batch = 0; batch < 5; batch++) {
            assertBalanced(
                await page.evaluate(
                    // Read the browser state
                    () => window.runLifecycleSoakBatch(100),
                ),
            );
            if (cdp) heapSamples.push(await readHeap());
        }

        if (cdp) {
            const finalHeap = heapSamples.at(-1),
                allowedGrowth = Math.max(2 * 1024 * 1024, baselineHeap * 0.1);
            expect(
                finalHeap,
                `heap samples: baseline=${baselineHeap}, batches=${heapSamples.join(',')}`,
            ).toBeLessThanOrEqual(baselineHeap + allowedGrowth);
            await cdp.send('HeapProfiler.collectGarbage');
            const retainedDetachedHosts = await page.evaluate(
                // Read the browser state
                () =>
                    window.soakDetachedHostRefs.filter(
                        // Select matching items
                        (reference) => reference.deref(),
                    ).length,
            );
            expect(retainedDetachedHosts).toBe(0);
            await cdp.detach();
        }
    });

    test('persistence, polling, keep-alive, dynamic, and debugger resources balance across hundreds of cycles', async ({
        page,
    }) => {
        // Exercise the test scenario
        test.slow();
        await preparePage(page);
        await page.evaluate(() => {
            // Read the browser state
            window.extendedResourceState = {
                pagehide: 0,
                hookListeners: 0,
                cleanups: 0,
                writes: 0,
            };
            const nativeAdd = window.addEventListener.bind(window),
                nativeRemove = window.removeEventListener.bind(window);
            window.addEventListener = (type, listener, options) => {
                // Read the browser state
                if (type === 'pagehide') window.extendedResourceState.pagehide++;
                return nativeAdd(type, listener, options);
            };
            window.removeEventListener = (type, listener, options) => {
                // Read the browser state
                if (type === 'pagehide') window.extendedResourceState.pagehide--;
                return nativeRemove(type, listener, options);
            };
        });
        await page.addScriptTag({
            type: 'module',
            content: `
        import Loader from '${baseUrl}/src/index.js';
        import ACLDebugger from '${baseUrl}/src/debugger.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false, dynamicTransition: 'none', runtimeCacheMax: 8 });
        await Loader.start();
        ACLDebugger.inject(Loader);
        const template = document.createElement('template');
        template.id = 'extended-resource-template';
        template.innerHTML = '<button data-acl-autofocus>resource host</button>';
        document.body.appendChild(template);
        const adapter = {
            getItem() { return null; },
            setItem() { window.extendedResourceState.writes++; },
            removeItem() {}
        };
        await Loader.define('extended-resource-card', '#extended-resource-template', {
            data: {
                poll: 60000,
                pauseWhenHidden: true,
                pauseWhenOffline: true,
                pauseWhenOffscreen: true
            },
            persist: 'custom',
            persistAdapter: adapter,
            persistDebounce: 60000,
            hooks: {
                mounted() {
                    const listener = () => {};
                    window.addEventListener('extended-resource-event', listener);
                    window.extendedResourceState.hookListeners++;
                    return () => {
                        window.removeEventListener('extended-resource-event', listener);
                        window.extendedResourceState.hookListeners--;
                        window.extendedResourceState.cleanups++;
                    };
                }
            }
        });
        await Loader.define('extended-dynamic-one', '#extended-resource-template');
        await Loader.define('extended-dynamic-two', '#extended-resource-template');
        await Loader.registerDynamicLoader('extended-dynamic-loader');
        window.Loader = Loader;

        window.runExtendedResourceCycles = async count => {
            const released = [];
            for (let cycle = 0; cycle < count; cycle++) {
                const element = document.createElement('extended-resource-card');
                element.setAttribute('keep-alive', '');
                document.body.appendChild(element);
                await element._load();
                void element.$props.$persistence.$save({ cycle }).catch(() => {});
                element.remove();
                document.body.appendChild(element);
                await element.reload();
                element.removeAttribute('keep-alive');
                await element._destroyImmediately();
                element.remove();
                released.push(
                    element._state === 'destroyed' &&
                    element._pollTimer === null &&
                    (element._pollSignalCleanups?.length || 0) === 0 &&
                    element._pollIntersectionObserver === null &&
                    element._persistenceDispose === null &&
                    element.$props.$persistence === undefined &&
                    (element._cleanups?.length || 0) === 0
                );
            }

            const dynamic = document.createElement('extended-dynamic-loader');
            dynamic.setAttribute('transition', 'none');
            dynamic.setAttribute('keep-alive', '');
            dynamic.setAttribute('keep-alive-max', '1');
            document.body.appendChild(dynamic);
            for (let cycle = 0; cycle < count; cycle++)
                await dynamic._switch(cycle % 2 ? 'extended-dynamic-one' : 'extended-dynamic-two');
            dynamic.remove();

            for (let cycle = 0; cycle < count; cycle++) {
                await Loader.toggleDebug();
                await Loader.toggleDebug();
            }
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            return {
                released: released.every(Boolean),
                resourceState: { ...window.extendedResourceState },
                dynamicCache: dynamic._cache.size,
                dynamicObserver: dynamic._attrObserver,
                dynamicFrame: dynamic._transitionFrame,
                dynamicTimer: dynamic._transitionTimer,
                dynamicScrollTimer: dynamic._scrollTimer,
                debuggerRows: document.querySelectorAll('#acl-debug-panel [data-acl-debug-id]').length,
                debuggerOverlays: document.querySelectorAll('#acl-debug-overlays > *').length,
                dataCacheSize: Loader.getDataCacheSize(),
                detachedDataEntries: Loader._detachedDataEntries.size,
            };
        };
    `,
        });

        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => typeof window.runExtendedResourceCycles === 'function',
        );
        const state = await page.evaluate(
            // Read the browser state
            () => window.runExtendedResourceCycles(100),
        );
        expect(state).toEqual({
            released: true,
            resourceState: {
                pagehide: 0,
                hookListeners: 0,
                cleanups: 200,
                writes: 200,
            },
            dynamicCache: 0,
            dynamicObserver: null,
            dynamicFrame: null,
            dynamicTimer: null,
            dynamicScrollTimer: null,
            debuggerRows: 0,
            debuggerOverlays: 0,
            dataCacheSize: 0,
            detachedDataEntries: 0,
        });
    });
});
