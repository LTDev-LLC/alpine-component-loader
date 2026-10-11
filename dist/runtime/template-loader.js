// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js', importLocalModule = (specifier)=>import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)), [{ ACLLoadError }, { getTemplateLoadKey }, { setBoundedMapEntry, validateOptions }, { createRuntimeCaches }] = await Promise.all([
    importLocalModule('./errors.js'),
    importLocalModule('./values.js'),
    importLocalModule('./config.js'),
    importLocalModule('./caches.js')
]);
// Own transactions independently while sharing network implementation code
export const createTemplateLoader = (AlpineComponentLoader)=>{
    const maps = AlpineComponentLoader._context.caches ||= createRuntimeCaches(), { templateLoadCache, templateLoadMetaCache } = maps;
    let templateRequestsModule, templateRequests;
    // Resolve the owning context template maps without another implementation import
    const loadTemplateMaps = async ()=>maps, // Activate shared template helpers through the owning loader
    loadRuntimeModule = (specifier)=>AlpineComponentLoader._loadModule(specifier), // Activate the persistent backend only for cache-enabled requests
    loadTemplateCacheRuntime = ()=>AlpineComponentLoader._loadTemplateCacheModule();
    class Templates {
        static async loadTemplate(source, settings = AlpineComponentLoader.globalConfig, options = {}) {
            // Resolve fetch sanitize and cache one component template
            const effectiveSettings = settings === AlpineComponentLoader.globalConfig ? AlpineComponentLoader.globalConfig : {
                ...AlpineComponentLoader.globalConfig,
                ...settings || {}
            };
            validateOptions(effectiveSettings);
            if (options.signal?.aborted) throw new ACLLoadError('Template loading was canceled', {
                code: 'ACL_LOAD_CANCELED',
                phase: 'template',
                cause: options.signal.reason
            });
            // Resolve direct template inputs before using the network
            if (source instanceof HTMLTemplateElement) {
                return source.content;
            } else if (typeof source === 'string' && source.startsWith('#')) {
                const el = document.querySelector(source);
                if (!el) return Promise.reject(new Error(`Template ID "${source}" not found`));
                if (!(el instanceof HTMLTemplateElement)) return Promise.reject(new Error(`ID "${source}" is not a <template>`));
                return el.content;
            }
            await loadTemplateMaps();
            const loadKey = getTemplateLoadKey(source, effectiveSettings), cacheGeneration = AlpineComponentLoader._context.templateGeneration;
            templateRequestsModule ||= await loadRuntimeModule('./template-requests.js');
            templateRequests ||= AlpineComponentLoader._context.templateRequests ||= templateRequestsModule.createTemplateRequests(templateLoadCache, // Resolve this operation and preserve independent ownership
            ()=>AlpineComponentLoader.globalConfig.prefetchConcurrency);
            return await templateRequests.subscribe(loadKey, options, async (requestContext)=>{
                // Deduplicate the complete cache strategy transaction under one in-flight promise
                // Decide whether this request can use the browser Cache API
                const strategy = effectiveSettings.templateCacheStrategy || 'cache-first', useCache = effectiveSettings.cacheTemplates && strategy !== 'no-store' && 'caches' in window, cacheTtl = Number(effectiveSettings.templateCacheTtl ?? effectiveSettings._templateCacheExpire);
                let _cache, cacheRequestKey = source, TEMPLATE_CACHE_HEADERS, createTemplateCacheResponse, invalidateTemplateCacheIndex, listTemplateCacheEntries, openTemplateCache, reconcileTemplateCacheEntries, touchTemplateCacheEntry, writeTemplateCacheEntry;
                if (useCache) {
                    const cacheRuntime = await loadTemplateCacheRuntime();
                    ({ TEMPLATE_CACHE_HEADERS, createTemplateCacheResponse, invalidateTemplateCacheIndex, listTemplateCacheEntries, openTemplateCache, reconcileTemplateCacheEntries, touchTemplateCacheEntry, writeTemplateCacheEntry } = cacheRuntime);
                    cacheRequestKey = cacheRuntime.getTemplateCacheRequestKey(source, effectiveSettings.templateRevision);
                    // Guard the load template operation against runtime failures
                    try {
                        _cache = await openTemplateCache(effectiveSettings._templateCacheKey);
                    } catch  {
                        _cache = null;
                    }
                }
                // Read and validate a cached response, optionally retaining expired stale content
                const readCache = async (allowStale = false)=>{
                    if (!_cache) return null;
                    // Guard the load template operation against runtime failures
                    try {
                        const match = await _cache.match(cacheRequestKey);
                        if (!match?.ok) return null;
                        const fetchedAt = Number(match.headers.get(TEMPLATE_CACHE_HEADERS.fetchedAt) || match.headers.get('acl__fetched-at__')), storedTtl = match.headers.has(TEMPLATE_CACHE_HEADERS.ttl) ? Number(match.headers.get(TEMPLATE_CACHE_HEADERS.ttl)) : cacheTtl, isFresh = !Number.isNaN(fetchedAt) && Date.now() - fetchedAt < storedTtl;
                        if (!isFresh && !allowStale) {
                            await _cache.delete(cacheRequestKey);
                            invalidateTemplateCacheIndex(_cache);
                            AlpineComponentLoader._dispatchRuntimeEvent('cacheevict', {
                                phase: 'template',
                                source,
                                cacheKey: effectiveSettings._templateCacheKey,
                                reason: 'expired'
                            });
                            return null;
                        }
                        const text = await templateRequestsModule.readTemplateResponse(match, effectiveSettings.templateMaxBytes, requestContext.signal);
                        if (cacheGeneration === AlpineComponentLoader._context.templateGeneration && !requestContext.signal.aborted) void touchTemplateCacheEntry(_cache, cacheRequestKey, text, match, {
                            source,
                            revision: effectiveSettings.templateRevision,
                            ttl: storedTtl,
                            fetchedAt,
                            lastAccess: Date.now()
                        }, {
                            coalesceMs: 1000
                        });
                        setBoundedMapEntry(templateLoadMetaCache, loadKey, {
                            source,
                            cacheKey: effectiveSettings._templateCacheKey,
                            cacheHit: true,
                            loadedAt: Date.now(),
                            fetchedAt,
                            revision: effectiveSettings.templateRevision || null
                        }, effectiveSettings.runtimeCacheMax);
                        return text;
                    } catch (error) {
                        if (error?.code === 'ACL_TEMPLATE_TOO_LARGE' || requestContext.signal.aborted) throw error;
                        return null;
                    }
                };
                // Fetch a fresh template, record metadata, and best-effort persist it to Cache API
                const fetchAndStore = async (context = requestContext)=>{
                    context.ensureActive();
                    // Resolve this operation and preserve independent ownership
                    const { text, response: res } = await context.network(()=>templateRequestsModule.fetchTemplateText(source, effectiveSettings, context.signal));
                    context.ensureActive();
                    if (_cache && cacheGeneration === AlpineComponentLoader._context.templateGeneration) {
                        // Guard the load template operation against runtime failures
                        try {
                            const stored = createTemplateCacheResponse(text, res, {
                                source,
                                revision: effectiveSettings.templateRevision,
                                ttl: cacheTtl
                            }), storedSuccessfully = await writeTemplateCacheEntry(_cache, cacheRequestKey, stored, {
                                // Resolve the queued operation and release its resources
                                isCurrent: ()=>cacheGeneration === AlpineComponentLoader._context.templateGeneration && !context.signal.aborted,
                                onQuota: async ()=>{
                                    // Run the on quota operation
                                    const entries = await listTemplateCacheEntries(_cache), count = Math.max(1, Math.ceil(entries.length * 0.2));
                                    await Promise.all(// Recover quota by deleting the oldest victim set concurrently
                                    entries.slice(-count).map(async (entry)=>{
                                        await _cache.delete(entry.request);
                                        AlpineComponentLoader._dispatchRuntimeEvent('cacheevict', {
                                            phase: 'template',
                                            source: entry.source,
                                            cacheKey: effectiveSettings._templateCacheKey,
                                            reason: 'quota'
                                        });
                                    }));
                                    invalidateTemplateCacheIndex(_cache);
                                }
                            });
                            if (storedSuccessfully) {
                                const evicted = await reconcileTemplateCacheEntries(_cache, {
                                    max: AlpineComponentLoader.globalConfig.templateCacheMax,
                                    source: effectiveSettings.templateRevision ? source : null,
                                    currentRequest: cacheRequestKey
                                });
                                evicted.forEach((entry)=>{
                                    AlpineComponentLoader._dispatchRuntimeEvent('cacheevict', {
                                        phase: 'template',
                                        source: entry.source,
                                        cacheKey: effectiveSettings._templateCacheKey,
                                        reason: entry.reason
                                    });
                                });
                            }
                        } catch  {
                        // Ignore cache write failures because templates can still render
                        }
                    }
                    context.ensureActive();
                    if (cacheGeneration === AlpineComponentLoader._context.templateGeneration) setBoundedMapEntry(templateLoadMetaCache, loadKey, {
                        source,
                        cacheKey: effectiveSettings._templateCacheKey,
                        cacheHit: false,
                        loadedAt: Date.now(),
                        fetchedAt: Date.now(),
                        revision: effectiveSettings.templateRevision || null
                    }, effectiveSettings.runtimeCacheMax);
                    return text;
                };
                if (strategy === 'cache-first') {
                    const cached = await readCache(false);
                    if (cached !== null) return cached;
                    return await fetchAndStore();
                }
                if (strategy === 'stale-while-revalidate') {
                    const cached = await readCache(true);
                    if (cached !== null) {
                        templateRequests// Resolve this operation and preserve independent ownership
                        .subscribe(`${loadKey}::revalidation`, {
                            priority: 'prefetch'
                        }, (context)=>fetchAndStore(context)).catch(()=>{
                        // Ignore detached stale cache refresh failures
                        });
                        return cached;
                    }
                    return await fetchAndStore();
                }
                if (strategy === 'network-first') {
                    // Guard the load template operation against runtime failures
                    try {
                        return await fetchAndStore();
                    } catch (e) {
                        if (requestContext.signal.aborted || e?.code === 'ACL_TEMPLATE_TOO_LARGE') throw e;
                        const cached = await readCache(true);
                        if (cached !== null) return cached;
                        throw e;
                    }
                }
                return await fetchAndStore();
            });
        }
    }
    return Templates;
};
