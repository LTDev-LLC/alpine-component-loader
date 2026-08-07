// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const currentModuleUrl = new URL(import.meta.url), moduleSuffix = currentModuleUrl.pathname.endsWith('.min.js') ? '.min.js' : '.js', resolveLocalModule = (specifier)=>{
    const resolved = new URL(specifier.replace(/\.js$/, moduleSuffix), currentModuleUrl);
    if (currentModuleUrl.searchParams.has('acl-instance')) resolved.searchParams.set('acl-instance', currentModuleUrl.searchParams.get('acl-instance'));
    return resolved.href;
}, importLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), importDeferredLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), { ACLLoadError } = await importLocalModule('./acl-load-error.js'), ACL_FACADE_VERSION = typeof "1.0.2" === 'undefined' ? 'development' : "1.0.2", pendingDefinitions = new Set(), pendingDefinitionsByTag = new Map(), pendingDefinitionFailuresByTag = new Map(), pendingConfiguration = [], pendingBuiltIns = new Map(), facadeManifestDependencies = new Map(), facadeManifestGroups = new Map(), facadeDetachedDataEntries = new Set(), normalizeCacheNamespace = (value)=>String(value || 'default').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || 'default';
let implementationPromise = null, implementationClass = null, discoveryObserver = null, facadeTemplateObserver = null, facadeStartingPromise = null, facadeReportOverride = null, facadeStarted = false, facadeDisposed = false;
// Check whether an object owns a configuration key
const hasOwn = (value, key)=>Object.prototype.hasOwnProperty.call(value || {}, key), defaultDataOptions = {
    src: null,
    keys: null,
    params: null,
    options: null,
    method: null,
    body: null,
    target: '$data',
    poll: null,
    timeout: 30000,
    retries: 0,
    retryDelay: 250,
    cacheStrategy: 'cache-first',
    cacheTtl: 5 * 60 * 1000,
    cacheMax: 100,
    cacheKey: null,
    responseType: 'json',
    parser: null,
    retryMaxDelay: 30000,
    retryJitter: 0.2,
    retryUnsafeMethods: false,
    pauseWhenHidden: true,
    pauseWhenOffline: true,
    pauseWhenOffscreen: false
}, defaultConfig = {
    debug: false,
    autoStart: true,
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
    data: {
        ...defaultDataOptions
    },
    persistVersion: 1,
    cacheTemplates: true,
    templateCacheStrategy: 'cache-first',
    templateCacheTtl: 15 * 60 * 1000,
    templateCacheMax: 100,
    templateRevision: null,
    cacheNamespace: 'default',
    _templateCacheVersion: ACL_FACADE_VERSION,
    _templateCachePrefix: `alpine-component-loader-default-`,
    _templateCacheKey: `alpine-component-loader-default-${ACL_FACADE_VERSION}`,
    _templateCacheExpire: 15 * 60 * 1000
};
// Merge facade configuration while preserving nested defaults
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
        'adaptivePrefetch'
    ].forEach((key)=>{
        // Merge each explicitly supplied nested configuration group
        if (hasOwn(options, key)) next[key] = options[key] === false ? false : {
            ...current[key] || {},
            ...options[key] || {}
        };
    });
    Object.assign(current, next);
};
// Validate facade-owned configuration before committing or importing the runtime
const validateFacadeConfiguration = (settings)=>{
    const validCacheStrategies = new Set([
        'cache-first',
        'network-first',
        'stale-while-revalidate',
        'no-store'
    ]), validLoadingModes = new Set([
        'eager',
        'lazy',
        'idle'
    ]), validHydrationModes = new Set([
        'eager',
        'visible',
        'idle',
        'interaction',
        'media'
    ]), validResponseTypes = new Set([
        'json',
        'text',
        'blob',
        'arrayBuffer',
        'stream',
        'auto'
    ]), data = settings.data && typeof settings.data === 'object' ? settings.data : {};
    if (settings.templateCacheStrategy != null && !validCacheStrategies.has(settings.templateCacheStrategy)) throw new TypeError(`[ACL] Unsupported template cache strategy "${settings.templateCacheStrategy}".`);
    if (settings.loading != null && !validLoadingModes.has(settings.loading)) throw new TypeError(`[ACL] Unsupported loading mode "${settings.loading}".`);
    if (settings.hydrate != null && !validHydrationModes.has(settings.hydrate)) throw new TypeError(`[ACL] Unsupported hydration mode "${settings.hydrate}".`);
    if (settings.hydrate === 'media' && !(typeof settings.hydrateMedia === 'string' && settings.hydrateMedia.trim())) throw new TypeError('[ACL] hydrateMedia is required when hydrate is "media".');
    [
        'persistDebounce',
        'runtimeCacheMax',
        'transitionDuration',
        'templateCacheTtl',
        'templateCacheMax'
    ].forEach((key)=>{
        // Validate every non-negative top-level numeric setting
        if (settings[key] != null && (!Number.isFinite(Number(settings[key])) || Number(settings[key]) < 0)) throw new TypeError(`[ACL] ${key} must be a non-negative finite number.`);
    });
    if (settings.keepAliveMax !== Infinity && settings.keepAliveMax != null && (!Number.isFinite(Number(settings.keepAliveMax)) || Number(settings.keepAliveMax) < 0)) throw new TypeError('[ACL] keepAliveMax must be a non-negative number or Infinity.');
    [
        'poll',
        'timeout',
        'cacheTtl',
        'cacheMax',
        'retries',
        'retryDelay',
        'retryMaxDelay'
    ].forEach((key)=>{
        // Validate every non-negative grouped data setting
        if (data[key] != null && (!Number.isFinite(Number(data[key])) || Number(data[key]) < 0)) throw new TypeError(`[ACL] data.${key} must be a non-negative finite number.`);
    });
    if (data.retryJitter != null && (!Number.isFinite(Number(data.retryJitter)) || Number(data.retryJitter) < 0 || Number(data.retryJitter) > 1)) throw new TypeError('[ACL] data.retryJitter must be between 0 and 1.');
    if (data.responseType != null && !validResponseTypes.has(data.responseType)) throw new TypeError(`[ACL] Unsupported data.responseType value "${data.responseType}".`);
    if (data.cacheStrategy != null && !validCacheStrategies.has(data.cacheStrategy)) throw new TypeError(`[ACL] Unsupported data.cacheStrategy value "${data.cacheStrategy}".`);
    if (settings.persistVersion != null && (!Number.isInteger(Number(settings.persistVersion)) || Number(settings.persistVersion) < 1)) throw new TypeError('[ACL] persistVersion must be a positive integer.');
};
// Snapshot mutable configuration groups before queueing them for runtime replay
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
        'adaptivePrefetch'
    ].forEach((key)=>{
        // Clone only object-valued groups while retaining callback identities
        if (options[key] && typeof options[key] === 'object') snapshot[key] = {
            ...options[key]
        };
    });
    return snapshot;
};
// Replay facade state after the deferred runtime becomes available
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
        // Apply configuration calls queued before runtime activation
        Implementation.config(options);
    });
    if (AlpineComponentLoader.globalConfig.observability) await Implementation._loadObservability();
};
// Load and initialize the full runtime on first demand
const loadImplementation = ()=>{
    if (implementationPromise) return implementationPromise;
    const loading = importDeferredLocalModule('./runtime/loader.js').then(async ({ default: Implementation })=>{
        // Synchronize facade state before exposing the runtime
        implementationClass = Implementation;
        await syncImplementationState(Implementation);
        return Implementation;
    }).catch((error)=>{
        // Permit a later activation attempt after an import failure
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
// Warn when debugger support has not been imported
const defaultToggleDebug = ()=>{
    console.warn('[ACL] Debugger not loaded. Import "alpine-component-loader/debugger" to enable.');
};
// Resolve the configured custom element name for a built in
const builtInSelector = (name)=>name === 'declarative' ? AlpineComponentLoader.globalConfig.defaultComponentName || 'acl-component' : name === 'dynamic' ? AlpineComponentLoader.globalConfig.defaultDynamicName || 'acl-dynamic' : AlpineComponentLoader.globalConfig.defaultBoundaryName || 'acl-boundary';
// Register one built in custom element only when discovered
const registerBuiltIn = async (name, elementName = builtInSelector(name))=>{
    const key = `${name}:${elementName}`;
    if (pendingBuiltIns.has(key)) return pendingBuiltIns.get(key);
    const registration = loadImplementation().then(async (Implementation)=>{
        // Select the matching runtime registration path
        if (name === 'declarative') await Implementation.registerComponent(elementName);
        else if (name === 'dynamic') await Implementation.registerDynamicLoader(elementName);
        else await Implementation.registerErrorBoundary(elementName);
    }).finally(()=>{
        // Release the shared registration promise after settlement
        if (pendingBuiltIns.get(key) === registration) pendingBuiltIns.delete(key);
    });
    pendingBuiltIns.set(key, registration);
    return registration;
};
// Find built in elements below a newly visible DOM root
const scanBuiltIns = (root)=>{
    if (!root?.querySelector) return [];
    const declarativeName = builtInSelector('declarative'), dynamicName = builtInSelector('dynamic'), boundaryName = builtInSelector('boundary'), registrations = [];
    if (root.matches?.(declarativeName) || root.querySelector(declarativeName)) registrations.push(registerBuiltIn('declarative', declarativeName));
    if (root.matches?.(dynamicName) || root.querySelector(dynamicName)) registrations.push(registerBuiltIn('dynamic', dynamicName));
    if (root.matches?.(boundaryName) || root.querySelector(boundaryName)) registrations.push(registerBuiltIn('boundary', boundaryName));
    return registrations;
};
// Observe the document for built ins that require runtime activation
const installBuiltInDiscovery = ()=>{
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return [];
    const root = AlpineComponentLoader.root || document, initialRegistrations = scanBuiltIns(root);
    if (discoveryObserver) return initialRegistrations;
    discoveryObserver = new MutationObserver((records)=>{
        // Inspect each mutation for newly added built in elements
        records.forEach((record)=>{
            // Scan each added element as an independent DOM root
            record.addedNodes.forEach((node)=>{
                // Ignore non-element nodes that cannot contain built ins
                if (node.nodeType === 1) scanBuiltIns(node).forEach(// Report background discovery failures without creating unhandled rejections
                (registration)=>void registration.catch((error)=>AlpineComponentLoader._report('warn', '[ACL] Failed to register a discovered built-in element.', error, {
                            phase: 'runtime-import'
                        })));
            });
        });
    });
    discoveryObserver.observe(root === document ? document.documentElement : root, {
        childList: true,
        subtree: true
    });
    return initialRegistrations;
};
// Drain every definition added before or during the current startup pass
const drainPendingDefinitions = async ()=>{
    // Repeat until definitions stop arriving during the current pass
    while(pendingDefinitions.size)await Promise.allSettled([
        ...pendingDefinitions
    ]);
    if (pendingDefinitionFailuresByTag.size) {
        const [error] = pendingDefinitionFailuresByTag.values();
        pendingDefinitionFailuresByTag.clear();
        throw error;
    }
};
export { ACLLoadError };
export default class AlpineComponentLoader {
    static root = null;
    static globalConfig = {
        ...defaultConfig,
        data: {
            ...defaultDataOptions
        }
    };
    // Report the active runtime or facade build version
    static get version() {
        return implementationClass?.version || ACL_FACADE_VERSION;
    }
    // Update configuration without forcing runtime activation
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
            validateFacadeConfiguration(staged);
            Object.assign(AlpineComponentLoader.globalConfig, staged);
            pendingConfiguration.push(snapshot);
        }
    }
    // Start registrations that are required by the current document
    static async start() {
        AlpineComponentLoader._assertActive();
        if (typeof window === 'undefined' || typeof document === 'undefined' || typeof customElements === 'undefined' || typeof HTMLElement === 'undefined') throw new ACLLoadError('AlpineComponentLoader.start() requires browser DOM APIs.', {
            code: 'ACL_ENVIRONMENT_UNAVAILABLE',
            phase: 'environment'
        });
        if (facadeStarted) return;
        if (facadeStartingPromise) return facadeStartingPromise;
        facadeStartingPromise = (async ()=>{
            // Complete every activation step inside one shared transaction
            await drainPendingDefinitions();
            implementationClass?._registerDefinitions();
            const builtInRegistrations = installBuiltInDiscovery();
            await Promise.all(builtInRegistrations);
            await drainPendingDefinitions();
            const root = AlpineComponentLoader.root || document, hasTemplates = Boolean(root.querySelector?.('template[acl-component]'));
            if (implementationClass || hasTemplates) {
                const Implementation = await loadImplementation();
                if (hasTemplates) await Implementation.registerTemplates(root);
                await drainPendingDefinitions();
                Implementation._registerDefinitions();
                Implementation._started = true;
                // Keep cache cleanup failures from blocking runtime startup
                try {
                    // Prune stale version buckets without activating persistent template-cache modules
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
        // Share startup failures while clearing the transaction for a retry
        try {
            return await facadeStartingPromise;
        } finally{
            facadeStartingPromise = null;
        }
    }
    // Queue a component definition while activating the runtime
    static define(tagName, source, config = {}) {
        AlpineComponentLoader._assertActive();
        const definitionKey = String(tagName || '').trim().toLowerCase();
        if (pendingDefinitionsByTag.has(definitionKey)) return pendingDefinitionsByTag.get(definitionKey);
        pendingDefinitionFailuresByTag.delete(definitionKey);
        const operation = loadImplementation().then((Implementation)=>{
            // Forward the definition after runtime activation
            return Implementation.define(tagName, source, config);
        });
        pendingDefinitions.add(operation);
        pendingDefinitionsByTag.set(definitionKey, operation);
        void operation.then(// Remove a successfully registered pending definition
        ()=>{
            pendingDefinitions.delete(operation);
            if (pendingDefinitionsByTag.get(definitionKey) === operation) pendingDefinitionsByTag.delete(definitionKey);
        }, // Preserve a failed queued definition for the next startup transaction
        (error)=>{
            pendingDefinitions.delete(operation);
            if (pendingDefinitionsByTag.get(definitionKey) === operation) pendingDefinitionsByTag.delete(definitionKey);
            pendingDefinitionFailuresByTag.set(definitionKey, error);
        });
        return operation;
    }
    // Register the declarative loader element on demand
    static async registerComponent(name = AlpineComponentLoader.globalConfig.defaultComponentName) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return await Implementation.registerComponent(name);
    }
    // Register the dynamic loader element on demand
    static async registerDynamicLoader(name = AlpineComponentLoader.globalConfig.defaultDynamicName) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return await Implementation.registerDynamicLoader(name);
    }
    // Run this operation
    static async registerErrorBoundary(name = AlpineComponentLoader.globalConfig.defaultBoundaryName) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return await Implementation.registerErrorBoundary(name);
    }
    // Register definitions declared by templates under a DOM root
    static async registerTemplates(root = document) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation(), constructors = await Implementation.registerTemplates(root);
        await Promise.all([
            ...pendingDefinitions
        ]);
        return constructors.filter(Boolean);
    }
    // Begin deferred template observation and return an immediate disposer
    static observeTemplates(options = {}) {
        if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') throw new ACLLoadError('Template observation requires MutationObserver.', {
            code: 'ACL_ENVIRONMENT_UNAVAILABLE',
            phase: 'environment'
        });
        AlpineComponentLoader._assertActive();
        const root = options.root ?? AlpineComponentLoader.root ?? document.documentElement, subtree = options.subtree ?? true;
        AlpineComponentLoader.stopObservingTemplates();
        facadeTemplateObserver = new MutationObserver((records)=>{
            // Inspect added subtrees without loading the runtime for unrelated mutations
            records.forEach((record)=>{
                // Process each added element independently
                record.addedNodes.forEach((node)=>{
                    // Register only subtrees that contain an inline ACL template
                    if (node.nodeType === Node.ELEMENT_NODE && (node.matches?.('template[acl-component]') || node.querySelector?.('template[acl-component]'))) void AlpineComponentLoader.registerTemplates(node).catch(// Report observed registration failures without rejecting the mutation callback
                    (error)=>AlpineComponentLoader._report('warn', '[ACL] Failed to register an observed inline template.', error, {
                            phase: 'template-observer'
                        }));
                });
            });
        });
        facadeTemplateObserver.observe(root, {
            childList: true,
            subtree
        });
        return ()=>{
            // Stop the installed facade observer
            AlpineComponentLoader.stopObservingTemplates();
        };
    }
    // Stop runtime template observation when it has been activated
    static stopObservingTemplates() {
        facadeTemplateObserver?.disconnect();
        facadeTemplateObserver = null;
        implementationClass?.stopObservingTemplates();
    }
    // Begin adaptive prefetch observation on demand
    static async observePrefetch(options = {}) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return Implementation.observePrefetch(options);
    }
    // Stop adaptive prefetch observation when available
    static stopObservingPrefetch() {
        implementationClass?.stopObservingPrefetch();
    }
    // Check registrations without activating the runtime
    static has(tagName) {
        return implementationClass?.has(tagName) || false;
    }
    // Read a registered definition without activating the runtime
    static getDefinition(tagName) {
        return implementationClass?.getDefinition(tagName) || null;
    }
    // List registered tags without activating the runtime
    static getRegisteredTags() {
        return implementationClass?.getRegisteredTags() || [];
    }
    // Read dependencies known to the active runtime
    static getDependencies(tagName, options) {
        return implementationClass?.getDependencies(tagName, options) || [];
    }
    // Subscribe to observability after deferred runtime activation
    static subscribe(listener) {
        AlpineComponentLoader._assertActive();
        if (implementationClass) return implementationClass.subscribe(listener);
        let active = true, release = ()=>{
            // Remember disposal before runtime activation finishes
            active = false;
        };
        void loadImplementation().then((Implementation)=>{
            // Attach the listener only while its facade subscription is active
            if (active) release = Implementation.subscribe(listener);
        }, // Report detached subscription activation failures without an unhandled rejection
        (error)=>AlpineComponentLoader._report('warn', '[ACL] Failed to activate observability for a subscription.', error, {
                phase: 'runtime-import'
            }));
        // Delegate disposal to whichever subscription is active
        return ()=>release();
    }
    // Return empty metrics until runtime observability is active
    static getMetrics() {
        return implementationClass?.getMetrics() || {
            startedAt: Date.now(),
            totals: {},
            durations: {},
            recent: []
        };
    }
    // Clear metrics only when the runtime is active
    static clearMetrics() {
        AlpineComponentLoader._assertActive();
        implementationClass?.clearMetrics();
    }
    // Expose manifest dependency storage to legacy diagnostics without activating modules
    static get _manifestDependencies() {
        return facadeManifestDependencies;
    }
    // Expose manifest group storage to adaptive-prefetch diagnostics
    static get _manifestGroups() {
        return facadeManifestGroups;
    }
    // Share detached data-entry ownership with the deferred implementation
    static get _detachedDataEntries() {
        return facadeDetachedDataEntries;
    }
    // Return the current reporting hook or a disabled-runtime console fallback
    static get _report() {
        if (facadeReportOverride) return facadeReportOverride;
        if (implementationClass) return implementationClass._report.bind(implementationClass);
        return (level, message, error = null)=>{
            // Keep pre-activation diagnostics visible without forcing a runtime import
            console?.[level]?.(message, ...error == null ? [] : [
                error
            ]);
        };
    }
    // Forward a diagnostic hook override into the active or future implementation
    static set _report(reporter) {
        if (typeof reporter !== 'function') throw new TypeError('[ACL] _report must be a function.');
        facadeReportOverride = reporter;
        if (implementationClass) implementationClass._report = reporter;
    }
    // Forward internal runtime events when the runtime is active
    static _dispatchRuntimeEvent(name, detail = {}) {
        return implementationClass?._dispatchRuntimeEvent(name, detail);
    }
    // Clear data cache state without forcing runtime activation
    static clearDataCache(finalUrlOrKey = null) {
        AlpineComponentLoader._assertActive();
        return implementationClass?.clearDataCache(finalUrlOrKey) ?? true;
    }
    // Report zero data entries until the runtime is active
    static getDataCacheSize() {
        return implementationClass?.getDataCacheSize() || 0;
    }
    // Read data cache details without forcing runtime activation
    static getDataCacheInfo(finalUrlOrKey = null) {
        return implementationClass?.getDataCacheInfo(finalUrlOrKey) || (finalUrlOrKey ? null : {
            size: 0,
            keys: []
        });
    }
    // Read template load details from an active runtime
    static getTemplateLoadInfo(source, settings) {
        return implementationClass?.getTemplateLoadInfo(source, settings) || null;
    }
    // Register a skeleton manifest on demand
    static async registerSkeletonManifest(manifest) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return Implementation.registerSkeletonManifest(manifest);
    }
    // Register a component manifest on demand
    static async registerManifest(manifest, options = {}) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return Implementation.registerManifest(manifest, options);
    }
    // Run this operation
    static async registerManifestFrom(source, options = {}) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return Implementation.registerManifestFrom(source, options);
    }
    // Run this operation
    static async registerRouteManifest(routeKey, indexOrUrl, options = {}) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return Implementation.registerRouteManifest(routeKey, indexOrUrl, options);
    }
    // Prefetch one registered component on demand
    static async prefetch(tagName) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return Implementation.prefetch(tagName);
    }
    // Prefetch a selected or complete component set on demand
    static async prefetchAll(tagNames = null, options = {}) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return Implementation.prefetchAll(tagNames, options);
    }
    // Prefetch a dependency graph on demand
    static async prefetchGraph(tagNames, options = {}) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return Implementation.prefetchGraph(tagNames, options);
    }
    // Load a template through the deferred runtime
    static async loadTemplate(source, settings = AlpineComponentLoader.globalConfig) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return Implementation.loadTemplate(source, settings);
    }
    // Prune versioned browser caches through the deferred runtime
    static async pruneCaches(prefix, current) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return Implementation.pruneCaches(prefix, current);
    }
    // Clear template caches through the deferred runtime
    static async clearTemplateCaches(prefix) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return Implementation.clearTemplateCaches(prefix);
    }
    // Clear one cached template through the deferred runtime
    static async clearTemplate(source, cacheKey) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return Implementation.clearTemplate(source, cacheKey);
    }
    // Read template cache metadata through the deferred runtime
    static async getTemplateCacheInfo(source = null, settings = AlpineComponentLoader.globalConfig) {
        const Implementation = await loadImplementation();
        return Implementation.getTemplateCacheInfo(source, settings);
    }
    // Prune the template cache through the deferred runtime
    static async pruneTemplateCache(options = {}) {
        AlpineComponentLoader._assertActive();
        const Implementation = await loadImplementation();
        return Implementation.pruneTemplateCache(options);
    }
    // Run this operation
    static _assertActive() {
        if (facadeDisposed) throw new ACLLoadError('This AlpineComponentLoader instance has been disposed.', {
            code: 'ACL_LOADER_DISPOSED',
            phase: 'lifecycle'
        });
    }
    // Run this operation
    static async dispose({ clearPersistentCaches = true } = {}) {
        if (facadeDisposed) return;
        facadeDisposed = true;
        discoveryObserver?.disconnect();
        discoveryObserver = null;
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
let isolatedLoaderSequence = 0;
const isolatedAsyncMethodDescriptors = [
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
], stageSubscription = (subscriptions, listener)=>{
    // Retain one subscription until the isolated implementation activates
    const subscription = {
        listener,
        active: true,
        release: ()=>{
        // Keep early subscription disposal harmless before activation
        }
    };
    subscriptions.add(subscription);
    return ()=>{
        // Release either the staged or activated subscription
        subscription.active = false;
        subscription.release();
        subscriptions.delete(subscription);
    };
}, disposeStagedSubscriptions = (subscriptions)=>{
    // Release every subscription owned by the isolated facade
    subscriptions.forEach(// Release one staged subscription
    (subscription)=>subscription.release());
    subscriptions.clear();
}, installAsyncForwarders = (Facade, ready)=>{
    // Install consistent deferred forwarding without another browser module
    isolatedAsyncMethodDescriptors.forEach(// Install one asynchronous method descriptor
    (name)=>Object.defineProperty(Facade, name, {
            configurable: true,
            value: (...args)=>{
                // Assert facade lifecycle before crossing the ready boundary
                Facade._assertActive();
                return ready.then(// Forward arguments after isolated activation
                (Loader)=>Loader[name](...args));
            }
        }));
};
// Create a synchronously usable facade whose implementation modules are isolated by URL identity
export const createLoader = ({ root = null, config = {}, cacheNamespace = null } = {})=>{
    const instanceId = `instance-${Date.now().toString(36)}-${++isolatedLoaderSequence}`, url = new URL(import.meta.url);
    url.searchParams.set('acl-instance', instanceId);
    let activeLoader = null, instanceRoot = root, disposed = false, reportOverride = null, debugOverride = null;
    const stagedConfig = {
        ...defaultConfig,
        data: {
            ...defaultDataOptions
        }
    }, stagedSubscriptions = new Set(), // Run this operation
    ready = import(/* @vite-ignore */ url.href).then(async ({ default: Loader })=>{
        activeLoader = Loader;
        Loader.root = instanceRoot;
        Loader.config(stagedConfig);
        if (reportOverride) Loader._report = reportOverride;
        if (debugOverride) Loader.toggleDebug = debugOverride;
        IsolatedLoader.globalConfig = Loader.globalConfig;
        if (disposed) await Loader.dispose();
        // Run this operation
        for (const subscription of stagedSubscriptions){
            if (subscription.active) subscription.release = Loader.subscribe(subscription.listener);
        }
        return Loader;
    });
    mergeConfiguration(stagedConfig, {
        ...config,
        cacheNamespace: cacheNamespace ?? config.cacheNamespace ?? instanceId
    });
    validateFacadeConfiguration(stagedConfig);
    class IsolatedLoader {
        static get root() {
            return instanceRoot;
        }
        static set root(value) {
            instanceRoot = value;
            if (activeLoader) activeLoader.root = value;
        }
        static globalConfig = stagedConfig;
        static get version() {
            return activeLoader?.version || ACL_FACADE_VERSION;
        }
        static get ready() {
            return ready.then(()=>IsolatedLoader);
        }
        static _assertActive() {
            if (disposed) throw new ACLLoadError('This AlpineComponentLoader instance has been disposed.', {
                code: 'ACL_LOADER_DISPOSED',
                phase: 'lifecycle'
            });
        }
        static config(options) {
            IsolatedLoader._assertActive();
            if (activeLoader) return activeLoader.config(options);
            mergeConfiguration(stagedConfig, snapshotConfiguration(options));
            validateFacadeConfiguration(stagedConfig);
        }
        static subscribe(listener) {
            IsolatedLoader._assertActive();
            if (activeLoader) return activeLoader.subscribe(listener);
            return stageSubscription(stagedSubscriptions, listener);
        }
        static observeTemplates(options = {}) {
            IsolatedLoader._assertActive();
            // Run this operation
            let release = ()=>{};
            void ready.then((Loader)=>{
                if (!disposed) release = Loader.observeTemplates({
                    // Default template observation to this loader's discovery root
                    root: options.root || instanceRoot,
                    ...options
                });
            });
            return ()=>release();
        }
        static stopObservingTemplates() {
            activeLoader?.stopObservingTemplates();
        }
        static stopObservingPrefetch() {
            activeLoader?.stopObservingPrefetch();
        }
        static has(tagName) {
            return activeLoader?.has(tagName) || false;
        }
        static getDefinition(tagName) {
            return activeLoader?.getDefinition(tagName) || null;
        }
        static getRegisteredTags() {
            return activeLoader?.getRegisteredTags() || [];
        }
        static getDependencies(tagName, options) {
            return activeLoader?.getDependencies(tagName, options) || [];
        }
        static getMetrics() {
            return activeLoader?.getMetrics() || {
                startedAt: Date.now(),
                totals: {},
                durations: {},
                recent: []
            };
        }
        static clearMetrics() {
            IsolatedLoader._assertActive();
            activeLoader?.clearMetrics();
        }
        static clearDataCache(key = null) {
            IsolatedLoader._assertActive();
            return activeLoader?.clearDataCache(key) ?? true;
        }
        static getDataCacheSize() {
            return activeLoader?.getDataCacheSize() || 0;
        }
        static getDataCacheInfo(key = null) {
            return activeLoader?.getDataCacheInfo(key) || (key ? null : {
                // Return the empty cache summary before activation
                size: 0,
                keys: []
            });
        }
        static getTemplateLoadInfo(source, settings) {
            return activeLoader?.getTemplateLoadInfo(source, settings) || null;
        }
        static get _report() {
            return reportOverride || activeLoader?._report;
        }
        static set _report(reporter) {
            reportOverride = reporter;
            if (activeLoader) activeLoader._report = reporter;
        }
        static get toggleDebug() {
            return debugOverride || ((...args)=>ready.then((Loader)=>Loader.toggleDebug(...args)));
        }
        static set toggleDebug(callback) {
            debugOverride = callback;
            if (activeLoader) activeLoader.toggleDebug = callback;
        }
        static async dispose(options = {}) {
            if (disposed) return;
            disposed = true;
            disposeStagedSubscriptions(stagedSubscriptions);
            const Loader = await ready;
            await Loader.dispose({
                clearPersistentCaches: options.clearPersistentCaches ?? true
            });
        }
    }
    installAsyncForwarders(IsolatedLoader, ready);
    return IsolatedLoader;
};
// Create an IndexedDB adapter facade that opens storage on first use
export const createIndexedDBPersistenceAdapter = (...args)=>{
    let adapterPromise = null, closed = false;
    // Load the persistence implementation only for the first operation
    const getAdapter = ()=>{
        if (!adapterPromise) {
            const loading = importDeferredLocalModule('./runtime/persistence.js').then(// Construct the concrete adapter after its module arrives
            ({ createIndexedDBPersistenceAdapter: createAdapter })=>createAdapter(...args)).catch((error)=>{
                // Evict a failed adapter import so the next storage operation can retry
                if (adapterPromise === loading) adapterPromise = null;
                throw new ACLLoadError('Unable to load the IndexedDB persistence adapter.', {
                    code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
                    phase: 'runtime-import',
                    cause: error,
                    retryable: true
                });
            });
            adapterPromise = loading;
        }
        return adapterPromise;
    };
    return {
        // Read one persisted value through the deferred adapter
        async getItem (key) {
            return (await getAdapter()).getItem(key);
        },
        // Write one persisted value through the deferred adapter
        async setItem (key, value) {
            return (await getAdapter()).setItem(key, value);
        },
        // Remove one persisted value through the deferred adapter
        async removeItem (key) {
            return (await getAdapter()).removeItem(key);
        },
        // Close the adapter now or after its deferred construction
        close () {
            closed = true;
            void adapterPromise?.then((adapter)=>{
                // Close a concrete adapter that finished opening
                adapter.close?.();
            }, // The initiating storage operation owns any deferred import failure
            ()=>{});
        },
        // Expose facade closure state without opening storage
        get closed () {
            return closed;
        }
    };
};
