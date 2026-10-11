// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

// BEGIN GENERATED OPTIONS
// Generated from option descriptors by scripts/generate-options.mjs

// Allocate fresh literal defaults
export const createDefaults = (dataDefaults) => ({
    debug: false,
    autoStart: true,
    observeTemplates: true,
    basePath: '',
    sourceResolver: null,
    errorCss: {},
    shadow: false,
    useConstructibleStyles: true,
    sharedStyleSheets: [],
    executeScripts: false,
    stripStyles: false,
    sanitize: true,
    security: {},
    observability: false,
    adaptivePrefetch: false,
    strictProps: false,
    runtimeCacheMax: 200,
    keepAliveMax: Infinity,
    dynamicTransition: 'auto',
    transitionDuration: 100,
    events: {
        forward: [],
    },
    externalCss: [],
    externalScripts: [],
    loading: 'eager',
    loadingTemplate: null,
    loadingHtml: null,
    hydrate: 'eager',
    hydrateMedia: null,
    persist: false,
    persistKey: null,
    persistDebounce: 250,
    persistAdapter: null,
    persistMigrate: null,
    bindStore: null,
    form: false,
    defaultComponentName: 'acl-component',
    defaultDynamicName: 'acl-dynamic',
    defaultBoundaryName: 'acl-boundary',
    persistVersion: 1,
    cacheTemplates: true,
    templateCacheStrategy: 'cache-first',
    templateCacheTtl: 900000,
    templateCacheMax: 100,
    templateTimeout: 10000,
    templateMaxBytes: 1048576,
    prefetchConcurrency: 4,
    hydrationScheduler: false,
    templateRevision: null,
    cacheNamespace: 'default',
    data: { ...dataDefaults },
});

// Validate numeric options
const checkOptionNumber = (value, name, rule, suffix = '') => {
    if (value == null) return;
    const number = Number(value),
        valid =
            (number === Infinity && (rule === 1 || rule === 4)) ||
            (rule === 2 || rule === 4
                ? Number.isInteger(number) && number >= 1
                : Number.isFinite(number) && number >= 0 && (rule !== 3 || number <= 1));
    if (!valid)
        throw new TypeError(
            '[ACL] ' +
                name +
                ' must be ' +
                [
                    'a non-negative finite number',
                    'a non-negative number or Infinity',
                    'a positive integer',
                    'between 0 and 1',
                    'a positive integer or Infinity',
                ][rule || 0] +
                suffix,
        );
};

// Validate allowed option values
const checkOptionValue = (value, name, allowed, suffix = '') => {
    if (value != null && !allowed.includes(value))
        throw new TypeError('[ACL] Unsupported ' + name + ' value "' + value + '"' + suffix);
};

// Validate data options
export const validateDataOptions = (settings, suffix = '') => {
    const data = settings.data;
    checkOptionNumber(data?.poll, 'data.poll', 0, suffix);
    checkOptionNumber(data?.timeout, 'data.timeout', 0, suffix);
    checkOptionNumber(data?.cacheTtl, 'data.cacheTtl', 0, suffix);
    checkOptionNumber(data?.cacheMax, 'data.cacheMax', 0, suffix);
    checkOptionValue(
        data?.responseType,
        'data.responseType',
        ['json', 'text', 'blob', 'arrayBuffer', 'stream', 'auto'],
        suffix,
    );
    checkOptionNumber(data?.retries, 'data.retries', 0, suffix);
    checkOptionNumber(data?.retryDelay, 'data.retryDelay', 0, suffix);
    checkOptionNumber(data?.retryMaxDelay, 'data.retryMaxDelay', 0, suffix);
    checkOptionNumber(data?.retryJitter, 'data.retryJitter', 3, suffix);
    checkOptionValue(
        data?.cacheStrategy,
        'data.cacheStrategy',
        ['cache-first', 'network-first', 'stale-while-revalidate', 'no-store'],
        suffix,
    );
    checkOptionNumber(settings.persistVersion, 'persistVersion', 2, suffix);
};

