// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Clone mutable runtime values while preserving unsupported host objects by identity
export const cloneRuntimeValue = (value)=>{
    if (value === null || typeof value !== 'object') return value;
    if (typeof structuredClone === 'function') {
        // Guard the clone runtime value operation against runtime failures
        try {
            return structuredClone(value);
        } catch  {
        // Reactive proxies and host objects fall through to the safe recursive cases
        }
    }
    if (Array.isArray(value)) return value.map(cloneRuntimeValue);
    if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) return Object.fromEntries(Object.entries(value).map(// Transform the current item
    ([key, nested])=>[
            key,
            cloneRuntimeValue(nested)
        ]));
    return value;
};
// Clone reusable definition data with cycle protection while preserving DOM nodes and host objects
export const cloneDefinitionValue = (value, seen = new WeakMap())=>{
    if (value === null || typeof value !== 'object') return value;
    if (typeof Node !== 'undefined' && value instanceof Node) return value;
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value)) {
        const copy = [];
        seen.set(value, copy);
        value.forEach(// Process the current item
        (item)=>copy.push(cloneDefinitionValue(item, seen)));
        return copy;
    }
    if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
        const copy = {};
        seen.set(value, copy);
        Object.entries(value).forEach(([key, nested])=>{
            // Process the current item
            copy[key] = cloneDefinitionValue(nested, seen);
        });
        return copy;
    }
    return value;
};
// Serialize a camel-cased style object to inline CSS declarations
export const toCssString = (styleObj)=>Object.entries(styleObj).map(// Transform the current item
    ([key, value])=>`${key.replace(/[A-Z]/g, // Transform the matched text
        (match)=>`-${match.toLowerCase()}`)}:${value}`).join(';');
// Encode scalar or structured data for interpolation into a URL segment
export const toUrlValue = (value)=>encodeURIComponent(typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
// Serialize structured query values as JSON and scalars as strings
export const toParamValue = (value)=>typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
// Merge fetch options in order while combining headers case-insensitively
export const mergeFetchOptions = (...optionsList)=>{
    const merged = {}, headers = new Headers();
    let hasHeaders = false;
    optionsList.filter(Boolean).forEach((options)=>{
        // Process the current item
        Object.entries(options).forEach(([key, value])=>{
            // Process the current item
            if (key !== 'headers') merged[key] = value;
        });
        if (options.headers) {
            hasHeaders = true;
            new Headers(options.headers).forEach(// Process the current item
            (value, key)=>headers.set(key, value));
        }
    });
    if (hasHeaders) merged.headers = Object.fromEntries(headers.entries());
    return merged;
};
// Flatten nested objects and arrays into bracketed URLSearchParams keys
export const toSearchParamsDeep = (obj)=>{
    const params = new URLSearchParams(), // Recursively preserve object paths and repeat array keys in source order
    add = (key, value)=>{
        if (value == null) return;
        if (Array.isArray(value)) return value.forEach(// Process the current item
        (item)=>add(key, item));
        if (typeof value === 'object') {
            // Process each entry
            for (const [nestedKey, nestedValue] of Object.entries(value))add(`${key}[${nestedKey}]`, nestedValue);
            return;
        }
        params.append(key, toParamValue(value));
    };
    // Process each entry
    for (const [key, value] of Object.entries(obj ?? {}))add(key, value);
    return params;
};
// Parse strict JSON, otherwise return the provided fallback
export const parseJson = (value, fallback = null)=>{
    if (!value) return fallback;
    // Guard the parse json operation against runtime failures
    try {
        return JSON.parse(value);
    } catch  {
        return fallback;
    }
};
// Parse a declarative list expressed as a strict JSON array
export const parseListAttribute = (value)=>{
    if (!value) return [];
    const invalid = Symbol('invalid-list'), parsed = parseJson(value, invalid);
    if (!Array.isArray(parsed)) throw new TypeError('[ACL] Declarative lists must be JSON arrays.');
    return parsed.filter(Boolean);
};
// Resolve a safe dotted global path while blocking prototype traversal
export const resolveWindowPath = (path)=>{
    if (!path || typeof path !== 'string' || typeof window === 'undefined' || !/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(path)) return null;
    const keys = path.split('.');
    if (keys.some(// Check the current item
    (key)=>key === '__proto__' || key === 'prototype' || key === 'constructor')) return null;
    return keys.reduce(// Accumulate the current item
    (value, key)=>value?.[key], window);
};
// Normalize string and descriptor event-forwarding entries to one public rule shape
const normalizeForwardEvent = (entry)=>{
    if (!entry) return null;
    if (typeof entry === 'string') return {
        from: entry,
        as: entry,
        bubbles: true,
        composed: true
    };
    if (entry && typeof entry === 'object') {
        const from = entry.from;
        if (!from) return null;
        return {
            from,
            as: entry.as || from,
            bubbles: entry.bubbles !== false,
            composed: entry.composed !== false
        };
    }
    return null;
};
// Flatten, normalize, and discard invalid event-forwarding entries
export const normalizeForwardEvents = (...eventLists)=>eventLists.flatMap(// Expand the current item
    (list)=>Array.isArray(list) ? list : []).map(normalizeForwardEvent).filter(Boolean);
// Serialize objects with sorted keys so logically equivalent values share cache identity
export const stableStringify = (value)=>{
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().map(// Transform the current item
    (key)=>`${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};
// Namespace a template request by its active versioned cache key
export const getTemplateLoadKey = (source, settings = {})=>`${settings?._templateCacheKey || ''}::${settings?.templateRevision ? `${settings.templateRevision}::` : ''}${source}`;
