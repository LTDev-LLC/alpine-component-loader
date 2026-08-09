// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const currentModuleUrl = new URL(import.meta.url), moduleSuffix = currentModuleUrl.pathname.endsWith('.min.js') ? '.min.js' : '.js', resolveLocalModule = (specifier)=>{
    const resolved = new URL(specifier.replace(/\.js$/, moduleSuffix), currentModuleUrl);
    if (currentModuleUrl.searchParams.has('acl-instance')) resolved.searchParams.set('acl-instance', currentModuleUrl.searchParams.get('acl-instance'));
    return resolved.href;
}, importLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), importDeferredLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), runtimeModulePromises = new Map(), loadRuntimeModule = (specifier)=>{
    if (runtimeModulePromises.has(specifier)) return runtimeModulePromises.get(specifier);
    // Share one deferred module request and allow later retries after failure
    const loading = importDeferredLocalModule(specifier).catch((error)=>{
        if (runtimeModulePromises.get(specifier) === loading) runtimeModulePromises.delete(specifier);
        if (error instanceof ACLLoadError) throw error;
        throw new ACLLoadError(`Unable to load runtime module "${specifier}".`, {
            code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
            phase: 'runtime-import',
            cause: error,
            retryable: true
        });
    });
    runtimeModulePromises.set(specifier, loading);
    return loading;
}, [{ ACL_VERSION, VALID_CACHE_STRATEGIES, VALID_HYDRATION_MODES, VALID_LOADING_MODES, HTMLElementBase, getTemplateCacheNames, hasOwn, resolveComponentSource, setBoundedMapEntry, validateCustomElementName }, { ACLLoadError }, { cloneDefinitionValue, getTemplateLoadKey, normalizeForwardEvents, parseListAttribute }, { parsePropDefinitions }, { DEFAULT_DATA_OPTIONS, INTERNAL_COMPONENT_ATTRIBUTES, readDeclarativeOptionSettings, resolveDataOptionSettings, validateDataOptionSettings }, { collectInlineComponentTemplates, getInlineComponentName }] = await Promise.all([
    importLocalModule('./config.js'),
    importLocalModule('./errors.js'),
    importLocalModule('./values.js'),
    importLocalModule('./props.js'),
    importLocalModule('./data-options.js'),
    importLocalModule('../inline-templates.js')
]);
let templateMapsPromise = null, templateCacheRuntimePromise = null, componentRuntimePromise = null, templateLoadCache = null, templateLoadMetaCache = null;
// Load optional cache and observability helpers only after their first use
const loadTemplateMaps = ()=>{
    if (templateMapsPromise) return templateMapsPromise;
    // Share cache-map initialization while permitting retries after failure
    const loading = loadRuntimeModule('./caches.js').then((cachesRuntime)=>{
        templateLoadCache = cachesRuntime.templateLoadCache;
        templateLoadMetaCache = cachesRuntime.templateLoadMetaCache;
        return cachesRuntime;
    }).catch((error)=>{
        if (templateMapsPromise === loading) templateMapsPromise = null;
        throw error;
    });
    templateMapsPromise = loading;
    return loading;
}, loadTemplateCacheRuntime = ()=>{
    if (templateCacheRuntimePromise) return templateCacheRuntimePromise;
    // Share template-cache loading while permitting retries after failure
    const loading = loadRuntimeModule('./template-cache.js').catch((error)=>{
        if (templateCacheRuntimePromise === loading) templateCacheRuntimePromise = null;
        throw error;
    });
    templateCacheRuntimePromise = loading;
    return loading;
}, loadComponentRuntime = ()=>{
    if (componentRuntimePromise) return componentRuntimePromise;
    // Load component construction and controllers only when a definition is requested
    const loading = Promise.all([
        loadRuntimeModule('./component/factory.js'),
        loadRuntimeModule('./component/lifecycle-controller.js'),
        loadRuntimeModule('./component/loading-controller.js'),
        loadRuntimeModule('./component/data-gate-controller.js'),
        loadRuntimeModule('./component/render-controller.js'),
        loadRuntimeModule('./component/state-controller.js')
    ]).then(([{ createComponentElementClass }, { withComponentLifecycle }, { withComponentLoading }, { withComponentDataGate }, { withComponentRendering }, { withComponentState }])=>({
            createComponentElementClass,
            withComponentLifecycle,
            withComponentLoading,
            withComponentDataGate,
            withComponentRendering,
            withComponentState
        })).catch((error)=>{
        if (componentRuntimePromise === loading) componentRuntimePromise = null;
        throw error;
    });
    componentRuntimePromise = loading;
    return loading;
}, createDisabledObservability = ()=>({
        emit (type, detail = {}, defaults = {}) {
            return {
                sequence: 0,
                timestamp: Date.now(),
                type,
                severity: defaults.severity || (type === 'error' ? 'error' : 'info'),
                tagName: detail.tagName || defaults.tagName || null,
                phase: detail.phase || defaults.phase || null,
                requestId: detail.requestId || defaults.requestId || null,
                duration: Number.isFinite(detail.duration) ? detail.duration : null,
                status: detail.status ?? null,
                detail
            };
        },
        report (level, message, error = null) {
            // Keep disabled diagnostics best effort across restricted consoles
            try {
                console?.[level]?.(message, ...error == null ? [] : [
                    error
                ]);
            } catch  {
            // Keep diagnostics best effort while observability remains disabled
            }
        },
        getMetrics () {
            return {
                startedAt: Date.now(),
                totals: {},
                durations: {},
                recent: []
            };
        },
        clearMetrics () {
        // No retained metrics exist until observability is activated
        }
    }), createEffectiveSettings = ({ globalConfig, config, dataSettings, generatedSkeletonHtml, hasAuthoredLoadingUI })=>({
        loading: 'eager',
        ...globalConfig,
        ...config,
        attributes: {
            ...globalConfig.attributes || {},
            ...config.attributes || {}
        },
        executeScripts: config.executeScripts ?? globalConfig.executeScripts,
        sanitize: config.sanitize ?? globalConfig.sanitize,
        strictProps: config.strictProps ?? globalConfig.strictProps ?? false,
        sourceResolver: config.sourceResolver ?? globalConfig.sourceResolver ?? null,
        loadingTemplate: config.loadingTemplate ?? globalConfig.loadingTemplate ?? null,
        loadingHtml: config.loadingHtml ?? globalConfig.loadingHtml ?? (hasAuthoredLoadingUI ? null : generatedSkeletonHtml),
        templateCacheStrategy: config.templateCacheStrategy ?? globalConfig.templateCacheStrategy ?? 'cache-first',
        hooks: {
            beforeFetch: (options)=>options,
            afterFetch: (data)=>data,
            ...globalConfig.hooks || {},
            ...config.hooks || {}
        },
        externalCss: [
            ...globalConfig.externalCss || [],
            ...config.externalCss || []
        ],
        externalScripts: [
            ...globalConfig.externalScripts || [],
            ...config.externalScripts || []
        ],
        sharedStyleSheets: [
            ...globalConfig.sharedStyleSheets || [],
            ...config.sharedStyleSheets || []
        ],
        errorCss: {
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            padding: '1rem',
            border: '1px solid #fca5a5',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            borderRadius: '6px',
            fontFamily: 'sans-serif',
            fontSize: '0.9rem',
            ...globalConfig.errorCss || {},
            ...config.errorCss || {}
        },
        events: {
            ...globalConfig.events || {},
            ...config.events || {},
            forward: normalizeForwardEvents(globalConfig.events?.forward, config.events?.forward)
        },
        fallback: config.fallback ?? globalConfig.fallback ?? null,
        persist: config.persist ?? globalConfig.persist ?? false,
        persistKey: config.persistKey ?? globalConfig.persistKey ?? null,
        persistDebounce: config.persistDebounce ?? globalConfig.persistDebounce ?? 250,
        persistAdapter: config.persistAdapter ?? globalConfig.persistAdapter ?? null,
        persistMigrate: config.persistMigrate ?? globalConfig.persistMigrate ?? null,
        bindStore: config.bindStore ?? globalConfig.bindStore ?? null,
        form: config.form ?? globalConfig.form ?? false,
        data: dataSettings
    });