// Validate generated configuration
export const validateOptions = (settings) => {
    validateDataOptions(settings);
    checkOptionNumber(settings.persistDebounce, 'persistDebounce');
    checkOptionNumber(settings.runtimeCacheMax, 'runtimeCacheMax');
    checkOptionNumber(settings.transitionDuration, 'transitionDuration');
    checkOptionNumber(settings.templateCacheTtl, 'templateCacheTtl');
    checkOptionNumber(settings.templateCacheMax, 'templateCacheMax');
    checkOptionNumber(settings.templateTimeout, 'templateTimeout');
    checkOptionNumber(settings.keepAliveMax, 'keepAliveMax', 1);
    checkOptionNumber(settings.templateMaxBytes, 'templateMaxBytes', 4);
    checkOptionNumber(settings.prefetchConcurrency, 'prefetchConcurrency', 2);
    checkOptionValue(settings.loading, 'loading', ['eager', 'lazy', 'idle']);
    checkOptionValue(settings.hydrate, 'hydrate', ['eager', 'visible', 'idle', 'interaction', 'media']);
    checkOptionValue(settings.templateCacheStrategy, 'templateCacheStrategy', [
        'cache-first',
        'network-first',
        'stale-while-revalidate',
        'no-store',
    ]);
    if (settings.hydrate === 'media' && !(typeof settings.hydrateMedia === 'string' && settings.hydrateMedia.trim()))
        throw new TypeError('[ACL] hydrateMedia is required when hydrate is media');
    const scheduler = settings.hydrationScheduler;
    if (scheduler !== undefined && scheduler !== false) {
        if (!scheduler || typeof scheduler !== 'object' || Array.isArray(scheduler))
            throw new TypeError('[ACL] hydrationScheduler must be false or an options object');
        const { budgetMs = 8, maxTasksPerTurn = 4 } = scheduler;
        if (!Number.isFinite(budgetMs) || budgetMs <= 0 || !Number.isInteger(maxTasksPerTurn) || maxTasksPerTurn < 1)
            throw new TypeError('[ACL] Invalid hydrationScheduler budget');
    }
};
// END GENERATED OPTIONS

// The build replaces this identifier from package.json; raw source uses an isolated development namespace
export const ACL_VERSION = typeof __ACL_BUILD_VERSION__ === 'undefined' ? 'development' : __ACL_BUILD_VERSION__;

export const VALID_CACHE_STRATEGIES = new Set(['cache-first', 'network-first', 'stale-while-revalidate', 'no-store']),
    VALID_RESPONSE_TYPES = new Set(['json', 'text', 'blob', 'arrayBuffer', 'stream', 'auto']),
    RESERVED_CUSTOM_ELEMENT_NAMES = new Set([
        'annotation-xml',
        'color-profile',
        'font-face',
        'font-face-src',
        'font-face-uri',
        'font-face-format',
        'font-face-name',
        'missing-glyph',
    ]);

export const HTMLElementBase = typeof globalThis.HTMLElement === 'undefined' ? class {} : globalThis.HTMLElement;

// Perform a prototype-safe own-property check against optional objects
export const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

// Insert or refresh a map entry and evict the oldest keys until its bound is met
export const setBoundedMapEntry = (map, key, value, max = 200) => {
    if (map.has(key)) map.delete(key);
    map.set(key, value);
    const limit = Number(max);
    if (!Number.isFinite(limit)) return value;
    const boundedLimit = Math.max(0, Math.floor(limit)),
        evictions = Math.max(0, map.size - boundedLimit),
        keys = map.keys();
    // Iterate over the indexed values
    for (let index = 0; index < evictions; index++) map.delete(keys.next().value);
    return value;
};

// Convert arbitrary namespace input into a stable Cache API-safe segment
export const normalizeCacheNamespace = (value) =>
    String(value || 'default')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-') || 'default';

// Derive the versioned cache name and namespace-wide pruning prefix
export const getTemplateCacheNames = (namespace, version = ACL_VERSION) => {
    const normalizedNamespace = normalizeCacheNamespace(namespace),
        prefix = `alpine-component-loader-${normalizedNamespace}-`;
    return {
        namespace: normalizedNamespace,
        prefix,
        key: `${prefix}${version}`,
    };
};

// Normalize and validate a standards-compliant, non-reserved custom-element name
export const validateCustomElementName = (tagName) => {
    const normalized = String(tagName || '')
        .trim()
        .toLowerCase();
    if (
        !/^[a-z][.0-9_a-z-]*-[.0-9_a-z-]*$/.test(normalized) ||
        normalized.startsWith('xml') ||
        RESERVED_CUSTOM_ELEMENT_NAMES.has(normalized)
    )
        throw new TypeError(`[ACL] Invalid custom element name "${tagName}".`);
    return normalized;
};

