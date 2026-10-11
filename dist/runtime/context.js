// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

const contexts = new Map(), implementationImports = new Map();
let sequence = 0, availableWebComponents = null;
// Allocate isolated loader ownership
export const createContext = (id = `instance-${Date.now().toString(36)}-${++sequence}`)=>({
        id,
        caches: null,
        templateGeneration: 0
    });
// Share default ownership
export const getContext = (id = 'default')=>{
    if (!contexts.has(id)) contexts.set(id, createContext(id));
    return contexts.get(id);
};
// Wait for optional Web Components
export const runWhenWebComponentsReady = (callback)=>{
    const startup = getContext().polyfillStartup, components = globalThis.WebComponents;
    if (startup) return startup.then(callback);
    if (!components || components.ready || components === availableWebComponents) return callback();
    return new Promise((resolve, reject)=>{
        // Batch upgrades after callbacks
        const run = ()=>{
            availableWebComponents = components;
            return Promise.resolve().then(callback).then(resolve, reject);
        };
        if (typeof components.waitFor === 'function') components.waitFor(run);
        else document.addEventListener('WebComponentsReady', run, {
            once: true
        });
    });
};
// Share implementation imports
export const importSharedImplementation = (url)=>{
    if (!implementationImports.has(url)) {
        const loading = import(/* @vite-ignore */ url).catch((error)=>{
            // Evict failed imports for retry
            if (implementationImports.get(url) === loading) implementationImports.delete(url);
            throw error;
        });
        implementationImports.set(url, loading);
    }
    return implementationImports.get(url);
};
