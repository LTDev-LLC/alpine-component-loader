// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Store cache bookkeeping in private response headers alongside template content
const HEADER_PREFIX = 'acl__',
    HEADERS = {
        source: `${HEADER_PREFIX}source__`,
        fetchedAt: `${HEADER_PREFIX}fetched_at__`,
        lastAccess: `${HEADER_PREFIX}last_access__`,
        ttl: `${HEADER_PREFIX}ttl__`,
        revision: `${HEADER_PREFIX}revision__`,
    },
    HYDRATION_CONCURRENCY = 8,
    CACHE_HANDLE_LIMIT = 16;
let cacheIndexes = new WeakMap(),
    cacheHandlePromises = new Map();

// Isolate authored template revisions without changing their source identity
const appendRevision = (source, revision) => {
    if (!revision) return source;
    const url = new URL(source, globalThis.document?.baseURI || 'http://localhost/');
    url.searchParams.set('__acl_revision', revision);
    return url.href;
};

export const getTemplateCacheRequestKey = (source, revision = null) => {
    // Get template cache request key
    return appendRevision(source, revision);
};

export const describeTemplateCacheResponse = (request, response) => {
    // Run the describe template cache response operation
    return {
        request: request.url,
        source: response.headers.get(HEADERS.source) || request.url,
        revision: response.headers.get(HEADERS.revision) || null,
        fetchedAt: Number(response.headers.get(HEADERS.fetchedAt)) || 0,
        lastAccess: Number(response.headers.get(HEADERS.lastAccess)) || 0,
        ttl: response.headers.has(HEADERS.ttl) ? Number(response.headers.get(HEADERS.ttl)) : null,
    };
};

const getCacheIndex = (cache) => {
    // Allocate one private metadata index for the supplied cache object
    let index = cacheIndexes.get(cache);
    if (!index) {
        index = {
            entries: new Map(),
            persistedAccess: new Map(),
            reconciliation: null,
            writes: new Map(),
        };
        cacheIndexes.set(cache, index);
    }
    return index;
};

const requestUrl = (request) =>
    request?.url || new URL(String(request), globalThis.document?.baseURI || 'http://localhost/').href;

const recordTemplateCacheResponse = (cache, request, response, { persisted = true, preserveNewer = false } = {}) => {
    const normalizedRequest = { url: requestUrl(request) },
        entry = describeTemplateCacheResponse(normalizedRequest, response),
        index = getCacheIndex(cache),
        current = index.entries.get(normalizedRequest.url);
    if (
        !preserveNewer ||
        !current ||
        (current.lastAccess || current.fetchedAt) <= (entry.lastAccess || entry.fetchedAt)
    )
        index.entries.set(normalizedRequest.url, entry);
    if (persisted) index.persistedAccess.set(normalizedRequest.url, entry.lastAccess || entry.fetchedAt);
    return entry;
};

export const invalidateTemplateCacheIndex = (cache) => {
    // Invalidate one cache index or every known index after broad clears
    if (cache) cacheIndexes.delete(cache);
    else cacheIndexes = new WeakMap();
};

export const openTemplateCache = (cacheKey) => {
    // Reuse a bounded set of Cache handles so hot reads do not reopen one bucket
    const key = String(cacheKey);
    if (cacheHandlePromises.has(key)) return cacheHandlePromises.get(key);
    if (cacheHandlePromises.size >= CACHE_HANDLE_LIMIT)
        cacheHandlePromises.delete(cacheHandlePromises.keys().next().value);
    const opening = caches.open(key).catch(
        // Permit a later Cache handle open to retry after failure
        (error) => {
            if (cacheHandlePromises.get(key) === opening) cacheHandlePromises.delete(key);
            throw error;
        },
    );
    cacheHandlePromises.set(key, opening);
    return opening;
};

export const invalidateTemplateCacheHandle = (cacheKey = null) => {
    // Drop one cached Cache handle or every handle after explicit bucket deletion
    if (cacheKey == null) {
        cacheHandlePromises = new Map();
        return;
    }
    cacheHandlePromises.delete(String(cacheKey));
};

