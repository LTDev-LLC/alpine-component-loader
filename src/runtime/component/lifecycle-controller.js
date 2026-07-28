// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js',
    importLocalModule = (specifier) => import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)),
    [{ DATA_CACHE_BOUND_ATTRIBUTES, DATA_FETCH_ATTRIBUTES, DATA_POLL_ATTRIBUTES }, { applyLifecycleState }] =
        await Promise.all([importLocalModule('../data-options.js'), importLocalModule('../lifecycle.js')]);

// Private custom-element controller with definition context supplied by the facade
export const withComponentLifecycle = (
    Base,
    { AlpineComponentLoader, settings, tagName, contentSource, helpers, observedAttrs },
) => {
    class Component extends Base {
        constructor() {
            // Initialize class state
            super();

            // Seed public props and cache helper methods
            let _$props = {
                $data: null,
                $loading: false,
                $error: null,
                $lastUpdated: Date.now(),
                ...helpers(this),
                ...Object.fromEntries(
                    Object.keys(settings.attributes || {}).map(
                        // Transform the current item
                        (name) => [name, undefined],
                    ),
                ),
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
            const declarativeShadowTemplate =
                settings.shadow && !this.shadowRoot
                    ? Array.from(this.children || []).find(
                          // Find the matching item
                          (child) =>
                              child.localName === 'template' &&
                              child.hasAttribute('data-acl-ssr-shadow') &&
                              child.getAttribute('shadowrootmode') === 'open',
                      )
                    : null;
            this._root = settings.shadow ? this.shadowRoot || this.attachShadow({ mode: 'open' }) : this;
            if (declarativeShadowTemplate) {
                this._root.appendChild(declarativeShadowTemplate.content);
                declarativeShadowTemplate.remove();
            }
            const initialDataElement = Array.from(this.children || []).find(
                // Run this operation
                (child) => child.localName === 'script' && child.hasAttribute('data-acl-ssr-data'),
            );
            if (initialDataElement) {
                // Run this operation
                try {
                    const initialData = JSON.parse(initialDataElement.textContent || 'null'),
                        initialTarget = settings.data.target || '$data';
                    this.$props[initialTarget] = initialData;
                    this._skipNextDataFetch = true;
                } catch {
                    // Ignore malformed server data and allow the configured client fetch to recover
                }
                initialDataElement.remove();
            }
            this._ssrHydration = Boolean(
                this.hasAttribute('data-acl-ssr') &&
                this._root.childNodes.length &&
                this.getAttribute('data-acl-revision') === String(settings.templateRevision || ''),
            );
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
            return (this._aclDebugState ||= {
                tagName,
                source: contentSource,
                templateCacheHit: null,
                dataCacheHit: null,
                dataUrl: null,
                dataCacheSize: AlpineComponentLoader.getDataCacheSize(),
            });
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
            const host = this,
                scope = {},
                hadOwnDataStack = Object.prototype.hasOwnProperty.call(this, '_x_dataStack');
            Object.defineProperty(scope, '$props', {
                configurable: false,
                enumerable: true,
                get() {
                    // Follow the current reference after store binding or reactive wrapping
                    return host.$props;
                },
            });
            const removeScope = window.Alpine.addScopeToNode(this, scope),
                cleanup = () => {
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
                phase: 'props',
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
                AlpineComponentLoader._pruneDataFetchCache({ cacheMax: this._getDataFetchCacheMax() });
            } else this._updateProp(name, newVal);

            // Notify hooks after initialized components receive updates
            if (this._state === 'ready') {
                this._runHookDetached('updated', {
                    name,
                    oldVal,
                    newVal,
                });
            }
        }

        connectedCallback() {
            if (AlpineComponentLoader._disposed) {
                this.setAttribute('data-acl-disposed', '');
                this.dispatchEvent(
                    new CustomEvent('acl:error', {
                        bubbles: true,
                        composed: true,
                        detail: {
                            error: new Error('ACL_LOADER_DISPOSED'),
                            phase: 'lifecycle',
                        },
                    }),
                );
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
            this._disconnectTimeout = setTimeout(() => {
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
            const clear = () => {
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
                        hook: 'unmounted',
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
            if (isNaN(interval) || interval <= 0) return;
            if (!this.isConnected) return;
            this._attachPollingSignals();
            if (this._isPollingPaused()) return;

            // Start the next polling interval only while every pause condition is clear
            this._pollTimer = setTimeout(async () => {
                // Run the scheduled delayed task
                if (!this.isConnected) return;

                // Fetch data again
                const src = this.getAttribute('data-src') || settings.data.src;
                if (src && this._state === 'ready' && !this.$props.$loading && !this._isPollingPaused())
                    await this._fetchData(src, true);

                // Schedule next tick
                this._startPolling();
            }, interval);
        }

        _stopPolling() {
            if (this._pollTimer) {
                clearTimeout(this._pollTimer);
                this._pollTimer = null;
            }
        }

        _attachPollingSignals() {
            if (this._pollSignalCleanups?.length) return;
            // Restart polling only when every configured pause condition is clear
            const resume = () => {
                if (this.isConnected && !this._isPollingPaused()) this._startPolling();
            };
            if (this._getPollingPauseSetting('pause-polling-when-hidden', 'pauseWhenHidden')) {
                document.addEventListener('visibilitychange', resume);
                (this._pollSignalCleanups ||= []).push(
                    // Capture the pushed value
                    () => document.removeEventListener('visibilitychange', resume),
                );
            }
            if (this._getPollingPauseSetting('pause-polling-when-offline', 'pauseWhenOffline')) {
                window.addEventListener('online', resume);
                (this._pollSignalCleanups ||= []).push(
                    // Capture the pushed value
                    () => window.removeEventListener('online', resume),
                );
            }
            if (this._getPollingPauseSetting('pause-polling-when-offscreen', 'pauseWhenOffscreen')) {
                if ('IntersectionObserver' in window) {
                    this._pollIsIntersecting = false;
                    const observer = new IntersectionObserver((entries) => {
                        // Process intersection changes
                        const wasIntersecting = this._pollIsIntersecting,
                            isIntersecting = entries.some(
                                // Check the current item
                                (entry) => entry.target === this && entry.isIntersecting,
                            );
                        this._pollIsIntersecting = isIntersecting;
                        if (!isIntersecting) {
                            this._stopPolling();
                            return;
                        }
                        if (!wasIntersecting) resume();
                    });
                    this._pollIntersectionObserver = observer;
                    observer.observe(this);
                    (this._pollSignalCleanups ||= []).push(() => {
                        // Capture the pushed value
                        observer.disconnect();
                        if (this._pollIntersectionObserver === observer) this._pollIntersectionObserver = null;
                        this._pollIsIntersecting = true;
                    });
                } else this._pollIsIntersecting = true;
            }
        }

        _detachPollingSignals() {
            this._pollSignalCleanups?.forEach(
                // Process the current item
                (cleanup) => cleanup(),
            );
            this._pollSignalCleanups = null;
            this._pollIntersectionObserver = null;
            this._pollIsIntersecting = true;
        }

        _addCleanup(cleanup) {
            if (typeof cleanup !== 'function')
                return () => {
                    // Keep invalid cleanup registration harmless
                };
            (this._cleanups ||= []).push(cleanup);
            return () => {
                // Run the with component lifecycle operation
                const index = this._cleanups?.indexOf(cleanup) ?? -1;
                if (index >= 0) this._cleanups.splice(index, 1);
            };
        }

        _runCleanups() {
            this._forwardEventCleanups?.forEach(
                // Process the current item
                (cleanup) => cleanup(),
            );
            this._forwardEventCleanups = null;
            this._cleanupEpoch++;
            const cleanups = this._cleanups?.splice(0).reverse() || [];
            this._cleanups = null;
            cleanups.forEach((cleanup) => {
                // Process the current item
                try {
                    cleanup();
                } catch (e) {
                    AlpineComponentLoader._report('warn', `[ACL] Cleanup failed for <${tagName}>`, e, {
                        tagName,
                        phase: 'cleanup',
                    });
                }
            });
        }

        _cancelDeferredLoad() {
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
            this._hydrationCleanups?.splice(0).forEach((cleanup) => cleanup());
            this._hydrationCleanups = null;
        }

        _beginHydration() {
            if (!this.isConnected || this._state !== 'deferred') return;
            this._cancelDeferredLoad();
            this.setAttribute('data-acl-hydration-state', 'hydrating');
            void this._load();
        }

        _initHydrationTrigger(mode) {
            if (mode === 'visible') {
                if (!('IntersectionObserver' in window)) {
                    this._beginHydration();
                    return;
                }
                const observer = new IntersectionObserver(
                    // Run this operation
                    (entries) => {
                        if (
                            entries.some(
                                // Run this operation
                                (entry) => entry.target === this && entry.isIntersecting,
                            )
                        )
                            this._beginHydration();
                    },
                    { rootMargin: '100px' },
                );
                observer.observe(this);
                this._observer = observer;
                return;
            }
            if (mode === 'idle') {
                this._initIdleLoader();
                return;
            }
            if (mode === 'interaction') {
                const start = // Run this operation
                        () => this._beginHydration(),
                    events = ['pointerover', 'touchstart', 'focusin'];
                events.forEach((event) =>
                    this.addEventListener(event, start, {
                        // Configure this value
                        capture: true,
                        passive: true,
                    }),
                );
                (this._hydrationCleanups ||= []).push(() =>
                    events.forEach((event) => this.removeEventListener(event, start, { capture: true })),
                );
                return;
            }
            if (mode === 'media') {
                const query = this.getAttribute('hydrate-media') || settings.hydrateMedia,
                    media = window.matchMedia(query),
                    change = // Run this operation
                        () => {
                            if (media.matches) this._beginHydration();
                        };
                if (media.matches) this._beginHydration();
                else {
                    media.addEventListener?.('change', change);
                    (this._hydrationCleanups ||= []).push(() => media.removeEventListener?.('change', change));
                }
            }
        }

        _cancelAlpineWait(reason = 'Canceled') {
            const cleanup = this._alpineWaitCleanup;
            this._alpineWaitCleanup = null;
            cleanup?.(reason);
        }

        _initLazyObserver() {
            if (!('IntersectionObserver' in window)) {
                this._load();
                return;
            }
            const placeholder = document.createElement('div');
            placeholder.style.minHeight = '1px';
            placeholder.setAttribute('data-acl-placeholder', '');
            this._root.appendChild(placeholder);
            this._observer = new IntersectionObserver(
                (entries) => {
                    // Process intersection changes
                    if (entries[0].isIntersecting) {
                        this._load();
                        this._cancelDeferredLoad();
                    }
                },
                { rootMargin: '100px' },
            );
            this._observer.observe(this);
        }

        _initIdleLoader() {
            if ('requestIdleCallback' in window) {
                this._idleCallbackId = requestIdleCallback(
                    () => {
                        // Run the scheduled idle task
                        this._idleCallbackId = null;
                        if (this.isConnected) {
                            if (this._ssrHydration) this._beginHydration();
                            else this._load();
                        }
                    },
                    { timeout: 2000 },
                );
            } else {
                this._idleTimeoutId = setTimeout(() => {
                    // Run the scheduled delayed task
                    this._idleTimeoutId = null;
                    if (this.isConnected) {
                        if (this._ssrHydration) this._beginHydration();
                        else this._load();
                    }
                }, 200);
            }
        }

        _initSlotObserver() {
            if (this._slotObserver) return;

            this._slotObserver = new MutationObserver(
                // Process observed DOM mutations
                (mutations) =>
                    mutations.forEach((mutation) => {
                        // Process the current item
                        mutation.addedNodes.forEach((node) => {
                            // Only handle Elements and Text nodes
                            if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) return;

                            // Ignore the slot containers themselves if they trigger an add
                            if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-acl-slot')) return;
                            if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-acl-form-proxy')) return;

                            // Determine target slot name + find the internal slot container
                            const slotName =
                                    (node.nodeType === Node.ELEMENT_NODE ? node.getAttribute('slot') : null) ||
                                    'default',
                                container = this._root.querySelector(`div[data-acl-slot="${slotName}"]`);

                            // Move the node into the container
                            if (container) {
                                (this._lightSlotNodes ||= new Set()).add(node);
                                container.appendChild(node);
                            }
                        });
                    }),
            );

            // Only observe direct children additions
            this._slotObserver.observe(this, { childList: true });
        }
    }

    Object.entries(settings.attributes || {}).forEach(([name, definition]) => {
        if (name in Component.prototype) return;
        Object.defineProperty(Component.prototype, name, {
            configurable: true,
            enumerable: true,
            get() {
                return this.$props[name];
            },
            set(value) {
                const configDefinition = definition && definition.type ? definition : {},
                    type = configDefinition.type || definition;
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
            },
        });
    });
    return Component;
};
