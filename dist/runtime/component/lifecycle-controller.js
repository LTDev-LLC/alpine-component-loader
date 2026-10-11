// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js', importLocalModule = (specifier)=>import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)), [{ DATA_CACHE_BOUND_ATTRIBUTES, DATA_FETCH_ATTRIBUTES, DATA_POLL_ATTRIBUTES, readBooleanAttribute, readNumberAttribute, hasOwn }, { applyLifecycleState, createLifecycleEventDetail }, { ACLLoadError, toACLLoadError }, { toCssString, cloneRuntimeValue, parseJson }, { validateSchemaShape }] = await Promise.all([
    importLocalModule('../config.js'),
    importLocalModule('../lifecycle.js'),
    importLocalModule('../errors.js'),
    importLocalModule('../values.js'),
    importLocalModule('../props.js')
]);
// The required component group shares imports; optional behaviors remain behind activation gates
let environment, environmentPromise, environmentAttempt = 0;
// Share environmental activation and retries
const loadEnvironment = (loader)=>{
    return environmentPromise ||= loader._loadEnvironment(environmentAttempt++).then(// Reuse the loaded module synchronously
    (module)=>environment = module, // Allow activation to retry after failure
    (error)=>{
        environmentPromise = null;
        throw error;
    });
};
// Private custom-element controller with definition context supplied by the facade
export const withComponentLifecycle = (Base, { AlpineComponentLoader, settings, tagName, contentSource, helpers, observedAttrs })=>{
    class Component extends Base {
        constructor(){
            // Initialize class state
            super();
            // Seed public props and cache helper methods
            let _$props = {
                $data: null,
                $loading: false,
                $error: null,
                $lastUpdated: Date.now(),
                ...helpers(this),
                ...Object.fromEntries(Object.keys(settings.attributes || {}).map(// Transform the current item
                (name)=>[
                        name,
                        undefined
                    ]))
            };
            // Prepare lifecycle state, roots, observers, and cleanup tracking
            this._hasLoadedOnce = false;
            this._state = 'idle';
            this._loadGeneration = 0;
            this._reloadGeneration = 0;
            this._activeLoadPromise = null;
            this._loadAbortController = null;
            this._disconnectTimeout = null;
            this._fetchAbortController = null;
            this._fetchGeneration = 0;
            this._skipNextDataFetch = false;
            this._idleCallbackId = null;
            this._idleTimeoutId = null;
            this._hydrationCleanups = null;
            this._alpineWaitCleanup = null;
            this._destroyPromise = null;
            this._destroying = false;
            this._unmounted = false;
            this._cleanupEpoch = 0;
            this._persistenceDispose = null;
            this.$props = window.Alpine ? window.Alpine.reactive(_$props) : _$props;
            const declarativeShadowTemplate = settings.shadow && !this.shadowRoot ? Array.from(this.children || []).find(// Find the matching item
            (child)=>child.localName === 'template' && child.hasAttribute('data-acl-ssr-shadow') && child.getAttribute('shadowrootmode') === 'open') : null;
            this._root = settings.shadow ? this.shadowRoot || this.attachShadow({
                mode: 'open'
            }) : this;
            if (declarativeShadowTemplate) {
                this._root.appendChild(declarativeShadowTemplate.content);
                declarativeShadowTemplate.remove();
            }
            const initialDataElement = Array.from(this.children || []).find(// Run this operation
            (child)=>child.localName === 'script' && child.hasAttribute('data-acl-ssr-data'));
            if (initialDataElement) {
                // Run this operation
                try {
                    const initialData = JSON.parse(initialDataElement.textContent || 'null'), initialTarget = settings.data.target || '$data';
                    this.$props[initialTarget] = initialData;
                    this._skipNextDataFetch = true;
                } catch  {
                // Ignore malformed server data and allow the configured client fetch to recover
                }
                initialDataElement.remove();
            }
            this._ssrHydration = Boolean(this.hasAttribute('data-acl-ssr') && this._root.childNodes.length && this.getAttribute('data-acl-revision') === String(settings.templateRevision || ''));
            this._ssrLightNodes = !settings.shadow && this._ssrHydration ? new Set(this.childNodes) : null;
            this._observer = null;
            this._scopeId = null;
            this._slotObserver = null;
            this._originalLightDom = null;
            this._lightSlotNodes = null;
            this._hasRenderedContent = Boolean(this._ssrHydration && !settings.shadow);
            this._pollTimer = null;
            this._pollSignalCleanups = null;
            this._pollIntersectionObserver = null;
            this._pollIsIntersecting = true;
            this._pollSetupGeneration = 0;
            this._deferredSetupGeneration = 0;
            this._pollSetupPending = false;
            this._alpinePropsScopeCleanup = null;
            this._cleanups = null;
            this._forwardEventCleanups = null;
            this._aclDebugState = null;
            AlpineComponentLoader._components?.add(this);
        }
        static get observedAttributes() {
            return observedAttrs;
        }
        _setLifecycleState(state) {
            applyLifecycleState(this, state);
        }
        get _aclDebug() {
            return this._aclDebugState ||= {
                tagName,
                source: contentSource,
                templateCacheHit: null,
                dataCacheHit: null,
                dataUrl: null,
                dataCacheSize: AlpineComponentLoader.getDataCacheSize()
            };
        }
        set _aclDebug(value) {
            this._aclDebugState = value;
        }
        _exposePropsToNode(node) {
            if (!node || node.nodeType !== 1) return;
            node.$props = this.$props;
        }
        _installAlpinePropsScope() {
            if (typeof window.Alpine?.addScopeToNode !== 'function') return;
            if (this._alpinePropsScopeCleanup) return;
            const host = this, scope = {}, hadOwnDataStack = Object.prototype.hasOwnProperty.call(this, '_x_dataStack');
            Object.defineProperty(scope, '$props', {
                configurable: false,
                enumerable: true,
                get () {
                    // Follow the current reference after store binding or reactive wrapping
                    return host.$props;
                }
            });
            const removeScope = window.Alpine.addScopeToNode(this, scope), cleanup = ()=>{
                // Restore ordinary ancestry when the host did not previously own an Alpine stack
                if (typeof removeScope === 'function') removeScope();
                if (!hadOwnDataStack) delete this._x_dataStack;
                if (this._alpinePropsScopeCleanup === cleanup) this._alpinePropsScopeCleanup = null;
            };
            this._alpinePropsScopeCleanup = cleanup;
            this._addCleanup(cleanup);
        }
        _reportPropIssue(message) {
            if (settings.strictProps) throw new TypeError(message);
            AlpineComponentLoader._report('warn', message, null, {
                tagName,
                phase: 'props'
            });
        }
        _resumeActiveResources() {
            this._setLifecycleState('ready');
            if (!settings.shadow) this._initSlotObserver();
            this._startPolling();
        }
        attributeChangedCallback(name, oldVal, newVal) {
            if (oldVal === newVal) return;
            // Refresh data when the endpoint or fetch options change
            if (DATA_FETCH_ATTRIBUTES.has(name)) {
                if (this._state === 'ready') this._fetchData(this.getAttribute('data-src') || settings.data.src);
            } else if (DATA_POLL_ATTRIBUTES.has(name)) {
                // Restart polling with the latest interval
                if (name !== 'data-fetch-poll') this._detachPollingSignals();
                this._startPolling();
            } else if (DATA_CACHE_BOUND_ATTRIBUTES.has(name)) {
                AlpineComponentLoader._pruneDataFetchCache({
                    cacheMax: this._getDataFetchCacheMax()
                });
            } else this._updateProp(name, newVal);
            // Notify hooks after initialized components receive updates
            if (this._state === 'ready') {
                this._runHookDetached('updated', {
                    name,
                    oldVal,
                    newVal
                });
            }
        }
        connectedCallback() {
            if (AlpineComponentLoader._disposed) {
                this.setAttribute('data-acl-disposed', '');
                this.dispatchEvent(new CustomEvent('acl:error', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        error: new Error('ACL_LOADER_DISPOSED'),
                        phase: 'lifecycle'
                    }
                }));
                return;
            }
            this.setAttribute('data-acl-component', this.tagName);
            // Cancel delayed disconnect cleanup when a moved component reconnects
            if (this._disconnectTimeout) {
                clearTimeout(this._disconnectTimeout);
                this._disconnectTimeout = null;
            }
            // Reactivate a previously loaded component that was detached before cleanup
            if (this._state === 'deactivated' && this._hasLoadedOnce) {
                this._resumeActiveResources();
                this._runHookDetached('activated');
                return;
            }
            // Deferred work is canceled on detach and must be scheduled again
            if (this._state === 'deactivated') this._setLifecycleState('idle');
            // Guard against parallel loading or already initialized states
            if (this._state === 'deferred' || this._state === 'loading') return;
            // Sync attributes immediately for eager loading
            this._syncAllAttributes();
            // Choose eager, lazy, or idle loading behavior
            const loadMode = this.getAttribute('loading') || settings.loading;
            const hydrateMode = this.getAttribute('hydrate') || settings.hydrate || 'eager';
            if (this._ssrHydration && hydrateMode !== 'eager') {
                this.setAttribute('data-acl-hydration-state', 'deferred');
                this._setLifecycleState('deferred');
                this._initHydrationTrigger(hydrateMode);
            } else if (loadMode === 'lazy') {
                this._setLifecycleState('deferred');
                this._initLazyObserver();
            } else if (loadMode === 'idle') {
                this._setLifecycleState('deferred');
                this._initIdleLoader();
            } else {
                this._load();
            }
            // Initialize data polling if configured
            this._startPolling();
        }
        disconnectedCallback() {
            if (this._destroying || this._state === 'destroyed') return;
            const wasReady = this._state === 'ready';
            this._cancelDeferredLoad();
            this._cancelAlpineWait('Disconnected');
            this._loadAbortController?.abort('Disconnected');
            this._loadAbortController = null;
            this._setLifecycleState('deactivated');
            if (!wasReady) {
                this._loadGeneration++;
                this._fetchGeneration++;
                this._fetchAbortController?.abort('Disconnected');
                this._fetchAbortController = null;
            }
            // Stop polling
            this._stopPolling();
            this._detachPollingSignals();
            // Stop observing slots
            if (this._slotObserver) {
                this._slotObserver.disconnect();
                this._slotObserver = null;
            }
            // If flagged with keep-alive, skip destruction
            if (this._isKeptAlive || this.hasAttribute('keep-alive')) {
                this._runHookDetached('deactivated');
                return;
            }
            // Don't destroy immediately; give moves/rewrites time to reattach
            this._disconnectTimeout = setTimeout(()=>{
                // If we got re-attached after a slower move, abort cleanup
                if (this.isConnected) {
                    this._disconnectTimeout = null;
                    return;
                }
                this._disconnectTimeout = null;
                void this._destroyImmediately();
            }, 250);
        }
        _destroyImmediately() {
            if (this._destroyPromise) return this._destroyPromise;
            this._destroying = true;
            const operation = this._performDestroy();
            this._destroyPromise = operation;
            // Release promise ownership only when this exact destroy generation settles
            const clear = ()=>{
                // Clear
                if (this._destroyPromise === operation) this._destroyPromise = null;
                this._destroying = false;
            };
            void operation.then(clear, clear);
            return operation;
        }
        async _performDestroy() {
            if (this._disconnectTimeout) {
                clearTimeout(this._disconnectTimeout);
                this._disconnectTimeout = null;
            }
            this._cancelDeferredLoad();
            this._cancelAlpineWait('Destroyed');
            this._loadAbortController?.abort('Destroyed');
            this._loadAbortController = null;
            this._stopPolling();
            this._detachPollingSignals();
            this._slotObserver?.disconnect();
            this._slotObserver = null;
            if (!this._unmounted) {
                this._unmounted = true;
                // Guard the perform destroy operation against runtime failures
                try {
                    await this._triggerHook('unmounted');
                } catch (error) {
                    this._dispatchAcl('error', {
                        error,
                        phase: 'hook',
                        hook: 'unmounted'
                    });
                }
            }
            this._fetchAbortController?.abort('Destroyed');
            this._fetchAbortController = null;
            this._fetchGeneration++;
            this._loadGeneration++;
            if (!settings.shadow) this._captureLightSlots();
            await this._releasePersistence(true);
            if (this._root && window.Alpine && this._hasLoadedOnce) window.Alpine.destroyTree(this._root);
            this._runCleanups();
            this._root?.replaceChildren();
            this._hasLoadedOnce = false;
            this._setLifecycleState('destroyed');
            AlpineComponentLoader._components?.delete(this);
        }
        _startPolling() {
            this._stopPolling();
            const interval = parseInt(this.getAttribute('data-fetch-poll') || settings.data.poll);
            if (!(interval > 0)) {
                this._detachPollingSignals();
                return;
            }
            if (!this.isConnected || this._pollDataPending) return;
            const generation = this._pollSetupGeneration;
            this._pollDataPending = true;
            void this._ensureDataRuntime().then(()=>{
                this._pollDataPending = false;
                if (this.isConnected && generation === this._pollSetupGeneration && !AlpineComponentLoader._disposed) this._startPolling();
            }).catch((error)=>{
                this._pollDataPending = false;
                if (!this.isConnected || generation !== this._pollSetupGeneration) return;
                this._dispatchAcl('error', {
                    error,
                    phase: 'runtime-import'
                });
            });
        }
        _stopPolling() {
            if (this._pollTimer) {
                clearTimeout(this._pollTimer);
                this._pollTimer = null;
            }
        }
        // Guard late module completion with independent polling and deferred-load ownership
        _useEnvironment(polling, install) {
            const field = polling ? '_pollSetupGeneration' : '_deferredSetupGeneration', generation = this[field], // Resolve the queued operation and release its resources
            current = ()=>this.isConnected && !this._destroying && !AlpineComponentLoader._disposed && this[field] === generation && (polling || this._state === 'deferred');
            if (environment) {
                if (current()) install(environment);
                return true;
            }
            if (polling && this._pollSetupPending) return false;
            if (polling) this._pollSetupPending = true;
            void loadEnvironment(AlpineComponentLoader).then((module)=>{
                if (!current()) return;
                if (polling) this._pollSetupPending = false;
                install(module);
                if (polling) this._startPolling();
            }).catch((error)=>{
                if (!current()) return;
                if (polling) this._pollSetupPending = false;
                else {
                    this._cancelDeferredLoad();
                    this._setLifecycleState('idle');
                }
                AlpineComponentLoader._report('error', `[ACL] <${tagName}> environmental activation failed.`, error, {
                    phase: 'runtime-import'
                });
                this._dispatchAcl('error', {
                    error,
                    phase: 'runtime-import'
                });
            });
            return false;
        }
        _detachPollingSignals() {
            this._pollSetupGeneration++;
            this._pollSetupPending = false;
            environment?.releasePollingSignals(this);
        }
        _addCleanup(cleanup) {
            if (typeof cleanup !== 'function') return ()=>{
            // Keep invalid cleanup registration harmless
            };
            (this._cleanups ||= []).push(cleanup);
            return ()=>{
                // Run the with component lifecycle operation
                const index = this._cleanups?.indexOf(cleanup) ?? -1;
                if (index >= 0) this._cleanups.splice(index, 1);
            };
        }
        _runCleanups() {
            this._forwardEventCleanups?.forEach(// Process the current item
            (cleanup)=>cleanup());
            this._forwardEventCleanups = null;
            this._cleanupEpoch++;
            const cleanups = this._cleanups?.splice(0).reverse() || [];
            this._cleanups = null;
            cleanups.forEach((cleanup)=>{
                // Process the current item
                try {
                    cleanup();
                } catch (e) {
                    AlpineComponentLoader._report('warn', `[ACL] Cleanup failed for <${tagName}>`, e, {
                        tagName,
                        phase: 'cleanup'
                    });
                }
            });
        }
        _cancelDeferredLoad() {
            this._deferredSetupGeneration++;
            if (this._observer) {
                this._observer.disconnect();
                this._observer = null;
            }
            if (this._idleCallbackId !== null && 'cancelIdleCallback' in window) {
                cancelIdleCallback(this._idleCallbackId);
                this._idleCallbackId = null;
            }
            if (this._idleTimeoutId !== null) {
                clearTimeout(this._idleTimeoutId);
                this._idleTimeoutId = null;
            }
            this._hydrationCleanups?.splice(0).forEach((cleanup)=>cleanup());
            this._hydrationCleanups = null;
        }
        _beginHydration() {
            if (!this.isConnected || this._state !== 'deferred') return;
            this._cancelDeferredLoad();
            this.setAttribute('data-acl-hydration-state', 'hydrating');
            void this._load();
        }
        _initHydrationTrigger(mode) {
            this._activateTriggers(mode, '_initHydrationTrigger');
        }
        _activateTriggers(mode, method) {
            const generation = this._deferredSetupGeneration, // Reject deferred setup after ownership or connection changes
            current = ()=>this.isConnected && this._state === 'deferred' && !this._destroying && !AlpineComponentLoader._disposed && generation === this._deferredSetupGeneration;
            let interacted = false;
            const events = mode === 'interaction' ? [
                'pointerover',
                'touchstart',
                'focusin'
            ] : [], // Remember interaction while trigger implementation is loading
            record = ()=>{
                interacted = true;
            }, // Release early interaction listeners after activation or cancellation
            release = ()=>events.forEach((name)=>this.removeEventListener(name, record, true));
            events.forEach((name)=>this.addEventListener(name, record, {
                    capture: true,
                    passive: true
                }));
            (this._hydrationCleanups ||= []).push(release);
            void AlpineComponentLoader._loadModule('./component/triggers.js').then((module)=>{
                release();
                if (!current()) return;
                const controller = module.withTriggers(class {
                }, {
                    settings
                });
                // Install trigger methods only on this component instance
                for (const name of Reflect.ownKeys(controller.prototype)){
                    if (name !== 'constructor') Object.defineProperty(this, name, Object.getOwnPropertyDescriptor(controller.prototype, name));
                }
                if (interacted) this._beginHydration();
                else this[method](mode);
            }).catch((error)=>{
                release();
                if (!current()) return;
                this._cancelDeferredLoad();
                this._setLifecycleState('idle');
                AlpineComponentLoader._report('error', '[ACL] Deferred activation failed.', error, {
                    phase: 'runtime-import'
                });
                this._dispatchAcl('error', {
                    error,
                    phase: 'runtime-import'
                });
            });
        }
        _cancelAlpineWait(reason = 'Canceled') {
            const cleanup = this._alpineWaitCleanup;
            this._alpineWaitCleanup = null;
            cleanup?.(reason);
        }
        _initLazyObserver() {
            this._activateTriggers('lazy', '_initLazyObserver');
        }
        _initIdleLoader() {
            this._activateTriggers('idle', '_initIdleLoader');
        }
        _initSlotObserver() {}
    }
    Object.entries(settings.attributes || {}).forEach(([name, definition])=>{
        if (name in Component.prototype) return;
        Object.defineProperty(Component.prototype, name, {
            configurable: true,
            enumerable: true,
            get () {
                return this.$props[name];
            },
            set (value) {
                const configDefinition = definition && definition.type ? definition : {}, type = configDefinition.type || definition;
                this.$props[name] = value;
                if (!configDefinition.reflect) return;
                if (type === Boolean) {
                    if (value) this.setAttribute(name, '');
                    else this.removeAttribute(name);
                } else if (value == null) {
                    this.removeAttribute(name);
                } else if (type === Object || type === Array) {
                    this.setAttribute(name, JSON.stringify(value));
                } else {
                    this.setAttribute(name, String(value));
                }
            }
        });
    });
    return Component;
};
// Compose the required controllers around one immutable definition context
export const createComponentElementClass = ({ base, context, controllers })=>{
    if (typeof base !== 'function') throw new TypeError('[ACL] Component construction requires a browser HTMLElement base class.');
    if (!Array.isArray(controllers) || !controllers.length || controllers.some(// Check the current item
    (controller)=>typeof controller !== 'function')) throw new TypeError('[ACL] Component construction requires implementation controllers.');
    const definitionContext = Object.freeze({
        ...context || {}
    }), elementClass = controllers.reduce(// Accumulate the current item
    (current, controller)=>controller(current, definitionContext), base);
    if (typeof elementClass !== 'function' || !(elementClass.prototype instanceof base)) throw new TypeError('[ACL] Component implementation factories must return an HTMLElement subclass.');
    return elementClass;
};
let dataRuntimePromise = null;
// Load and memoize optional data modules when a component first needs them
const loadDataRuntime = (owner)=>{
    if (dataRuntimePromise) return dataRuntimePromise;
    // Share one loading transaction and allow retries after a failed import
    const loading = Promise.all([
        owner._loadModule('./component/data-controller.js'),
        owner._loadModule('./fetch-cache.js')
    ]).then(([controller, cache])=>({
            controller,
            cache
        })).catch((error)=>{
        if (dataRuntimePromise === loading) dataRuntimePromise = null;
        throw new ACLLoadError('Unable to load the component data runtime.', {
            code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
            phase: 'runtime-import',
            cause: error,
            retryable: true
        });
    });
    dataRuntimePromise = loading;
    return loading;
};
// Keep the component contract synchronous while installing data behavior on first activation
export const withComponentDataGate = (Base, context)=>{
    const { AlpineComponentLoader, settings, contentSource } = context;
    return class extends Base {
        async _ensureDataRuntime() {
            const generation = this._loadGeneration, epoch = this._cleanupEpoch;
            if (!this._dataRuntimePromise || this._dataSetupGeneration !== generation || this._dataSetupEpoch !== epoch) {
                this._dataSetupGeneration = generation;
                this._dataSetupEpoch = epoch;
                const loading = loadDataRuntime(AlpineComponentLoader).then(// Install the concrete data controller after its modules arrive
                ({ controller, cache })=>{
                    if (this._destroying || AlpineComponentLoader._disposed || generation !== this._loadGeneration || epoch !== this._cleanupEpoch) throw new ACLLoadError('Data activation was canceled.', {
                        code: 'ACL_LOAD_CANCELED',
                        phase: 'runtime-import'
                    });
                    AlpineComponentLoader._dataRuntime ||= cache.createDataCache(AlpineComponentLoader);
                    const DataController = controller.withComponentData(class {
                    }, context);
                    // Install the deferred controller methods on this component instance
                    for (const name of Reflect.ownKeys(DataController.prototype)){
                        if (name === 'constructor') continue;
                        Object.defineProperty(this, name, Object.getOwnPropertyDescriptor(DataController.prototype, name));
                    }
                    return this;
                }).catch((error)=>{
                    // Permit the same component instance to retry a failed capability import
                    if (this._dataRuntimePromise === loading) this._dataRuntimePromise = null;
                    throw error;
                });
                this._dataRuntimePromise = loading;
            }
            return await this._dataRuntimePromise;
        }
        _getDataTarget() {
            return this.getAttribute('data-target') || settings.data.target || '$data';
        }
        _getDataFetchCacheMax() {
            return readNumberAttribute(this, 'data-fetch-cache-max', Number(settings.data.cacheMax), {
                min: 0
            });
        }
        _getPollingPauseSetting(attributeName, groupName) {
            return readBooleanAttribute(this, attributeName, settings.data[groupName]);
        }
        _setFetchedData(target, data) {
            if (!target || target === '$data') this.$props.$data = data;
            else this.$props[target] = data;
        }
        _clearFetchedData(target) {
            if (!target || target === '$data') this.$props.$data = null;
            else this.$props[target] = null;
        }
        async _clearTemplateCache() {
            if (!settings.cacheTemplates || !('caches' in window)) return false;
            return await AlpineComponentLoader.clearTemplate(contentSource, settings._templateCacheKey);
        }
        async _clearDataCache() {
            const currentDataSrc = this.getAttribute('data-src') || settings.data.src;
            if (!currentDataSrc && !this._aclDebug?.dataCacheKey) return false;
            await this._ensureDataRuntime();
            return await this._clearDataCache();
        }
        async _fetchData(...args) {
            if (!args[0]) return;
            await this._ensureDataRuntime();
            return await this._fetchData(...args);
        }
        async _triggerHook(hookName, detail = {}) {
            if (settings.hooks && typeof settings.hooks[hookName] === 'function') {
                const cleanupEpoch = this._cleanupEpoch;
                // Guard the trigger hook operation against runtime failures
                try {
                    const cleanup = await settings.hooks[hookName].call(this, {
                        el: this,
                        root: this._root,
                        props: this.$props,
                        ...detail
                    });
                    if (typeof cleanup === 'function') {
                        if (cleanupEpoch === this._cleanupEpoch && this._state !== 'destroyed') this._addCleanup(cleanup);
                        else cleanup();
                    }
                    return cleanup;
                } catch (error) {
                    throw toACLLoadError(error, {
                        code: 'ACL_HOOK_FAILED',
                        phase: 'hook'
                    });
                }
            }
        }
    };
};
// Own safe rendering and activate transformations only for matching content
export const withComponentRendering = (Base, { AlpineComponentLoader, settings, tagName, internalObservedAttrs })=>{
    return class extends Base {
        // Run application hooks without delaying the owning lifecycle phase
        _runHookDetached(hookName, detail = {}) {
            void this._triggerHook(hookName, detail).catch((error)=>{
                // Handle the rejected operation
                AlpineComponentLoader._report('error', `[ACL] ${hookName} hook failed for <${tagName}>`, error, {
                    tagName,
                    phase: 'hook',
                    hook: hookName
                });
                this._dispatchAcl('error', {
                    error,
                    phase: 'hook',
                    hook: hookName
                });
            });
        }
        // Activate shadow stylesheet support when external CSS is configured
        async _appendShadowExternalStyles(signal = null) {
            const { appendShadowExternalStyles } = await AlpineComponentLoader._loadModule('./component/asset-controller.js');
            return await appendShadowExternalStyles(this, settings, signal);
        }
        // Activate external assets on explicit component demand
        async _loadExternalDependencies(signal = null) {
            const { loadExternalDependencies } = await AlpineComponentLoader._loadModule('./component/asset-controller.js');
            return await loadExternalDependencies(settings, signal, AlpineComponentLoader);
        }
        // Capture consumer nodes before loading UI or asynchronous work replaces them
        _captureLightSlots() {
            this._originalLightDom ||= document.createDocumentFragment();
            this._lightSlotNodes ||= new Set();
            if (!this._hasRenderedContent) {
                // Keep original consumer nodes while excluding server-rendered content
                for (const node of Array.from(this.childNodes)){
                    if (this._ssrLightNodes?.has(node)) continue;
                    if (node.nodeType === 1 && (node.hasAttribute('data-acl-placeholder') || node.hasAttribute('data-acl-loading'))) {
                        node.remove();
                        continue;
                    }
                    if (node.nodeType === 1 && node.hasAttribute('data-acl-form-proxy')) continue;
                    this._lightSlotNodes.add(node);
                    this._originalLightDom.appendChild(node);
                }
            }
            return null;
        }
        // Load required transformations concurrently and commit them in render order
        async _renderSafe(content, lightSlots) {
            const signal = this._loadAbortController?.signal, generation = this._loadGeneration;
            // Prevent stale optional imports from committing DOM after cancellation
            const ensureCurrent = ()=>{
                if (signal?.aborted || generation !== this._loadGeneration || AlpineComponentLoader._disposed) throw new ACLLoadError('Rendering was canceled.', {
                    code: 'ACL_LOAD_CANCELED',
                    phase: 'render'
                });
            };
            const { applySanitizer, cloneParsedFragment } = await AlpineComponentLoader._loadModule('./rendering.js');
            let rootNode;
            // Parse string to DOM if needed, otherwise clone fragment
            if (typeof content === 'string') {
                rootNode = cloneParsedFragment(content, settings);
            } else rootNode = content.cloneNode(true);
            rootNode = await applySanitizer(rootNode, settings, {
                el: this,
                root: this._root,
                props: this.$props,
                tagName
            });
            const needsStyles = !settings.stripStyles && (rootNode.querySelector('style') || settings.shadow && settings.sharedStyleSheets.length), needsSlots = !settings.shadow && Boolean(rootNode.querySelector('slot')), needsScripts = settings.executeScripts && Boolean(rootNode.querySelector('script')), [styles, slots, scriptRuntime] = await Promise.all([
                needsStyles ? AlpineComponentLoader._loadModule('./component/styles.js') : null,
                needsSlots ? AlpineComponentLoader._loadModule('./component/slots.js') : null,
                needsScripts ? AlpineComponentLoader._loadModule('./component/scripts.js') : null
            ]);
            ensureCurrent();
            if (styles) await styles.transformStyles(rootNode, this, settings, AlpineComponentLoader);
            else if (settings.stripStyles) rootNode.querySelectorAll('style').forEach((node)=>node.remove());
            const scripts = scriptRuntime ? scriptRuntime.prepareScripts(rootNode) : [];
            // Remove scripts unless execution is explicitly enabled
            if (!scriptRuntime) rootNode.querySelectorAll('script').forEach((node)=>node.remove());
            if (slots) {
                if (!this._slotsRuntime) {
                    const controller = slots.withSlots(class {
                    });
                    // Install projection methods on the owning component instance
                    for (const name of Reflect.ownKeys(controller.prototype)){
                        if (name !== 'constructor') Object.defineProperty(this, name, Object.getOwnPropertyDescriptor(controller.prototype, name));
                    }
                    this._slotsRuntime = true;
                }
                slots.projectSlots(rootNode, this._captureLightSlots());
            }
            ensureCurrent();
            // Move nodes to component root
            this._installAlpinePropsScope();
            const rootChildren = Array.from(rootNode.childNodes);
            rootChildren.forEach((node)=>{
                // Process the current item
                this._exposePropsToNode(node);
            });
            this._root.append(...rootChildren);
            styles?.finishStyles(this);
            this._hasRenderedContent = true;
            // Append scripts to trigger execution
            this._root.append(...scripts);
        }
        // Forward configured component events with independent cleanup ownership
        _setupEventForwarding() {
            this._forwardEventCleanups?.forEach(// Process the current item
            (cleanup)=>cleanup());
            this._forwardEventCleanups = null;
            settings.events.forward.forEach((eventRule)=>{
                // Redispatch the configured event name without reprocessing forwarded events
                const handler = (e)=>{
                    this.dispatchEvent(new CustomEvent(eventRule.as, {
                        bubbles: eventRule.bubbles,
                        composed: eventRule.composed,
                        detail: e.detail
                    }));
                };
                this._root.addEventListener(eventRule.from, handler);
                (this._forwardEventCleanups ||= []).push(// Capture the pushed value
                ()=>this._root.removeEventListener(eventRule.from, handler));
            });
        }
        _updateProp(name, value) {
            // Skip loader internals, they are handled separately
            if (internalObservedAttrs.has(name)) return;
            // Read the declared prop configuration for this attribute
            const configDef = settings.attributes[name];
            // Normalize object and constructor prop definitions
            const type = configDef && configDef.type ? configDef.type : configDef, required = (configDef && configDef.required) === true, nullable = (configDef && configDef.nullable) === true, coerce = configDef && typeof configDef.coerce === 'function' ? configDef.coerce : null, validator = configDef && configDef.validator ? configDef.validator : null, configuredDefault = configDef && hasOwn(configDef, 'default') ? configDef.default : undefined, getDefaultValue = ()=>cloneRuntimeValue(typeof configuredDefault === 'function' ? configuredDefault.call(this) : configuredDefault), options = configDef && configDef.options ? configDef.options : null, schema = configDef && configDef.schema ? configDef.schema : null;
            // Handle null/undefined values
            if (value === null || value === undefined) {
                if (configuredDefault !== undefined) {
                    this.$props[name] = getDefaultValue();
                    return;
                }
                if (required) this._reportPropIssue(`[ACL] Missing required prop "${name}" on <${tagName}>.`);
                if (nullable) {
                    this.$props[name] = null;
                    return;
                }
                this._applyTypeDefault(name, type);
                return;
            }
            // Cast string attributes into configured runtime types
            let parsedValue;
            if (nullable && value === 'null') {
                parsedValue = null;
            } else if (coerce) {
                parsedValue = coerce.call(this, value, {
                    el: this,
                    props: this.$props,
                    name,
                    definition: configDef
                });
            } else if (type === Boolean) {
                parsedValue = value !== null && value !== 'false';
            } else if (type === Number) {
                const num = Number(value);
                if (isNaN(num)) {
                    this._reportPropIssue(`[ACL] Attribute "${name}" must be a number on <${tagName}>.`);
                    parsedValue = 0;
                } else parsedValue = num;
            } else if (type === Object || type === Array) {
                if (!value) parsedValue = type === Array ? [] : {};
                else {
                    const invalid = Symbol('invalid-json');
                    parsedValue = parseJson(value, invalid);
                    if (parsedValue === invalid) {
                        this._reportPropIssue(`[ACL] Attribute "${name}" contains invalid JSON on <${tagName}>.`);
                        parsedValue = type === Array ? [] : {};
                    }
                }
                if (type === Array && !Array.isArray(parsedValue) || type === Object && (typeof parsedValue !== 'object' || Array.isArray(parsedValue) || parsedValue === null)) {
                    this._reportPropIssue(`[ACL] Attribute "${name}" does not match its declared type on <${tagName}>.`);
                    parsedValue = type === Array ? [] : {};
                }
            } else {
                parsedValue = value;
            }
            if (parsedValue === null && nullable) {
                this.$props[name] = null;
                return;
            }
            // Validate against enum-style allowed values
            if (options && Array.isArray(options) && !options.includes(parsedValue)) {
                this._reportPropIssue(`[ACL] Value "${parsedValue}" is not a valid option for prop "${name}" on <${tagName}>. Allowed: ${options.join(', ')}.`);
                if (configuredDefault !== undefined) this.$props[name] = getDefaultValue();
                else if (this.$props[name] === undefined) this._applyTypeDefault(name, type);
                return;
            }
            // Validate nested object shapes
            if (schema && type === Object && typeof parsedValue === 'object' && parsedValue !== null) {
                const schemaError = validateSchemaShape(parsedValue, schema, name);
                if (schemaError) {
                    this._reportPropIssue(`[ACL] Schema validation failed for prop "${name}" on <${tagName}>: ${schemaError}`);
                    if (configuredDefault !== undefined) this.$props[name] = getDefaultValue();
                    else if (this.$props[name] === undefined) this._applyTypeDefault(name, type);
                    return;
                }
            }
            // Validate with a custom predicate when provided
            if (validator && typeof validator === 'function') {
                if (!validator(parsedValue)) {
                    this._reportPropIssue(`[ACL] Validation failed for prop "${name}" on <${tagName}>.`);
                    // Prefer the configured default after validation failure
                    if (configuredDefault !== undefined) this.$props[name] = getDefaultValue();
                    else if (this.$props[name] === undefined) this._applyTypeDefault(name, type);
                    // Keep the previous valid value when an update fails validation
                    return;
                }
            }
            this.$props[name] = parsedValue;
        }
    };
};
// Manage props and initialization without activating optional data behavior
export const withComponentState = (Base, { AlpineComponentLoader, settings, tagName, observedAttrs })=>{
    return class extends Base {
        // Initialize missing public props using their declared types
        _applyTypeDefault(name, type) {
            if (type === Number) this.$props[name] = 0;
            else if (type === Boolean) this.$props[name] = false;
            else if (type === Array) this.$props[name] = [];
            else if (type === Object) this.$props[name] = {};
            else this.$props[name] = '';
        }
        // Synchronize observed public attributes into props
        _syncAllAttributes() {
            observedAttrs.forEach(// Process the current item
            (name)=>this._updateProp(name, this.getAttribute(name)));
        }
        // Drain and release activated persistence subscriptions
        async _releasePersistence(flush = true) {
            const dispose = this._persistenceDispose, persistence = this.$props.$persistence;
            this._persistenceDispose = null;
            if (!dispose) return;
            // Guard the release persistence operation against runtime failures
            try {
                await dispose({
                    flush
                });
            } catch  {
            // Persistence operations report typed errors before teardown continues
            } finally{
                if (this.$props.$persistence === persistence) delete this.$props.$persistence;
            }
        }
        // Activate persistence only when a store is requested
        async _initPersistence() {
            if (!(this.getAttribute('persist') || settings.persist)) return;
            const { initializeComponentPersistence } = await AlpineComponentLoader._loadModule('./component/persistence-controller.js');
            return await initializeComponentPersistence(this, {
                AlpineComponentLoader,
                settings,
                tagName
            });
        }
        // Initialize Alpine now or await its availability with cancellation
        async _initAlpine() {
            if (window.Alpine) return this._finishAlpineInit();
            // Bind to alpine:init event + timeout if it is not fired
            return new Promise((resolve, reject)=>{
                // Settle the asynchronous operation
                let settled = false, timeoutId = null;
                // Release both readiness paths and clear externally callable cancellation ownership
                const cleanup = ()=>{
                    clearTimeout(timeoutId);
                    document.removeEventListener('alpine:init', finish);
                    if (this._alpineWaitCleanup === cancel) this._alpineWaitCleanup = null;
                };
                // Initialize Alpine once whether readiness comes from the event or timeout check
                const finish = async ()=>{
                    if (settled) return;
                    settled = true;
                    cleanup();
                    // Guard the init alpine operation against runtime failures
                    try {
                        await this._finishAlpineInit();
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                }, // Reject a pending Alpine wait when reload or teardown supersedes it
                cancel = (reason = 'Canceled')=>{
                    if (settled) return;
                    settled = true;
                    cleanup();
                    reject(new ACLLoadError(`Alpine initialization ${String(reason).toLowerCase()}.`, {
                        code: 'ACL_ALPINE_INIT_CANCELED',
                        phase: 'alpine'
                    }));
                };
                this._alpineWaitCleanup = cancel;
                document.addEventListener('alpine:init', finish);
                // Fail initialization when Alpine never appears
                timeoutId = setTimeout(()=>{
                    // Run the scheduled delayed task
                    if (window.Alpine) void finish();
                    else {
                        settled = true;
                        cleanup();
                        reject(new Error('Alpine.js not found (Timeout)'));
                    }
                }, 5000);
            });
        }
        async _finishAlpineInit() {
            // Bind Alpine store if provided
            const storeName = this.getAttribute('bind-store') || settings.bindStore;
            if (storeName) {
                let store = window.Alpine.store(storeName);
                if (store) {
                    // Merge Alpine store with provided $props
                    if (this.$props && typeof this.$props === 'object') Object.keys(this.$props).filter(// Select matching items
                    (key)=>store[key] === undefined).forEach(// Process the current item
                    (key)=>store[key] = this.$props[key]);
                    // Set $props to Alpine store
                    this.$props = store;
                } else {
                    AlpineComponentLoader._report('error', `[ACL] Store "${storeName}" not found. Falling back to local state.`, null, {
                        tagName,
                        phase: 'store'
                    });
                    this.$props = window.Alpine.reactive(this.$props || {});
                }
            } else {
                // Initialize Alpine Store
                this.$props = window.Alpine.reactive(this.$props || {});
            }
            // Initialize persistence
            await this._initPersistence();
            // Track reactive updates while excluding $lastUpdated to prevent an infinite effect loop
            const updateRunner = window.Alpine.effect(()=>{
                // Synchronize reactive state
                if (this.$props) {
                    Object.keys(this.$props).forEach((k)=>{
                        // Process the current item
                        if (k !== '$lastUpdated') void this.$props[k];
                    });
                    this.$props.$lastUpdated = Date.now();
                }
            });
            if (updateRunner && window.Alpine.release) this._addCleanup(// Register cleanup work
            ()=>window.Alpine.release(updateRunner));
            // Refresh expandos after store binding and attach a late Alpine scope if needed
            this._installAlpinePropsScope();
            if (this._root && this._root.children) Array.from(this._root.children).forEach((node)=>{
                // Process the current item
                this._exposePropsToNode(node);
            });
            // We wrap in nextTick to ensure the DOM is settled before Alpine scans it
            return await new Promise((resolve)=>{
                // Settle the asynchronous operation
                window.Alpine.nextTick(()=>{
                    // Continue after the Alpine DOM update
                    if (this._root) window.Alpine.initTree(this._root);
                    resolve();
                });
            });
        }
        // Render the configured safe error presentation
        _renderError(msg) {
            const container = document.createElement('div');
            container.style.cssText = toCssString(settings.errorCss);
            container.setAttribute('role', 'alert');
            const header = document.createElement('strong');
            header.textContent = `Load Failed: <${tagName}>`;
            const code = document.createElement('code');
            code.textContent = msg;
            code.style.display = 'block';
            code.style.marginTop = '4px';
            container.appendChild(header);
            container.appendChild(code);
            if (settings.shadow) this._root.replaceChildren(container);
            else this._root.appendChild(container);
        }
        // Dispatch the compatibility lifecycle event
        _dispatch(eventName) {
            this.dispatchEvent(new CustomEvent(eventName, {
                bubbles: true,
                composed: true,
                detail: {
                    props: this.$props
                }
            }));
        }
        // Publish the structured lifecycle event and observability record
        _dispatchAcl(eventName, detail = {}) {
            const eventDetail = createLifecycleEventDetail(this, tagName, detail);
            AlpineComponentLoader._observability.emit(eventName, eventDetail, {
                tagName
            });
            this.dispatchEvent(new CustomEvent(`acl:${eventName}`, {
                bubbles: true,
                composed: true,
                detail: eventDetail
            }));
        }
        // Resolve template content with this component load signal
        async _resolveContent(source, signal = this._loadAbortController?.signal) {
            const content = await AlpineComponentLoader.loadTemplate(source, settings, {
                signal
            }), info = AlpineComponentLoader.getTemplateLoadInfo(source, settings);
            this._aclDebug.templateCacheHit = info?.cacheHit ?? null;
            this._aclDebug.templateCacheKey = info?.cacheKey ?? null;
            this._aclDebug.templateSource = source;
            return content;
        }
        // Prune obsolete persistent buckets through the owning loader
        async _pruneCache() {
            return await AlpineComponentLoader.pruneCaches(settings._templateCachePrefix, settings._templateCacheKey);
        }
    };
};
// Own component load, reload, fallback, and cancellation phases
export const withComponentLoading = (Base, { AlpineComponentLoader, settings, tagName, contentSource, resolveSource })=>{
    return class extends Base {
        async _scheduleInitialization(run, signal) {
            // Load scheduling only when the application explicitly enables its budget
            const { scheduleComponentInitialization } = await AlpineComponentLoader._loadModule('./initialization-scheduler.js');
            return scheduleComponentInitialization(AlpineComponentLoader, this, settings, run, signal);
        }
        // Return existing rendering work directly on the unscheduled path
        _renderInitialization(content, lightSlots, hydrating, signal) {
            if (hydrating) return this._hydrateContent(signal);
            if (!settings.shadow) lightSlots = this._captureLightSlots();
            this._root.replaceChildren();
            if (settings.shadow && settings.externalCss.length) // Finish shadow asset loading before rendering the component
            return this._appendShadowExternalStyles(signal).then(()=>this._renderSafe(content, lightSlots));
            return this._renderSafe(content, lightSlots);
        }
        // Sanitize cloned server markup while retaining per-instance policies
        async _hydrateContent(loadSignal) {
            const { hydrateContent } = await AlpineComponentLoader._loadModule('./component/hydration.js');
            loadSignal.throwIfAborted();
            return hydrateContent(this, settings, tagName, AlpineComponentLoader, loadSignal);
        }
        // Invalidate stale work and start a new component load generation
        async reload({ preserveState = false, clearTemplate = true, clearData = true, reason = 'manual' } = {}) {
            const reloadGeneration = ++this._reloadGeneration, startedAt = performance.now();
            AlpineComponentLoader._report('info', `[ACL] Reloading <${tagName}>...`, null, {
                tagName,
                phase: 'hmr'
            });
            this._dispatchAcl('dev-reload-start', {
                reason,
                preserveState
            });
            let reloadSnapshot = null, customSnapshot = null;
            if (preserveState) {
                const { captureReloadState } = await AlpineComponentLoader._loadModule('./hmr.js');
                reloadSnapshot = captureReloadState(this, this._root, this.$props);
                if (typeof settings.hooks?.captureState === 'function') {
                    // Guard the reload operation against runtime failures
                    try {
                        customSnapshot = await settings.hooks.captureState.call(this, {
                            el: this,
                            root: this._root,
                            props: this.$props,
                            reason
                        });
                    } catch (error) {
                        AlpineComponentLoader._report('warn', `[ACL] captureState hook failed for <${tagName}>`, error, {
                            tagName,
                            phase: 'hmr'
                        });
                    }
                }
            }
            this._cancelDeferredLoad();
            this._cancelAlpineWait('Reloaded');
            this._stopPolling();
            this._detachPollingSignals();
            this._loadGeneration++;
            this._loadAbortController?.abort('Reloaded');
            this._loadAbortController = null;
            this._fetchGeneration++;
            this._fetchAbortController?.abort('Reloaded');
            this._fetchAbortController = null;
            const activeLoad = this._activeLoadPromise;
            if (activeLoad) await activeLoad.catch(()=>{
            // Drain the superseded load before starting the replacement
            });
            if (reloadGeneration !== this._reloadGeneration) return;
            // Clear caches specific to this component's source/data endpoint
            await Promise.all([
                clearData ? this._clearDataCache() : Promise.resolve(true),
                clearTemplate ? this._clearTemplateCache() : Promise.resolve(true)
            ]);
            if (reloadGeneration !== this._reloadGeneration) return;
            if (!settings.shadow) this._captureLightSlots();
            this._slotObserver?.disconnect();
            this._slotObserver = null;
            await this._releasePersistence(true);
            if (this._root && window.Alpine && this._state === 'ready') window.Alpine.destroyTree(this._root);
            this._runCleanups();
            // Reset state
            this._setLifecycleState('idle');
            this.$props.$loading = false;
            this.$props.$error = null;
            if (clearData) this._clearFetchedData(this._getDataTarget());
            if (reloadSnapshot) {
                const { restoreReloadProps } = await AlpineComponentLoader._loadModule('./hmr.js');
                restoreReloadProps(this.$props, reloadSnapshot);
            }
            this._skipNextDataFetch = preserveState && !clearData;
            // Re-trigger load
            if (this.isConnected) await this._load();
            if (reloadGeneration === this._reloadGeneration) {
                if (reloadSnapshot) {
                    // Guard the reload operation against runtime failures
                    try {
                        const { restoreReloadDomState } = await AlpineComponentLoader._loadModule('./hmr.js');
                        restoreReloadDomState(this, this._root, reloadSnapshot);
                        if (typeof settings.hooks?.restoreState === 'function') {
                            await settings.hooks.restoreState.call(this, customSnapshot, {
                                el: this,
                                root: this._root,
                                props: this.$props,
                                reason
                            });
                        }
                    } catch (error) {
                        AlpineComponentLoader._report('error', `[ACL] restoreState failed for <${tagName}>`, error, {
                            tagName,
                            phase: 'hmr'
                        });
                        this._dispatchAcl('error', {
                            error: toACLLoadError(error, {
                                code: 'ACL_HMR_RESTORE_FAILED',
                                phase: 'hmr'
                            }),
                            phase: 'hmr'
                        });
                        await this.reload({
                            preserveState: false,
                            clearTemplate: false,
                            clearData: true,
                            reason: 'hmr-fallback'
                        });
                        return;
                    }
                }
                this._startPolling();
                this._dispatchAcl('dev-reload-end', {
                    reason,
                    preserveState,
                    restored: Boolean(reloadSnapshot),
                    duration: performance.now() - startedAt
                });
            }
        }
        // Retry the data source only when one exists
        async retry() {
            const dataSrc = this.getAttribute('data-src') || settings.data.src;
            if (!dataSrc) return;
            return await this._fetchData(dataSrc, true);
        }
        // Release this component load and its pending activations
        cancel(reason = 'Canceled by component consumer') {
            this._cancelDeferredLoad();
            this._cancelAlpineWait(reason);
            this._loadGeneration++;
            this._loadAbortController?.abort(reason);
            this._loadAbortController = null;
            this._fetchGeneration++;
            this._fetchAbortController?.abort(reason);
            this._fetchAbortController = null;
            this.$props.$loading = false;
            if (this._state !== 'ready') this._setLifecycleState('idle');
            this._dispatchAcl('loadend', {
                canceled: true,
                reason
            });
        }
        // Render configured loading content with the same load ownership
        async _renderLoading() {
            const loadingSource = this.getAttribute('loading-template') || settings.loadingTemplate, loadingHtml = this.getAttribute('loading-html') || settings.loadingHtml;
            if (!loadingSource && !loadingHtml) return;
            const { applySanitizer, cloneParsedFragment } = await AlpineComponentLoader._loadModule('./rendering.js');
            // Guard the render loading operation against runtime failures
            try {
                let content;
                if (loadingHtml) {
                    content = loadingHtml;
                } else if (loadingSource instanceof HTMLTemplateElement || typeof loadingSource === 'string' && loadingSource.startsWith('#')) {
                    content = await AlpineComponentLoader.loadTemplate(loadingSource, settings, {
                        signal: this._loadAbortController?.signal
                    });
                } else {
                    content = await AlpineComponentLoader.loadTemplate(resolveSource(loadingSource), settings, {
                        signal: this._loadAbortController?.signal
                    });
                }
                let fragment = typeof content === 'string' ? cloneParsedFragment(content, settings) : content.cloneNode(true);
                fragment = await applySanitizer(fragment, settings, {
                    el: this,
                    root: this._root,
                    props: this.$props,
                    tagName
                });
                this._installAlpinePropsScope();
                Array.from(fragment.childNodes).forEach((node)=>{
                    // Process the current item
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        node.setAttribute('data-acl-loading', '');
                        if (!node.hasAttribute('role')) node.setAttribute('role', 'status');
                        if (!node.hasAttribute('aria-live')) node.setAttribute('aria-live', 'polite');
                    }
                    this._exposePropsToNode(node);
                });
                this._root.replaceChildren(fragment);
            } catch (e) {
                AlpineComponentLoader._report('warn', `[ACL] Failed to render loading state for <${tagName}>`, e, {
                    tagName,
                    phase: 'render'
                });
            }
        }
        // Coalesce active loads and preserve asynchronous completion results
        _load() {
            if (this._state === 'ready') return Promise.resolve();
            if (this._state === 'loading') return this._activeLoadPromise || Promise.resolve();
            const operation = this._performLoad();
            this._activeLoadPromise = operation;
            // Clear load ownership only if no newer load has replaced this promise
            const clear = ()=>{
                // Clear
                if (this._activeLoadPromise === operation) this._activeLoadPromise = null;
            };
            void operation.then(clear, clear);
            return operation;
        }
        // Execute the component pipeline while checking load generation ownership
        async _performLoad() {
            const startMark = performance.now(), generation = ++this._loadGeneration, requestId = `${tagName}:component:${generation}`, loadController = new AbortController(), loadSignal = loadController.signal, hydrating = this._ssrHydration;
            this._loadAbortController?.abort('Superseded');
            this._loadAbortController = loadController;
            this._unmounted = false;
            // Guard the perform load operation against runtime failures
            try {
                // Lock loading state
                this._setLifecycleState('loading');
                // Preserve consumer light-DOM nodes before loading UI can replace the host content
                let lightSlots = settings.shadow ? null : this._captureLightSlots();
                // Emit beforeMount
                this._dispatchAcl('loadstart', {
                    phase: 'component',
                    source: contentSource,
                    requestId,
                    startedAt: startMark
                });
                if (hydrating) this._dispatchAcl('hydrationstart', {
                    phase: 'hydrate',
                    requestId,
                    startedAt: startMark
                });
                await this._triggerHook('beforeMount');
                // Render optional loading UI while template/data work completes
                if (!hydrating) await this._renderLoading();
                if (generation !== this._loadGeneration) return;
                // Load external dependencies, get content, and data if needed
                const dataSrc = this.getAttribute('data-src') || settings.data.src, fallbackSource = this.getAttribute('fallback') || settings.fallback, skipDataFetch = this._skipNextDataFetch, promises = [
                    settings.externalCss.length || settings.externalScripts.length ? this._loadExternalDependencies(loadSignal) : Promise.resolve(),
                    hydrating ? Promise.resolve(null) : this._resolveContent(contentSource),
                    dataSrc && !skipDataFetch ? this._fetchData(dataSrc, false, {
                        throwOnError: Boolean(fallbackSource) && !this._hasLoadedOnce
                    }) : Promise.resolve()
                ];
                this._skipNextDataFetch = false;
                // Get content from the resolved source
                const content = (await Promise.all(promises))[1];
                if (generation !== this._loadGeneration) return;
                await (settings.hydrationScheduler ? this._scheduleInitialization(// Queue the render phase only when scheduling is enabled
                ()=>this._renderInitialization(content, lightSlots, hydrating, loadSignal), loadSignal) : this._renderInitialization(content, lightSlots, hydrating, loadSignal));
                if (generation !== this._loadGeneration) return;
                // Setup event bubbling for Shadow DOM
                if (settings.shadow && settings.events.forward.length > 0) this._setupEventForwarding();
                // Start observing Light DOM for dynamic updates
                if (!settings.shadow) this._initSlotObserver();
                // Initialize Alpine
                await (settings.hydrationScheduler ? this._scheduleInitialization(()=>this._initAlpine(), loadSignal) : this._initAlpine());
                if (generation !== this._loadGeneration) return;
                // Stop timer and store metrics
                this._perf = {
                    duration: performance.now() - startMark
                };
                // Mark success and unlock
                this._hasLoadedOnce = true;
                this._setLifecycleState('ready');
                // Notify consumers after Alpine initialization completes
                this._dispatch('mount');
                await this._triggerHook('mounted');
                // Notify consumers that the component finished loading
                this._dispatch('loaded');
                await this._triggerHook('loaded');
                if (hydrating) {
                    this._ssrHydration = false;
                    this.setAttribute('data-acl-hydration-state', 'hydrated');
                    this.setAttribute('data-acl-hydrated', '');
                    this._dispatchAcl('hydrationend', {
                        phase: 'hydrate',
                        duration: performance.now() - startMark,
                        requestId
                    });
                }
                this._dispatchAcl('loadend', {
                    phase: 'component',
                    duration: this._perf.duration,
                    fallback: false,
                    requestId,
                    endedAt: performance.now()
                });
            } catch (err) {
                if (generation !== this._loadGeneration || loadSignal.aborted) return;
                AlpineComponentLoader._report('error', `[ACL] <${tagName}>`, err, {
                    tagName,
                    phase: 'component'
                });
                const loadError = toACLLoadError(err, {
                    code: 'ACL_COMPONENT_LOAD_FAILED',
                    phase: 'component'
                });
                if (hydrating) this.setAttribute('data-acl-hydration-state', 'error');
                if (hydrating) this._dispatchAcl('hydrationerror', {
                    error: loadError,
                    phase: 'hydrate',
                    requestId
                });
                this._dispatchAcl('error', {
                    error: loadError,
                    phase: loadError.phase
                });
                // Unlock on error so callers can retry
                this._setLifecycleState('idle');
                const fallbackSource = this.getAttribute('fallback') || settings.fallback;
                if (fallbackSource) {
                    // Guard the perform load operation against runtime failures
                    try {
                        // Clear failed state
                        this._root.replaceChildren();
                        // Render fallback; pass null for slots as fallback usually doesn't slot user content
                        await this._renderSafe(await this._resolveContent(fallbackSource), null);
                        // Initialize Alpine so fallback content can be interactive
                        await (settings.hydrationScheduler ? this._scheduleInitialization(()=>this._initAlpine(), loadSignal) : this._initAlpine());
                        // Stop timer and store metrics
                        this._perf = {
                            duration: performance.now() - startMark
                        };
                        // Mark success and unlock
                        this._hasLoadedOnce = true;
                        this._setLifecycleState('ready');
                        // Dispatch 'loaded' event
                        this._dispatch('loaded');
                        await this._triggerHook('loaded');
                        this._dispatchAcl('loadend', {
                            phase: 'component',
                            duration: this._perf.duration,
                            fallback: true,
                            error: loadError,
                            requestId,
                            endedAt: performance.now()
                        });
                        // Stop here, do not render default error
                        return;
                    } catch (fallbackErr) {
                        AlpineComponentLoader._report('error', `[ACL] <${tagName}> Fallback Failed:`, fallbackErr, {
                            tagName,
                            phase: 'fallback'
                        });
                        // Show the original error when fallback rendering also fails
                        this._renderError(`Load Failed: ${err.message}. (Fallback also failed)`);
                    }
                } else {
                    // Render the default error UI
                    this._renderError(err.message);
                }
                this._dispatchAcl('loadend', {
                    phase: 'component',
                    error: loadError,
                    fallback: false
                });
            } finally{
                if (this._loadAbortController === loadController) this._loadAbortController = null;
            }
        }
    };
};
