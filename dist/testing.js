// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Propagate jsDelivr's generated minified entry suffix to package-owned dependencies
const isMinifiedModule = new URL(import.meta.url).pathname.endsWith('.min.js'), resolveLocalModule = (specifier)=>isMinifiedModule ? specifier.replace(/\.js$/, '.min.js') : specifier, importLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), [{ default: AlpineComponentLoader, createLoader }, { htmlToFragment }] = await Promise.all([
    importLocalModule('./index.js'),
    importLocalModule('./runtime/rendering.js')
]);
let testTagSequence = 0;
const abortError = (reason)=>{
    // Create a standards-compatible abort exception
    return new DOMException(String(reason || 'Aborted'), 'AbortError');
};
export const waitForComponent = (element, { state = 'ready', timeout = 2000, signal } = {})=>{
    // Wait for a component lifecycle state with timeout and abort support
    return new Promise((resolve, reject)=>{
        // Settle the asynchronous operation
        if (!element) return reject(new TypeError('[ACL Testing] waitForComponent() requires an element.'));
        let timer = null, interval = null, settled = false;
        const cleanup = ()=>{
            // Run the cleanup operation
            clearTimeout(timer);
            clearInterval(interval);
            signal?.removeEventListener('abort', onAbort);
            element.removeEventListener('acl:error', onError);
        }, finish = (callback, value)=>{
            // Settle the waiter once and release its resources
            if (settled) return;
            settled = true;
            cleanup();
            callback(value);
        }, matches = ()=>{
            // Check whether the requested lifecycle state is present
            return state === 'error' ? element._state === 'idle' && Boolean(element.$props?.$error) : element._state === state;
        }, onAbort = ()=>{
            // Reject the waiter with the signal abort reason
            finish(reject, abortError(signal.reason));
        }, onError = (event)=>{
            // Resolve an error-state waiter from the component event
            if (state === 'error') finish(resolve, event.detail);
        };
        if (signal?.aborted) return onAbort();
        if (matches()) return finish(resolve, element);
        signal?.addEventListener('abort', onAbort, {
            once: true
        });
        element.addEventListener('acl:error', onError);
        interval = setInterval(()=>{
            // Run the scheduled interval task
            if (matches()) finish(resolve, element);
        }, 10);
        timer = setTimeout(// Run the scheduled delayed task
        ()=>finish(reject, new Error(`[ACL Testing] Timed out waiting for state "${state}".`)), timeout);
    });
};
const appendSlotValue = (element, name, value, settings)=>{
    // Run the append slot value operation
    const values = Array.isArray(value) ? value : [
        value
    ];
    values.forEach((item)=>{
        // Process the current item
        let nodes;
        if (typeof item === 'string') nodes = Array.from(htmlToFragment(item, settings).childNodes);
        else if (item instanceof Node) nodes = [
            item
        ];
        else nodes = [
            document.createTextNode(String(item ?? ''))
        ];
        nodes.forEach((node)=>{
            // Process the current item
            if (name !== 'default' && node.nodeType === Node.ELEMENT_NODE) node.setAttribute('slot', name);
            element.appendChild(node);
        });
    });
};
export const mountComponent = async ({ loader = AlpineComponentLoader, tagName = `acl-test-${++testTagSequence}`, template = '', options = {}, attributes = {}, properties = {}, slots = {}, container = typeof document === 'undefined' ? null : document.body, state = 'ready', timeout = 2000, signal } = {})=>{
    // Mount a uniquely named component and wait for its requested lifecycle state
    if (typeof document === 'undefined' || !container) throw new TypeError('[ACL Testing] mountComponent() requires browser DOM APIs and a container.');
    const templateElement = document.createElement('template');
    templateElement.content.appendChild(htmlToFragment(template, options));
    loader.define(tagName, templateElement, options);
    await loader.start();
    const element = document.createElement(tagName);
    Object.entries(attributes).forEach(([name, value])=>{
        // Process the current item
        if (value === false || value == null) return;
        element.setAttribute(name, value === true ? '' : String(value));
    });
    Object.entries(properties).forEach(([name, value])=>{
        // Process the current item
        element[name] = value;
    });
    if (typeof slots === 'string' || slots instanceof Node) appendSlotValue(element, 'default', slots, options);
    else Object.entries(slots || {}).forEach(// Process the current item
    ([name, value])=>appendSlotValue(element, name, value, options));
    container.appendChild(element);
    // Guard the mount component operation against runtime failures
    try {
        await waitForComponent(element, {
            state,
            timeout,
            signal
        });
    } catch (error) {
        element.remove();
        if (typeof element._performDestroy === 'function') await element._performDestroy();
        throw error;
    }
    let unmounted = false;
    return {
        element,
        async update ({ attributes: nextAttributes = {}, properties: nextProperties = {} } = {}) {
            // Apply attribute and property updates before the next Alpine tick
            Object.entries(nextAttributes).forEach(([name, value])=>{
                // Process the current item
                if (value === false || value == null) element.removeAttribute(name);
                else element.setAttribute(name, value === true ? '' : String(value));
            });
            Object.assign(element, nextProperties);
            if (typeof globalThis.Alpine?.nextTick === 'function') await new Promise(// Settle the asynchronous operation
            (resolve)=>globalThis.Alpine.nextTick(resolve));
            else await Promise.resolve();
            return element;
        },
        // Reload the mounted component through its public helper
        reload: (options)=>element.reload(options),
        async unmount () {
            // Remove the component and run idempotent lifecycle cleanup
            if (unmounted) return;
            unmounted = true;
            element.remove();
            if (typeof element._performDestroy === 'function') await element._performDestroy();
        }
    };
};
export const recordACLEvents = (target, names = [
    'acl:loadstart',
    'acl:loadend',
    'acl:error',
    'acl:cachehit',
    'acl:cacheevict',
    'acl:revalidated',
    'acl:hydrationstart',
    'acl:hydrationend'
])=>{
    // Record selected ACL DOM events and expose bounded wait helpers
    const records = [], listeners = new Map(), waiters = new Map();
    let stopped = false;
    names.forEach((name)=>{
        // Process the current item
        const listener = (event)=>{
            // Run the listener operation
            records.push(event);
            const queue = waiters.get(name) || [];
            waiters.delete(name);
            queue.forEach((waiter)=>{
                // Process the current item
                clearTimeout(waiter.timer);
                waiter.resolve(event);
            });
        };
        listeners.set(name, listener);
        target.addEventListener(name, listener);
    });
    return {
        records,
        waitFor (name, { timeout = 2000 } = {}) {
            // Wait for the first matching event or reject at the deadline
            const existing = records.find(// Find the matching item
            (event)=>event.type === name);
            if (existing) return Promise.resolve(existing);
            return new Promise((resolve, reject)=>{
                // Settle the asynchronous operation
                const waiter = {
                    resolve,
                    reject,
                    timer: null
                };
                waiter.timer = setTimeout(()=>{
                    // Run the scheduled delayed task
                    const queue = (waiters.get(name) || []).filter(// Select matching items
                    (item)=>item !== waiter);
                    if (queue.length) waiters.set(name, queue);
                    else waiters.delete(name);
                    reject(new Error(`[ACL Testing] Timed out waiting for ${name}.`));
                }, timeout);
                waiters.set(name, [
                    ...waiters.get(name) || [],
                    waiter
                ]);
            });
        },
        clear () {
            // Clear all captured event records
            records.length = 0;
        },
        stop () {
            // Stop recording and reject every pending event waiter
            if (stopped) return;
            stopped = true;
            listeners.forEach(// Process the current item
            (listener, name)=>target.removeEventListener(name, listener));
            listeners.clear();
            waiters.forEach(// Process the current item
            (queue)=>queue.forEach((waiter)=>{
                    // Process the current item
                    clearTimeout(waiter.timer);
                    waiter.reject(new Error('[ACL Testing] Event recorder stopped.'));
                }));
            waiters.clear();
        }
    };
};
const matchesRoute = (matcher, request)=>{
    // Match one request against an exact URL regular expression or callback
    return typeof matcher === 'string' ? request.url === matcher : matcher instanceof RegExp ? (matcher.lastIndex = 0, matcher.test(request.url)) : typeof matcher === 'function' && matcher(request);
};
export const installFetchMock = (routes = [], { target = globalThis } = {})=>{
    // Install a restorable route-based fetch mock with request history
    const originalFetch = target.fetch, requests = [];
    let activeRoutes = [
        ...routes
    ], restored = false;
    target.fetch = async (input, init = {})=>{
        // Match one fetch request and materialize its configured response
        const request = input instanceof Request ? input : new Request(input, init), record = {
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers),
            request
        };
        requests.push(record);
        const route = activeRoutes.find(// Find the matching item
        (candidate)=>(!candidate.method || candidate.method.toUpperCase() === request.method) && matchesRoute(candidate.match ?? candidate.url, record));
        if (!route) throw new Error(`[ACL Testing] No fetch mock matched ${request.method} ${request.url}.`);
        if (request.signal.aborted) throw abortError(request.signal.reason);
        if (route.delay) {
            await new Promise((resolve, reject)=>{
                // Settle the asynchronous operation
                const finish = // Run the finish operation
                (callback)=>(value)=>{
                        // Settle the asynchronous operation
                        request.signal.removeEventListener('abort', onAbort);
                        callback(value);
                    }, timer = setTimeout(finish(resolve), route.delay), onAbort = ()=>{
                    // Run the on abort operation
                    clearTimeout(timer);
                    reject(abortError(request.signal.reason));
                };
                request.signal.addEventListener('abort', onAbort, {
                    once: true
                });
            });
        }
        const response = typeof route.response === 'function' ? await route.response(record) : route.response;
        if (request.signal.aborted) throw abortError(request.signal.reason);
        if (response instanceof Response) return response;
        const body = response ?? route.body ?? null;
        return new Response(typeof body === 'object' && body !== null ? JSON.stringify(body) : body, {
            status: route.status || 200,
            headers: {
                ...typeof body === 'object' && body !== null ? {
                    'content-type': 'application/json'
                } : {},
                ...route.headers || {}
            }
        });
    };
    return {
        requests,
        reset (nextRoutes = routes) {
            // Reset request history and replace the active route table
            requests.length = 0;
            activeRoutes = [
                ...nextRoutes
            ];
        },
        restore () {
            // Restore the original fetch implementation once
            if (restored) return;
            restored = true;
            target.fetch = originalFetch;
        }
    };
};
export const assertLifecycleSequence = (records, expected, { exact = false } = {})=>{
    // Assert ordered lifecycle event names while allowing unrelated diagnostic events by default
    const actual = Array.from(records || [], (record)=>record?.type || record?.name || String(record)), wanted = Array.from(expected || [], String);
    if (exact) {
        // Run this operation
        if (actual.length !== wanted.length || actual.some((name, index)=>name !== wanted[index])) throw new Error(`[ACL Testing] Expected lifecycle sequence ${wanted.join(' -> ')}, received ${actual.join(' -> ')}.`);
        return actual;
    }
    let cursor = 0;
    // Run this operation
    for (const name of actual){
        if (name === wanted[cursor]) cursor++;
        if (cursor === wanted.length) return actual;
    }
    throw new Error(`[ACL Testing] Missing ordered lifecycle sequence ${wanted.join(' -> ')} in ${actual.join(' -> ')}.`);
};
export const createACLTestHarness = ({ loader = null, loaderOptions = {}, container = typeof document === 'undefined' ? null : document.body, disposeLoader = loader == null } = {})=>{
    // Own mounts mocks recorders and an isolated loader so runner cleanup is deterministic
    let activeLoader = loader || createLoader(loaderOptions), cleaned = false;
    const mounts = new Set(), recorders = new Set(), fetchMocks = new Set();
    // Run this operation
    const assertActive = ()=>{
        if (cleaned) throw new Error('[ACL Testing] This harness has been cleaned up.');
    }, // Run this operation
    cleanupResources = async ()=>{
        // Run this operation
        await Promise.allSettled([
            ...mounts
        ].map((mount)=>mount.unmount()));
        mounts.clear();
        // Run this operation
        recorders.forEach((recorder)=>recorder.stop());
        recorders.clear();
        // Run this operation
        fetchMocks.forEach((mock)=>mock.restore());
        fetchMocks.clear();
    };
    return {
        get loader () {
            return activeLoader;
        },
        // Run this operation
        async mount (options = {}) {
            assertActive();
            const handle = await mountComponent({
                container,
                ...options,
                loader: options.loader || activeLoader
            });
            mounts.add(handle);
            const unmount = handle.unmount.bind(handle);
            // Run this operation
            handle.unmount = async ()=>{
                await unmount();
                mounts.delete(handle);
            };
            return handle;
        },
        // Run this operation
        record (target = container || document, names) {
            assertActive();
            const recorder = recordACLEvents(target, names);
            recorders.add(recorder);
            return recorder;
        },
        // Run this operation
        mockFetch (routes = [], options = {}) {
            assertActive();
            const mock = installFetchMock(routes, options);
            fetchMocks.add(mock);
            return mock;
        },
        // Run this operation
        assertLifecycle (records, expected, options) {
            return assertLifecycleSequence(records, expected, options);
        },
        // Run this operation
        async reset () {
            assertActive();
            await cleanupResources();
            if (disposeLoader) {
                await activeLoader.dispose();
                activeLoader = createLoader(loaderOptions);
            } else {
                activeLoader.clearMetrics?.();
                activeLoader.clearDataCache?.();
            }
            return activeLoader;
        },
        // Run this operation
        async cleanup () {
            if (cleaned) return;
            cleaned = true;
            await cleanupResources();
            if (disposeLoader) await activeLoader.dispose();
        }
    };
};
export default {
    createACLTestHarness,
    mountComponent,
    waitForComponent,
    recordACLEvents,
    installFetchMock,
    assertLifecycleSequence
};
