// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

const currentModuleUrl = new URL(import.meta.url), moduleSuffix = currentModuleUrl.pathname.endsWith('.min.js') ? '.min.js' : '.js', resolveLocalModule = (specifier)=>{
    const resolved = new URL(specifier.replace(/\.js$/, moduleSuffix), currentModuleUrl);
    return resolved.href;
}, importLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), importDeferredLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), [{ setBoundedMapEntry }, { ACLLoadError, raceWithSignal }, { stableStringify }, { applyAssetDescriptor, findExternalScript, findExternalStyle, normalizeAssetUrl }] = await Promise.all([
    importLocalModule('../config.js'),
    importLocalModule('../errors.js'),
    importLocalModule('../values.js'),
    importLocalModule('../assets.js')
]);
let cachesModulePromise = null;
// Share asset cache initialization while allowing a later attempt after an import failure
const loadCachesModule = ()=>{
    if (cachesModulePromise) return cachesModulePromise;
    const loading = importDeferredLocalModule('../caches.js').catch((cause)=>{
        // Evict only the failed cache request before surfacing the typed import error
        if (cachesModulePromise === loading) cachesModulePromise = null;
        throw new ACLLoadError('Unable to load the asset cache runtime module.', {
            code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
            phase: 'runtime-import',
            cause,
            retryable: true
        });
    });
    cachesModulePromise = loading;
    return loading;
};
// Apply external styles to a component shadow root after the asset capability is requested
export const appendShadowExternalStyles = async (component, settings, signal = null)=>{
    await Promise.all(settings.externalCss.map(// Transform the current item
    (descriptor)=>new Promise((resolve, reject)=>{
            // Settle the asynchronous operation
            const link = document.createElement('link');
            let settled = false, timeoutId = null, releaseCleanup = ()=>{
            // Leave cleanup unowned until registration completes
            };
            // Settle each shadow stylesheet through one path that releases every listener
            const cleanup = ()=>{
                clearTimeout(timeoutId);
                link.removeEventListener('load', onLoad);
                link.removeEventListener('error', onError);
                signal?.removeEventListener('abort', onAbort);
                releaseCleanup();
            }, finish = (callback, value)=>{
                if (settled) return;
                settled = true;
                cleanup();
                callback(value);
            }, createError = ()=>new ACLLoadError(`Failed to apply stylesheet: ${descriptor.url}`, {
                    code: 'ACL_ASSET_LOAD_FAILED',
                    phase: 'asset'
                }), createCancelError = ()=>new ACLLoadError('Component asset load was canceled.', {
                    code: 'ACL_LOAD_CANCELED',
                    phase: 'asset'
                }), onLoad = ()=>finish(resolve), onError = ()=>finish(reject, createError()), onAbort = ()=>finish(reject, createCancelError());
            if (signal?.aborted) {
                onAbort();
                return;
            }
            link.rel = 'stylesheet';
            link.href = descriptor.url;
            applyAssetDescriptor(link, descriptor);
            link.addEventListener('load', onLoad, {
                once: true
            });
            link.addEventListener('error', onError, {
                once: true
            });
            signal?.addEventListener('abort', onAbort, {
                once: true
            });
            timeoutId = setTimeout(onError, descriptor.timeout);
            releaseCleanup = component._addCleanup(// Register cleanup work
            ()=>finish(reject, createError()));
            component._root.appendChild(link);
        })));
};
// Load shared document styles and ordered scripts only for components declaring external assets
export const loadExternalDependencies = async (settings, signal = null, owner)=>{
    const module = await loadCachesModule(), { scriptLoadCache, styleLoadPromiseCache } = owner._context.caches ||= module.createRuntimeCaches();
    // Race shared global work against only this component's local load signal
    const awaitForComponent = (promise)=>raceWithSignal(promise, signal, // Settle the abortable promise
        ()=>new ACLLoadError('Component asset load was canceled.', {
                code: 'ACL_LOAD_CANCELED',
                phase: 'asset'
            }));
    // Inject CSS into document head and await readiness so components do not flash unstyled
    await Promise.all(settings.externalCss.map(async (descriptor)=>{
        // Transform the current item
        const url = descriptor.url, cacheKey = stableStringify({
            url: normalizeAssetUrl(url),
            ...descriptor
        });
        let loadPromise = styleLoadPromiseCache.get(cacheKey);
        if (!loadPromise) {
            // Share one global stylesheet request across every component using its descriptor
            loadPromise = new Promise((resolve, reject)=>{
                // Settle the asynchronous operation
                let link = findExternalStyle(url), timeoutId = null;
                // Remove request listeners and its fallback timeout on every outcome
                const cleanup = ()=>{
                    clearTimeout(timeoutId);
                    link?.removeEventListener('load', onLoad);
                    link?.removeEventListener('error', onError);
                };
                // Mark the shared stylesheet ready before resolving all consumers
                const onLoad = ()=>{
                    cleanup();
                    if (link) link.dataset.aclLoaded = 'true';
                    resolve();
                };
                // Remove only loader-owned failed stylesheets before rejecting consumers
                const onError = ()=>{
                    cleanup();
                    if (link?.dataset.aclOwned === 'true') link.remove();
                    reject(new ACLLoadError(`Failed to load stylesheet: ${url}`, {
                        code: 'ACL_ASSET_LOAD_FAILED',
                        phase: 'asset'
                    }));
                };
                if (link?.dataset.aclLoaded === 'true' || link?.sheet) {
                    resolve();
                    return;
                }
                if (!link) {
                    link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = url;
                    link.dataset.aclOwned = 'true';
                    applyAssetDescriptor(link, descriptor);
                    document.head.appendChild(link);
                }
                link.addEventListener('load', onLoad, {
                    once: true
                });
                link.addEventListener('error', onError, {
                    once: true
                });
                timeoutId = setTimeout(onError, descriptor.timeout);
            });
            // A failed shared request must be evicted so a later component can retry it
            loadPromise.catch(()=>{
                // Handle the rejected operation
                if (styleLoadPromiseCache.get(cacheKey) === loadPromise) styleLoadPromiseCache.delete(cacheKey);
            });
            setBoundedMapEntry(styleLoadPromiseCache, cacheKey, loadPromise, settings.runtimeCacheMax);
        }
        await awaitForComponent(loadPromise);
    }));
    // Scripts: load sequentially so dependency order is preserved
    for (const descriptor of settings.externalScripts){
        const url = descriptor.url, cacheKey = stableStringify({
            url: normalizeAssetUrl(url),
            ...descriptor
        });
        let loadPromise = scriptLoadCache.get(cacheKey);
        if (!loadPromise) {
            // Share one ordered global script request across every matching component
            loadPromise = new Promise((resolve, reject)=>{
                // Settle the asynchronous operation
                const existing = findExternalScript(url);
                if (existing && (existing.dataset.aclLoaded === 'true' || existing.dataset.aclOwned !== 'true')) {
                    resolve();
                    return;
                }
                const script = existing || document.createElement('script');
                let timeoutId = null;
                // Remove request listeners and its fallback timeout on every outcome
                const cleanup = ()=>{
                    clearTimeout(timeoutId);
                    script.removeEventListener('load', onLoad);
                    script.removeEventListener('error', onError);
                };
                // Mark the shared script ready before resolving all consumers
                const onLoad = ()=>{
                    cleanup();
                    script.dataset.aclLoaded = 'true';
                    resolve();
                };
                // Remove only loader-owned failed scripts before rejecting consumers
                const onError = ()=>{
                    cleanup();
                    if (script.dataset.aclOwned === 'true') script.remove();
                    reject(new ACLLoadError(`Failed to load script: ${url}`, {
                        code: 'ACL_ASSET_LOAD_FAILED',
                        phase: 'asset'
                    }));
                };
                script.addEventListener('load', onLoad, {
                    once: true
                });
                script.addEventListener('error', onError, {
                    once: true
                });
                if (!existing) {
                    script.src = url;
                    script.dataset.aclOwned = 'true';
                    applyAssetDescriptor(script, descriptor);
                }
                script.async = false;
                if (!existing) document.head.appendChild(script);
                timeoutId = setTimeout(onError, descriptor.timeout);
            });
            // A failed shared request must be evicted so a later component can retry it
            loadPromise.catch(()=>{
                // Handle the rejected operation
                if (scriptLoadCache.get(cacheKey) === loadPromise) scriptLoadCache.delete(cacheKey);
            });
            setBoundedMapEntry(scriptLoadCache, cacheKey, loadPromise, settings.runtimeCacheMax);
        }
        await awaitForComponent(loadPromise);
    }
};
