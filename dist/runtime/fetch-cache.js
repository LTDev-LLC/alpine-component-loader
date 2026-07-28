// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js', importLocalModule = (specifier)=>import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)), [{ hasOwn }, { parseJson, stableStringify }] = await Promise.all([
    importLocalModule('./config.js'),
    importLocalModule('./values.js')
]);
export const dataFetchCache = new Map();
// Remove non-semantic request fields and canonicalize headers for cache identity
export const normalizeRequestForCache = (options = {})=>{
    const normalized = {};
    Object.entries(options).forEach(([key, value])=>{
        // Process the current item
        if (key === 'signal' || value === undefined || typeof value === 'function') return;
        if (key === 'headers') {
            const headers = {};
            new Headers(value).forEach((headerValue, headerKey)=>{
                // Process the current item
                headers[headerKey] = headerValue;
            });
            normalized.headers = headers;
            return;
        }
        normalized[key] = value;
    });
    return normalized;
};
// Hash a cache fingerprint with SHA-256 or a deterministic FNV-1a fallback
export const digestCacheKey = async (value)=>{
    if (globalThis.crypto?.subtle && typeof TextEncoder !== 'undefined') {
        const bytes = new TextEncoder().encode(value), digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), // Transform the current item
        (byte)=>byte.toString(16).padStart(2, '0')).join('');
    }
    // Use 32-bit FNV-1a when Web Crypto is unavailable, such as older test runtimes
    let hash = 2166136261;
    // Iterate over the indexed values
    for(let index = 0; index < value.length; index++){
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};
// Describe request bodies deterministically and reject bodies that cannot be replayed safely
export const normalizeBodyForCache = (body)=>{
    if (body == null) return {
        cacheable: true,
        value: null
    };
    if (typeof body === 'string') return {
        cacheable: true,
        value: {
            type: 'string',
            value: body
        }
    };
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return {
        cacheable: true,
        value: {
            type: 'url-search-params',
            value: Array.from(body.entries())
        }
    };
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
        const entries = Array.from(body.entries());
        if (entries.every(// Check every item
        ([, value])=>typeof value === 'string')) return {
            cacheable: true,
            value: {
                type: 'form-data',
                value: entries
            }
        };
        return {
            cacheable: false,
            reason: 'FormData containing files or blobs is not replayable.'
        };
    }
    if (typeof Blob !== 'undefined' && body instanceof Blob || typeof ArrayBuffer !== 'undefined' && (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) || typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) return {
        cacheable: false,
        reason: 'Binary and streaming bodies require an explicit data.cacheKey.'
    };
    return {
        cacheable: true,
        value: {
            type: typeof body,
            value: body
        }
    };
};
// Build an opaque cache key from URL, request semantics, explicit identity, and response variant
export const getDataCacheKey = async (finalUrl, fetchOptions, explicitKey = null, variant = null)=>{
    const request = normalizeRequestForCache(fetchOptions), body = normalizeBodyForCache(fetchOptions?.body);
    if (!body.cacheable && !explicitKey) return {
        cacheable: false,
        reason: body.reason,
        key: null,
        request
    };
    if (hasOwn(request, 'body')) request.body = explicitKey || body.value;
    const fingerprint = stableStringify({
        url: finalUrl,
        request,
        explicitKey: explicitKey || null,
        variant
    });
    return {
        cacheable: true,
        key: `acl-data-${await digestCacheKey(fingerprint)}`,
        request
    };
};
// Parse strict JSON declarative bodies while preserving ordinary string payloads
export const parseBodyValue = (value)=>{
    if (value == null || typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseJson(trimmed, value);
    return value;
};
// Evict only settled data entries until the configured cache bound is satisfied
export const pruneDataFetchCache = (settings = null)=>{
    const max = Number(settings?.cacheMax ?? 100);
    if (!Number.isFinite(max)) return;
    const limit = Math.max(0, Math.floor(max));
    let overflow = dataFetchCache.size - limit;
    if (overflow <= 0) return;
    // Process each entry
    for (const [key, entry] of dataFetchCache){
        if (overflow <= 0) break;
        if (entry.settled !== false) {
            dataFetchCache.delete(key);
            overflow--;
        }
    }
};
