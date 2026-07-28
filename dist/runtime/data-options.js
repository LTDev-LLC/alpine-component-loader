// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js', importLocalModule = (specifier)=>import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)), [{ VALID_CACHE_STRATEGIES, VALID_RESPONSE_TYPES }, { mergeFetchOptions, parseJson }] = await Promise.all([
    importLocalModule('./config.js'),
    importLocalModule('./values.js')
]);
// Define every public data and persistence control from one descriptor table
export const DATA_OPTION_DESCRIPTORS = Object.freeze([
    {
        group: 'src',
        attribute: 'data-src',
        default: null,
        parse: 'string',
        reaction: 'fetch'
    },
    {
        group: 'params',
        attribute: 'data-fetch-params',
        default: null,
        parse: 'json',
        reaction: 'fetch'
    },
    {
        group: 'keys',
        attribute: 'data-fetch-keys',
        default: null,
        parse: 'json',
        reaction: 'fetch'
    },
    {
        group: 'poll',
        attribute: 'data-fetch-poll',
        default: null,
        parse: 'number',
        validate: 'nonNegative',
        reaction: 'poll'
    },
    {
        group: 'timeout',
        attribute: 'data-fetch-timeout',
        default: 30000,
        parse: 'number',
        validate: 'nonNegative',
        reaction: 'fetch'
    },
    {
        group: 'options',
        proxyAttribute: 'data-fetch-options',
        default: null,
        parse: 'json',
        merge: 'fetchOptions'
    },
    {
        group: 'cacheTtl',
        attribute: 'data-fetch-cache-ttl',
        default: 5 * 60 * 1000,
        parse: 'number',
        validate: 'nonNegative',
        reaction: 'fetch'
    },
    {
        group: 'cacheMax',
        attribute: 'data-fetch-cache-max',
        default: 100,
        parse: 'number',
        validate: 'nonNegative',
        reaction: 'cache-bound'
    },
    {
        group: 'cacheKey',
        attribute: 'data-cache-key',
        default: null,
        parse: 'string',
        reaction: 'fetch'
    },
    {
        group: 'responseType',
        attribute: 'data-response-type',
        default: 'json',
        parse: 'string',
        allowed: VALID_RESPONSE_TYPES,
        reaction: 'fetch'
    },
    {
        group: 'parser',
        default: null
    },
    {
        group: 'method',
        attribute: 'data-method',
        default: null,
        parse: 'string',
        reaction: 'fetch'
    },
    {
        group: 'body',
        attribute: 'data-body',
        default: null,
        parse: 'raw',
        reaction: 'fetch'
    },
    {
        group: 'target',
        attribute: 'data-target',
        default: '$data',
        parse: 'string',
        reaction: 'fetch'
    },
    {
        group: 'retries',
        attribute: 'data-retries',
        default: 0,
        parse: 'number',
        validate: 'nonNegative',
        reaction: 'fetch'
    },
    {
        group: 'retryDelay',
        attribute: 'data-retry-delay',
        default: 250,
        parse: 'number',
        validate: 'nonNegative',
        reaction: 'fetch'
    },
    {
        group: 'retryMaxDelay',
        attribute: 'data-retry-max-delay',
        default: 30000,
        parse: 'number',
        validate: 'nonNegative',
        reaction: 'fetch'
    },
    {
        group: 'retryJitter',
        attribute: 'data-retry-jitter',
        default: 0.2,
        parse: 'number',
        validate: 'unitInterval',
        reaction: 'fetch'
    },
    {
        group: 'retryUnsafeMethods',
        attribute: 'data-retry-unsafe-methods',
        default: false,
        parse: 'boolean',
        reaction: 'fetch'
    },
    {
        group: 'pauseWhenHidden',
        attribute: 'pause-polling-when-hidden',
        default: true,
        parse: 'boolean',
        reaction: 'poll'
    },
    {
        group: 'pauseWhenOffline',
        attribute: 'pause-polling-when-offline',
        default: true,
        parse: 'boolean',
        reaction: 'poll'
    },
    {
        group: 'pauseWhenOffscreen',
        attribute: 'pause-polling-when-offscreen',
        default: false,
        parse: 'boolean',
        reaction: 'poll'
    },
    {
        group: 'cacheStrategy',
        attribute: 'data-cache-strategy',
        default: 'cache-first',
        parse: 'string',
        allowed: VALID_CACHE_STRATEGIES,
        reaction: 'fetch'
    },
    {
        setting: 'persistVersion',
        attribute: 'persist-version',
        default: 1,
        parse: 'number',
        validate: 'positiveInteger',
        reaction: 'persistence'
    }
]);
// Derive observed attribute sets from one descriptor reaction category
const attributesForReaction = (reaction)=>new Set(DATA_OPTION_DESCRIPTORS.filter(// Select matching items
    (descriptor)=>descriptor.attribute && descriptor.reaction === reaction).map(// Transform the current item
    (descriptor)=>descriptor.attribute));
