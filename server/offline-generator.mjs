import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { normalizeManifest, resolveManifestDependencyTags } from '../dist/runtime/registry.js';
import { minifyJavaScript } from './javascript-minifier.mjs';
import { writeProjectFile } from './file-writer.mjs';

const hash = (value) => {
        // Hash
        return createHash('sha256').update(value).digest('base64url');
    },
    isRemote = (value) => {
        // Check whether remote
        return /^(?:https?:)?\/\//i.test(value);
    },
    normalizeBaseUrl = (value) => {
        // Normalize base url
        return `/${String(value || '/').replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '/');
    },
    normalizeBrowserUrl = (value) => {
        // Normalize browser url
        if (isRemote(value)) return value;
        const parsed = new URL(value, 'https://acl.invalid');
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    },
    joinBrowserPath = (baseUrl, source) => {
        // Join browser path
        if (isRemote(source) || source.startsWith('/')) return normalizeBrowserUrl(source);
        return normalizeBrowserUrl(`${baseUrl.replace(/\/$/, '')}/${source.replace(/^\.\//, '')}`);
    },
    resolveBrowserAsset = (baseUrl, manifestBasePath, source) => {
        // Resolve browser asset
        if (isRemote(source) || source.startsWith('/')) return source;
        const root = String(manifestBasePath || '').startsWith('/')
            ? manifestBasePath
            : joinBrowserPath(baseUrl, manifestBasePath || '');
        return joinBrowserPath(root || '/', source);
    },
    descriptorUrl = (value) => {
        // Run the descriptor url operation
        return typeof value === 'string' ? value : value?.url;
    },
    localFileFor = (manifestDirectory, manifestBasePath, source) => {
        // Run the local file for operation
        return resolve(manifestDirectory, String(manifestBasePath || '').replace(/^\/+/, ''), source);
    },
    walkFiles = async (directory) => {
        // Walk files
        const files = [];
        // Process each entry
        for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
            // Compare the current items
            (a, b) => a.name.localeCompare(b.name),
        )) {
            const path = resolve(directory, entry.name);
            if (entry.isDirectory()) files.push(...(await walkFiles(path)));
            else if (entry.isFile()) files.push(path);
        }
        return files;
    };

// Expand template fallbacks and external dependencies into one component asset list
const collectComponentAssets = (definition) => {
    const options = definition.options || {},
        assets = [definition.source];
    // Process each source
    for (const source of [options.loadingTemplate, options.fallback]) {
        if (typeof source === 'string' && !source.startsWith('#')) assets.push(source);
    }
    // Process each descriptor
    for (const descriptor of [...(options.externalCss || []), ...(options.externalScripts || [])]) {
        const url = descriptorUrl(descriptor);
        if (url) assets.push(url);
    }
    return assets;
};

