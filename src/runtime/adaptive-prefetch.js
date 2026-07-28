// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const DEFAULTS = Object.freeze({
    selector: '[data-acl-prefetch]',
    triggers: ['hover', 'focus', 'viewport'],
    hoverDelay: 75,
    rootMargin: '200px',
    concurrency: 2,
    respectDataSaver: true,
});

const closestTarget = (node, root, selector) => {
    // Run the closest target operation
    const element = node?.nodeType === 1 ? node : node?.parentElement,
        target = element?.closest?.(selector);
    return target && (root === document || root.contains?.(target)) ? target : null;
};

const connectionSkipReason = (options) => {
    // Run the connection skip reason operation
    if (typeof navigator === 'undefined') return null;
    if (navigator.onLine === false) return 'offline';
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!options.respectDataSaver || !connection) return null;
    if (connection.saveData) return 'save-data';
    if (['slow-2g', '2g'].includes(connection.effectiveType)) return 'constrained-network';
    return null;
};

export const createAdaptivePrefetchController = (loaderClass, supplied = {}) => {
    // Create adaptive prefetch controller
    if (typeof document === 'undefined') throw new TypeError('[ACL] Adaptive prefetch requires browser DOM APIs.');
    const options = {
            ...DEFAULTS,
            ...(supplied || {}),
        },
        root = options.root || document,
        triggers = new Set(options.triggers || DEFAULTS.triggers),
        completed = new Set(),
        timers = new Map(),
        observed = new Set();
    let disconnected = false,
        intersectionObserver = null,
        mutationObserver = null,
        idleId = null;

    const dispatch = (name, detail) => {
        // Dispatch
        return loaderClass._dispatchRuntimeEvent?.(name, {
            phase: 'prefetch',
            adaptive: true,
            ...detail,
        });
    };

    const resolveTokens = (target) => {
        // Resolve tokens
        const raw =
                typeof target === 'string'
                    ? target
                    : target?.getAttribute?.('data-acl-prefetch') || target?.localName || '',
            tokens = String(raw)
                .split(/[\s,]+/)
                .map(
                    // Transform the current item
                    (value) => value.trim().toLowerCase(),
                )
                .filter(Boolean),
            tags = [];
        // Process each token
        for (const token of tokens) {
            const group = loaderClass._manifestGroups?.get(token);
            if (group) tags.push(...group);
            else if (loaderClass.has(token)) tags.push(token);
            else
                dispatch('prefetchskip', {
                    reason: 'unknown-target',
                    target: token,
                });
        }
        return [...new Set(tags)];
    };

    const prefetch = async (target) => {
        // Prefetch
        if (disconnected) return {};
        const reason = connectionSkipReason(options);
        if (reason) {
            dispatch('prefetchskip', { reason });
            return {};
        }
        const tags = Array.isArray(target) ? [...new Set(target.flatMap(resolveTokens))] : resolveTokens(target),
            pending = tags.filter(
                // Select matching items
                (tag) => !completed.has(tag),
            );
        if (!pending.length) return {};
        pending.forEach(
            // Process the current item
            (tag) => completed.add(tag),
        );
        dispatch('prefetchstart', { tags: pending });
        const results = await loaderClass.prefetchGraph(pending, { concurrency: options.concurrency });
        Object.entries(results).forEach(([tag, result]) => {
            // Process the current item
            if (result.status === 'rejected') completed.delete(tag);
        });
        dispatch('prefetchend', {
            tags: pending,
            fulfilled: Object.values(results).filter(
                // Select matching items
                (result) => result.status === 'fulfilled',
            ).length,
            rejected: Object.values(results).filter(
                // Select matching items
                (result) => result.status === 'rejected',
            ).length,
        });
        return results;
    };

    const releaseElement = (element) => {
            // Release observer and hover ownership for one target
            if (observed.delete(element)) intersectionObserver?.unobserve(element);
            const timer = timers.get(element);
            if (timer != null) {
                clearTimeout(timer);
                timers.delete(element);
            }
        },
        releaseSubtree = (node) => {
            // Release active targets removed anywhere in one mutation subtree
            observed.forEach(
                // Release one observed descendant
                (element) => {
                    if (element === node || node?.contains?.(element)) releaseElement(element);
                },
            );
            timers.forEach(
                // Release one delayed hover descendant
                (_, element) => {
                    if (element === node || node?.contains?.(element)) releaseElement(element);
                },
            );
        },
        observeElement = (element) => {
            // Observe element
            if (!intersectionObserver || observed.has(element)) return;
            observed.add(element);
            intersectionObserver.observe(element);
        },
        scan = (node) => {
            // Run the scan operation
            if (node?.matches?.(options.selector)) observeElement(node);
            node?.querySelectorAll?.(options.selector).forEach(observeElement);
        };

    const onPointerOver = (event) => {
            // Run the on pointer over operation
            const target = closestTarget(event.target, root, options.selector);
            if (!target || timers.has(target)) return;
            timers.set(
                target,
                setTimeout(
                    () => {
                        // Run the scheduled delayed task
                        timers.delete(target);
                        void prefetch(target);
                    },
                    Math.max(0, Number(options.hoverDelay) || 0),
                ),
            );
        },
        onPointerOut = (event) => {
            // Run the on pointer out operation
            const target = closestTarget(event.target, root, options.selector),
                timer = target && timers.get(target);
            if (timer && !target.contains(event.relatedTarget)) {
                clearTimeout(timer);
                timers.delete(target);
            }
        },
        onFocus = (event) => {
            // Run the on focus operation
            const target = closestTarget(event.target, root, options.selector);
            if (target) void prefetch(target);
        };

    if (triggers.has('hover')) {
        root.addEventListener('pointerover', onPointerOver);
        root.addEventListener('pointerout', onPointerOut);
    }
    if (triggers.has('focus')) root.addEventListener('focusin', onFocus);
    if ((triggers.has('viewport') || triggers.has('visible')) && typeof IntersectionObserver !== 'undefined') {
        intersectionObserver = new IntersectionObserver(
            // Process intersection changes
            (entries) =>
                entries.forEach((entry) => {
                    // Process the current item
                    if (entry.isIntersecting) {
                        releaseElement(entry.target);
                        void prefetch(entry.target);
                    }
                }),
            {
                root: options.intersectionRoot || null,
                rootMargin: options.rootMargin,
            },
        );
    }
    scan(root);
    if (typeof MutationObserver !== 'undefined') {
        mutationObserver = new MutationObserver(
            // Process observed DOM mutations
            (records) => {
                records.forEach(
                    // Release removed mutation subtrees before considering reinsertions
                    (record) => record.removedNodes.forEach(releaseSubtree),
                );
                records.forEach(
                    // Observe matching targets from every added mutation subtree
                    (record) => record.addedNodes.forEach(scan),
                );
            },
        );
        mutationObserver.observe(root === document ? document.documentElement : root, {
            childList: true,
            subtree: true,
        });
    }
    if (triggers.has('idle')) {
        const run = () => {
            // Run
            idleId = null;
            const targets = Array.from(root.querySelectorAll?.(options.selector) || []);
            void Promise.all(targets.map(prefetch));
        };
        if (typeof requestIdleCallback === 'function') idleId = requestIdleCallback(run, { timeout: 2000 });
        else idleId = setTimeout(run, 200);
    }

    return {
        prefetch,
        disconnect() {
            // Run the disconnect operation
            if (disconnected) return;
            disconnected = true;
            root.removeEventListener('pointerover', onPointerOver);
            root.removeEventListener('pointerout', onPointerOut);
            root.removeEventListener('focusin', onFocus);
            timers.forEach(clearTimeout);
            timers.clear();
            intersectionObserver?.disconnect();
            mutationObserver?.disconnect();
            if (idleId != null) {
                if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId);
                else clearTimeout(idleId);
            }
            observed.clear();
        },
    };
};