export const settleTemplateCacheWrites = async (cache, request = null) => {
    // Let detached access-metadata writes finish before explicit entry deletion
    const index = cacheIndexes.get(cache);
    if (!index) return;
    const pending = request == null ? [...index.writes.values()] : [index.writes.get(requestUrl(request))];
    await Promise.allSettled(pending.filter(Boolean));
};

export const touchTemplateCacheEntry = (
    cache,
    requestKey,
    text,
    response,
    { source, revision = null, ttl, fetchedAt = Date.now(), lastAccess = Date.now() } = {},
    { coalesceMs = 1000 } = {},
) => {
    // Update in-memory LRU order and construct a replacement response only when persistence is due
    const request = requestUrl(requestKey),
        stored = describeTemplateCacheResponse({ url: request }, response),
        entry = {
            request,
            source: source ?? stored.source,
            revision,
            fetchedAt,
            lastAccess,
            ttl: ttl ?? stored.ttl,
        },
        index = getCacheIndex(cache),
        current = index.entries.get(request),
        interval = Math.max(0, Number(coalesceMs) || 0),
        persistedAccess =
            index.persistedAccess.get(request) || current?.lastAccess || current?.fetchedAt || entry.fetchedAt;
    index.entries.set(request, entry);
    if (interval > 0 && (entry.lastAccess - persistedAccess < interval || index.writes.has(request)))
        return Promise.resolve(true);
    const accessed = createTemplateCacheResponse(text, response, entry);
    return writeTemplateCacheEntry(cache, requestKey, accessed, { coalesceMs: interval });
};

// Reconcile Cache API keys while reading metadata only for entries not already indexed
export const listTemplateCacheEntries = async (cache) => {
    const index = getCacheIndex(cache);
    if (!index.reconciliation) {
        index.reconciliation = (async () => {
            const requests = await cache.keys(),
                keys = new Set(requests.map(requestUrl));
            index.entries.forEach(
                // Remove indexed entries whose Cache API keys disappeared
                (_, key) => {
                    if (!keys.has(key)) index.entries.delete(key);
                },
            );
            const unknown = requests.filter(
                // Select Cache API keys whose response metadata is not indexed
                (request) => !index.entries.has(requestUrl(request)),
            );
            // Hydrate only unknown metadata with fixed bounded concurrency
            for (let offset = 0; offset < unknown.length; offset += HYDRATION_CONCURRENCY) {
                const batch = unknown.slice(offset, offset + HYDRATION_CONCURRENCY),
                    responses = await Promise.all(
                        batch.map(
                            // Match one unknown cache request
                            (request) => cache.match(request),
                        ),
                    );
                responses.forEach(
                    // Record one newly hydrated metadata response
                    (response, responseIndex) => {
                        if (response) recordTemplateCacheResponse(cache, batch[responseIndex], response);
                    },
                );
            }
        })().finally(() => {
            index.reconciliation = null;
        });
    }
    await index.reconciliation;
    return [...index.entries.values()].sort(
        // Compare the current items
        (a, b) => (b.lastAccess || b.fetchedAt) - (a.lastAccess || a.fetchedAt),
    );
};

// Rebuild the response so cache metadata remains available across page loads
export const createTemplateCacheResponse = (
    text,
    response,
    { source, revision = null, ttl, fetchedAt = Date.now(), lastAccess = Date.now() } = {},
) => {
    const headers = new Headers(response?.headers || {});
    headers.set(HEADERS.source, source);
    headers.set(HEADERS.fetchedAt, String(fetchedAt));
    headers.set(HEADERS.lastAccess, String(lastAccess));
    headers.set(HEADERS.ttl, String(ttl));
    if (revision) headers.set(HEADERS.revision, revision);
    else headers.delete(HEADERS.revision);
    return new Response(text, {
        status: response?.status || 200,
        statusText: response?.statusText || 'OK',
        headers,
    });
};

