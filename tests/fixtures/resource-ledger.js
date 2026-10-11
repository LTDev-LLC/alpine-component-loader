// Instrument native resources for both lifecycle stress tests and runtime benchmarks
export const installResourceLedger = () => {
    // Read the browser state
    const resources = (window.__aclResourceLedger = {
            timers: new Set(),
            frames: new Set(),
            mutationObservers: 0,
            resizeObservers: 0,
            intersectionObservers: 0,
            peaks: {
                mutationObservers: 0,
                resizeObservers: 0,
                intersectionObservers: 0,
            },
            listeners: new Set(),
            peakListeners: 0,
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
                    this.__aclHarness = new Error().stack?.includes('InjectedScript');
                }

                observe(...args) {
                    // Count the fixture observer when it becomes active
                    if (!this.__aclActive && !this.__aclHarness) {
                        this.__aclActive = true;
                        resources[key]++;
                        resources.peaks[key] = Math.max(resources.peaks[key], resources[key]);
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
    // Count independent global environmental listeners with native once semantics
    for (const target of [window, document]) {
        const add = target.addEventListener.bind(target),
            remove = target.removeEventListener.bind(target);
        target.addEventListener = (type, listener, options) => {
            if (new Error().stack?.includes('InjectedScript')) return add(type, listener, options);
            const capture = options === true || Boolean(options?.capture),
                existing = [...resources.listeners].find(
                    // Inspect the controlled fixture and its completion
                    (item) =>
                        item.target === target &&
                        item.type === type &&
                        item.listener === listener &&
                        item.capture === capture,
                );
            if (existing || !listener) return add(type, existing?.wrapped || listener, options);
            const entry = {
                target,
                type,
                listener,
                capture,
                wrapped: listener,
            };
            if (options?.once)
                entry.wrapped = function (event) {
                    // Retire an automatically removed native listener before invoking its callback
                    resources.listeners.delete(entry);
                    return typeof listener === 'function' ? listener.call(this, event) : listener.handleEvent(event);
                };
            resources.listeners.add(entry);
            resources.peakListeners = Math.max(resources.peakListeners, resources.listeners.size);
            return add(type, entry.wrapped, options);
        };
        target.removeEventListener = (type, listener, options) => {
            const capture = options === true || Boolean(options?.capture),
                entry = [...resources.listeners].find(
                    // Inspect the controlled fixture and its completion
                    (item) =>
                        item.target === target &&
                        item.type === type &&
                        item.listener === listener &&
                        item.capture === capture,
                );
            if (entry) resources.listeners.delete(entry);
            return remove(type, entry?.wrapped || listener, options);
        };
    }
};
