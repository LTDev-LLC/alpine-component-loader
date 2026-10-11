// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

const currentModuleUrl = new URL(import.meta.url),
    moduleSuffix = currentModuleUrl.pathname.endsWith('.min.js') ? '.min.js' : '.js',
    resolveLocalModule = (specifier, shared, retry) => {
        const resolved = new URL(specifier.replace(/\.js$/, moduleSuffix), currentModuleUrl);
        if (retry) resolved.searchParams.set('acl-retry', retry);
        return resolved.href;
    },
    importNativeModule = (specifier) => import(/* @vite-ignore */ resolveLocalModule(specifier)),
    { getContext, importSharedImplementation } = await importNativeModule('./context.js'),
    importLocalModule = (specifier) => importSharedImplementation(resolveLocalModule(specifier)),
    importDeferredLocalModule = (specifier, shared, retry) =>
        importSharedImplementation(resolveLocalModule(specifier, shared, retry)),
    runtimeModulePromises = new Map(),
    runtimeModuleAttempts = new Map(),
    loadRuntimeModule = (specifier, shared, retry) => {
        if (runtimeModulePromises.has(specifier)) return runtimeModulePromises.get(specifier);
        // Share one deferred module request and allow later retries after failure
        const attempt = Math.max(retry || 0, runtimeModuleAttempts.get(specifier) || 0),
            loading = importDeferredLocalModule(specifier, shared, attempt).catch((error) => {
                if (runtimeModulePromises.get(specifier) === loading) runtimeModulePromises.delete(specifier);
                runtimeModuleAttempts.set(specifier, attempt + 1);
                if (error instanceof ACLLoadError) throw error;
                throw new ACLLoadError(`Unable to load runtime module "${specifier}".`, {
                    code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
                    phase: 'runtime-import',
                    cause: error,
                    retryable: true,
                });
            });
        runtimeModulePromises.set(specifier, loading);
        return loading;
    },
    [
        {
            ACL_VERSION,
            HTMLElementBase,
            getTemplateCacheNames,
            hasOwn,
            resolveComponentSource,
            setBoundedMapEntry,
            validateCustomElementName,
            createDefaults,
            validateOptions,
            DEFAULT_DATA_OPTIONS,
            INTERNAL_COMPONENT_ATTRIBUTES,
            resolveDataOptionSettings,
        },
        { ACLLoadError },
        { cloneDefinitionValue, getTemplateLoadKey, normalizeForwardEvents, parseListAttribute },
        { parsePropDefinitions },
        { collectInlineComponentTemplates, getInlineComponentName },
    ] = await Promise.all([
        importLocalModule('./config.js'),
        importLocalModule('./errors.js'),
        importLocalModule('./values.js'),
        importLocalModule('./props.js'),
        importLocalModule('../inline-templates.js'),
    ]);

let defaultRuntime;
export { defaultRuntime as default };