// Remove expired entries first and then least-recently-used entries above the bound
export const pruneTemplateCacheEntries = async (cache, { max = 100, now = Date.now() } = {}) => {
    const entries = await listTemplateCacheEntries(cache),
        evicted = [],
        retained = [];
    // Process each entry
    for (const entry of entries) {
        if (entry.ttl != null && entry.ttl >= 0 && entry.fetchedAt && now - entry.fetchedAt >= entry.ttl) {
            evicted.push({
                ...entry,
                reason: 'expired',
            });
        } else {
            retained.push(entry);
        }
    }
    const limit = Math.max(0, Math.floor(Number(max) || 0));
    // Process each entry
    for (const entry of retained.slice(limit)) {
        evicted.push({
            ...entry,
            reason: 'capacity',
        });
    }
    await Promise.all(
        evicted.map(async (entry) => {
            await cache.delete(entry.request);
            const index = getCacheIndex(cache);
            index.entries.delete(entry.request);
            index.persistedAccess.delete(entry.request);
        }),
    );
    return evicted;
};

// Apply revision, expiry, and capacity eviction from one reconciled metadata snapshot
export const reconcileTemplateCacheEntries = async (
    cache,
    { max = 100, now = Date.now(), source = null, currentRequest = null } = {},
) => {
    const entries = await listTemplateCacheEntries(cache),
        currentUrl = currentRequest ? requestUrl(currentRequest) : null,
        victims = new Map();
    entries.forEach((entry) => {
        if (source && entry.source === source && entry.request !== currentUrl) victims.set(entry.request, 'revision');
        else if (entry.ttl != null && entry.ttl >= 0 && entry.fetchedAt && now - entry.fetchedAt >= entry.ttl)
            victims.set(entry.request, 'expired');
    });
    const retained = entries.filter(
            // Retain entries not already selected for revision or expiry eviction
            (entry) => !victims.has(entry.request),
        ),
        limit = Math.max(0, Math.floor(Number(max) || 0));
    retained.slice(limit).forEach(
        // Select over-capacity entries in least-recently-used order
        (entry) => victims.set(entry.request, 'capacity'),
    );
    const evicted = entries
        .filter(
            // Select every reconciled victim
            (entry) => victims.has(entry.request),
        )
        .map(
            // Attach the reconciled eviction reason
            (entry) => ({
                ...entry,
                reason: victims.get(entry.request),
            }),
        );
    await Promise.all(
        evicted.map(async (entry) => {
            await cache.delete(entry.request);
            const index = getCacheIndex(cache);
            index.entries.delete(entry.request);
            index.persistedAccess.delete(entry.request);
        }),
    );
    return evicted;
};

export const isQuotaError = (error) => {
    // Check whether quota error
    return error?.name === 'QuotaExceededError' || error?.code === 22;
};

// Retry once after caller-managed pruning when browser storage reaches quota
export const writeTemplateCacheEntry = async (cache, requestKey, response, { onQuota, coalesceMs = 0 } = {}) => {
    const request = requestUrl(requestKey),
        interval = Math.max(0, Number(coalesceMs) || 0),
        index = getCacheIndex(cache),
        current = index.entries.get(request),
        entry = describeTemplateCacheResponse({ url: request }, response);
    if (interval > 0) {
        // Advance in-memory LRU order immediately while bounding persistent metadata writes
        recordTemplateCacheResponse(cache, requestKey, response, { persisted: false });
        const persistedAccess =
            index.persistedAccess.get(request) || current?.lastAccess || current?.fetchedAt || entry.fetchedAt;
        if (entry.lastAccess - persistedAccess < interval || index.writes.has(request)) return true;
    }
    const persist = async () => {
        // Guard the write template cache entry operation against runtime failures
        try {
            await cache.put(requestKey, response.clone());
            recordTemplateCacheResponse(cache, requestKey, response, { preserveNewer: interval > 0 });
            return true;
        } catch (error) {
            if (!isQuotaError(error)) return false;
            invalidateTemplateCacheIndex(cache);
            await onQuota?.();
            // Guard the retried template cache write against runtime failures
            try {
                await cache.put(requestKey, response.clone());
                recordTemplateCacheResponse(cache, requestKey, response, { preserveNewer: interval > 0 });
                return true;
            } catch {
                return false;
            }
        }
    };
    if (interval === 0) return await persist();
    const writing = persist();
    index.writes.set(request, writing);
    // Keep the coalescing registry aligned with the detached write lifetime
    try {
        return await writing;
    } finally {
        if (index.writes.get(request) === writing) index.writes.delete(request);
    }
};

export const TEMPLATE_CACHE_HEADERS = HEADERS;