// Detect protocol, root-relative, and protocol-relative component sources
export const isAbsoluteSource = (source) =>
    typeof source === 'string' &&
    (/^[A-Za-z][A-Za-z\d+.-]*:/.test(source) || source.startsWith('/') || source.startsWith('//'));

// Prefix only relative fetchable sources while preserving selectors and absolute URLs
export const joinBasePath = (basePath, source) => {
    if (!basePath || typeof source !== 'string' || source.startsWith('#') || isAbsoluteSource(source)) return source;
    return `${basePath.replace(/\/?$/, '/')}${source.replace(/^\.\//, '')}`;
};

// Apply an optional source resolver before joining the configured base path
export const resolveComponentSource = (source, settings, context) => {
    let resolved = source;
    if (typeof settings.sourceResolver === 'function') {
        const next = settings.sourceResolver(source, context);
        if (next) resolved = next;
    }
    return joinBasePath(settings.basePath, resolved);
};

// BEGIN GENERATED DATA CONTRACT
// Compiled from authoritative option descriptors
export const DEFAULT_DATA_OPTIONS = Object.freeze({
    src: null,
    params: null,
    keys: null,
    poll: null,
    timeout: 30000,
    options: null,
    cacheTtl: 300000,
    cacheMax: 100,
    cacheKey: null,
    responseType: 'json',
    parser: null,
    method: null,
    body: null,
    target: '$data',
    retries: 0,
    retryDelay: 250,
    retryMaxDelay: 30000,
    retryJitter: 0.2,
    retryUnsafeMethods: false,
    pauseWhenHidden: true,
    pauseWhenOffline: true,
    pauseWhenOffscreen: false,
    cacheStrategy: 'cache-first',
});
export const DATA_FETCH_ATTRIBUTES = new Set([
    'data-src',
    'data-fetch-params',
    'data-fetch-keys',
    'data-fetch-timeout',
    'data-fetch-cache-ttl',
    'data-cache-key',
    'data-response-type',
    'data-method',
    'data-body',
    'data-target',
    'data-retries',
    'data-retry-delay',
    'data-retry-max-delay',
    'data-retry-jitter',
    'data-retry-unsafe-methods',
    'data-cache-strategy',
]);
export const DATA_POLL_ATTRIBUTES = new Set([
    'data-fetch-poll',
    'pause-polling-when-hidden',
    'pause-polling-when-offline',
    'pause-polling-when-offscreen',
]);
export const DATA_CACHE_BOUND_ATTRIBUTES = new Set(['data-fetch-cache-max']);
export const INTERNAL_COMPONENT_ATTRIBUTES = new Set([
    'data-src',
    'data-fetch-params',
    'data-fetch-keys',
    'data-fetch-poll',
    'data-fetch-timeout',
    'data-fetch-cache-ttl',
    'data-fetch-cache-max',
    'data-cache-key',
    'data-response-type',
    'data-method',
    'data-body',
    'data-target',
    'data-retries',
    'data-retry-delay',
    'data-retry-max-delay',
    'data-retry-jitter',
    'data-retry-unsafe-methods',
    'pause-polling-when-hidden',
    'pause-polling-when-offline',
    'pause-polling-when-offscreen',
    'data-cache-strategy',
    'persist-version',
]);
// Merge request options while preserving header precedence
const mergeFetchOptions = (...optionsList) => {
    const merged = {},
        headers = new Headers();
    let hasHeaders = false;
    optionsList.filter(Boolean).forEach((options) => {
        // Process the current item
        Object.entries(options).forEach(([key, value]) => {
            // Process the current item
            if (key !== 'headers') merged[key] = value;
        });
        if (options.headers) {
            hasHeaders = true;
            new Headers(options.headers).forEach(
                // Process the current item
                (value, key) => headers.set(key, value),
            );
        }
    });
    if (hasHeaders) merged.headers = Object.fromEntries(headers.entries());
    return merged;
};