export { ACLLoadError };
export default class AlpineComponentLoader {
    static _instanceId = currentModuleUrl.searchParams.get('acl-instance') || 'default';
    static _isolated = currentModuleUrl.searchParams.has('acl-instance');
    static _disposed = false;
    static _components = new Set();
    static _started = false;
    static _starting = null;
    static _registry = new Map();
    static _manifestDependencies = new Map();
    static _manifestGroups = new Map();
    static _skeletonRegistry = new Map();
    static _debugger = false;
    static _templateObserver = null;
    static _prefetchController = null;
    static _prefetchStarting = null;
    static _prefetchGeneration = 0;
    static _detachedDataEntries = new Set();
    static _indexedDBPersistenceAdapter = null;
    static _dataRuntime = null;
    static _observability = createDisabledObservability();
    static _observabilityPromise = null;
    static get version() {
        // Return the runtime package version
        return ACL_VERSION;
    }
    static globalConfig = {
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
            forward: []
        },
        externalCss: [],
        externalScripts: [],
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
        // Descriptor-driven grouped data defaults
        data: {
            ...DEFAULT_DATA_OPTIONS
        },
        persistVersion: 1,
        // Defaults for Cache API backed template storage
        cacheTemplates: true,
        templateCacheStrategy: 'cache-first',
        templateCacheTtl: 15 * 60 * 1000,
        templateCacheMax: 100,
        templateRevision: null,
        cacheNamespace: 'default',
        _templateCacheVersion: ACL_VERSION,
        _templateCachePrefix: getTemplateCacheNames('default').prefix,
        _templateCacheKey: getTemplateCacheNames('default').key,
        _templateCacheExpire: 15 * 60 * 1000
    };
    // Run this operation
    static async start() {
        AlpineComponentLoader._assertActive();
        // Initialize registration and cache state through one shared startup transaction
        if (typeof window === 'undefined' || typeof document === 'undefined' || typeof customElements === 'undefined' || typeof HTMLElement === 'undefined') throw new ACLLoadError('AlpineComponentLoader.start() requires browser DOM APIs.', {
            code: 'ACL_ENVIRONMENT_UNAVAILABLE',
            phase: 'environment'
        });
        if (AlpineComponentLoader._started) return;
        if (AlpineComponentLoader._starting) return AlpineComponentLoader._starting;
        // Share one startup transaction across callers until registration completes or fails
        AlpineComponentLoader._starting = (async ()=>{
            // Run the deferred operation
            try {
                // Remove stale template cache buckets before registration
                await AlpineComponentLoader.pruneCaches();
            } catch (e) {
                AlpineComponentLoader._report('warn', '[ACL] Failed to prune template caches.', e, {
                    phase: 'cache'
                });
            }
            // Register definitions queued before startup before installing built-in tags
            AlpineComponentLoader._registerDefinitions();
            // Install the default declarative and dynamic custom elements
            await AlpineComponentLoader.registerComponent();
            await AlpineComponentLoader.registerDynamicLoader();
            await AlpineComponentLoader.registerTemplates();
            // Register inline and declarative definitions discovered during startup
            AlpineComponentLoader._registerDefinitions();
            AlpineComponentLoader._started = true;
            if (AlpineComponentLoader.globalConfig.adaptivePrefetch) await AlpineComponentLoader.observePrefetch(AlpineComponentLoader.globalConfig.adaptivePrefetch === true ? {} : AlpineComponentLoader.globalConfig.adaptivePrefetch);
            AlpineComponentLoader._starting = null;
        })();
        // Guard the start operation against runtime failures
        try {
            return await AlpineComponentLoader._starting;
        } catch (e) {
            AlpineComponentLoader._starting = null;
            throw e;
        }
    }
    static async pruneCaches(prefix = AlpineComponentLoader.globalConfig._templateCachePrefix, current = AlpineComponentLoader.globalConfig._templateCacheKey) {
        // Remove stale versioned Cache API buckets
        if (!('caches' in window)) return;
        const staleKeys = (await caches.keys()).filter(// Select matching items
        (key)=>key.startsWith(prefix)).filter(// Select matching items
        (key)=>key !== current);
        if (templateCacheRuntimePromise) {
            const { invalidateTemplateCacheHandle, invalidateTemplateCacheIndex, openTemplateCache, settleTemplateCacheWrites } = await templateCacheRuntimePromise;
            await Promise.all(staleKeys.map(async (key)=>{
                // Drain detached access writes before deleting one stale bucket
                try {
                    const cache = await openTemplateCache(key);
                    await settleTemplateCacheWrites(cache);
                    invalidateTemplateCacheIndex(cache);
                } catch  {
                // Continue with explicit bucket deletion when a handle cannot open
                }
                invalidateTemplateCacheHandle(key);
            }));
        }
        return await Promise.all(staleKeys.map(// Transform the current item
        (key)=>caches.delete(key)));
    }
    static async clearTemplateCaches(prefix = AlpineComponentLoader.globalConfig._templateCachePrefix) {
        // Remove every persistent template cache under the requested prefix
        if (!('caches' in window)) {
            AlpineComponentLoader._report('warn', '[ACL] Cache API not supported.', null, {
                phase: 'cache'
            });
            return;
        }
        const { invalidateTemplateCacheHandle, invalidateTemplateCacheIndex, openTemplateCache, settleTemplateCacheWrites } = await loadTemplateCacheRuntime(), cacheKeys = (await caches.keys()).filter(// Select matching items
        (key)=>key.startsWith(prefix));
        await Promise.all(cacheKeys.map(async (key)=>{
            // Drain detached access writes before deleting one explicit bucket
            try {
                const cache = await openTemplateCache(key);
                await settleTemplateCacheWrites(cache);
                invalidateTemplateCacheIndex(cache);
            } catch  {
            // Continue with explicit bucket deletion when a handle cannot open
            }
            invalidateTemplateCacheHandle(key);
        }));
        invalidateTemplateCacheIndex();
        // Delete every template cache bucket using the requested prefix
        return await Promise.all(cacheKeys.map(// Transform the current item
        (key)=>caches.delete(key)));
    }
    static _dispatchRuntimeEvent(name, detail = {}) {
        // Emit matching structured and DOM runtime events
        AlpineComponentLoader._observability.emit(name, detail);
        if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') document.dispatchEvent(new CustomEvent(`acl:${name}`, {
            detail
        }));
    }
    static subscribe(listener) {
        // Activate structured observability only when a consumer subscribes
        if (typeof listener !== 'function') throw new TypeError('[ACL] subscribe() expects a listener function.');
        // Retain a cancellable placeholder until deferred observability is ready
        let active = true, unsubscribe = ()=>{
            active = false;
        };
        // Replace the placeholder only while the subscription remains active
        void AlpineComponentLoader._loadObservability().then((observability)=>{
            // Attach only subscriptions that remain active after deferred initialization
            if (active) unsubscribe = observability.subscribe(listener);
        }, // Report detached subscription activation failures without an unhandled rejection
        (error)=>AlpineComponentLoader._report('warn', '[ACL] Failed to activate observability for a subscription.', error, {
                phase: 'runtime-import'
            }));
        // Release either the placeholder or the eventual runtime subscription
        return ()=>unsubscribe();
    }
    static getMetrics() {
        // Return the current aggregate metrics snapshot
        return AlpineComponentLoader._observability.getMetrics();
    }
    static clearMetrics() {
        // Reset aggregate metrics and retained observability records
        AlpineComponentLoader._observability.clearMetrics();
    }
    static _report(level, message, error = null, context = {}) {
        // Forward a warning or error to the structured reporter
        return AlpineComponentLoader._observability.report(level, message, error, context);
    }
    static async _loadObservability() {
        // Import and configure structured diagnostics only after explicit activation
        if (AlpineComponentLoader._observabilityPromise) return AlpineComponentLoader._observabilityPromise;
        // Share one observability initialization and permit retries after failure
        const loading = loadRuntimeModule('./observability.js').then(({ createObservability })=>{
            const observability = createObservability();
            observability.configure(AlpineComponentLoader.globalConfig.observability);
            AlpineComponentLoader._observability = observability;
            return observability;
        }).catch((error)=>{
            if (AlpineComponentLoader._observabilityPromise === loading) AlpineComponentLoader._observabilityPromise = null;
            throw error;
        });
        AlpineComponentLoader._observabilityPromise = loading;
        return loading;
    }
    static async clearTemplate(source, cacheKey = AlpineComponentLoader.globalConfig._templateCacheKey) {
        // Evict every persistent cache entry for one template source
        if (!('caches' in window)) return false;
        const { invalidateTemplateCacheIndex, listTemplateCacheEntries, openTemplateCache, settleTemplateCacheWrites } = await loadTemplateCacheRuntime(), cache = await openTemplateCache(cacheKey);
        await settleTemplateCacheWrites(cache);
        const entries = await listTemplateCacheEntries(cache), matches = entries.filter(// Select matching items
        (entry)=>entry.source === source || entry.request === source), results = await Promise.all(matches.map(// Transform the current item
        (entry)=>cache.delete(entry.request)));
        if (!matches.length) results.push(await cache.delete(source));
        invalidateTemplateCacheIndex(cache);
        return results.some(Boolean);
    }
    static async getTemplateCacheInfo(source = null, settings = AlpineComponentLoader.globalConfig) {
        // Inspect persistent template cache metadata without exposing response bodies
        if (typeof window === 'undefined' || !('caches' in window)) return source ? null : {
            size: 0,
            entries: []
        };
        const { listTemplateCacheEntries, openTemplateCache } = await loadTemplateCacheRuntime(), cache = await openTemplateCache(settings._templateCacheKey), entries = await listTemplateCacheEntries(cache), filtered = source == null ? entries : entries.filter(// Select matching items
        (entry)=>entry.source === source);
        return source == null ? {
            size: entries.length,
            entries
        } : filtered[0] || null;
    }
    static async pruneTemplateCache({ max = AlpineComponentLoader.globalConfig.templateCacheMax } = {}) {
        // Enforce the configured persistent template cache capacity
        if (typeof window === 'undefined' || !('caches' in window)) return [];
        const { openTemplateCache, pruneTemplateCacheEntries } = await loadTemplateCacheRuntime(), settings = AlpineComponentLoader.globalConfig, cache = await openTemplateCache(settings._templateCacheKey), evicted = await pruneTemplateCacheEntries(cache, {
            max
        });
        evicted.forEach(// Process the current item
        (entry)=>AlpineComponentLoader._dispatchRuntimeEvent('cacheevict', {
                phase: 'template',
                source: entry.source,
                cacheKey: settings._templateCacheKey,
                reason: entry.reason
            }));
        return evicted;
    }
    static clearDataCache(finalUrlOrKey = null) {
        // Evict shared lookup ownership while allowing active subscribers to finish safely
        const dataFetchCache = AlpineComponentLoader._dataRuntime?.dataFetchCache;
        if (!dataFetchCache) return finalUrlOrKey == null;
        // Mark or abort one detached cache entry according to subscriber ownership
        const evict = (entry)=>{
            if (!entry) return;
            // Keep evicted in-flight entries available only to consumers that already subscribed
            if ((entry.subscribers || 0) === 0) {
                entry.invalidated = true;
            }
            if (entry.invalidated && entry.settled === false) entry.controller?.abort('Cache cleared');
        };
        if (!finalUrlOrKey) {
            dataFetchCache.forEach(evict);
            AlpineComponentLoader._detachedDataEntries.forEach(evict);
            dataFetchCache.clear();
            AlpineComponentLoader._detachedDataEntries.clear();
            return true;
        }
        const exactEntry = dataFetchCache.get(finalUrlOrKey);
        evict(exactEntry);
        let cleared = dataFetchCache.delete(finalUrlOrKey);
        dataFetchCache.forEach((entry, key)=>{
            // Process the current item
            if (entry.finalUrl === finalUrlOrKey) {
                evict(entry);
                dataFetchCache.delete(key);
                cleared = true;
            }
        });
        AlpineComponentLoader._detachedDataEntries.forEach((entry)=>{
            // Process the current item
            if (entry.cacheKey === finalUrlOrKey || entry.finalUrl === finalUrlOrKey) {
                evict(entry);
                cleared = true;
            }
        });
        return cleared;
    }
    static getDataCacheSize() {
        // Count settled and active data cache entries
        return AlpineComponentLoader._dataRuntime?.dataFetchCache?.size || 0;
    }
    static getDataCacheInfo(finalUrlOrKey = null) {
        // Inspect redacted data cache metadata for one or every request
        const dataFetchCache = AlpineComponentLoader._dataRuntime?.dataFetchCache;
        if (!dataFetchCache) return finalUrlOrKey ? null : {
            size: 0,
            keys: []
        };
        if (!finalUrlOrKey) return {
            size: dataFetchCache.size,
            keys: Array.from(dataFetchCache.keys())
        };
        let entry = dataFetchCache.get(finalUrlOrKey), cacheKey = finalUrlOrKey;
        if (!entry) {
            // Process each entry
            for (const [key, value] of dataFetchCache.entries()){
                if (value.finalUrl === finalUrlOrKey) {
                    entry = value;
                    cacheKey = key;
                    break;
                }
            }
        }
        if (!entry) return null;
        return {
            key: cacheKey,
            finalUrl: entry.finalUrl,
            target: entry.target,
            strategy: entry.strategy,
            expiresAt: entry.expiresAt,
            lastAccess: entry.lastAccess,
            pending: entry.settled === false,
            subscribers: entry.subscribers || 0
        };
    }
    static _pruneDataFetchCache(settings = null) {
        // Delegate pruning only after the optional data runtime has loaded
        return AlpineComponentLoader._dataRuntime?.pruneDataFetchCache?.(settings) || [];
    }
    static config(options) {
        // Merge global options and synchronize dependent runtime controllers
        if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('[ACL] config() expects an options object.');
        const current = AlpineComponentLoader.globalConfig, next = {
            ...options
        };
        [
            'data',
            'hooks',
            'attributes',
            'errorCss',
            'events',
            'security',
            'observability',
            'adaptivePrefetch'
        ].forEach((key)=>{
            // Process the current item
            if (hasOwn(options, key)) next[key] = options[key] === false ? false : {
                ...current[key] || {},
                ...options[key] || {}
            };
        });
        if (next.templateCacheStrategy != null && !VALID_CACHE_STRATEGIES.has(next.templateCacheStrategy)) throw new TypeError(`[ACL] Unsupported template cache strategy "${next.templateCacheStrategy}".`);
        if (next.loading != null && !VALID_LOADING_MODES.has(next.loading)) throw new TypeError(`[ACL] Unsupported loading mode "${next.loading}".`);
        if (next.hydrate != null && !VALID_HYDRATION_MODES.has(next.hydrate)) throw new TypeError(`[ACL] Unsupported hydration mode "${next.hydrate}".`);
        if ((next.hydrate ?? current.hydrate) === 'media' && !String(next.hydrateMedia ?? current.hydrateMedia ?? '').trim()) throw new TypeError('[ACL] hydrateMedia is required when hydrate is "media".');
        validateDataOptionSettings({
            ...current,
            ...next,
            data: resolveDataOptionSettings(next, current)
        });
        [
            'persistDebounce',
            'runtimeCacheMax',
            'transitionDuration',
            'templateCacheTtl',
            'templateCacheMax'
        ].forEach((key)=>{
            // Process the current item
            if (hasOwn(next, key) && (!Number.isFinite(Number(next[key])) || Number(next[key]) < 0)) throw new TypeError(`[ACL] ${key} must be a non-negative finite number.`);
        });
        if (hasOwn(next, 'keepAliveMax') && next.keepAliveMax !== Infinity && (!Number.isFinite(Number(next.keepAliveMax)) || Number(next.keepAliveMax) < 0)) throw new TypeError('[ACL] keepAliveMax must be a non-negative number or Infinity.');
        Object.assign(current, next);
        if (hasOwn(options, 'observability')) {
            if (current.observability) void AlpineComponentLoader._loadObservability().catch(// Report asynchronous configuration activation failures
            (error)=>AlpineComponentLoader._report('warn', '[ACL] Failed to activate configured observability.', error, {
                    phase: 'runtime-import'
                }));
            else AlpineComponentLoader._observability.configure?.(false);
        }
        if (hasOwn(options, 'cacheNamespace') || hasOwn(options, '_templateCacheVersion') || !current._templateCacheKey && !current._templateCachePrefix) {
            const names = getTemplateCacheNames(current.cacheNamespace, current._templateCacheVersion || ACL_VERSION);
            current.cacheNamespace = names.namespace;
            if (!hasOwn(options, '_templateCachePrefix')) current._templateCachePrefix = names.prefix;
            if (!hasOwn(options, '_templateCacheKey')) current._templateCacheKey = names.key;
        }
    }
    static has(tagName) {
        // Check whether a component definition is registered
        return AlpineComponentLoader._registry.has(String(tagName || '').toLowerCase());
    }
    static getDefinition(tagName) {
        // Return an isolated clone of a registered definition
        tagName = String(tagName || '').toLowerCase();
        const definition = AlpineComponentLoader._registry.get(tagName);
        if (!definition) return null;
        return {
            tagName,
            source: definition.source,
            settings: cloneDefinitionValue(definition.settings),
            dependencies: [
                ...AlpineComponentLoader._manifestDependencies.get(tagName) || []
            ]
        };
    }
    static getRegisteredTags() {
        // List every registered component tag in stable order
        return Array.from(AlpineComponentLoader._registry.keys());
    }
    static getDependencies(tagName, { transitive = false } = {}) {
        // Resolve direct or transitive dependencies for one component
        const root = String(tagName || '').toLowerCase(), direct = AlpineComponentLoader._manifestDependencies.get(root) || [];
        if (!transitive) return [
            ...direct
        ];
        const selected = new Set(), visit = (tag)=>{
            // Visit
            for (const dependency of AlpineComponentLoader._manifestDependencies.get(tag) || []){
                if (!selected.has(dependency)) {
                    visit(dependency);
                    selected.add(dependency);
                }
            }
        };
        visit(root);
        return [
            ...selected
        ];
    }
    static async registerSkeletonManifest(manifest) {
        // Register generated skeleton definitions from a manifest
        const { normalizeSkeletonManifest } = await loadRuntimeModule('./registry.js'), normalizedManifest = normalizeSkeletonManifest(manifest), registered = [];
        normalizedManifest.skeletons.forEach(({ tagName, html })=>{
            // Process the current item
            validateCustomElementName(tagName);
            AlpineComponentLoader._skeletonRegistry.set(tagName, html);
            const definition = AlpineComponentLoader._registry.get(tagName);
            if (definition && !definition.hasAuthoredLoadingUI) definition.settings.loadingHtml = html;
            registered.push(tagName);
        });
        return registered;
    }
    static async registerComponent(name = AlpineComponentLoader.globalConfig.defaultComponentName) {
        // Define the default declarative component custom element
        const { createDeclarativeLoader } = await loadRuntimeModule('../elements/declarative.js');
        name = validateCustomElementName(name);
        const existing = customElements.get(name);
        if (existing && AlpineComponentLoader._isolated && existing.__aclLoaderInstance !== AlpineComponentLoader._instanceId) throw new ACLLoadError(`<${name}> is owned by another custom-element registry user.`, {
            code: 'ACL_TAG_OWNERSHIP_CONFLICT',
            phase: 'registry'
        });
        if (!existing) {
            const elementClass = createDeclarativeLoader(AlpineComponentLoader);
            Object.defineProperty(elementClass, '__aclLoaderInstance', {
                value: AlpineComponentLoader._instanceId
            });
            customElements.define(name, elementClass);
        }
        return customElements.get(name);
    }
    static async registerDynamicLoader(name = AlpineComponentLoader.globalConfig.defaultDynamicName) {
        // Define the dynamic component loader custom element
        const { createDynamicLoader } = await loadRuntimeModule('../elements/dynamic.js');
        name = validateCustomElementName(name);
        const existing = customElements.get(name);
        if (existing && AlpineComponentLoader._isolated && existing.__aclLoaderInstance !== AlpineComponentLoader._instanceId) throw new ACLLoadError(`<${name}> is owned by another custom-element registry user.`, {
            code: 'ACL_TAG_OWNERSHIP_CONFLICT',
            phase: 'registry'
        });
        if (!existing) {
            const elementClass = createDynamicLoader(AlpineComponentLoader);
            Object.defineProperty(elementClass, '__aclLoaderInstance', {
                value: AlpineComponentLoader._instanceId
            });
            customElements.define(name, elementClass);
        }
        return customElements.get(name);
    }
    // Run this operation
    static async registerErrorBoundary(name = AlpineComponentLoader.globalConfig.defaultBoundaryName) {
        const { createErrorBoundary } = await loadRuntimeModule('../elements/boundary.js');
        name = validateCustomElementName(name);
        const existing = customElements.get(name);
        if (existing && AlpineComponentLoader._isolated && existing.__aclLoaderInstance !== AlpineComponentLoader._instanceId) throw new ACLLoadError(`<${name}> is owned by another custom-element registry user.`, {
            code: 'ACL_TAG_OWNERSHIP_CONFLICT',
            phase: 'registry'
        });
        if (!existing) {
            const elementClass = createErrorBoundary();
            Object.defineProperty(elementClass, '__aclLoaderInstance', {
                value: AlpineComponentLoader._instanceId
            });
            customElements.define(name, elementClass);
        }
        return customElements.get(name);
    }
    static _registerDefinition(tagName) {
        // Define the custom element for one registered component
        const definition = AlpineComponentLoader._registry.get(tagName);
        if (!definition?.elementClass) return null;
        const existingElement = customElements.get(tagName);
        if (existingElement) {
            if (AlpineComponentLoader._isolated && existingElement.__aclLoaderInstance !== AlpineComponentLoader._instanceId) throw new ACLLoadError(`<${tagName}> is owned by another AlpineComponentLoader instance.`, {
                code: 'ACL_TAG_OWNERSHIP_CONFLICT',
                phase: 'registry'
            });
            if (existingElement !== definition.elementClass) AlpineComponentLoader._report('warn', `[ACL] <${tagName}> was defined outside AlpineComponentLoader before startup.`, null, {
                tagName,
                phase: 'registry'
            });
            return existingElement;
        }
        Object.defineProperty(definition.elementClass, '__aclLoaderInstance', {
            value: AlpineComponentLoader._instanceId
        });
        customElements.define(tagName, definition.elementClass);
        return definition.elementClass;
    }
    static _registerDefinitions() {
        // Install every pending registered component definition
        AlpineComponentLoader._registry.forEach((_definition, tagName)=>{
            // Process the current item
            AlpineComponentLoader._registerDefinition(tagName);
        });
    }
    static async registerTemplates(root = document) {
        // Register inline component definitions found below a DOM root
        const templates = collectInlineComponentTemplates(root), constructors = await Promise.all(templates.map(async (tpl)=>{
            // Process the current item
            const tagName = getInlineComponentName(tpl);
            if (!tagName) return null;
            // Parse template-level prop definitions into component attributes
            const config = readDeclarativeOptionSettings(tpl, AlpineComponentLoader.globalConfig);
            // Guard the register templates operation against runtime failures
            try {
                config.attributes = parsePropDefinitions(tpl.getAttribute('acl-props') || '{}');
            } catch (e) {
                AlpineComponentLoader._report('warn', `[ACL] Invalid JSON in acl-props for <${tagName}>`, e, {
                    tagName,
                    phase: 'props'
                });
                config.attributes = {};
            }
            // Bind the template content to the declared custom element
            return await AlpineComponentLoader.define(tagName, tpl, config);
        }));
        return constructors.filter(Boolean);
    }
    static observeTemplates(options = {}) {
        // Watch dynamic DOM additions for inline component definitions
        if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') throw new ACLLoadError('Template observation requires MutationObserver.', {
            code: 'ACL_ENVIRONMENT_UNAVAILABLE',
            phase: 'environment'
        });
        const root = options.root ?? document.documentElement, subtree = options.subtree ?? true;
        AlpineComponentLoader.stopObservingTemplates();
        // Scan only added element subtrees so observation cost scales with actual insertions
        const observer = new MutationObserver(// Process observed DOM mutations
        (mutations)=>mutations.forEach((mutation)=>{
                // Process the current item
                mutation.addedNodes.forEach((node)=>{
                    // Process the current item
                    if (node.nodeType === Node.ELEMENT_NODE) void AlpineComponentLoader.registerTemplates(node).catch((error)=>AlpineComponentLoader._report('warn', '[ACL] Failed to register an observed inline template.', error, {
                            phase: 'template-observer'
                        }));
                });
            }));
        observer.observe(root, {
            childList: true,
            subtree
        });
        AlpineComponentLoader._templateObserver = observer;
        return ()=>{
            // Stop only the observer installed for this caller
            if (AlpineComponentLoader._templateObserver !== observer) return;
            observer.disconnect();
            AlpineComponentLoader._templateObserver = null;
        };
    }
    static stopObservingTemplates() {
        // Disconnect the inline-template mutation observer
        AlpineComponentLoader._templateObserver?.disconnect();
        AlpineComponentLoader._templateObserver = null;
    }
    static async observePrefetch(options = {}) {
        // Serialize controller replacement so concurrent activations cannot leak observers
        const generation = ++AlpineComponentLoader._prefetchGeneration, previous = AlpineComponentLoader._prefetchStarting, starting = (async ()=>{
            if (previous) {
                // Allow the prior activation to settle before replacing its controller
                try {
                    await previous;
                } catch  {
                // A later activation may retry a failed optional-module import
                }
            }
            const { createAdaptivePrefetchController } = await loadRuntimeModule('./adaptive-prefetch.js'), controller = createAdaptivePrefetchController(AlpineComponentLoader, options);
            if (generation !== AlpineComponentLoader._prefetchGeneration) {
                controller.disconnect();
                return controller;
            }
            AlpineComponentLoader._prefetchController?.disconnect();
            AlpineComponentLoader._prefetchController = controller;
            return controller;
        })();
        AlpineComponentLoader._prefetchController?.disconnect();
        AlpineComponentLoader._prefetchController = null;
        AlpineComponentLoader._prefetchStarting = starting;
        // Clear only the matching activation transaction after it settles
        try {
            return await starting;
        } finally{
            if (AlpineComponentLoader._prefetchStarting === starting) AlpineComponentLoader._prefetchStarting = null;
        }
    }
    static stopObservingPrefetch() {
        // Stop adaptive prefetch observation and pending speculative work
        AlpineComponentLoader._prefetchGeneration += 1;
        AlpineComponentLoader._prefetchController?.disconnect();
        AlpineComponentLoader._prefetchController = null;
    }
    static toggleDebug() {
        // Toggle default console diagnostics at runtime
        AlpineComponentLoader._report('warn', '[ACL] Debugger not loaded. Import "alpine-component-loader/debugger" to enable.', null, {
            phase: 'debugger'
        });
    }
    static async prefetch(tagName) {
        // Fetch and cache one registered component template
        const config = AlpineComponentLoader._registry.get(tagName);
        if (!config) {
            AlpineComponentLoader._report('warn', `[ACL] Cannot prefetch <${tagName}>: component not defined.`, null, {
                tagName,
                phase: 'prefetch'
            });
            return;
        }
        return await AlpineComponentLoader.loadTemplate(config.source, config.settings);
    }
    static async prefetchAll(tagNames = null, { concurrency = 4 } = {}) {
        // Prefetch a component set with bounded concurrency
        const { settleNamedTasks } = await loadRuntimeModule('./registry.js'), tags = tagNames ? Array.from(tagNames) : AlpineComponentLoader.getRegisteredTags();
        return await settleNamedTasks(tags, // Settle the named task
        (tagName)=>AlpineComponentLoader.prefetch(tagName), concurrency);
    }
    static async prefetchGraph(tagNames, { concurrency = 4, includeRoots = true } = {}) {
        // Prefetch component roots and their manifest dependency graph
        const roots = Array.from(tagNames || [], // Transform the current item
        (tag)=>String(tag).toLowerCase()), selected = new Set(), visit = (tag)=>{
            // Visit
            for (const dependency of AlpineComponentLoader._manifestDependencies.get(tag) || [])visit(dependency);
            if ((includeRoots || !roots.includes(tag)) && AlpineComponentLoader._registry.has(tag)) selected.add(tag);
        };
        roots.forEach(visit);
        return await AlpineComponentLoader.prefetchAll(selected, {
            concurrency
        });
    }
    static async registerManifest(manifest, options = {}) {
        // Normalize and register a version-one component manifest
        const { normalizeManifest, resolveManifestPrefetchTags } = await loadRuntimeModule('./registry.js'), normalizedManifest = normalizeManifest(manifest), basePath = options.basePath ?? normalizedManifest.basePath ?? AlpineComponentLoader.globalConfig.basePath, registered = [];
        Object.entries(normalizedManifest.groups || {}).forEach(([name, tags])=>{
            // Process the current item
            AlpineComponentLoader._manifestGroups.set(String(name).toLowerCase(), Array.from(tags || [], // Transform the current item
            (tag)=>String(tag).toLowerCase()));
        });
        await Promise.all(normalizedManifest.components.map(async (definition)=>{
            // Process the current item
            AlpineComponentLoader._manifestDependencies.set(definition.tagName, [
                ...definition.dependencies
            ]);
            await AlpineComponentLoader.define(definition.tagName, definition.source, {
                ...definition.options,
                basePath: definition.options?.basePath ?? basePath
            });
            registered.push(definition.tagName);
        }));
        const prefetchTags = resolveManifestPrefetchTags(normalizedManifest, registered, options.prefetch);
        return {
            registered,
            prefetched: prefetchTags.length ? await AlpineComponentLoader.prefetchGraph(prefetchTags, {
                concurrency: options.concurrency
            }) : {}
        };
    }
    // Run this operation
    static async registerManifestFrom(source, options = {}) {
        const { registerManifestFrom } = await loadRuntimeModule('./manifest-loader.js');
        return await registerManifestFrom(AlpineComponentLoader, source, options);
    }
    // Run this operation
    static async registerRouteManifest(routeKey, indexOrUrl, options = {}) {
        const { registerRouteManifest } = await loadRuntimeModule('./manifest-loader.js');
        return await registerRouteManifest(AlpineComponentLoader, routeKey, indexOrUrl, options);
    }
    static getTemplateLoadInfo(source, settings = AlpineComponentLoader.globalConfig) {
        // Inspect in-flight and cached template loading state
        return templateLoadMetaCache?.get(getTemplateLoadKey(source, settings)) || null;
    }
    static async loadTemplate(source, settings = AlpineComponentLoader.globalConfig) {
        // Resolve fetch sanitize and cache one component template
        const effectiveSettings = settings === AlpineComponentLoader.globalConfig ? AlpineComponentLoader.globalConfig : {
            ...AlpineComponentLoader.globalConfig,
            ...settings || {}
        };
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
        const loadKey = getTemplateLoadKey(source, effectiveSettings);
        if (templateLoadCache.has(loadKey)) return await templateLoadCache.get(loadKey);
        // Deduplicate the complete cache strategy transaction under one in-flight promise
        const loadTask = (async ()=>{
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
                    const text = await match.text();
                    void touchTemplateCacheEntry(_cache, cacheRequestKey, text, match, {
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
                } catch  {
                    return null;
                }
            };
            // Fetch a fresh template, record metadata, and best-effort persist it to Cache API
            const fetchAndStore = async ()=>{
                const res = await fetch(source, {
                    cache: 'no-store'
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const text = await res.clone().text();
                if (_cache) {
                    // Guard the load template operation against runtime failures
                    try {
                        const stored = createTemplateCacheResponse(text, res, {
                            source,
                            revision: effectiveSettings.templateRevision,
                            ttl: cacheTtl
                        }), storedSuccessfully = await writeTemplateCacheEntry(_cache, cacheRequestKey, stored, {
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
                setBoundedMapEntry(templateLoadMetaCache, loadKey, {
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
                    fetchAndStore().catch(()=>{
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
                    const cached = await readCache(true);
                    if (cached !== null) return cached;
                    throw e;
                }
            }
            return await fetchAndStore();
        })();
        templateLoadCache.set(loadKey, loadTask);
        // Guard the load template operation against runtime failures
        try {
            return await loadTask;
        } finally{
            templateLoadCache.delete(loadKey);
        }
    }
    // Run this operation
    static async define(tagName, source, config) {
        AlpineComponentLoader._assertActive();
        // Register a component definition and install it after startup
        tagName = validateCustomElementName(tagName);
        const inlineDefinition = source && typeof source === 'object' && !Array.isArray(source) && !(source instanceof HTMLTemplateElement);
        let inlineTemplateHtml = null;
        if (inlineDefinition) {
            if (arguments.length > 2) throw new TypeError(`[ACL] Inline definition options for <${tagName}> must be supplied with template.`);
            const { template, ...inlineConfig } = source;
            if (typeof template !== 'string' || !template.trim()) throw new TypeError(`[ACL] Inline definition for <${tagName}> requires a non-empty template string.`);
            inlineTemplateHtml = template;
            source = template;
            config = inlineConfig;
        }
        if (config === undefined) config = {};
        if (!(typeof source === 'string' && source.trim()) && !(source instanceof HTMLTemplateElement)) throw new TypeError(`[ACL] <${tagName}> requires a non-empty source URL, selector, or template.`);
        if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError(`[ACL] Configuration for <${tagName}> must be an object.`);
        const globalConfig = AlpineComponentLoader.globalConfig, dataSettings = resolveDataOptionSettings(config, globalConfig), generatedSkeletonHtml = AlpineComponentLoader._skeletonRegistry.get(tagName) || null, hasAuthoredLoadingUI = config.loadingHtml != null || config.loadingTemplate != null || globalConfig.loadingHtml != null || globalConfig.loadingTemplate != null;
        // Merge defaults, global config, and definition config with explicit precedence
        const settings = createEffectiveSettings({
            globalConfig,
            config,
            dataSettings,
            generatedSkeletonHtml,
            hasAuthoredLoadingUI
        });
        if (settings.form === true) settings.form = {
            // Configure this value
            value: 'value',
            state: null,
            disabled: 'disabled'
        };
        else if (settings.form) {
            if (typeof settings.form !== 'object' || Array.isArray(settings.form)) throw new TypeError(`[ACL] form must be false, true, or an options object for <${tagName}>.`);
            settings.form = {
                value: 'value',
                state: null,
                disabled: 'disabled',
                ...settings.form
            };
            // Process forof
            for (const key of [
                'value',
                'state',
                'disabled'
            ]){
                if (settings.form[key] != null && !/^[A-Za-z_$][\w$]*$/.test(settings.form[key])) throw new TypeError(`[ACL] form.${key} must be a prop name for <${tagName}>.`);
            }
        }
        if (!VALID_LOADING_MODES.has(settings.loading)) throw new TypeError(`[ACL] Unsupported loading mode "${settings.loading}" for <${tagName}>.`);
        if (!VALID_CACHE_STRATEGIES.has(settings.templateCacheStrategy)) throw new TypeError(`[ACL] Unsupported template cache strategy "${settings.templateCacheStrategy}" for <${tagName}>.`);
        if (!VALID_HYDRATION_MODES.has(settings.hydrate)) throw new TypeError(`[ACL] Unsupported hydration mode "${settings.hydrate}" for <${tagName}>.`);
        if (settings.hydrate === 'media' && !String(settings.hydrateMedia || '').trim()) throw new TypeError(`[ACL] hydrateMedia is required for media hydration on <${tagName}>.`);
        validateDataOptionSettings(settings, ` for <${tagName}>`);
        settings.attributes = parsePropDefinitions(settings.attributes);
        [
            'persistDebounce',
            'runtimeCacheMax',
            'transitionDuration',
            'templateCacheTtl',
            'templateCacheMax'
        ].forEach((key)=>{
            // Process the current item
            if (!Number.isFinite(Number(settings[key])) || Number(settings[key]) < 0) throw new TypeError(`[ACL] ${key} must be a non-negative finite number for <${tagName}>.`);
        });
        if (inlineTemplateHtml !== null) {
            const { htmlToFragment } = await loadRuntimeModule('./rendering.js'), inlineTemplate = document.createElement('template');
            inlineTemplate.content.appendChild(htmlToFragment(inlineTemplateHtml, settings));
            source = inlineTemplate;
        }
        const internalObservedAttrs = settings.form ? new Set([
            ...INTERNAL_COMPONENT_ATTRIBUTES,
            'name',
            'disabled',
            'required'
        ]) : INTERNAL_COMPONENT_ATTRIBUTES;
        // Track observed attributes internally
        const observedAttrs = [
            ...new Set([
                ...Object.keys(settings.attributes),
                ...internalObservedAttrs
            ])
        ];
        // Bind source resolution to this immutable component definition context
        const sourceResolutionContext = Object.freeze({
            tagName,
            config,
            globalConfig,
            loader: AlpineComponentLoader._publicFacade || AlpineComponentLoader
        }), resolveSource = (candidate)=>resolveComponentSource(candidate, settings, sourceResolutionContext);
        let contentSource = inlineTemplateHtml === null ? resolveSource(source) : source;
        const existingElement = customElements.get(tagName);
        if (existingElement) {
            if (AlpineComponentLoader._isolated && existingElement.__aclLoaderInstance !== AlpineComponentLoader._instanceId) throw new ACLLoadError(`<${tagName}> is owned by another AlpineComponentLoader instance.`, {
                code: 'ACL_TAG_OWNERSHIP_CONFLICT',
                phase: 'registry'
            });
            if (!AlpineComponentLoader._registry.has(tagName)) AlpineComponentLoader._report('warn', `[ACL] <${tagName}> is already defined outside AlpineComponentLoader.`, null, {
                tagName,
                phase: 'registry'
            });
            return existingElement;
        }
        // Reuse a definition already queued before startup
        const queuedDefinition = AlpineComponentLoader._registry.get(tagName);
        if (queuedDefinition) return queuedDefinition.elementClass;
        if (settings.externalCss.length || settings.externalScripts.length) {
            const { normalizeAssetList } = await loadRuntimeModule('./assets.js');
            settings.externalCss = normalizeAssetList(settings.externalCss, 'style');
            settings.externalScripts = normalizeAssetList(settings.externalScripts, 'script');
            const pendingDefinition = AlpineComponentLoader._registry.get(tagName);
            if (pendingDefinition) return pendingDefinition.elementClass;
        }
        // Return helpers to be assigned to $el.$props
        const helpers = (_this)=>({
                // Emit a composed bubbling event from the component host
                // Run the $emit operation
                $emit: (name, detail)=>_this.dispatchEvent(new CustomEvent(name, {
                        bubbles: true,
                        composed: true,
                        detail
                    })),
                // Run the complete cache-clearing component reload pipeline
                // Run the $reload operation
                $reload: (options)=>_this.reload(options),
                // Retry only the component's current data request
                // Run the $retry operation
                $retry: ()=>_this.retry(),
                // Abort only the component's current data request
                // Run the $cancel operation
                $cancel: (reason)=>_this.cancel(reason),
                $cache: {
                    // Remove this component's resolved template cache entry
                    // Clear template
                    clearTemplate: ()=>_this._clearTemplateCache(),
                    // Remove this component's request-aware data cache entry
                    // Clear data
                    clearData: ()=>_this._clearDataCache(),
                    // Clear both cache layers and report whether every operation succeeded
                    clear: async ()=>{
                        // Clear
                        const results = await Promise.all([
                            _this._clearTemplateCache(),
                            _this._clearDataCache()
                        ]);
                        return results.every(Boolean);
                    }
                }
            });
        // Create the concrete custom element class through the deferred isolated factory
        const { createComponentElementClass, withComponentLifecycle, withComponentLoading, withComponentDataGate, withComponentRendering, withComponentState } = await loadComponentRuntime(), formController = settings.form ? (await loadRuntimeModule('./component/form-controller.js')).withComponentForm : null, concurrentDefinition = AlpineComponentLoader._registry.get(tagName);
        if (concurrentDefinition) return concurrentDefinition.elementClass;
        const AlpineExternalComponent = createComponentElementClass({
            base: HTMLElement,
            context: {
                AlpineComponentLoader,
                settings,
                tagName,
                contentSource,
                resolveSource,
                helpers,
                observedAttrs,
                internalObservedAttrs
            },
            controllers: [
                withComponentLifecycle,
                withComponentLoading,
                withComponentDataGate,
                withComponentRendering,
                withComponentState,
                formController
            ].filter(Boolean)
        });
        // Store the definition until startup owns browser registration
        AlpineComponentLoader._registry.set(tagName, {
            source: contentSource,
            settings,
            hasAuthoredLoadingUI,
            elementClass: AlpineExternalComponent
        });
        // Keep definitions created after startup immediately available
        if (AlpineComponentLoader._started) AlpineComponentLoader._registerDefinition(tagName);
        return AlpineExternalComponent;
    }
    // Run this operation
    static _assertActive() {
        if (AlpineComponentLoader._disposed) throw new ACLLoadError('This AlpineComponentLoader instance has been disposed.', {
            code: 'ACL_LOADER_DISPOSED',
            phase: 'lifecycle'
        });
    }
    // Run this operation
    static async dispose({ clearPersistentCaches = true } = {}) {
        if (AlpineComponentLoader._disposed) return;
        AlpineComponentLoader._disposed = true;
        AlpineComponentLoader.stopObservingTemplates();
        AlpineComponentLoader.stopObservingPrefetch();
        await Promise.allSettled(// Run this operation
        [
            ...AlpineComponentLoader._components
        ].map(async (component)=>{
            component.remove();
            if (typeof component._performDestroy === 'function') await component._performDestroy();
        }));
        AlpineComponentLoader._components.clear();
        AlpineComponentLoader.clearDataCache();
        AlpineComponentLoader._registry.clear();
        AlpineComponentLoader._manifestDependencies.clear();
        AlpineComponentLoader._manifestGroups.clear();
        AlpineComponentLoader._skeletonRegistry.clear();
        AlpineComponentLoader._detachedDataEntries.clear();
        AlpineComponentLoader._indexedDBPersistenceAdapter?.close?.();
        AlpineComponentLoader._indexedDBPersistenceAdapter = null;
        AlpineComponentLoader.clearMetrics();
        if (clearPersistentCaches && typeof window !== 'undefined') await AlpineComponentLoader.clearTemplateCaches(AlpineComponentLoader.globalConfig._templateCachePrefix);
        const cachesRuntime = await loadRuntimeModule('./caches.js');
        [
            cachesRuntime.styleSheetCache,
            cachesRuntime.scriptLoadCache,
            cachesRuntime.styleLoadPromiseCache,
            cachesRuntime.templateLoadCache,
            cachesRuntime.templateLoadMetaCache
        ].forEach((cache)=>cache.clear());
    }
}
