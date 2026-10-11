// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

const createDefaults = ()=>({
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
        data: {
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
            cacheStrategy: 'cache-first'
        }
    });
const checkOptionNumber = (value, name, rule)=>{
    if (value == null) return;
    const number = Number(value), valid = number === Infinity && (rule === 1 || rule === 4) || (rule === 2 || rule === 4 ? Number.isInteger(number) && number >= 1 : Number.isFinite(number) && number >= 0 && (rule !== 3 || number <= 1));
    if (!valid) throw new TypeError('[ACL] ' + name + ' must be ' + [
        'a non-negative finite number',
        'a non-negative number or Infinity',
        'a positive integer',
        'between 0 and 1',
        'a positive integer or Infinity'
    ][rule || 0]);
};
const checkOptionValue = (value, name, allowed)=>{
    if (value != null && !allowed.includes(value)) throw new TypeError('[ACL] Unsupported ' + name + ' value "' + value + '"');
};
const validateOptions = (settings)=>{
    const data = settings.data;
    checkOptionNumber(data?.poll, 'data.poll');
    checkOptionNumber(data?.timeout, 'data.timeout');
    checkOptionNumber(data?.cacheTtl, 'data.cacheTtl');
    checkOptionNumber(data?.cacheMax, 'data.cacheMax');
    checkOptionValue(data?.responseType, 'data.responseType', [
        'json',
        'text',
        'blob',
        'arrayBuffer',
        'stream',
        'auto'
    ]);
    checkOptionNumber(data?.retries, 'data.retries');
    checkOptionNumber(data?.retryDelay, 'data.retryDelay');
    checkOptionNumber(data?.retryMaxDelay, 'data.retryMaxDelay');
    checkOptionNumber(data?.retryJitter, 'data.retryJitter', 3);
    checkOptionValue(data?.cacheStrategy, 'data.cacheStrategy', [
        'cache-first',
        'network-first',
        'stale-while-revalidate',
        'no-store'
    ]);
    checkOptionNumber(settings.persistVersion, 'persistVersion', 2);
    checkOptionNumber(settings.persistDebounce, 'persistDebounce');
    checkOptionNumber(settings.runtimeCacheMax, 'runtimeCacheMax');
    checkOptionNumber(settings.transitionDuration, 'transitionDuration');
    checkOptionNumber(settings.templateCacheTtl, 'templateCacheTtl');
    checkOptionNumber(settings.templateCacheMax, 'templateCacheMax');
    checkOptionNumber(settings.templateTimeout, 'templateTimeout');
    checkOptionNumber(settings.keepAliveMax, 'keepAliveMax', 1);
    checkOptionNumber(settings.templateMaxBytes, 'templateMaxBytes', 4);
    checkOptionNumber(settings.prefetchConcurrency, 'prefetchConcurrency', 2);
    checkOptionValue(settings.loading, 'loading', [
        'eager',
        'lazy',
        'idle'
    ]);
    checkOptionValue(settings.hydrate, 'hydrate', [
        'eager',
        'visible',
        'idle',
        'interaction',
        'media'
    ]);
    checkOptionValue(settings.templateCacheStrategy, 'templateCacheStrategy', [
        'cache-first',
        'network-first',
        'stale-while-revalidate',
        'no-store'
    ]);
    if (settings.hydrate === 'media' && !(typeof settings.hydrateMedia === 'string' && settings.hydrateMedia.trim())) throw new TypeError('[ACL] hydrateMedia is required when hydrate is media');
    const scheduler = settings.hydrationScheduler;
    if (scheduler !== undefined && scheduler !== false) {
        if (!scheduler || typeof scheduler !== 'object' || Array.isArray(scheduler)) throw new TypeError('[ACL] hydrationScheduler must be false or an options object');
        const { budgetMs = 8, maxTasksPerTurn = 4 } = scheduler;
        if (!Number.isFinite(budgetMs) || budgetMs <= 0 || !Number.isInteger(maxTasksPerTurn) || maxTasksPerTurn < 1) throw new TypeError('[ACL] Invalid hydrationScheduler budget');
    }
};
const containsInlineComponentTemplate = (root)=>Boolean(root?.matches?.('template[acl-component],template[x-acl]') || root?.querySelector?.('template[acl-component],template[x-acl]'));
const currentModuleUrl = new URL(import.meta.url), moduleSuffix = currentModuleUrl.pathname.endsWith('.min.js') ? '.min.js' : '.js', resolveLocalModule = (specifier)=>{
    const resolved = new URL(specifier.replace(/\.js$/, moduleSuffix), currentModuleUrl);
    return resolved.href;
}, importLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), importDeferredLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), [{ ACLLoadError }, { getContext, createContext, runWhenWebComponentsReady }] = await Promise.all([
    importLocalModule('./acl-load-error.js'),
    importLocalModule('./runtime/context.js')
]);
const ACL_FACADE_VERSION = typeof "1.2.0" === 'undefined' ? 'development' : "1.2.0", defaultContext = getContext(currentModuleUrl.searchParams.get('acl-instance') || 'default');
const createFacade = (context)=>{
    const pendingDefinitions = new Set(), pendingDefinitionsByTag = new Map(), pendingDefinitionFailuresByTag = new Map(), pendingConfiguration = [], pendingBuiltIns = new Map(), facadeManifestDependencies = new Map(), facadeManifestGroups = new Map(), facadeDetachedDataEntries = new Set(), normalizeCacheNamespace = (value)=>String(value || 'default').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || 'default';
    let implementationPromise = null, implementationClass = null, discoveryObserver = null, facadeTemplateObserver = null, facadeStartingPromise = null, facadeReportOverride = null, facadeStarted = false, facadeDisposed = false;
    const hasOwn = (value, key)=>Object.prototype.hasOwnProperty.call(value || {}, key), defaultConfig = {
        ...createDefaults(),
        _templateCacheVersion: ACL_FACADE_VERSION,
        _templateCachePrefix: 'alpine-component-loader-default-',
        _templateCacheKey: `alpine-component-loader-default-${ACL_FACADE_VERSION}`,
        _templateCacheExpire: 15 * 60 * 1000
    };
    const mergeConfiguration = (current, options)=>{
        if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('[ACL] config() expects an options object.');
        const next = {
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
            'adaptivePrefetch',
            'hydrationScheduler'
        ].forEach((key)=>{
            if (hasOwn(options, key)) next[key] = options[key] === false ? false : {
                ...current[key] || {},
                ...options[key] || {}
            };
        });
        Object.assign(current, next);
    };
    const snapshotConfiguration = (options)=>{
        const snapshot = {
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
            'adaptivePrefetch',
            'hydrationScheduler'
        ].forEach((key)=>{
            if (options[key] && typeof options[key] === 'object') snapshot[key] = {
                ...options[key]
            };
        });
        return snapshot;
    };
    const syncImplementationState = async (Implementation)=>{
        const namespace = normalizeCacheNamespace(AlpineComponentLoader.globalConfig.cacheNamespace), prefix = `alpine-component-loader-${namespace}-`;
        AlpineComponentLoader.globalConfig.cacheNamespace = namespace;
        AlpineComponentLoader.globalConfig._templateCacheVersion ||= ACL_FACADE_VERSION;
        AlpineComponentLoader.globalConfig._templateCachePrefix ||= prefix;
        AlpineComponentLoader.globalConfig._templateCacheKey ||= `${prefix}${AlpineComponentLoader.globalConfig._templateCacheVersion}`;
        Implementation.globalConfig = AlpineComponentLoader.globalConfig;
        Implementation._publicFacade = AlpineComponentLoader;
        Implementation._manifestDependencies = facadeManifestDependencies;
        Implementation._manifestGroups = facadeManifestGroups;
        Implementation._detachedDataEntries = facadeDetachedDataEntries;
        if (facadeStarted) Implementation._started = true;
        if (AlpineComponentLoader.toggleDebug !== defaultToggleDebug) Implementation.toggleDebug = AlpineComponentLoader.toggleDebug;
        if (facadeReportOverride) Implementation._report = facadeReportOverride;
        pendingConfiguration.splice(0).forEach((options)=>{
            Implementation.config(options);
        });
        if (AlpineComponentLoader.globalConfig.observability) await Implementation._loadObservability();
    };
    const loadImplementation = ()=>{
        if (implementationPromise) return implementationPromise;
        const loading = runWhenWebComponentsReady(()=>{
            AlpineComponentLoader._assertActive();
            return importDeferredLocalModule('./runtime/loader.js');
        }).then(async ({ createRuntime })=>{
            AlpineComponentLoader._assertActive();
            const Implementation = createRuntime(context);
            implementationClass = Implementation;
            await syncImplementationState(Implementation);
            AlpineComponentLoader._assertActive();
            return Implementation;
        }).catch((error)=>{
            if (error?.code === 'ACL_LOADER_DISPOSED') throw error;
            if (implementationPromise === loading) {
                implementationPromise = null;
                implementationClass = null;
            }
            throw new ACLLoadError('Unable to load the AlpineComponentLoader runtime.', {
                code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
                phase: 'runtime-import',
                cause: error,
                retryable: true
            });
        });
        implementationPromise = loading;
        return loading;
    };
    const defaultToggleDebug = ()=>{
        console.warn('[ACL] Debugger not loaded. Import "alpine-component-loader/debugger" to enable.');
    };
    const drainPendingDefinitions = async ()=>{
        while(pendingDefinitions.size)await Promise.allSettled([
            ...pendingDefinitions
        ]);
        if (pendingDefinitionFailuresByTag.size) {
            const [error] = pendingDefinitionFailuresByTag.values();
            pendingDefinitionFailuresByTag.clear();
            throw error;
        }
    };
    class AlpineComponentLoader {
        static root = null;
        static get ready() {
            return Promise.resolve(AlpineComponentLoader);
        }
        static globalConfig = {
            ...defaultConfig,
            data: {
                ...defaultConfig.data
            }
        };
        static get version() {
            return implementationClass?.version || ACL_FACADE_VERSION;
        }
        static config(options) {
            AlpineComponentLoader._assertActive();
            if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('[ACL] config() expects an options object.');
            const snapshot = snapshotConfiguration(options);
            if (implementationClass) {
                implementationClass.config(snapshot);
                implementationClass.globalConfig = AlpineComponentLoader.globalConfig;
            } else {
                const staged = {
                    ...AlpineComponentLoader.globalConfig,
                    data: {
                        ...AlpineComponentLoader.globalConfig.data || {}
                    }
                };
                mergeConfiguration(staged, snapshot);
                validateOptions(staged);
                Object.assign(AlpineComponentLoader.globalConfig, staged);
                pendingConfiguration.push(snapshot);
            }
        }
        static async start() {
            return AlpineComponentLoader._start(true);
        }
        static async _start(discover) {
            AlpineComponentLoader._assertActive();
            if (defaultContext.polyfillStartup || globalThis.WebComponents?.ready === false) {
                await runWhenWebComponentsReady(()=>AlpineComponentLoader._assertActive());
            }
            if (typeof window === 'undefined' || typeof document === 'undefined' || typeof customElements === 'undefined' || typeof HTMLElement === 'undefined') throw new ACLLoadError('AlpineComponentLoader.start() requires browser DOM APIs.', {
                code: 'ACL_ENVIRONMENT_UNAVAILABLE',
                phase: 'environment'
            });
            if (facadeStarted && (!discover || context.discoveryStarted)) return;
            if (facadeStartingPromise) return facadeStartingPromise;
            facadeStartingPromise = (async ()=>{
                await drainPendingDefinitions();
                implementationClass?._registerDefinitions();
                const builtInRegistrations = discover ? context.discover?.(AlpineComponentLoader) || [] : [];
                if (discover) context.discoveryStarted = true;
                await Promise.all(builtInRegistrations);
                await drainPendingDefinitions();
                const root = AlpineComponentLoader.root || document, hasTemplates = discover && containsInlineComponentTemplate(root);
                if (implementationClass || hasTemplates) {
                    const Implementation = await loadImplementation();
                    if (hasTemplates) await Implementation.registerTemplates(root);
                    await drainPendingDefinitions();
                    Implementation._registerDefinitions();
                    Implementation._started = true;
                    try {
                        await Implementation.pruneCaches();
                    } catch (error) {
                        Implementation._report('warn', '[ACL] Failed to prune template caches.', error, {
                            phase: 'cache'
                        });
                    }
                    await drainPendingDefinitions();
                    Implementation._registerDefinitions();
                    if (Implementation.globalConfig.adaptivePrefetch) await Implementation.observePrefetch(Implementation.globalConfig.adaptivePrefetch === true ? {} : Implementation.globalConfig.adaptivePrefetch);
                }
                facadeStarted = true;
            })();
            try {
                return await facadeStartingPromise;
            } finally{
                facadeStartingPromise = null;
            }
        }
        static define(tagName, source, config) {
            AlpineComponentLoader._assertActive();
            const hasSeparateConfig = arguments.length > 2, definitionKey = String(tagName || '').trim().toLowerCase();
            if (pendingDefinitionsByTag.has(definitionKey)) return pendingDefinitionsByTag.get(definitionKey);
            pendingDefinitionFailuresByTag.delete(definitionKey);
            const operation = loadImplementation().then((Implementation)=>{
                return hasSeparateConfig ? Implementation.define(tagName, source, config) : Implementation.define(tagName, source);
            });
            pendingDefinitions.add(operation);
            pendingDefinitionsByTag.set(definitionKey, operation);
            void operation.then(()=>{
                pendingDefinitions.delete(operation);
                if (pendingDefinitionsByTag.get(definitionKey) === operation) pendingDefinitionsByTag.delete(definitionKey);
            }, (error)=>{
                pendingDefinitions.delete(operation);
                if (pendingDefinitionsByTag.get(definitionKey) === operation) pendingDefinitionsByTag.delete(definitionKey);
                if (!facadeDisposed) pendingDefinitionFailuresByTag.set(definitionKey, error);
            });
            return operation;
        }
        static async registerTemplates(root = document) {
            AlpineComponentLoader._assertActive();
            const Implementation = await loadImplementation(), constructors = await Implementation.registerTemplates(root);
            await Promise.all([
                ...pendingDefinitions
            ]);
            return constructors.filter(Boolean);
        }
        static observeTemplates(options = {}) {
            if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') throw new ACLLoadError('Template observation requires MutationObserver.', {
                code: 'ACL_ENVIRONMENT_UNAVAILABLE',
                phase: 'environment'
            });
            AlpineComponentLoader._assertActive();
            const root = options.root ?? AlpineComponentLoader.root ?? document.documentElement, subtree = options.subtree ?? true;
            AlpineComponentLoader.stopObservingTemplates();
            facadeTemplateObserver = new MutationObserver((records)=>{
                records.forEach((record)=>{
                    record.addedNodes.forEach((node)=>{
                        if (node.nodeType === Node.ELEMENT_NODE && containsInlineComponentTemplate(node)) void AlpineComponentLoader.registerTemplates(node).catch((error)=>AlpineComponentLoader._report('warn', '[ACL] Failed to register an observed inline template.', error, {
                                phase: 'template-observer'
                            }));
                    });
                });
            });
            facadeTemplateObserver.observe(root, {
                childList: true,
                subtree
            });
            const installedObserver = facadeTemplateObserver;
            return ()=>{
                if (facadeTemplateObserver !== installedObserver) return;
                installedObserver.disconnect();
                facadeTemplateObserver = null;
            };
        }
        static stopObservingTemplates() {
            facadeTemplateObserver?.disconnect();
            facadeTemplateObserver = null;
            implementationClass?.stopObservingTemplates();
        }
        static stopObservingPrefetch() {
            implementationClass?.stopObservingPrefetch();
        }
        static has(tagName) {
            return implementationClass?.has(tagName) || false;
        }
        static getDefinition(tagName) {
            return implementationClass?.getDefinition(tagName) || null;
        }
        static getRegisteredTags() {
            return implementationClass?.getRegisteredTags() || [];
        }
        static getDependencies(tagName, options) {
            return implementationClass?.getDependencies(tagName, options) || [];
        }
        static subscribe(listener) {
            AlpineComponentLoader._assertActive();
            if (implementationClass) return implementationClass.subscribe(listener);
            let active = true, release = ()=>{
                active = false;
            };
            void loadImplementation().then((Implementation)=>{
                if (active) release = Implementation.subscribe(listener);
            }, (error)=>AlpineComponentLoader._report('warn', "[ACL] Failed to activate observability for a subscription.", error, {
                    phase: 'runtime-import'
                }));
            return ()=>release();
        }
        static getMetrics() {
            return implementationClass?.getMetrics() || {
                startedAt: Date.now(),
                totals: {},
                durations: {},
                recent: []
            };
        }
        static clearMetrics() {
            AlpineComponentLoader._assertActive();
            implementationClass?.clearMetrics();
        }
        static get _manifestDependencies() {
            return facadeManifestDependencies;
        }
        static get _manifestGroups() {
            return facadeManifestGroups;
        }
        static get _detachedDataEntries() {
            return facadeDetachedDataEntries;
        }
        static get _report() {
            if (facadeReportOverride) return facadeReportOverride;
            if (implementationClass) return implementationClass._report.bind(implementationClass);
            return (level, message, error = null)=>{
                console?.[level]?.(message, ...error == null ? [] : [
                    error
                ]);
            };
        }
        static set _report(reporter) {
            if (typeof reporter !== 'function') throw new TypeError('[ACL] _report must be a function.');
            facadeReportOverride = reporter;
            if (implementationClass) implementationClass._report = reporter;
        }
        static _dispatchRuntimeEvent(name, detail = {}) {
            return implementationClass?._dispatchRuntimeEvent(name, detail);
        }
        static clearDataCache(finalUrlOrKey = null) {
            AlpineComponentLoader._assertActive();
            return implementationClass?.clearDataCache(finalUrlOrKey) ?? true;
        }
        static getDataCacheSize() {
            return implementationClass?.getDataCacheSize() || 0;
        }
        static getDataCacheInfo(finalUrlOrKey = null) {
            return implementationClass?.getDataCacheInfo(finalUrlOrKey) || (finalUrlOrKey ? null : {
                size: 0,
                keys: []
            });
        }
        static getTemplateLoadInfo(source, settings) {
            return implementationClass?.getTemplateLoadInfo(source, settings) || null;
        }
        static _assertActive() {
            if (facadeDisposed) throw new ACLLoadError('This AlpineComponentLoader instance has been disposed.', {
                code: 'ACL_LOADER_DISPOSED',
                phase: 'lifecycle'
            });
        }
        static async dispose({ clearPersistentCaches = true } = {}) {
            if (facadeDisposed) return;
            facadeDisposed = true;
            context.disposed = true;
            context.discoveryObserver?.disconnect();
            context.discoveryObserver = null;
            facadeTemplateObserver?.disconnect();
            facadeTemplateObserver = null;
            pendingDefinitions.clear();
            pendingDefinitionsByTag.clear();
            pendingDefinitionFailuresByTag.clear();
            pendingBuiltIns.clear();
            facadeManifestDependencies.clear();
            facadeManifestGroups.clear();
            facadeDetachedDataEntries.clear();
            if (implementationClass) await implementationClass.dispose({
                clearPersistentCaches
            });
        }
        static toggleDebug = defaultToggleDebug;
    }
    for (const name of [
        'registerComponent',
        'registerDynamicLoader',
        'registerErrorBoundary',
        'observePrefetch',
        'registerSkeletonManifest',
        'registerManifest',
        'registerManifestFrom',
        'registerRouteManifest',
        'prefetch',
        'prefetchAll',
        'prefetchGraph',
        'loadTemplate',
        'pruneCaches',
        'clearTemplateCaches',
        'clearTemplate',
        'getTemplateCacheInfo',
        'pruneTemplateCache'
    ]){
        Object.defineProperty(AlpineComponentLoader, name, {
            configurable: true,
            value: async (...args)=>{
                if (name !== 'getTemplateCacheInfo') AlpineComponentLoader._assertActive();
                return (await loadImplementation())[name](...args);
            }
        });
    }
    if (context.id !== 'default') {
        for (const name of [
            'start',
            'define',
            'registerComponent',
            'registerDynamicLoader',
            'registerErrorBoundary',
            'registerTemplates',
            'observePrefetch',
            'registerSkeletonManifest',
            'registerManifest',
            'registerManifestFrom',
            'registerRouteManifest',
            'prefetch',
            'prefetchAll',
            'prefetchGraph',
            'loadTemplate',
            'pruneCaches',
            'clearTemplateCaches',
            'clearTemplate',
            'getTemplateCacheInfo',
            'pruneTemplateCache'
        ]){
            const operation = AlpineComponentLoader[name];
            Object.defineProperty(AlpineComponentLoader, name, {
                value: (...args)=>{
                    AlpineComponentLoader._assertActive();
                    return operation(...args);
                }
            });
        }
    }
    return AlpineComponentLoader;
};
const Loader = defaultContext.facade ||= createFacade(defaultContext);
class CoreLoader extends Loader {
    static start() {
        return Loader._start(false);
    }
}
export default CoreLoader;
export { ACLLoadError };
