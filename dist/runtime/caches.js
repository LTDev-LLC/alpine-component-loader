// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

// Allocate runtime caches for one owner; implementation imports remain shared
export const createRuntimeCaches = ()=>({
        styleSheetCache: new Map(),
        scriptLoadCache: new Map(),
        styleLoadPromiseCache: new Map(),
        templateLoadCache: new Map(),
        templateLoadMetaCache: new Map()
    });
const suffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js', // Resolve shared cache implementation modules in the selected delivery family
importLocalModule = (specifier)=>import(/* @vite-ignore */ specifier.replace(/\.js$/, suffix)), { getContext } = await importLocalModule('./context.js'), defaults = getContext().caches ||= createRuntimeCaches();
// Keep internal default-cache aliases bound to the default ownership context
export const { styleSheetCache, scriptLoadCache, styleLoadPromiseCache, templateLoadCache, templateLoadMetaCache } = defaults;
