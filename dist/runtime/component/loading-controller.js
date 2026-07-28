// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Propagate jsDelivr's generated minified suffix to package-owned dependencies
const currentModuleUrl = new URL(import.meta.url), isMinifiedModule = currentModuleUrl.pathname.endsWith('.min.js'), resolveLocalModule = (specifier)=>{
    const resolved = new URL(isMinifiedModule ? specifier.replace(/\.js$/, '.min.js') : specifier, currentModuleUrl);
    if (currentModuleUrl.searchParams.has('acl-instance')) resolved.searchParams.set('acl-instance', currentModuleUrl.searchParams.get('acl-instance'));
    return resolved.href;
}, importLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), importDeferredLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), { ACLLoadError, toACLLoadError } = await importLocalModule('../errors.js');
let hmrModulePromise = null, renderingModulePromise = null;
// Load optional runtime support only when its corresponding behavior is activated
const loadRuntimeModule = (specifier, getCurrent, setCurrent)=>{
    const current = getCurrent();
    if (current) return current;
    const operation = importDeferredLocalModule(specifier).catch((error)=>{
        // Evict failed imports so a later use can retry the optional capability
        if (getCurrent() === operation) setCurrent(null);
        throw new ACLLoadError('Unable to load an optional runtime module.', {
            code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
            phase: 'runtime-import',
            cause: error,
            retryable: true
        });
    });
    setCurrent(operation);
    return operation;
}, loadHmrModule = ()=>loadRuntimeModule('../hmr.js', ()=>hmrModulePromise, (value)=>{
        hmrModulePromise = value;
    }), loadRenderingModule = ()=>loadRuntimeModule('../rendering.js', ()=>renderingModulePromise, (value)=>{
        renderingModulePromise = value;
    });
// Private custom-element controller with definition context supplied by the facade
export const withComponentLoading = (Base, { AlpineComponentLoader, settings, tagName, contentSource, resolveSource })=>{
    return class extends Base {
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
                const { captureReloadState } = await loadHmrModule();
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
                const { restoreReloadProps } = await loadHmrModule();
                restoreReloadProps(this.$props, reloadSnapshot);
            }
            this._skipNextDataFetch = preserveState && !clearData;
            // Re-trigger load
            if (this.isConnected) await this._load();
            if (reloadGeneration === this._reloadGeneration) {
                if (reloadSnapshot) {
                    // Guard the reload operation against runtime failures
                    try {
                        const { restoreReloadDomState } = await loadHmrModule();
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
        async retry() {
            const dataSrc = this.getAttribute('data-src') || settings.data.src;
            if (!dataSrc) return;
            return await this._fetchData(dataSrc, true);
        }
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
        async _renderLoading() {
            const loadingSource = this.getAttribute('loading-template') || settings.loadingTemplate, loadingHtml = this.getAttribute('loading-html') || settings.loadingHtml;
            if (!loadingSource && !loadingHtml) return;
            const { applySanitizer, cloneParsedFragment } = await loadRenderingModule();
            // Guard the render loading operation against runtime failures
            try {
                let content;
                if (loadingHtml) {
                    content = loadingHtml;
                } else if (loadingSource instanceof HTMLTemplateElement || typeof loadingSource === 'string' && loadingSource.startsWith('#')) {
                    content = await AlpineComponentLoader.loadTemplate(loadingSource, settings);
                } else {
                    content = await AlpineComponentLoader.loadTemplate(resolveSource(loadingSource), settings);
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
                if (hydrating) {
                    const { applySanitizer } = await loadRenderingModule();
                    if (settings.externalCss.length) await this._appendShadowExternalStyles(loadSignal);
                    const fragment = document.createDocumentFragment();
                    Array.from(this._root.childNodes).forEach(// Process the current item
                    (node)=>fragment.appendChild(node.cloneNode(true)));
                    const sanitized = await applySanitizer(fragment, settings, {
                        el: this,
                        root: this._root,
                        props: this.$props,
                        tagName
                    });
                    this._installAlpinePropsScope();
                    Array.from(sanitized.childNodes).forEach((node)=>this._exposePropsToNode(node));
                    this._root.replaceChildren(sanitized);
                } else {
                    // Capture existing children for slotting if using Light DOM
                    if (!settings.shadow) lightSlots = this._captureLightSlots();
                    // Strict clear of root element
                    this._root.replaceChildren();
                    // Inject CSS links into Shadow DOM for local style application
                    if (settings.shadow && settings.externalCss.length) await this._appendShadowExternalStyles(loadSignal);
                    // Render content safely
                    await this._renderSafe(content, lightSlots);
                }
                if (generation !== this._loadGeneration) return;
                // Setup event bubbling for Shadow DOM
                if (settings.shadow && settings.events.forward.length > 0) this._setupEventForwarding();
                // Start observing Light DOM for dynamic updates
                if (!settings.shadow) this._initSlotObserver();
                // Initialize Alpine
                await this._initAlpine();
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
                if (generation !== this._loadGeneration) return;
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
                        await this._initAlpine();
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
