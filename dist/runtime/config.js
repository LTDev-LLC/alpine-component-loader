// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// The build replaces this identifier from package.json; raw source uses an isolated development namespace
export const ACL_VERSION = typeof "1.0.0" === 'undefined' ? 'development' : "1.0.0";
export const VALID_CACHE_STRATEGIES = new Set([
    'cache-first',
    'network-first',
    'stale-while-revalidate',
    'no-store'
]), VALID_LOADING_MODES = new Set([
    'eager',
    'lazy',
    'idle'
]), VALID_HYDRATION_MODES = new Set([
    'eager',
    'visible',
    'idle',
    'interaction',
    'media'
]), VALID_RESPONSE_TYPES = new Set([
    'json',
    'text',
    'blob',
    'arrayBuffer',
    'stream',
    'auto'
]), RESERVED_CUSTOM_ELEMENT_NAMES = new Set([
    'annotation-xml',
    'color-profile',
    'font-face',
    'font-face-src',
    'font-face-uri',
    'font-face-format',
    'font-face-name',
    'missing-glyph'
]);
export const HTMLElementBase = typeof globalThis.HTMLElement === 'undefined' ? class {
} : globalThis.HTMLElement;
// Perform a prototype-safe own-property check against optional objects
export const hasOwn = (obj, key)=>Object.prototype.hasOwnProperty.call(obj || {}, key);
// Insert or refresh a map entry and evict the oldest keys until its bound is met
export const setBoundedMapEntry = (map, key, value, max = 200)=>{
    if (map.has(key)) map.delete(key);
    map.set(key, value);
    const limit = Number(max);
    if (!Number.isFinite(limit)) return value;
    const boundedLimit = Math.max(0, Math.floor(limit)), evictions = Math.max(0, map.size - boundedLimit), keys = map.keys();
    // Iterate over the indexed values
    for(let index = 0; index < evictions; index++)map.delete(keys.next().value);
    return value;
};
// Convert arbitrary namespace input into a stable Cache API-safe segment
export const normalizeCacheNamespace = (value)=>String(value || 'default').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || 'default';
// Derive the versioned cache name and namespace-wide pruning prefix
export const getTemplateCacheNames = (namespace, version = ACL_VERSION)=>{
    const normalizedNamespace = normalizeCacheNamespace(namespace), prefix = `alpine-component-loader-${normalizedNamespace}-`;
    return {
        namespace: normalizedNamespace,
        prefix,
        key: `${prefix}${version}`
    };
};
// Normalize and validate a standards-compliant, non-reserved custom-element name
export const validateCustomElementName = (tagName)=>{
    const normalized = String(tagName || '').trim().toLowerCase();
    if (!/^[a-z][.0-9_a-z-]*-[.0-9_a-z-]*$/.test(normalized) || normalized.startsWith('xml') || RESERVED_CUSTOM_ELEMENT_NAMES.has(normalized)) throw new TypeError(`[ACL] Invalid custom element name "${tagName}".`);
    return normalized;
};
// Detect protocol, root-relative, and protocol-relative component sources
export const isAbsoluteSource = (source)=>typeof source === 'string' && (/^[A-Za-z][A-Za-z\d+.-]*:/.test(source) || source.startsWith('/') || source.startsWith('//'));
// Prefix only relative fetchable sources while preserving selectors and absolute URLs
export const joinBasePath = (basePath, source)=>{
    if (!basePath || typeof source !== 'string' || source.startsWith('#') || isAbsoluteSource(source)) return source;
    return `${basePath.replace(/\/?$/, '/')}${source.replace(/^\.\//, '')}`;
};
// Apply an optional source resolver before joining the configured base path
export const resolveComponentSource = (source, settings, context)=>{
    let resolved = source;
    if (typeof settings.sourceResolver === 'function') {
        const next = settings.sourceResolver(source, context);
        if (next) resolved = next;
    }
    return joinBasePath(settings.basePath, resolved);
};