// Bind implementation state to one loader context
export const createRuntime = (context) => {
    if (context.runtime) return context.runtime;
    let componentRuntimePromise = null,
        templateLoaderPromise = null,
        templateCacheManagerPromise = null;
    // Coalesce required component implementation activation
    const loadComponentRuntime = () => {
            if (!componentRuntimePromise) {
                componentRuntimePromise = loadRuntimeModule('./component/lifecycle-controller.js', true).catch(
                    // Evict failed component imports so a later activation can retry
                    (error) => {
                        componentRuntimePromise = null;
                        throw error;
                    },
                );
            }
            return componentRuntimePromise;
        },
        // Provide the synchronous observability contract without loading instrumentation
        createDisabledObservability = () => ({
            // Return an inert observability event record
            emit(type, detail = {}, defaults = {}) {
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
                    detail,
                };
            },
            report(level, message, error = null) {
                // Keep disabled diagnostics best effort across restricted consoles
                try {
                    console?.[level]?.(message, ...(error == null ? [] : [error]));
                } catch {
                    // Keep diagnostics best effort while observability remains disabled
                }
            },
            // Report empty metrics before observability activation
            getMetrics() {
                return {
                    startedAt: Date.now(),
                    totals: {},
                    durations: {},
                    recent: [],
                };
            },
            clearMetrics() {
                // No retained metrics exist until observability is activated
            },
        }),
        // Merge effective component settings while preserving callbacks and header precedence
        createEffectiveSettings = ({
            globalConfig,
            config,
            dataSettings,
            generatedSkeletonHtml,
            hasAuthoredLoadingUI,
        }) => ({
            loading: 'eager',
            ...globalConfig,
            ...config,
            attributes: {
                ...(globalConfig.attributes || {}),
                ...(config.attributes || {}),
            },
            executeScripts: config.executeScripts ?? globalConfig.executeScripts,
            sanitize: config.sanitize ?? globalConfig.sanitize,
            strictProps: config.strictProps ?? globalConfig.strictProps ?? false,
            sourceResolver: config.sourceResolver ?? globalConfig.sourceResolver ?? null,
            loadingTemplate: config.loadingTemplate ?? globalConfig.loadingTemplate ?? null,
            loadingHtml:
                config.loadingHtml ?? globalConfig.loadingHtml ?? (hasAuthoredLoadingUI ? null : generatedSkeletonHtml),
            templateCacheStrategy: config.templateCacheStrategy ?? globalConfig.templateCacheStrategy ?? 'cache-first',
            hooks: {
                // Retain fetch options when no application hook is supplied
                beforeFetch: (options) => options,
                // Retain fetched data when no application hook is supplied
                afterFetch: (data) => data,
                ...(globalConfig.hooks || {}),
                ...(config.hooks || {}),
            },
            externalCss: [...(globalConfig.externalCss || []), ...(config.externalCss || [])],
            externalScripts: [...(globalConfig.externalScripts || []), ...(config.externalScripts || [])],
            sharedStyleSheets: [...(globalConfig.sharedStyleSheets || []), ...(config.sharedStyleSheets || [])],
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
                ...(globalConfig.errorCss || {}),
                ...(config.errorCss || {}),
            },
            events: {
                ...(globalConfig.events || {}),
                ...(config.events || {}),
                forward: normalizeForwardEvents(globalConfig.events?.forward, config.events?.forward),
            },
            fallback: config.fallback ?? globalConfig.fallback ?? null,
            persist: config.persist ?? globalConfig.persist ?? false,
            persistKey: config.persistKey ?? globalConfig.persistKey ?? null,
            persistDebounce: config.persistDebounce ?? globalConfig.persistDebounce ?? 250,
            persistAdapter: config.persistAdapter ?? globalConfig.persistAdapter ?? null,
            persistMigrate: config.persistMigrate ?? globalConfig.persistMigrate ?? null,
            bindStore: config.bindStore ?? globalConfig.bindStore ?? null,
            form: config.form ?? globalConfig.form ?? false,
            data: dataSettings,
        });

    class AlpineComponentLoader {
        static _instanceId = context.id;

        static _isolated = context.id !== 'default';

        static _context = context;

        static _disposed = Boolean(context.disposed);

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
            ...createDefaults(DEFAULT_DATA_OPTIONS),
            _templateCacheVersion: ACL_VERSION,
            _templateCachePrefix: getTemplateCacheNames('default').prefix,
            _templateCacheKey: getTemplateCacheNames('default').key,
            _templateCacheExpire: 15 * 60 * 1000,
        };

        // Run this operation
        static async start() {
            AlpineComponentLoader._assertActive();
            // Initialize registration and cache state through one shared startup transaction
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
            if (AlpineComponentLoader._started) return;
            if (AlpineComponentLoader._starting) return AlpineComponentLoader._starting;
            // Share one startup transaction across callers until registration completes or fails
            AlpineComponentLoader._starting = (async () => {
                // Run the deferred operation
                try {
                    // Remove stale template cache buckets before registration
                    await AlpineComponentLoader.pruneCaches();
                } catch (e) {
                    AlpineComponentLoader._report('warn', '[ACL] Failed to prune template caches.', e, {
                        phase: 'cache',
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
                if (AlpineComponentLoader.globalConfig.adaptivePrefetch)
                    await AlpineComponentLoader.observePrefetch(
                        AlpineComponentLoader.globalConfig.adaptivePrefetch === true
                            ? {}
                            : AlpineComponentLoader.globalConfig.adaptivePrefetch,
                    );
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

        static async pruneCaches(
            prefix = AlpineComponentLoader.globalConfig._templateCachePrefix,
            current = AlpineComponentLoader.globalConfig._templateCacheKey,
        ) {
            // Remove stale versioned Cache API buckets
            if (!('caches' in window)) return;
            const staleKeys = (await caches.keys())
                .filter(
                    // Select matching items
                    (key) => key.startsWith(prefix),
                )
                .filter(
                    // Select matching items
                    (key) => key !== current,
                );
            if (context.templateCacheRuntime) {
                const {
                    invalidateTemplateCacheHandle,
                    invalidateTemplateCacheIndex,
                    openTemplateCache,
                    settleTemplateCacheWrites,
                } = context.templateCacheRuntime;
                await Promise.all(
                    staleKeys.map(async (key) => {
                        // Drain detached access writes before deleting one stale bucket
                        try {
                            const cache = await openTemplateCache(key);
                            await settleTemplateCacheWrites(cache);
                            invalidateTemplateCacheIndex(cache);
                        } catch {
                            // Continue with explicit bucket deletion when a handle cannot open
                        }
                        invalidateTemplateCacheHandle(key);
                    }),
                );
            }
            return await Promise.all(
                staleKeys.map(
                    // Transform the current item
                    (key) => caches.delete(key),
                ),
            );
        }

        static async clearTemplateCaches(prefix = AlpineComponentLoader.globalConfig._templateCachePrefix) {
            const manager = await AlpineComponentLoader._loadTemplateCacheManager();
            return manager.clearTemplateCaches(prefix);
        }

        static _dispatchRuntimeEvent(name, detail = {}) {
            // Emit matching structured and DOM runtime events
            AlpineComponentLoader._observability.emit(name, detail);
            if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined')
                document.dispatchEvent(new CustomEvent(`acl:${name}`, { detail }));
        }

        static subscribe(listener) {
            // Activate structured observability only when a consumer subscribes
            if (typeof listener !== 'function') throw new TypeError('[ACL] subscribe() expects a listener function.');
            // Retain a cancellable placeholder until deferred observability is ready
            let active = true,
                unsubscribe = () => {
                    active = false;
                };
            // Replace the placeholder only while the subscription remains active
            void AlpineComponentLoader._loadObservability().then(
                (observability) => {
                    // Attach only subscriptions that remain active after deferred initialization
                    if (active) unsubscribe = observability.subscribe(listener);
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
            // Release either the placeholder or the eventual runtime subscription
            return () => unsubscribe();
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
            const loading = loadRuntimeModule('./observability.js')
                .then(({ createObservability }) => {
                    const observability = createObservability();
                    observability.configure(AlpineComponentLoader.globalConfig.observability);
                    AlpineComponentLoader._observability = observability;
                    return observability;
                })
                .catch((error) => {
                    if (AlpineComponentLoader._observabilityPromise === loading)
                        AlpineComponentLoader._observabilityPromise = null;
                    throw error;
                });
            AlpineComponentLoader._observabilityPromise = loading;
            return loading;
        }

        static async clearTemplate(source, cacheKey = AlpineComponentLoader.globalConfig._templateCacheKey) {
            const manager = await AlpineComponentLoader._loadTemplateCacheManager();
            return manager.clearTemplate(source, cacheKey);
        }

        static async getTemplateCacheInfo(source = null, settings = AlpineComponentLoader.globalConfig) {
            const manager = await AlpineComponentLoader._loadTemplateCacheManager();
            return manager.getTemplateCacheInfo(source, settings);
        }

        static async pruneTemplateCache(options = {}) {
            const manager = await AlpineComponentLoader._loadTemplateCacheManager();
            return manager.pruneTemplateCache(options);
        }

        static clearDataCache(key = null) {
            return AlpineComponentLoader._dataRuntime?.clearDataCache(key) ?? key == null;
        }

        static getDataCacheSize() {
            // Count settled and active data cache entries
            return AlpineComponentLoader._dataRuntime?.dataFetchCache?.size || 0;
        }

        static getDataCacheInfo(key = null) {
            return (
                AlpineComponentLoader._dataRuntime?.getDataCacheInfo(key) ??
                (key
                    ? null
                    : {
                          size: 0,
                          keys: [],
                      })
            );
        }

        static _pruneDataFetchCache(settings = null) {
            // Delegate pruning only after the optional data runtime has loaded
            return AlpineComponentLoader._dataRuntime?.pruneDataFetchCache?.(settings) || [];
        }

        // Reuse deferred capability loading and its structured failure handling
        static _loadModule(specifier) {
            return loadRuntimeModule(specifier);
        }

        static _templateLoadKey(source, settings) {
            return getTemplateLoadKey(source, settings);
        }

        static async _loadTemplateCacheModule() {
            return (context.templateCacheRuntime ||= await loadRuntimeModule('./template-cache.js'));
        }

        static _loadTemplateCacheManager() {
            return (templateCacheManagerPromise ||= AlpineComponentLoader._loadTemplateCacheModule()
                .then((module) => module.createTemplateCacheManager(AlpineComponentLoader))
                .catch((error) => {
                    templateCacheManagerPromise = null;
                    throw error;
                }));
        }

        static _loadEnvironment(retry) {
            return loadRuntimeModule('./environment.js', true, retry).then(
                (module) => (AlpineComponentLoader._environment = module),
            );
        }

        static config(options) {
            // Merge global options and synchronize dependent runtime controllers
            if (!options || typeof options !== 'object' || Array.isArray(options))
                throw new TypeError('[ACL] config() expects an options object.');
            const current = AlpineComponentLoader.globalConfig,
                next = { ...options };
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
                // Process the current item
                if (hasOwn(options, key))
                    next[key] =
                        options[key] === false
                            ? false
                            : {
                                  ...(current[key] || {}),
                                  ...(options[key] || {}),
                              };
            });
            validateOptions({
                ...current,
                ...next,
                data: resolveDataOptionSettings(next, current),
            });
            Object.assign(current, next);
            if (hasOwn(options, 'observability')) {
                if (current.observability)
                    void AlpineComponentLoader._loadObservability().catch(
                        // Report asynchronous configuration activation failures
                        (error) =>
                            AlpineComponentLoader._report(
                                'warn',
                                '[ACL] Failed to activate configured observability.',
                                error,
                                { phase: 'runtime-import' },
                            ),
                    );
                else AlpineComponentLoader._observability.configure?.(false);
            }
            if (
                hasOwn(options, 'cacheNamespace') ||
                hasOwn(options, '_templateCacheVersion') ||
                (!current._templateCacheKey && !current._templateCachePrefix)
            ) {
                const names = getTemplateCacheNames(
                    current.cacheNamespace,
                    current._templateCacheVersion || ACL_VERSION,
                );
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
                dependencies: [...(AlpineComponentLoader._manifestDependencies.get(tagName) || [])],
            };
        }

        static getRegisteredTags() {
            // List every registered component tag in stable order
            return Array.from(AlpineComponentLoader._registry.keys());
        }

        static getDependencies(tagName, { transitive = false } = {}) {
            // Resolve direct or transitive dependencies for one component
            const root = String(tagName || '').toLowerCase(),
                direct = AlpineComponentLoader._manifestDependencies.get(root) || [];
            if (!transitive) return [...direct];
            const selected = new Set(),
                visit = (tag) => {
                    // Visit
                    for (const dependency of AlpineComponentLoader._manifestDependencies.get(tag) || []) {
                        if (!selected.has(dependency)) {
                            visit(dependency);
                            selected.add(dependency);
                        }
                    }
                };
            visit(root);
            return [...selected];
        }

        static async registerSkeletonManifest(manifest) {
            // Register generated skeleton definitions from a manifest
            const { normalizeSkeletonManifest } = await loadRuntimeModule('./registry.js'),
                normalizedManifest = normalizeSkeletonManifest(manifest),
                registered = [];
            normalizedManifest.skeletons.forEach(({ tagName, html }) => {
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
            if (
                existing &&
                AlpineComponentLoader._isolated &&
                existing.__aclLoaderInstance !== AlpineComponentLoader._instanceId
            )
                throw new ACLLoadError(`<${name}> is owned by another custom-element registry user.`, {
                    code: 'ACL_TAG_OWNERSHIP_CONFLICT',
                    phase: 'registry',
                });
            if (!existing) {
                const elementClass = createDeclarativeLoader(AlpineComponentLoader);
                Object.defineProperty(elementClass, '__aclLoaderInstance', {
                    value: AlpineComponentLoader._instanceId,
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
            if (
                existing &&
                AlpineComponentLoader._isolated &&
                existing.__aclLoaderInstance !== AlpineComponentLoader._instanceId
            )
                throw new ACLLoadError(`<${name}> is owned by another custom-element registry user.`, {
                    code: 'ACL_TAG_OWNERSHIP_CONFLICT',
                    phase: 'registry',
                });
            if (!existing) {
                const elementClass = createDynamicLoader(AlpineComponentLoader);
                Object.defineProperty(elementClass, '__aclLoaderInstance', {
                    value: AlpineComponentLoader._instanceId,
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
            if (
                existing &&
                AlpineComponentLoader._isolated &&
                existing.__aclLoaderInstance !== AlpineComponentLoader._instanceId
            )
                throw new ACLLoadError(`<${name}> is owned by another custom-element registry user.`, {
                    code: 'ACL_TAG_OWNERSHIP_CONFLICT',
                    phase: 'registry',
                });
            if (!existing) {
                const elementClass = createErrorBoundary();
                Object.defineProperty(elementClass, '__aclLoaderInstance', {
                    value: AlpineComponentLoader._instanceId,
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
                if (
                    AlpineComponentLoader._isolated &&
                    existingElement.__aclLoaderInstance !== AlpineComponentLoader._instanceId
                )
                    throw new ACLLoadError(`<${tagName}> is owned by another AlpineComponentLoader instance.`, {
                        code: 'ACL_TAG_OWNERSHIP_CONFLICT',
                        phase: 'registry',
                    });
                if (existingElement !== definition.elementClass)
                    AlpineComponentLoader._report(
                        'warn',
                        `[ACL] <${tagName}> was defined outside AlpineComponentLoader before startup.`,
                        null,
                        {
                            tagName,
                            phase: 'registry',
                        },
                    );
                return existingElement;
            }
            Object.defineProperty(definition.elementClass, '__aclLoaderInstance', {
                value: AlpineComponentLoader._instanceId,
            });
            customElements.define(tagName, definition.elementClass);
            return definition.elementClass;
        }

        static _registerDefinitions() {
            // Install every pending registered component definition
            AlpineComponentLoader._registry.forEach((_definition, tagName) => {
                // Process the current item
                AlpineComponentLoader._registerDefinition(tagName);
            });
        }

        static async registerTemplates(root = document) {
            const { readDeclarativeOptionSettings } = await loadRuntimeModule('./data-options.js');
            // Register inline component definitions found below a DOM root
            const templates = collectInlineComponentTemplates(root),
                constructors = await Promise.all(
                    templates.map(async (tpl) => {
                        // Process the current item
                        const tagName = getInlineComponentName(tpl);
                        if (!tagName) return null;
                        // Parse template-level prop definitions into component attributes
                        const config = readDeclarativeOptionSettings(tpl, AlpineComponentLoader.globalConfig);
                        // Guard the register templates operation against runtime failures
                        try {
                            config.attributes = parsePropDefinitions(tpl.getAttribute('acl-props') || '{}');
                        } catch (e) {
                            AlpineComponentLoader._report(
                                'warn',
                                `[ACL] Invalid JSON in acl-props for <${tagName}>`,
                                e,
                                {
                                    tagName,
                                    phase: 'props',
                                },
                            );
                            config.attributes = {};
                        }
                        // Bind the template content to the declared custom element
                        return await AlpineComponentLoader.define(tagName, tpl, config);
                    }),
                );
            return constructors.filter(Boolean);
        }

        static observeTemplates(options = {}) {
            // Watch dynamic DOM additions for inline component definitions
            if (typeof document === 'undefined' || typeof MutationObserver === 'undefined')
                throw new ACLLoadError('Template observation requires MutationObserver.', {
                    code: 'ACL_ENVIRONMENT_UNAVAILABLE',
                    phase: 'environment',
                });
            const root = options.root ?? document.documentElement,
                subtree = options.subtree ?? true;
            AlpineComponentLoader.stopObservingTemplates();
            // Scan only added element subtrees so observation cost scales with actual insertions
            const observer = new MutationObserver(
                // Process observed DOM mutations
                (mutations) =>
                    mutations.forEach((mutation) => {
                        // Process the current item
                        mutation.addedNodes.forEach((node) => {
                            // Process the current item
                            if (node.nodeType === Node.ELEMENT_NODE)
                                void AlpineComponentLoader.registerTemplates(node).catch((error) =>
                                    AlpineComponentLoader._report(
                                        'warn',
                                        '[ACL] Failed to register an observed inline template.',
                                        error,
                                        { phase: 'template-observer' },
                                    ),
                                );
                        });
                    }),
            );
            observer.observe(root, {
                childList: true,
                subtree,
            });
            AlpineComponentLoader._templateObserver = observer;
            return () => {
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
            const generation = ++AlpineComponentLoader._prefetchGeneration,
                previous = AlpineComponentLoader._prefetchStarting,
                starting = (async () => {
                    if (previous) {
                        // Allow the prior activation to settle before replacing its controller
                        try {
                            await previous;
                        } catch {
                            // A later activation may retry a failed optional-module import
                        }
                    }
                    const { createAdaptivePrefetchController } = await loadRuntimeModule('./adaptive-prefetch.js'),
                        controller = createAdaptivePrefetchController(AlpineComponentLoader, options);
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
            } finally {
                if (AlpineComponentLoader._prefetchStarting === starting)
                    AlpineComponentLoader._prefetchStarting = null;
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
            AlpineComponentLoader._report(
                'warn',
                '[ACL] Debugger not loaded. Import "alpine-component-loader/debugger" to enable.',
                null,
                { phase: 'debugger' },
            );
        }

        static async prefetch(tagName, { signal } = {}) {
            // Fetch and cache one registered component template
            const config = AlpineComponentLoader._registry.get(tagName);
            if (!config) {
                AlpineComponentLoader._report(
                    'warn',
                    `[ACL] Cannot prefetch <${tagName}>: component not defined.`,
                    null,
                    {
                        tagName,
                        phase: 'prefetch',
                    },
                );
                return;
            }
            return await AlpineComponentLoader.loadTemplate(config.source, config.settings, {
                signal,
                priority: 'prefetch',
            });
        }

        static async prefetchAll(tagNames = null, { concurrency = 4, signal } = {}) {
            // Prefetch a component set with bounded concurrency
            const { settleNamedTasks } = await loadRuntimeModule('./registry.js'),
                tags = tagNames ? Array.from(tagNames) : AlpineComponentLoader.getRegisteredTags();
            return await settleNamedTasks(
                tags,
                // Settle the named task
                (tagName) => AlpineComponentLoader.prefetch(tagName, { signal }),
                concurrency,
            );
        }

        static async prefetchGraph(tagNames, { concurrency = 4, includeRoots = true, signal } = {}) {
            // Prefetch component roots and their manifest dependency graph
            const roots = Array.from(
                    tagNames || [],
                    // Transform the current item
                    (tag) => String(tag).toLowerCase(),
                ),
                selected = new Set(),
                visit = (tag) => {
                    // Visit
                    for (const dependency of AlpineComponentLoader._manifestDependencies.get(tag) || [])
                        visit(dependency);
                    if ((includeRoots || !roots.includes(tag)) && AlpineComponentLoader._registry.has(tag))
                        selected.add(tag);
                };
            roots.forEach(visit);
            return await AlpineComponentLoader.prefetchAll(selected, {
                concurrency,
                signal,
            });
        }

        static async registerManifest(manifest, options = {}) {
            // Normalize and register a version-one component manifest
            const { normalizeManifest, resolveManifestPrefetchTags } = await loadRuntimeModule('./registry.js'),
                normalizedManifest = normalizeManifest(manifest),
                basePath =
                    options.basePath ?? normalizedManifest.basePath ?? AlpineComponentLoader.globalConfig.basePath,
                registered = [];
            Object.entries(normalizedManifest.groups || {}).forEach(([name, tags]) => {
                // Process the current item
                AlpineComponentLoader._manifestGroups.set(
                    String(name).toLowerCase(),
                    Array.from(
                        tags || [],
                        // Transform the current item
                        (tag) => String(tag).toLowerCase(),
                    ),
                );
            });
            await Promise.all(
                normalizedManifest.components.map(async (definition) => {
                    // Process the current item
                    AlpineComponentLoader._manifestDependencies.set(definition.tagName, [...definition.dependencies]);
                    await AlpineComponentLoader.define(definition.tagName, definition.source, {
                        ...definition.options,
                        basePath: definition.options?.basePath ?? basePath,
                    });
                    registered.push(definition.tagName);
                }),
            );
            const prefetchTags = resolveManifestPrefetchTags(normalizedManifest, registered, options.prefetch);
            return {
                registered,
                prefetched: prefetchTags.length
                    ? await AlpineComponentLoader.prefetchGraph(prefetchTags, { concurrency: options.concurrency })
                    : {},
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
            return context.caches?.templateLoadMetaCache.get(getTemplateLoadKey(source, settings)) || null;
        }

        static async loadTemplate(source, settings = AlpineComponentLoader.globalConfig, options = {}) {
            // Resolve fetch sanitize and cache one component template
            const effectiveSettings =
                settings === AlpineComponentLoader.globalConfig
                    ? AlpineComponentLoader.globalConfig
                    : {
                          ...AlpineComponentLoader.globalConfig,
                          ...(settings || {}),
                      };
            validateOptions(effectiveSettings);
            if (options.signal?.aborted)
                throw new ACLLoadError('Template loading was canceled', {
                    code: 'ACL_LOAD_CANCELED',
                    phase: 'template',
                    cause: options.signal.reason,
                });
            // Resolve direct template inputs before using the network
            if (source instanceof HTMLTemplateElement) {
                return source.content;
            } else if (typeof source === 'string' && source.startsWith('#')) {
                const el = document.querySelector(source);
                if (!el) return Promise.reject(new Error(`Template ID "${source}" not found`));
                if (!(el instanceof HTMLTemplateElement))
                    return Promise.reject(new Error(`ID "${source}" is not a <template>`));
                return el.content;
            }
            templateLoaderPromise ||= loadRuntimeModule('./template-loader.js')
                .then((module) => module.createTemplateLoader(AlpineComponentLoader))
                .catch((error) => {
                    templateLoaderPromise = null;
                    throw error;
                });
            const templates = await templateLoaderPromise;
            return templates.loadTemplate(source, effectiveSettings, options);
        }

        static async define(tagName, source, config) {
            AlpineComponentLoader._assertActive();
            // Register a component definition and install it after startup
            tagName = validateCustomElementName(tagName);
            const inlineDefinition =
                source &&
                typeof source === 'object' &&
                !Array.isArray(source) &&
                !(source instanceof HTMLTemplateElement);
            let inlineTemplateHtml = null;
            if (inlineDefinition) {
                if (arguments.length > 2)
                    throw new TypeError(
                        `[ACL] Inline definition options for <${tagName}> must be supplied with template.`,
                    );
                const { template, ...inlineConfig } = source;
                if (typeof template !== 'string' || !template.trim())
                    throw new TypeError(
                        `[ACL] Inline definition for <${tagName}> requires a non-empty template string.`,
                    );
                inlineTemplateHtml = template;
                source = template;
                config = inlineConfig;
            }
            if (config === undefined) config = {};
            if (!(typeof source === 'string' && source.trim()) && !(source instanceof HTMLTemplateElement))
                throw new TypeError(`[ACL] <${tagName}> requires a non-empty source URL, selector, or template.`);
            if (!config || typeof config !== 'object' || Array.isArray(config))
                throw new TypeError(`[ACL] Configuration for <${tagName}> must be an object.`);
            const globalConfig = AlpineComponentLoader.globalConfig,
                dataSettings = resolveDataOptionSettings(config, globalConfig),
                generatedSkeletonHtml = AlpineComponentLoader._skeletonRegistry.get(tagName) || null,
                hasAuthoredLoadingUI =
                    config.loadingHtml != null ||
                    config.loadingTemplate != null ||
                    globalConfig.loadingHtml != null ||
                    globalConfig.loadingTemplate != null;
            // Merge defaults, global config, and definition config with explicit precedence
            const settings = createEffectiveSettings({
                globalConfig,
                config,
                dataSettings,
                generatedSkeletonHtml,
                hasAuthoredLoadingUI,
            });
            if (settings.form === true)
                settings.form = {
                    // Configure this value
                    value: 'value',
                    state: null,
                    disabled: 'disabled',
                };
            else if (settings.form) {
                if (typeof settings.form !== 'object' || Array.isArray(settings.form))
                    throw new TypeError(`[ACL] form must be false, true, or an options object for <${tagName}>.`);
                settings.form = {
                    value: 'value',
                    state: null,
                    disabled: 'disabled',
                    ...settings.form,
                };
                // Process forof
                for (const key of ['value', 'state', 'disabled']) {
                    if (settings.form[key] != null && !/^[A-Za-z_$][\w$]*$/.test(settings.form[key]))
                        throw new TypeError(`[ACL] form.${key} must be a prop name for <${tagName}>.`);
                }
            }
            validateOptions(settings);
            settings.attributes = parsePropDefinitions(settings.attributes);
            if (inlineTemplateHtml !== null) {
                const { htmlToFragment } = await loadRuntimeModule('./rendering.js'),
                    inlineTemplate = document.createElement('template');
                inlineTemplate.content.appendChild(htmlToFragment(inlineTemplateHtml, settings));
                source = inlineTemplate;
            }
            const internalObservedAttrs = settings.form
                ? new Set([...INTERNAL_COMPONENT_ATTRIBUTES, 'name', 'disabled', 'required'])
                : INTERNAL_COMPONENT_ATTRIBUTES;
            // Track observed attributes internally
            const observedAttrs = [...new Set([...Object.keys(settings.attributes), ...internalObservedAttrs])];
            // Bind source resolution to this immutable component definition context
            const sourceResolutionContext = Object.freeze({
                    tagName,
                    config,
                    globalConfig,
                    loader: AlpineComponentLoader._publicFacade || AlpineComponentLoader,
                }),
                resolveSource = (candidate) => resolveComponentSource(candidate, settings, sourceResolutionContext);
            let contentSource = inlineTemplateHtml === null ? resolveSource(source) : source;
            const existingElement = customElements.get(tagName);
            if (existingElement) {
                if (
                    AlpineComponentLoader._isolated &&
                    existingElement.__aclLoaderInstance !== AlpineComponentLoader._instanceId
                )
                    throw new ACLLoadError(`<${tagName}> is owned by another AlpineComponentLoader instance.`, {
                        code: 'ACL_TAG_OWNERSHIP_CONFLICT',
                        phase: 'registry',
                    });
                if (!AlpineComponentLoader._registry.has(tagName))
                    AlpineComponentLoader._report(
                        'warn',
                        `[ACL] <${tagName}> is already defined outside AlpineComponentLoader.`,
                        null,
                        {
                            tagName,
                            phase: 'registry',
                        },
                    );
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
            const helpers = (_this) => ({
                // Emit a composed bubbling event from the component host
                // Run the $emit operation
                $emit: (name, detail) =>
                    _this.dispatchEvent(
                        new CustomEvent(name, {
                            bubbles: true,
                            composed: true,
                            detail,
                        }),
                    ),
                // Run the complete cache-clearing component reload pipeline
                // Run the $reload operation
                $reload: (options) => _this.reload(options),
                // Retry only the component's current data request
                // Run the $retry operation
                $retry: () => _this.retry(),
                // Abort only the component's current data request
                // Run the $cancel operation
                $cancel: (reason) => _this.cancel(reason),
                $cache: {
                    // Remove this component's resolved template cache entry
                    // Clear template
                    clearTemplate: () => _this._clearTemplateCache(),
                    // Remove this component's request-aware data cache entry
                    // Clear data
                    clearData: () => _this._clearDataCache(),
                    // Clear both cache layers and report whether every operation succeeded
                    clear: async () => {
                        // Clear
                        const results = await Promise.all([_this._clearTemplateCache(), _this._clearDataCache()]);
                        return results.every(Boolean);
                    },
                },
            });
            // Create the concrete custom element class through the deferred isolated factory
            const {
                    createComponentElementClass,
                    withComponentLifecycle,
                    withComponentLoading,
                    withComponentDataGate,
                    withComponentRendering,
                    withComponentState,
                } = await loadComponentRuntime(),
                formController = settings.form
                    ? (await loadRuntimeModule('./component/form-controller.js')).withComponentForm
                    : null,
                concurrentDefinition = AlpineComponentLoader._registry.get(tagName);
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
                    internalObservedAttrs,
                },
                controllers: [
                    withComponentLifecycle,
                    withComponentLoading,
                    withComponentDataGate,
                    withComponentRendering,
                    withComponentState,
                    formController,
                ].filter(Boolean),
            });
            // Store the definition until startup owns browser registration
            AlpineComponentLoader._registry.set(tagName, {
                source: contentSource,
                settings,
                hasAuthoredLoadingUI,
                elementClass: AlpineExternalComponent,
            });
            // Keep definitions created after startup immediately available
            if (AlpineComponentLoader._started) AlpineComponentLoader._registerDefinition(tagName);
            return AlpineExternalComponent;
        }

        // Run this operation
        static _assertActive() {
            if (AlpineComponentLoader._disposed)
                throw new ACLLoadError('This AlpineComponentLoader instance has been disposed.', {
                    code: 'ACL_LOADER_DISPOSED',
                    phase: 'lifecycle',
                });
        }

        // Run this operation
        static async dispose({ clearPersistentCaches = true } = {}) {
            if (AlpineComponentLoader._disposed) return;
            AlpineComponentLoader._disposed = true;
            context.templateRequests?.dispose();
            AlpineComponentLoader.stopObservingTemplates();
            AlpineComponentLoader.stopObservingPrefetch();
            await Promise.allSettled(
                // Run this operation
                [...AlpineComponentLoader._components].map(async (component) => {
                    component.remove();
                    if (typeof component._performDestroy === 'function') await component._performDestroy();
                }),
            );
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
            if (
                clearPersistentCaches &&
                !context.templateCacheRuntime &&
                typeof window !== 'undefined' &&
                'caches' in window
            ) {
                context.templateGeneration++;
                // Select persistent buckets owned by this loader namespace
                const keys = (await caches.keys()).filter((key) =>
                    key.startsWith(AlpineComponentLoader.globalConfig._templateCachePrefix),
                );
                await Promise.all(keys.map((key) => caches.delete(key)));
            } else if (clearPersistentCaches && typeof window !== 'undefined')
                await AlpineComponentLoader.clearTemplateCaches(
                    AlpineComponentLoader.globalConfig._templateCachePrefix,
                );
            const cachesRuntime = context.caches;
            if (cachesRuntime)
                [
                    cachesRuntime.styleSheetCache,
                    cachesRuntime.scriptLoadCache,
                    cachesRuntime.styleLoadPromiseCache,
                    cachesRuntime.templateLoadCache,
                    cachesRuntime.templateLoadMetaCache,
                    // Run this operation
                ].forEach((cache) => cache.clear());
        }
    }
    context.runtime = AlpineComponentLoader;
    return AlpineComponentLoader;
};

defaultRuntime = createRuntime(getContext());
