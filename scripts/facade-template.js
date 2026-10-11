// Check whether explicit inline discovery is needed
const containsInlineComponentTemplate = (root) =>
    Boolean(
        root?.matches?.('template[acl-component],template[x-acl]') ||
        root?.querySelector?.('template[acl-component],template[x-acl]'),
    );

const currentModuleUrl = new URL(import.meta.url),
    moduleSuffix = currentModuleUrl.pathname.endsWith('.min.js') ? '.min.js' : '.js',
    // Resolve the shared implementation URL in the selected delivery family
    resolveLocalModule = (specifier) => {
        const resolved = new URL(specifier.replace(/\.js$/, moduleSuffix), currentModuleUrl);
        return resolved.href;
    },
    // Import shared modules without loader-specific URL identities
    importLocalModule = (specifier) => import(/* @vite-ignore */ resolveLocalModule(specifier)),
    importDeferredLocalModule = (specifier) => import(/* @vite-ignore */ resolveLocalModule(specifier)),
    [{ ACLLoadError }, { getContext, createContext, runWhenWebComponentsReady }] = await Promise.all([
        importLocalModule('./acl-load-error.js'),
        importLocalModule('./runtime/context.js'),
    ]);

const ACL_FACADE_VERSION = typeof __ACL_BUILD_VERSION__ === 'undefined' ? 'development' : __ACL_BUILD_VERSION__,
    defaultContext = getContext(currentModuleUrl.searchParams.get('acl-instance') || 'default');

