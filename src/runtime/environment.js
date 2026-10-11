// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

const documents = new WeakMap(),
    targets = new WeakMap();

// Release pooled polling subscriptions without affecting other component owners
export const releasePollingSignals = (component) => {
    component._pollSignalCleanups?.forEach(
        // Remove each owned listener or observed target
        (cleanup) => cleanup(),
    );
    component._pollSignalCleanups = null;
    component._pollIntersectionObserver = null;
    component._pollIsIntersecting = true;
};

// Keep visibility, connectivity, and intersection checks in the optional capability
export const isPollingPaused = (component) =>
    (component._getPollingPauseSetting('pause-polling-when-hidden', 'pauseWhenHidden') && document.hidden) ||
    (component._getPollingPauseSetting('pause-polling-when-offline', 'pauseWhenOffline') &&
        navigator.onLine === false) ||
    (component._getPollingPauseSetting('pause-polling-when-offscreen', 'pauseWhenOffscreen') &&
        !component._pollIsIntersecting);

// Share one event listener while retaining independent callback ownership
export const subscribeEnvironment = (target, event, callback) => {
    const events = targets.get(target) || new Map();
    targets.set(target, events);
    let entry = events.get(event);
    if (!entry) {
        entry = {
            callbacks: new Set(),
            listener: () => entry.callbacks.forEach((fn) => fn()),
        };
        events.set(event, entry);
        target.addEventListener(event, entry.listener);
    }
    entry.callbacks.add(callback);
    return () => {
        entry.callbacks.delete(callback);
        if (!entry.callbacks.size) {
            target.removeEventListener(event, entry.listener);
            events.delete(event);
        }
    };
};

// Pool observers by immutable native configuration and release empty pools
export const observeIntersection = (element, callback, options = {}) => {
    const document = element.ownerDocument,
        pools = documents.get(document) || [],
        // Resolve this operation and preserve independent ownership
        thresholds = JSON.stringify([].concat(options.threshold ?? 0).sort((a, b) => a - b));
    documents.set(document, pools);
    let pool = pools.find(
        // Resolve this operation and preserve independent ownership
        (item) =>
            item.root === (options.root || null) &&
            item.margin === (options.rootMargin || '0px') &&
            item.thresholds === thresholds,
    );
    if (!pool) {
        const callbacks = new Map();
        pool = {
            root: options.root || null,
            margin: options.rootMargin || '0px',
            thresholds,
            callbacks,
            observer: new document.defaultView.IntersectionObserver((entries) => {
                // Deliver only entries owned by each target subscriber
                entries.forEach((entry) => callbacks.get(entry.target)?.forEach((fn) => fn([entry])));
            }, options),
        };
        pools.push(pool);
    }
    const callbacks = pool.callbacks.get(element) || new Set();
    pool.callbacks.set(element, callbacks);
    callbacks.add(callback);
    pool.observer.observe(element);
    let released = false;
    return {
        disconnect() {
            // Unobserve one subscriber without disrupting other targets
            if (released) return;
            released = true;
            callbacks.delete(callback);
            if (!callbacks.size) {
                pool.callbacks.delete(element);
                pool.observer.unobserve(element);
            }
            if (!pool.callbacks.size) {
                pool.observer.disconnect();
                pools.splice(pools.indexOf(pool), 1);
            }
        },
    };
};

// Attach polling subscriptions only after the deferred capability is available
export const installPollingSignals = (component) => {
    // Restart polling only when every configured pause condition is clear
    const resume = () => {
        if (component.isConnected && !isPollingPaused(component)) component._startPolling();
    };
    if (component._getPollingPauseSetting('pause-polling-when-hidden', 'pauseWhenHidden')) {
        (component._pollSignalCleanups ||= []).push(subscribeEnvironment(document, 'visibilitychange', resume));
    }
    if (component._getPollingPauseSetting('pause-polling-when-offline', 'pauseWhenOffline')) {
        (component._pollSignalCleanups ||= []).push(subscribeEnvironment(window, 'online', resume));
    }
    if (component._getPollingPauseSetting('pause-polling-when-offscreen', 'pauseWhenOffscreen')) {
        if ('IntersectionObserver' in window) {
            component._pollIsIntersecting = false;
            const observer = observeIntersection(component, (entries) => {
                // Process intersection changes
                const wasIntersecting = component._pollIsIntersecting,
                    isIntersecting = entries.some(
                        // Check the current item
                        (entry) => entry.target === component && entry.isIntersecting,
                    );
                component._pollIsIntersecting = isIntersecting;
                if (!isIntersecting) {
                    component._stopPolling();
                    return;
                }
                if (!wasIntersecting) resume();
            });
            component._pollIntersectionObserver = observer;
            (component._pollSignalCleanups ||= []).push(() => {
                // Capture the pushed value
                observer.disconnect();
                if (component._pollIntersectionObserver === observer) component._pollIntersectionObserver = null;
                component._pollIsIntersecting = true;
            });
        } else component._pollIsIntersecting = true;
    }
};

// Share deferred component observation without adding callbacks to the eager path
export const observeDeferredComponent = (component, hydrating) =>
    observeIntersection(
        component,
        (entries) => {
            // Begin work only for a visible target that still owns its subscription
            if (!entries[0].isIntersecting) return;
            if (hydrating) component._beginHydration();
            else {
                void component._load();
                component._cancelDeferredLoad();
            }
        },
        { rootMargin: '100px' },
    );