// Resolve effective data options while preserving header and callback contracts
export const resolveDataOptionSettings = (localConfig = {}, globalConfig = {}) => ({
    src: localConfig.data?.src ?? globalConfig.data?.src ?? DEFAULT_DATA_OPTIONS.src,
    params: localConfig.data?.params ?? globalConfig.data?.params ?? DEFAULT_DATA_OPTIONS.params,
    keys: localConfig.data?.keys ?? globalConfig.data?.keys ?? DEFAULT_DATA_OPTIONS.keys,
    poll: localConfig.data?.poll ?? globalConfig.data?.poll ?? DEFAULT_DATA_OPTIONS.poll,
    timeout: localConfig.data?.timeout ?? globalConfig.data?.timeout ?? DEFAULT_DATA_OPTIONS.timeout,
    options: mergeFetchOptions(globalConfig.data?.options, localConfig.data?.options),
    cacheTtl: localConfig.data?.cacheTtl ?? globalConfig.data?.cacheTtl ?? DEFAULT_DATA_OPTIONS.cacheTtl,
    cacheMax: localConfig.data?.cacheMax ?? globalConfig.data?.cacheMax ?? DEFAULT_DATA_OPTIONS.cacheMax,
    cacheKey: localConfig.data?.cacheKey ?? globalConfig.data?.cacheKey ?? DEFAULT_DATA_OPTIONS.cacheKey,
    responseType:
        localConfig.data?.responseType ?? globalConfig.data?.responseType ?? DEFAULT_DATA_OPTIONS.responseType,
    parser: localConfig.data?.parser ?? globalConfig.data?.parser ?? DEFAULT_DATA_OPTIONS.parser,
    method: localConfig.data?.method ?? globalConfig.data?.method ?? DEFAULT_DATA_OPTIONS.method,
    body: localConfig.data?.body ?? globalConfig.data?.body ?? DEFAULT_DATA_OPTIONS.body,
    target: localConfig.data?.target ?? globalConfig.data?.target ?? DEFAULT_DATA_OPTIONS.target,
    retries: localConfig.data?.retries ?? globalConfig.data?.retries ?? DEFAULT_DATA_OPTIONS.retries,
    retryDelay: localConfig.data?.retryDelay ?? globalConfig.data?.retryDelay ?? DEFAULT_DATA_OPTIONS.retryDelay,
    retryMaxDelay:
        localConfig.data?.retryMaxDelay ?? globalConfig.data?.retryMaxDelay ?? DEFAULT_DATA_OPTIONS.retryMaxDelay,
    retryJitter: localConfig.data?.retryJitter ?? globalConfig.data?.retryJitter ?? DEFAULT_DATA_OPTIONS.retryJitter,
    retryUnsafeMethods:
        localConfig.data?.retryUnsafeMethods ??
        globalConfig.data?.retryUnsafeMethods ??
        DEFAULT_DATA_OPTIONS.retryUnsafeMethods,
    pauseWhenHidden:
        localConfig.data?.pauseWhenHidden ?? globalConfig.data?.pauseWhenHidden ?? DEFAULT_DATA_OPTIONS.pauseWhenHidden,
    pauseWhenOffline:
        localConfig.data?.pauseWhenOffline ??
        globalConfig.data?.pauseWhenOffline ??
        DEFAULT_DATA_OPTIONS.pauseWhenOffline,
    pauseWhenOffscreen:
        localConfig.data?.pauseWhenOffscreen ??
        globalConfig.data?.pauseWhenOffscreen ??
        DEFAULT_DATA_OPTIONS.pauseWhenOffscreen,
    cacheStrategy:
        localConfig.data?.cacheStrategy ?? globalConfig.data?.cacheStrategy ?? DEFAULT_DATA_OPTIONS.cacheStrategy,
});
// Read boolean attributes using explicit false and zero spellings as opt-outs
export const readBooleanAttribute = (element, name, fallback = false) => {
    if (!element?.hasAttribute?.(name)) return fallback === true;
    const value = element.getAttribute(name);
    return value !== 'false' && value !== '0';
};

// Read a finite numeric attribute while enforcing its descriptor lower bound
export const readNumberAttribute = (element, name, fallback, { min = 0, positive = false } = {}) => {
    const raw = element?.getAttribute?.(name);
    if (raw == null) return fallback;
    const value = Number(raw),
        lowerBound = positive ? Number.MIN_VALUE : min;
    return Number.isFinite(value) && value >= lowerBound ? value : fallback;
};
// END GENERATED DATA CONTRACT