// Construct the synchronous facade for one ownership context
const createFacade = (context) => {
    const pendingDefinitions = new Set(),
        pendingDefinitionsByTag = new Map(),
        pendingDefinitionFailuresByTag = new Map(),
        pendingConfiguration = [],
        pendingBuiltIns = new Map(),
        facadeManifestDependencies = new Map(),
        facadeManifestGroups = new Map(),
        facadeDetachedDataEntries = new Set(),
        // Normalize persistent cache namespaces consistently with the runtime
        normalizeCacheNamespace = (value) =>
            String(value || 'default')
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9._-]+/g, '-') || 'default';

    let implementationPromise = null,
        implementationClass = null,
        discoveryObserver = null,
        facadeTemplateObserver = null,
        facadeStartingPromise = null,
        facadeReportOverride = null,
        facadeStarted = false,
        facadeDisposed = false;

    // Check whether an object owns a configuration key
    const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key),
        defaultConfig = {
            ...createDefaults(),
            _templateCacheVersion: ACL_FACADE_VERSION,
            _templateCachePrefix: 'alpine-component-loader-default-',
            _templateCacheKey: `alpine-component-loader-default-${ACL_FACADE_VERSION}`,
            _templateCacheExpire: 15 * 60 * 1000,
        };

    // Merge facade configuration while preserving nested defaults
    const mergeConfiguration = (current, options) => {
        if (!options || typeof options !== 'object' || Array.isArray(options))
            throw new TypeError('[ACL] config() expects an options object.');
        const next = { ...options };
        [
            'data',
            'hooks',
            'attributes',
            'errorCss',
            'events',
            'security',
            'observability',
            'adaptivePrefetch',
            'hydrationScheduler',
        ].forEach((key) => {
            // Merge each explicitly supplied nested configuration group
            if (hasOwn(options, key))
                next[key] =
                    options[key] === false
                        ? false
                        : {
                              ...(current[key] || {}),
                              ...(options[key] || {}),
                          };
        });
        Object.assign(current, next);
    };

    // Snapshot mutable configuration groups before queueing them for runtime replay
    const snapshotConfiguration = (options) => {
        const snapshot = { ...options };
        [
            'data',
            'hooks',
            'attributes',
            'errorCss',
            'events',
            'security',
            'observability',
            'adaptivePrefetch',
            'hydrationScheduler',
        ].forEach((key) => {
            // Clone only object-valued groups while retaining callback identities
            if (options[key] && typeof options[key] === 'object') snapshot[key] = { ...options[key] };
        });
        return snapshot;
    };

    // Replay facade state after the deferred runtime becomes available
    const syncImplementationState = async (Implementation) => {
        const namespace = normalizeCacheNamespace(AlpineComponentLoader.globalConfig.cacheNamespace),
            prefix = `alpine-component-loader-${namespace}-`;
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
        if (AlpineComponentLoader.toggleDebug !== defaultToggleDebug)
            Implementation.toggleDebug = AlpineComponentLoader.toggleDebug;
        if (facadeReportOverride) Implementation._report = facadeReportOverride;
        pendingConfiguration.splice(0).forEach((options) => {
            // Apply configuration calls queued before runtime activation
            Implementation.config(options);
        });
        if (AlpineComponentLoader.globalConfig.observability) await Implementation._loadObservability();
    };

    // Load and initialize the full runtime on first demand
    const loadImplementation = () => {
        if (implementationPromise) return implementationPromise;
        const loading = runWhenWebComponentsReady(() => {
            // Avoid importing DOM-dependent modules after disposal during polyfill startup
            AlpineComponentLoader._assertActive();
            return importDeferredLocalModule('./runtime/loader.js');
        })
            // Bind shared implementation code to this facade ownership context
            .then(async ({ createRuntime }) => {
                AlpineComponentLoader._assertActive();
                const Implementation = createRuntime(context);
                // Synchronize facade state before exposing the runtime
                implementationClass = Implementation;
                await syncImplementationState(Implementation);
                AlpineComponentLoader._assertActive();
                return Implementation;
            })
            .catch((error) => {
                // Permit a later activation attempt after an import failure
                if (error?.code === 'ACL_LOADER_DISPOSED') throw error;
                if (implementationPromise === loading) {
                    implementationPromise = null;
                    implementationClass = null;
                }
                throw new ACLLoadError('Unable to load the AlpineComponentLoader runtime.', {
                    code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
                    phase: 'runtime-import',
                    cause: error,
                    retryable: true,
                });
            });
        implementationPromise = loading;
        return loading;
    };

    // Warn when debugger support has not been imported
    const defaultToggleDebug = () => {
        console.warn('[ACL] Debugger not loaded. Import "alpine-component-loader/debugger" to enable.');
    };

    // Drain every definition added before or during the current startup pass
    const drainPendingDefinitions = async () => {
        // Repeat until definitions stop arriving during the current pass
        while (pendingDefinitions.size) await Promise.allSettled([...pendingDefinitions]);
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
            data: { ...defaultConfig.data },
        };

        // Report the active runtime or facade build version
        static get version() {
            return implementationClass?.version || ACL_FACADE_VERSION;
        }

        // Update configuration without forcing runtime activation
        static config(options) {
            AlpineComponentLoader._assertActive();
            if (!options || typeof options !== 'object' || Array.isArray(options))
                throw new TypeError('[ACL] config() expects an options object.');
            const snapshot = snapshotConfiguration(options);
            if (implementationClass) {
                implementationClass.config(snapshot);
                implementationClass.globalConfig = AlpineComponentLoader.globalConfig;
            } else {
                const staged = {
                    ...AlpineComponentLoader.globalConfig,
                    data: { ...(AlpineComponentLoader.globalConfig.data || {}) },
                };
                mergeConfiguration(staged, snapshot);
                validateOptions(staged);
                Object.assign(AlpineComponentLoader.globalConfig, staged);
                pendingConfiguration.push(snapshot);
            }
        }

        // Start registrations that are required by the current document
        static async start() {
            return AlpineComponentLoader._start(true);
        }

        static async _start(discover) {
            AlpineComponentLoader._assertActive();
            if (defaultContext.polyfillStartup || globalThis.WebComponents?.ready === false) {
                // Wait before checking Custom Elements availability or discovering definitions
                await runWhenWebComponentsReady(() => AlpineComponentLoader._assertActive());
            }
            if (
                typeof window === 'undefined' ||
                typeof document === 'undefined' ||
                typeof customElements === 'undefined' ||
                typeof HTMLElement === 'undefined'
            )
                throw new ACLLoadError('AlpineComponentLoader.start() requires browser DOM APIs.', {
                    code: 'ACL_ENVIRONMENT_UNAVAILABLE',
                    phase: 'environment',
                });
            if (facadeStarted && (!discover || context.discoveryStarted)) return;
            if (facadeStartingPromise) return facadeStartingPromise;
            facadeStartingPromise = (async () => {
                // Complete every activation step inside one shared transaction
                await drainPendingDefinitions();
                implementationClass?._registerDefinitions();
                const builtInRegistrations = discover ? context.discover?.(AlpineComponentLoader) || [] : [];
                if (discover) context.discoveryStarted = true;
                await Promise.all(builtInRegistrations);
                await drainPendingDefinitions();
                const root = AlpineComponentLoader.root || document,
                    hasTemplates = discover && containsInlineComponentTemplate(root);
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
                            phase: 'cache',
                        });
                    }
                    await drainPendingDefinitions();
                    Implementation._registerDefinitions();
                    if (Implementation.globalConfig.adaptivePrefetch)
                        await Implementation.observePrefetch(
                            Implementation.globalConfig.adaptivePrefetch === true
                                ? {}
                                : Implementation.globalConfig.adaptivePrefetch,
                        );
                }
                facadeStarted = true;
            })();
            // Share startup failures while clearing the transaction for a retry
            try {
                return await facadeStartingPromise;
            } finally {
                facadeStartingPromise = null;
            }
        }

        // Queue a component definition while activating the runtime
        static define(tagName, source, config) {
            AlpineComponentLoader._assertActive();
            const hasSeparateConfig = arguments.length > 2,
                definitionKey = String(tagName || '')
                    .trim()
                    .toLowerCase();
            if (pendingDefinitionsByTag.has(definitionKey)) return pendingDefinitionsByTag.get(definitionKey);
            pendingDefinitionFailuresByTag.delete(definitionKey);
            const operation = loadImplementation().then((Implementation) => {
                // Forward the definition after runtime activation
                return hasSeparateConfig
                    ? Implementation.define(tagName, source, config)
                    : Implementation.define(tagName, source);
            });
            pendingDefinitions.add(operation);
            pendingDefinitionsByTag.set(definitionKey, operation);
            void operation.then(
                // Remove a successfully registered pending definition
                () => {
                    pendingDefinitions.delete(operation);
                    if (pendingDefinitionsByTag.get(definitionKey) === operation)
                        pendingDefinitionsByTag.delete(definitionKey);
                },
                // Preserve a failed queued definition for the next startup transaction
                (error) => {
                    pendingDefinitions.delete(operation);
                    if (pendingDefinitionsByTag.get(definitionKey) === operation)
                        pendingDefinitionsByTag.delete(definitionKey);
                    if (!facadeDisposed) pendingDefinitionFailuresByTag.set(definitionKey, error);
                },
            );
            return operation;
        }

        // Register definitions declared by templates under a DOM root
        static async registerTemplates(root = document) {
            AlpineComponentLoader._assertActive();
            const Implementation = await loadImplementation(),
                constructors = await Implementation.registerTemplates(root);
            await Promise.all([...pendingDefinitions]);
            return constructors.filter(Boolean);
        }

        // Begin deferred template observation and return an immediate disposer
        static observeTemplates(options = {}) {
            if (typeof document === 'undefined' || typeof MutationObserver === 'undefined')
                throw new ACLLoadError('Template observation requires MutationObserver.', {
                    code: 'ACL_ENVIRONMENT_UNAVAILABLE',
                    phase: 'environment',
                });
            AlpineComponentLoader._assertActive();
            const root = options.root ?? AlpineComponentLoader.root ?? document.documentElement,
                subtree = options.subtree ?? true;
            AlpineComponentLoader.stopObservingTemplates();
            facadeTemplateObserver = new MutationObserver((records) => {
                // Inspect added subtrees without loading the runtime for unrelated mutations
                records.forEach((record) => {
                    // Process each added element independently
                    record.addedNodes.forEach((node) => {
                        // Register only subtrees that contain an inline ACL template
                        if (node.nodeType === Node.ELEMENT_NODE && containsInlineComponentTemplate(node))
                            void AlpineComponentLoader.registerTemplates(node).catch(
                                // Report observed registration failures without rejecting the mutation callback
                                (error) =>
                                    AlpineComponentLoader._report(
                                        'warn',
                                        '[ACL] Failed to register an observed inline template.',
                                        error,
                                        { phase: 'template-observer' },
                                    ),
                            );
                    });
                });
            });
            facadeTemplateObserver.observe(root, {
                childList: true,
                subtree,
            });
            const installedObserver = facadeTemplateObserver;
            return () => {
                // Stop only the observer installed for this caller
                if (facadeTemplateObserver !== installedObserver) return;
                installedObserver.disconnect();
                facadeTemplateObserver = null;
            };
        }

        // Stop runtime template observation when it has been activated
        static stopObservingTemplates() {
            facadeTemplateObserver?.disconnect();
            facadeTemplateObserver = null;
            implementationClass?.stopObservingTemplates();
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
            let active = true,
                release = () => {
                    // Remember disposal before runtime activation finishes
                    active = false;
                };
            void loadImplementation().then(
                (Implementation) => {
                    // Attach the listener only while its facade subscription is active
                    if (active) release = Implementation.subscribe(listener);
                },
                // Report detached subscription activation failures without an unhandled rejection
                (error) =>
                    AlpineComponentLoader._report(
                        'warn',
                        '[ACL] Failed to activate observability for a subscription.',
                        error,
                        { phase: 'runtime-import' },
                    ),
            );
            // Delegate disposal to whichever subscription is active
            return () => release();
        }

        // Return empty metrics until runtime observability is active
        static getMetrics() {
            return (
                implementationClass?.getMetrics() || {
                    startedAt: Date.now(),
                    totals: {},
                    durations: {},
                    recent: [],
                }
            );
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
            return (level, message, error = null) => {
                // Keep pre-activation diagnostics visible without forcing a runtime import
                console?.[level]?.(message, ...(error == null ? [] : [error]));
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
            return (
                implementationClass?.getDataCacheInfo(finalUrlOrKey) ||
                (finalUrlOrKey
                    ? null
                    : {
                          size: 0,
                          keys: [],
                      })
            );
        }

        // Read template load details from an active runtime
        static getTemplateLoadInfo(source, settings) {
            return implementationClass?.getTemplateLoadInfo(source, settings) || null;
        }

        // Run this operation
        static _assertActive() {
            if (facadeDisposed)
                throw new ACLLoadError('This AlpineComponentLoader instance has been disposed.', {
                    code: 'ACL_LOADER_DISPOSED',
                    phase: 'lifecycle',
                });
        }

        // Run this operation
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
            if (implementationClass)
                await implementationClass.dispose({
                    clearPersistentCaches,
                });
        }

        static toggleDebug = defaultToggleDebug;
    }
    // Install generated forwarding without allocating a wrapper for each operation's implementation
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
        'pruneTemplateCache',
    ]) {
        Object.defineProperty(AlpineComponentLoader, name, {
            configurable: true,
            value: async (...args) => {
                if (name !== 'getTemplateCacheInfo') AlpineComponentLoader._assertActive();
                return (await loadImplementation())[name](...args);
            },
        });
    }
    if (context.id !== 'default') {
        // Preserve synchronous disposed-loader errors on asynchronous forwarding methods
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
            'pruneTemplateCache',
        ]) {
            const operation = AlpineComponentLoader[name];
            Object.defineProperty(AlpineComponentLoader, name, {
                value: (...args) => {
                    AlpineComponentLoader._assertActive();
                    return operation(...args);
                },
            });
        }
    }
    return AlpineComponentLoader;
};