export const DATA_FETCH_ATTRIBUTES = attributesForReaction('fetch'), DATA_POLL_ATTRIBUTES = attributesForReaction('poll'), DATA_CACHE_BOUND_ATTRIBUTES = attributesForReaction('cache-bound');
export const INTERNAL_COMPONENT_ATTRIBUTES = new Set(DATA_OPTION_DESCRIPTORS.filter(// Select matching items
(descriptor)=>descriptor.attribute).map(// Transform the current item
(descriptor)=>descriptor.attribute));
export const DEFAULT_DATA_OPTIONS = Object.freeze(Object.fromEntries(DATA_OPTION_DESCRIPTORS.filter(// Select matching items
(descriptor)=>descriptor.group).map(// Transform the current item
(descriptor)=>[
        descriptor.group,
        descriptor.default
    ])));
// Read boolean attributes using explicit false and zero spellings as opt-outs
export const readBooleanAttribute = (element, name, fallback = false)=>{
    if (!element?.hasAttribute?.(name)) return fallback === true;
    const value = element.getAttribute(name);
    return value !== 'false' && value !== '0';
};
// Read a finite numeric attribute while enforcing its descriptor lower bound
export const readNumberAttribute = (element, name, fallback, { min = 0, positive = false } = {})=>{
    const raw = element?.getAttribute?.(name);
    if (raw == null) return fallback;
    const value = Number(raw), lowerBound = positive ? Number.MIN_VALUE : min;
    return Number.isFinite(value) && value >= lowerBound ? value : fallback;
};
// Resolve one descriptor using local grouped, global grouped, and default precedence
const configuredValue = (descriptor, localConfig, globalConfig)=>{
    const localData = localConfig?.data || {}, globalData = globalConfig?.data || {};
    return descriptor.group ? localData[descriptor.group] ?? globalData[descriptor.group] ?? descriptor.default : localConfig?.[descriptor.setting] ?? globalConfig?.[descriptor.setting] ?? descriptor.default;
};
// Produce the complete effective data settings object from descriptor-driven configuration
export const resolveDataOptionSettings = (localConfig = {}, globalConfig = {})=>Object.fromEntries(DATA_OPTION_DESCRIPTORS.filter(// Select matching items
    (descriptor)=>descriptor.group).map((descriptor)=>{
        // Transform the current item
        if (descriptor.merge === 'fetchOptions') {
            return [
                descriptor.group,
                mergeFetchOptions(globalConfig?.data?.[descriptor.group], localConfig?.data?.[descriptor.group])
            ];
        }
        return [
            descriptor.group,
            configuredValue(descriptor, localConfig, globalConfig)
        ];
    }));
// Validate allowed values and numeric constraints declared by every data descriptor
export const validateDataOptionSettings = (settings, suffix = '')=>{
    DATA_OPTION_DESCRIPTORS.forEach((descriptor)=>{
        // Process the current item
        const name = descriptor.group ? `data.${descriptor.group}` : descriptor.setting, value = descriptor.group ? settings?.data?.[descriptor.group] : settings?.[descriptor.setting];
        if (value == null) return;
        if (descriptor.allowed && !descriptor.allowed.has(value)) throw new TypeError(`[ACL] Unsupported ${name} value "${value}"${suffix}.`);
        const numeric = Number(value);
        if (descriptor.validate === 'nonNegative' && (!Number.isFinite(numeric) || numeric < 0)) throw new TypeError(`[ACL] ${name} must be a non-negative finite number${suffix}.`);
        if (descriptor.validate === 'unitInterval' && (!Number.isFinite(numeric) || numeric < 0 || numeric > 1)) throw new TypeError(`[ACL] ${name} must be between 0 and 1${suffix}.`);
        if (descriptor.validate === 'positiveInteger' && (!Number.isInteger(numeric) || numeric < 1)) throw new TypeError(`[ACL] ${name} must be a positive integer${suffix}.`);
    });
};
// Parse one serializable declarative control according to its descriptor metadata
const parseDeclarativeValue = (element, descriptor, fallback)=>{
    const attribute = descriptor.attribute || descriptor.proxyAttribute;
    if (!attribute || !element.hasAttribute(attribute)) return undefined;
    if (descriptor.parse === 'boolean') return readBooleanAttribute(element, attribute, fallback);
    if (descriptor.parse === 'number') {
        const positive = descriptor.validate === 'positiveInteger';
        return readNumberAttribute(element, attribute, fallback, {
            min: positive ? 1 : 0
        });
    }
    const raw = element.getAttribute(attribute);
    if (descriptor.parse === 'json') return parseJson(raw, fallback);
    return raw;
};
// Limit declarative controls to serializable values while keeping function hooks programmatic
export const readDeclarativeOptionSettings = (element, globalConfig = {})=>{
    const data = {}, options = {};
    DATA_OPTION_DESCRIPTORS.forEach((descriptor)=>{
        // Process the current item
        const value = parseDeclarativeValue(element, descriptor, configuredValue(descriptor, {}, globalConfig));
        if (value === undefined) return;
        if (descriptor.group) data[descriptor.group] = value;
        else options[descriptor.setting] = value;
    });
    if (Object.keys(data).length) options.data = data;
    return options;
};