const normalizeOfflineConfig = (value = { version: 1 }) => {
    // Validate the small declarative policy surface consumed by the generated worker
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1)
        throw new TypeError('Offline configuration must be a version 1 object.');
    const rootKeys = new Set(['$schema', 'version', 'activation', 'navigation', 'runtimeRoutes']);
    if (
        Object.keys(value).some(
            // Reject unknown root policy fields
            (key) => !rootKeys.has(key),
        )
    )
        throw new TypeError('Offline configuration contains an unsupported property.');
    if (value.activation && !['immediate', 'prompt'].includes(value.activation))
        throw new TypeError(`Unsupported offline activation policy "${value.activation}".`);
    if (value.navigation) {
        const navigationKeys = new Set(['fallback', 'allow', 'strategy']);
        if (
            typeof value.navigation !== 'object' ||
            Array.isArray(value.navigation) ||
            Object.keys(value.navigation).some(
                // Reject unknown navigation policy fields
                (key) => !navigationKeys.has(key),
            )
        )
            throw new TypeError('Offline navigation configuration contains an unsupported property.');
        if (typeof value.navigation.fallback !== 'string' || !value.navigation.fallback)
            throw new TypeError('Offline navigation.fallback must be a non-empty string.');
        if (
            value.navigation.allow &&
            (!Array.isArray(value.navigation.allow) ||
                value.navigation.allow.some(
                    // Require string path prefixes
                    (path) => typeof path !== 'string',
                ) ||
                new Set(value.navigation.allow).size !== value.navigation.allow.length)
        )
            throw new TypeError('Offline navigation.allow must contain unique strings.');
        if (value.navigation.strategy && !['cache-first', 'network-first'].includes(value.navigation.strategy))
            throw new TypeError(`Unsupported offline navigation strategy "${value.navigation.strategy}".`);
    }
    // Run this operation
    if (value.runtimeRoutes && !Array.isArray(value.runtimeRoutes))
        throw new TypeError('Offline runtimeRoutes must be an array.');
    // Run this operation
    for (const route of value.runtimeRoutes || []) {
        const routeKeys = new Set(['path', 'origin', 'strategy', 'cacheName', 'maxEntries', 'maxAgeSeconds']);
        if (
            !route ||
            typeof route !== 'object' ||
            Array.isArray(route) ||
            Object.keys(route).some(
                // Reject unknown runtime route policy fields
                (key) => !routeKeys.has(key),
            ) ||
            typeof route.path !== 'string' ||
            !['cache-first', 'network-first', 'stale-while-revalidate', 'network-only'].includes(route.strategy)
        )
            throw new TypeError('Every offline runtime route requires a path and supported strategy.');
        if (route.maxEntries != null && (!Number.isInteger(route.maxEntries) || route.maxEntries < 0))
            throw new TypeError('Offline runtime route maxEntries must be a non-negative integer.');
        if (route.maxAgeSeconds != null && (!Number.isFinite(route.maxAgeSeconds) || route.maxAgeSeconds < 0))
            throw new TypeError('Offline runtime route maxAgeSeconds must be a non-negative number.');
    }
    return {
        version: 1,
        activation: value.activation || 'immediate',
        navigation: value.navigation
            ? {
                  fallback: value.navigation.fallback,
                  allow: value.navigation.allow || [],
                  strategy: value.navigation.strategy || 'network-first',
              }
            : null,
        // Run this operation
        runtimeRoutes: (value.runtimeRoutes || []).map((route, index) => ({
            path: route.path,
            origin: route.origin || null,
            strategy: route.strategy,
            cacheName: route.cacheName || `route-${index}`,
            maxEntries: route.maxEntries ?? 50,
            maxAgeSeconds: route.maxAgeSeconds ?? null,
        })),
    };
};

const createServiceWorker = ({ entries, cacheName, cachePrefix, config }) => {
    // Create service worker
    return `// Use content-addressed names so deployments never reuse stale entries
const CACHE_NAME = ${JSON.stringify(cacheName)};
const CACHE_PREFIX = ${JSON.stringify(cachePrefix)};
const CONFIG = ${JSON.stringify(config)};
const REQUIRED = ${JSON.stringify(
        entries
            .filter(
                // Select matching items
                (entry) => entry.required,
            )
            .map(
                // Transform the current item
                (entry) => entry.url,
            ),
    )};
const OPTIONAL = ${JSON.stringify(
        entries
            .filter(
                // Select matching items
                (entry) => !entry.required,
            )
            .map(
                // Transform the current item
                (entry) => entry.url,
            ),
    )};
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
`;
};

