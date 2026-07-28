// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Publish service worker state without making events mandatory for consumers
const dispatch = (name, detail) => {
    // Dispatch
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined')
        window.dispatchEvent(new CustomEvent(`acl:offline-${name}`, { detail }));
};

let offlineMessageListening = false;

// Register an explicitly selected generated ACL service worker
export const registerOfflineWorker = async (url = '/acl-sw.js', options = {}) => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker)
        throw new TypeError('[ACL Offline] Service workers are not available in this environment.');
    const registration = await navigator.serviceWorker.register(url, options);
    dispatch('registered', {
        scope: registration.scope,
        url: new URL(url, location.href).href,
    });
    registration.addEventListener('updatefound', () => {
        // Handle the updatefound event
        return dispatch('updatefound', { scope: registration.scope });
    });
    if (!offlineMessageListening && typeof navigator.serviceWorker.addEventListener === 'function') {
        navigator.serviceWorker.addEventListener('message', (event) => {
            // Forward generated worker quota and lifecycle messages once
            if (event.data?.type !== 'ACL_OFFLINE') return;
            dispatch(event.data.event || 'message', event.data);
        });
        offlineMessageListening = true;
    }
    return registration;
};

export const activateOfflineWorker = async (registration) => {
    // Promote a generated worker configured for prompt activation
    if (!registration) throw new TypeError('[ACL Offline] A service worker registration is required.');
    const worker = registration.waiting || registration.installing;
    if (!worker) return false;
    worker.postMessage({ type: 'ACL_ACTIVATE' });
    dispatch('activating', { scope: registration.scope });
    return true;
};

// Reduce browser service worker state to a serializable diagnostics snapshot
export const getOfflineStatus = async () => {
    const supported = typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker);
    if (!supported)
        return {
            supported: false,
            controlled: false,
            registrations: [],
        };
    const registrations = await navigator.serviceWorker.getRegistrations(),
        estimate = await navigator.storage?.estimate?.();
    return {
        supported: true,
        controlled: Boolean(navigator.serviceWorker.controller),
        storage: estimate
            ? {
                  usage: estimate.usage ?? null,
                  quota: estimate.quota ?? null,
                  remaining:
                      Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage)
                          ? Math.max(0, estimate.quota - estimate.usage)
                          : null,
              }
            : null,
        registrations: registrations.map(
            // Transform the current item
            (registration) => ({
                scope: registration.scope,
                active: registration.active?.state || null,
                waiting: registration.waiting?.state || null,
                installing: registration.installing?.state || null,
            }),
        ),
    };
};

export default {
    activateOfflineWorker,
    registerOfflineWorker,
    getOfflineStatus,
};
