// Use content-addressed names so deployments never reuse stale entries
const CACHE_NAME = "acl-offline-example-KSUv6yjDjrGd9d6F";
const CACHE_PREFIX = "acl-offline-example-";
const CONFIG = {"version":1,"activation":"immediate","navigation":{"fallback":"/examples/offline/index.html","allow":["/examples/offline/"],"strategy":"network-first"},"runtimeRoutes":[{"path":"/examples/offline/runtime-message.json","origin":null,"strategy":"cache-first","cacheName":"example-runtime","maxEntries":4,"maxAgeSeconds":86400}]};
const REQUIRED = ["/dist/acl-load-error.min.js","/dist/index.min.js","/dist/offline.min.js","/dist/runtime/caches.min.js","/dist/runtime/component/data-gate-controller.min.js","/dist/runtime/component/factory.min.js","/dist/runtime/component/lifecycle-controller.min.js","/dist/runtime/component/loading-controller.min.js","/dist/runtime/component/render-controller.min.js","/dist/runtime/component/state-controller.min.js","/dist/runtime/config.min.js","/dist/runtime/contracts.min.js","/dist/runtime/data-options.min.js","/dist/runtime/errors.min.js","/dist/runtime/lifecycle.min.js","/dist/runtime/loader.min.js","/dist/runtime/props.min.js","/dist/runtime/registry.min.js","/dist/runtime/rendering.min.js","/dist/runtime/template-cache.min.js","/dist/runtime/values.min.js","/examples/offline/acl-manifest.json","/examples/offline/app.min.js","/examples/offline/components/offline-shell.html","/examples/offline/components/offline-status.html","/examples/offline/index.html","/examples/offline/styles.css"];
const OPTIONAL = ["https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js"];
const PRECACHED = new Set([...REQUIRED, ...OPTIONAL].map(url => new URL(url, self.registration.scope).href));

// Fail installation for local assets while tolerating unavailable remote assets
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(REQUIRED.map(url => cache.add(url)));
        await Promise.allSettled(OPTIONAL.map(url => cache.add(url)));
        if (CONFIG.activation === 'immediate') await self.skipWaiting();
    })());
});

// Remove older bundles in the same namespace before taking control
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        await Promise.all((await caches.keys())
            .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

// Allow applications using prompt activation to promote the waiting worker explicitly
self.addEventListener('message', event => {
    if (event.data?.type === 'ACL_ACTIVATE') event.waitUntil(self.skipWaiting());
});

const notifyClients = async detail => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: 'ACL_OFFLINE', ...detail }));
};

const trimCache = async (cache, maxEntries) => {
    if (!Number.isInteger(maxEntries) || maxEntries < 0) return;
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map(key => cache.delete(key)));
};

const storeResponse = async (cache, request, response, route) => {
    if (!response?.ok) return response;
    const headers = new Headers(response.headers);
    headers.set('x-acl-cached-at', String(Date.now()));
    const stored = new Response(response.clone().body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
    try {
        await cache.put(request, stored.clone());
    } catch (error) {
        if (error?.name !== 'QuotaExceededError') throw error;
        await trimCache(cache, Math.max(0, Math.floor(route.maxEntries / 2)));
        await notifyClients({ event: 'quota', cacheName: route.cacheName });
        await cache.put(request, stored);
    }
    await trimCache(cache, route.maxEntries);
    return response;
};

const runtimeResponse = async (request, route, event) => {
    if (route.strategy === 'network-only') return fetch(request);
    const cache = await caches.open(CACHE_PREFIX + 'runtime-' + route.cacheName),
        network = () => fetch(request).then(response => storeResponse(cache, request, response, route));
    let cached = await cache.match(request);
    if (cached && route.maxAgeSeconds != null) {
        const cachedAt = Number(cached.headers.get('x-acl-cached-at'));
        if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > route.maxAgeSeconds * 1000) {
            await cache.delete(request);
            cached = null;
        }
    }
    if (route.strategy === 'cache-first') return cached || network();
    if (route.strategy === 'stale-while-revalidate') {
        const update = network();
        if (!cached) return update;
        event.waitUntil(update);
        return cached;
    }
    try {
        return await network();
    } catch (error) {
        if (cached) return cached;
        throw error;
    }
};

const navigationResponse = async request => {
    const policy = CONFIG.navigation,
        allowed = !policy.allow.length || policy.allow.some(path => new URL(request.url).pathname.startsWith(path)),
        cache = await caches.open(CACHE_NAME);
    if (!allowed) return fetch(request);
    if (policy.strategy === 'cache-first') return await cache.match(request) || await cache.match(policy.fallback) || fetch(request);
    try {
        return await fetch(request);
    } catch {
        return await cache.match(request) || await cache.match(policy.fallback) || Response.error();
    }
};

// Intercept exact precache URLs plus explicitly configured navigation and runtime routes
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    if (PRECACHED.has(event.request.url)) {
        event.respondWith(caches.open(CACHE_NAME).then(async cache => await cache.match(event.request) || fetch(event.request)));
        return;
    }
    if (event.request.mode === 'navigate' && CONFIG.navigation) {
        event.respondWith(navigationResponse(event.request));
        return;
    }
    const url = new URL(event.request.url),
        route = CONFIG.runtimeRoutes.find(candidate =>
            (!candidate.origin || candidate.origin === url.origin) && url.pathname.startsWith(candidate.path)
        );
    if (route) event.respondWith(runtimeResponse(event.request, route, event));
});