// Generate a deterministic service worker and precache manifest from a v1 component graph
export const generateOfflineBundle = async ({
    manifestFile,
    outDir,
    groups = [],
    assets = [],
    baseUrl = '/',
    minifyJavaScriptAssets = false,
    force = false,
    dryRun = false,
    namespace = 'default',
    configFile = null,
    config = null,
} = {}) => {
    const rawManifest = JSON.parse(await readFile(manifestFile, 'utf8')),
        offlineConfig = normalizeOfflineConfig(
            config || (configFile ? JSON.parse(await readFile(configFile, 'utf8')) : { version: 1 }),
        ),
        manifest = normalizeManifest(rawManifest),
        requestedRoots = groups.length
            ? groups.flatMap((group) => {
                  // Expand the current item
                  if (!rawManifest.groups?.[group]) throw new TypeError(`Manifest group does not exist: ${group}`);
                  return rawManifest.groups[group];
              })
            : manifest.order,
        tags = resolveManifestDependencyTags(manifest, requestedRoots),
        selected = new Map(
            manifest.components.map(
                // Transform the current item
                (component) => [component.tagName, component],
            ),
        ),
        manifestDirectory = dirname(manifestFile),
        normalizedBaseUrl = normalizeBaseUrl(baseUrl),
        assetRecords = new Map();

    // Hash local component assets while treating remote dependencies as optional
    for (const tag of tags) {
        const definition = selected.get(tag);
        // Process each source
        for (const source of collectComponentAssets(definition)) {
            const remote = isRemote(source),
                url = resolveBrowserAsset(normalizedBaseUrl, rawManifest.basePath, source);
            if (assetRecords.has(url)) continue;
            let revision = definition.options?.templateRevision || null;
            if (!remote) {
                // Guard the generate offline bundle operation against runtime failures
                try {
                    revision ||= `sha256-${hash(await readFile(localFileFor(manifestDirectory, rawManifest.basePath, source)))}`;
                } catch (error) {
                    throw new TypeError(`Offline asset does not exist for <${tag}>: ${source} (${error.message})`);
                }
            }
            assetRecords.set(url, {
                url,
                revision: revision || `url-${hash(source)}`,
                required: !remote,
                component: tag,
            });
        }
    }

    // Expand explicit asset directories into deterministic browser paths
    for (const source of assets) {
        const remote = isRemote(source);
        if (remote) {
            const url = joinBrowserPath(normalizedBaseUrl, source);
            assetRecords.set(url, {
                url,
                revision: `url-${hash(source)}`,
                required: false,
                component: null,
            });
            continue;
        }
        const localPath = resolve(manifestDirectory, source.replace(/^\/+/, '')),
            info = await stat(localPath),
            files = info.isDirectory() ? await walkFiles(localPath) : [localPath];
        if (!info.isDirectory() && !info.isFile())
            throw new TypeError(`Offline asset must be a file or directory: ${source}`);
        // Process each file
        for (const file of files) {
            const suffix = info.isDirectory() ? relative(localPath, file).split(sep).join('/') : '',
                readableBrowserSource = suffix ? `${source.replace(/[\\/]+$/, '')}/${suffix}` : source,
                shouldMinify =
                    minifyJavaScriptAssets &&
                    extname(file).toLowerCase() === '.js' &&
                    !file.toLowerCase().endsWith('.min.js'),
                browserSource = shouldMinify
                    ? readableBrowserSource.replace(/\.js$/i, '.min.js')
                    : readableBrowserSource,
                url = joinBrowserPath(normalizedBaseUrl, browserSource),
                readableContent = await readFile(file),
                publishedContent = shouldMinify
                    ? await minifyJavaScript(readableContent.toString('utf8'))
                    : readableContent,
                revision = `sha256-${hash(publishedContent)}`;
            assetRecords.set(url, {
                url,
                revision,
                required: true,
                component: null,
            });
        }
    }

    // Derive the cache name from sorted content so identical inputs stay reproducible
    if (offlineConfig.navigation) {
        const fallbackUrl = joinBrowserPath(normalizedBaseUrl, offlineConfig.navigation.fallback);
        if (!assetRecords.has(fallbackUrl))
            throw new TypeError(
                `Offline navigation fallback must be included by --asset or the component graph: ${fallbackUrl}`,
            );
        offlineConfig.navigation.fallback = fallbackUrl;
    }
    const entries = [...assetRecords.values()].sort(
            // Compare the current items
            (a, b) => a.url.localeCompare(b.url),
        ),
        digest = hash(
            JSON.stringify({
                // Include policies so changing behavior creates a new deployment identity
                entries,
                config: offlineConfig,
            }),
        ),
        cachePrefix = `acl-offline-${namespace}-`,
        cacheName = `${cachePrefix}${digest.slice(0, 16)}`,
        precacheManifest = {
            version: 1,
            namespace,
            cacheName,
            groups,
            components: tags,
            config: offlineConfig,
            entries,
        },
        manifestPath = resolve(outDir, 'acl-precache-manifest.json'),
        serviceWorkerPath = resolve(outDir, 'acl-sw.js'),
        manifestContent = `${JSON.stringify(precacheManifest, null, 2)}\n`,
        serviceWorkerContent = createServiceWorker({
            entries,
            cacheName,
            cachePrefix,
            config: offlineConfig,
        });

    if (!dryRun) {
        await writeProjectFile(manifestPath, manifestContent, { force });
        await writeProjectFile(serviceWorkerPath, serviceWorkerContent, { force });
    }
    return {
        command: 'offline',
        dryRun,
        manifest: precacheManifest,
        files: dryRun ? [] : [manifestPath, serviceWorkerPath],
        outputs: {
            manifest: manifestContent,
            serviceWorker: serviceWorkerContent,
        },
    };
};
