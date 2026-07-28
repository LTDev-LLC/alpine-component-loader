// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js', importLocalModule = (specifier)=>import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)), { stableStringify } = await importLocalModule('./values.js');
// Resolve an asset URL against the current document while tolerating invalid input
export const normalizeAssetUrl = (url)=>{
    // Guard the normalize asset url operation against runtime failures
    try {
        return new URL(url, document.baseURI).href;
    } catch  {
        return url;
    }
};
// Find an existing global stylesheet by either its normalized or authored URL
export const findExternalStyle = (url)=>{
    const normalized = normalizeAssetUrl(url);
    return Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).find(// Find the matching item
    (link)=>link.href === normalized || link.getAttribute('href') === url) || null;
};
// Report whether a matching global stylesheet is already present
export const hasExternalStyle = (url)=>Boolean(findExternalStyle(url));
// Find an existing global script by either its normalized or authored URL
export const findExternalScript = (url)=>{
    const normalized = normalizeAssetUrl(url);
    return Array.from(document.scripts).find(// Find the matching item
    (script)=>script.src === normalized || script.getAttribute('src') === url) || null;
};
// Report whether a matching global script is already present
export const hasExternalScript = (url)=>Boolean(findExternalScript(url));
// Convert string or object asset input into one validated descriptor shape
export const normalizeAssetDescriptor = (entry, type)=>{
    if (typeof entry === 'string') return {
        url: entry,
        timeout: 30000
    };
    if (!entry || typeof entry !== 'object') return null;
    const url = entry.url || entry.href || entry.src;
    if (!url) return null;
    return {
        ...entry,
        url,
        timeout: Number.isFinite(Number(entry.timeout)) ? Math.max(0, Number(entry.timeout)) : 30000,
        ...type === 'style' && entry.media ? {
            media: entry.media
        } : {}
    };
};
// Normalize and structurally deduplicate an asset descriptor list in source order
export const normalizeAssetList = (entries, type)=>{
    const seen = new Set();
    return (entries || []).map(// Transform the current item
    (entry)=>normalizeAssetDescriptor(entry, type)).filter((descriptor)=>{
        // Select matching items
        if (!descriptor) return false;
        const key = stableStringify(descriptor);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};
// Copy supported security, loading, and media metadata onto an asset element
export const applyAssetDescriptor = (element, descriptor)=>{
    if (descriptor.nonce) element.nonce = descriptor.nonce;
    if (descriptor.crossOrigin != null) element.crossOrigin = descriptor.crossOrigin;
    if (descriptor.referrerPolicy) element.referrerPolicy = descriptor.referrerPolicy;
    if (descriptor.integrity) element.integrity = descriptor.integrity;
    if (descriptor.media && element.localName === 'link') element.media = descriptor.media;
    if (descriptor.type && element.localName === 'script') element.type = descriptor.type;
};
