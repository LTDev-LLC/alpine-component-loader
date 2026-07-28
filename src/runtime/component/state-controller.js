// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Propagate jsDelivr's generated minified suffix to package-owned dependencies
const currentModuleUrl = new URL(import.meta.url),
    isMinifiedModule = currentModuleUrl.pathname.endsWith('.min.js'),
    resolveLocalModule = (specifier) => {
        const resolved = new URL(
            isMinifiedModule ? specifier.replace(/\.js$/, '.min.js') : specifier,
            currentModuleUrl,
        );
        if (currentModuleUrl.searchParams.has('acl-instance'))
            resolved.searchParams.set('acl-instance', currentModuleUrl.searchParams.get('acl-instance'));
        return resolved.href;
    },
    importLocalModule = (specifier) => import(/* @vite-ignore */ resolveLocalModule(specifier)),
    importDeferredLocalModule = (specifier) => import(/* @vite-ignore */ resolveLocalModule(specifier)),
    [
        { hasOwn },
        { ACLLoadError, toACLLoadError },
        { cloneRuntimeValue, toCssString },
        { readNumberAttribute },
        { createLifecycleEventDetail },
    ] = await Promise.all([
        importLocalModule('../config.js'),
        importLocalModule('../errors.js'),
        importLocalModule('../values.js'),
        importLocalModule('../data-options.js'),
        importLocalModule('../lifecycle.js'),
    ]);

let persistenceModulePromise = null;

// Load persistence only when a component opts in, retaining one retryable promise per module
const loadRuntimeModule = (specifier) => {
    if (!persistenceModulePromise) {
        const operation = importDeferredLocalModule(specifier).catch((error) => {
            // Evict failed imports so a later explicit persistence activation can retry
            if (persistenceModulePromise === operation) persistenceModulePromise = null;
            throw new ACLLoadError('Unable to load the persistence runtime module.', {
                code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
                phase: 'runtime-import',
                cause: error,
                retryable: true,
            });
        });
        persistenceModulePromise = operation;
    }
    return persistenceModulePromise;
};

// Private custom-element controller with definition context supplied by the facade
export const withComponentState = (Base, { AlpineComponentLoader, settings, tagName, observedAttrs }) => {
    return class extends Base {
        _applyTypeDefault(name, type) {
            if (type === Number) this.$props[name] = 0;
            else if (type === Boolean) this.$props[name] = false;
            else if (type === Array) this.$props[name] = [];
            else if (type === Object) this.$props[name] = {};
            else this.$props[name] = '';
        }

        _syncAllAttributes() {
            observedAttrs.forEach(
                // Process the current item
                (name) => this._updateProp(name, this.getAttribute(name)),
            );
        }

        async _releasePersistence(flush = true) {
            const dispose = this._persistenceDispose,
                persistence = this.$props.$persistence;
            this._persistenceDispose = null;
            if (!dispose) return;
            // Guard the release persistence operation against runtime failures
            try {
                await dispose({ flush });
            } catch {
                // Persistence operations report typed errors before teardown continues
            } finally {
                if (this.$props.$persistence === persistence) delete this.$props.$persistence;
            }
        }

        async _initPersistence() {
            const mode = this.getAttribute('persist') || settings.persist;
            if (!mode) return;

            const {
                createIndexedDBPersistenceAdapter,
                createPersistenceEnvelope,
                decodePersistedValue,
                snapshotPersistentProps,
            } = await loadRuntimeModule('../persistence.js');

            // Normalize identity and route all adapter failures through the component error boundary
            const key =
                    this.getAttribute('persist-key') ||
                    settings.persistKey ||
                    `acl:${this.localName}:${this.id || 'default'}`,
                debounceMs = Math.max(
                    0,
                    parseInt(this.getAttribute('persist-debounce') || settings.persistDebounce || '250', 10) || 0,
                ),
                version = Math.max(
                    1,
                    readNumberAttribute(this, 'persist-version', Number(settings.persistVersion) || 1, { min: 1 }),
                ),
                reportPersistenceError = (error, operation) => {
                    const wrapped = toACLLoadError(error, {
                        code: 'ACL_PERSISTENCE_FAILED',
                        phase: 'persistence',
                    });
                    AlpineComponentLoader._report('warn', `[ACL] Persistence ${operation} failed for ${key}`, wrapped, {
                        tagName,
                        phase: 'persistence',
                        operation,
                    });
                    this._dispatchAcl('error', {
                        error: wrapped,
                        phase: 'persistence',
                        operation,
                        key,
                    });
                    return wrapped;
                };

            let adapter = settings.persistAdapter;
            if (!adapter) {
                // Guard the init persistence operation against runtime failures
                try {
                    const normalizedMode = String(mode).toLowerCase();
                    if (normalizedMode === 'indexeddb')
                        adapter = AlpineComponentLoader._indexedDBPersistenceAdapter ||=
                            createIndexedDBPersistenceAdapter();
                    else {
                        const storage = normalizedMode === 'local' ? window.localStorage : window.sessionStorage;
                        adapter = {
                            getItem: storage.getItem.bind(storage),
                            setItem: storage.setItem.bind(storage),
                            removeItem: storage.removeItem.bind(storage),
                        };
                    }
                } catch (error) {
                    reportPersistenceError(error, 'initialize');
                    return;
                }
            }
            if (
                !adapter ||
                !['getItem', 'setItem', 'removeItem'].every(
                    // Check every item
                    (method) => typeof adapter[method] === 'function',
                )
            ) {
                reportPersistenceError(
                    new TypeError('Persistence adapter must implement getItem, setItem, and removeItem.'),
                    'initialize',
                );
                return;
            }

            // Debounce timer for persistence
            let _timer = null,
                pendingValue,
                pendingHasValue = false,
                pendingDeferred = null,
                writeChain = Promise.resolve(),
                disposed = false,
                disposePromise = null,
                persistRunner = null,
                onPageHide = null;

            // Create the single promise shared by every save in one debounce window
            const createDeferred = () => {
                let resolve, reject;
                // Capture settlement functions so saveNow can complete the shared caller promise
                const promise = new Promise((resolvePromise, rejectPromise) => {
                    // Settle the asynchronous operation
                    resolve = resolvePromise;
                    reject = rejectPromise;
                });
                return {
                    promise,
                    resolve,
                    reject,
                };
            };

            // JSON serialization happens inside Alpine effects so nested mutations are tracked
            const getSnapshot = () => snapshotPersistentProps(this.$props);

            // Read, decode, migrate, and rewrite one persisted record behind the error boundary
            const readData = async () => {
                // Guard the init persistence operation against runtime failures
                try {
                    const raw = await adapter.getItem(key);
                    if (raw == null) return null;
                    const decoded = await decodePersistedValue(raw, {
                        version,
                        key,
                        component: this,
                        migrate: settings.persistMigrate,
                    });
                    if (decoded.shouldWrite) await adapter.setItem(key, JSON.stringify(decoded.envelope));
                    return decoded.data;
                } catch (error) {
                    reportPersistenceError(error, 'read');
                    return null;
                }
            };

            // Perform immediate save
            const saveNow = async (value, hasValue = false) => {
                if (_timer) clearTimeout(_timer);
                _timer = null;
                const deferred = pendingDeferred;
                pendingDeferred = null;
                pendingValue = undefined;
                pendingHasValue = false;
                const data = cloneRuntimeValue(hasValue ? value : getSnapshot()),
                    operation = writeChain
                        .catch(() => {
                            // Drain a failed predecessor before writing the latest value
                        })
                        .then(() => {
                            // Handle the resolved operation
                            return adapter.setItem(key, JSON.stringify(createPersistenceEnvelope(version, data)));
                        });
                writeChain = operation;
                // Guard the init persistence operation against runtime failures
                try {
                    await operation;
                    deferred?.resolve();
                } catch (error) {
                    const wrapped = reportPersistenceError(error, 'write');
                    deferred?.reject(wrapped);
                    throw wrapped;
                }
            };

            // Attach persistence helpers
            this.$props.$persistence = {
                $key: key,
                // Queue the latest explicit value or a flush-time snapshot for serialized writing
                $save(value) {
                    if (disposed) return Promise.resolve();
                    const hasValue = arguments.length > 0;
                    pendingValue = value;
                    pendingHasValue = hasValue;
                    if (debounceMs > 0) {
                        if (_timer) clearTimeout(_timer);
                        pendingDeferred ||= createDeferred();
                        _timer = setTimeout(() => {
                            // Run the scheduled delayed task
                            void saveNow(pendingValue, pendingHasValue).catch(() => {
                                // Keep scheduled write failures on the returned persistence promise
                            });
                        }, debounceMs);
                        return pendingDeferred.promise;
                    }
                    return saveNow(value, hasValue);
                },
                // Cancel queued state and serialize adapter removal after earlier writes
                $clear: async () => {
                    // Run the $clear operation
                    if (_timer) clearTimeout(_timer);
                    _timer = null;
                    pendingValue = undefined;
                    pendingHasValue = false;
                    pendingDeferred?.resolve();
                    pendingDeferred = null;
                    // Serialize removal after prior writes while allowing a failed predecessor to drain
                    const operation = writeChain
                        .catch(() => {
                            // Drain a failed predecessor before clearing storage
                        })
                        .then(() => {
                            // Handle the resolved operation
                            return adapter.removeItem(key);
                        });
                    writeChain = operation;
                    // Guard the init persistence operation against runtime failures
                    try {
                        await operation;
                    } catch (error) {
                        throw reportPersistenceError(error, 'clear');
                    }
                },
                // Read the full stored value or one named field with a fallback
                $get: async (storedKey = null, fallback = null) => {
                    // Run the $get operation
                    const stored = await readData();
                    if (storedKey) return stored && hasOwn(stored, storedKey) ? stored[storedKey] : fallback;
                    return stored ?? fallback;
                },
                // Drain the pending debounce immediately and await all serialized writes
                $flush: async () => {
                    // Run the $flush operation
                    if (_timer) return await saveNow(pendingValue, pendingHasValue);
                    return await writeChain;
                },
            };

            // Restore state on load
            const stored = await readData();
            if (stored && typeof stored === 'object')
                // Process each prop name
                for (const propName in this.$props)
                    if (hasOwn(stored, propName)) this.$props[propName] = cloneRuntimeValue(stored[propName]);

            // Start saving on Alpine updates
            persistRunner = window.Alpine.effect(() => {
                // Track persistent props now while deferring snapshots to avoid same-tick stale writes
                getSnapshot();
                void this.$props.$persistence.$save().catch(() => {
                    // Keep reactive persistence failures inside the runtime boundary
                });
            });

            // Flush on page exit as a best-effort safeguard for queued writes
            if (debounceMs > 0) {
                onPageHide = () => {
                    // Run the with component state operation
                    void this.$props.$persistence.$flush().catch(() => {
                        // Ignore best-effort page teardown failures
                    });
                };
                window.addEventListener('pagehide', onPageHide);
            }

            // Release the Alpine effect and page listener once, then settle pending writes
            const dispose = ({ flush = true } = {}) => {
                if (disposePromise) return disposePromise;
                disposed = true;
                if (persistRunner && window.Alpine.release) {
                    window.Alpine.release(persistRunner);
                    persistRunner = null;
                }
                if (onPageHide) {
                    window.removeEventListener('pagehide', onPageHide);
                    onPageHide = null;
                }
                // Share one teardown transaction so repeated release paths cannot flush twice
                disposePromise = (async () => {
                    // Run the dispose operation
                    if (flush && _timer) await saveNow(pendingValue, pendingHasValue);
                    else if (!flush && _timer) {
                        clearTimeout(_timer);
                        _timer = null;
                        pendingValue = undefined;
                        pendingHasValue = false;
                        pendingDeferred?.resolve();
                        pendingDeferred = null;
                    }
                    await writeChain;
                })();
                return disposePromise;
            };
            this._persistenceDispose = dispose;
            this._addCleanup(() => {
                // Dispose persistence without flushing during ordinary cleanup
                void dispose({ flush: false }).catch(() => {
                    // Ignore cleanup failures already reported by the persistence boundary
                });
            });
        }

        async _initAlpine() {
            if (window.Alpine) return this._finishAlpineInit();

            // Bind to alpine:init event + timeout if it is not fired
            return new Promise((resolve, reject) => {
                // Settle the asynchronous operation
                let settled = false,
                    timeoutId = null;
                // Release both readiness paths and clear externally callable cancellation ownership
                const cleanup = () => {
                    clearTimeout(timeoutId);
                    document.removeEventListener('alpine:init', finish);
                    if (this._alpineWaitCleanup === cancel) this._alpineWaitCleanup = null;
                };
                // Initialize Alpine once whether readiness comes from the event or timeout check
                const finish = async () => {
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
                    },
                    // Reject a pending Alpine wait when reload or teardown supersedes it
                    cancel = (reason = 'Canceled') => {
                        if (settled) return;
                        settled = true;
                        cleanup();
                        reject(
                            new ACLLoadError(`Alpine initialization ${String(reason).toLowerCase()}.`, {
                                code: 'ACL_ALPINE_INIT_CANCELED',
                                phase: 'alpine',
                            }),
                        );
                    };

                this._alpineWaitCleanup = cancel;
                document.addEventListener('alpine:init', finish);

                // Fail initialization when Alpine never appears
                timeoutId = setTimeout(() => {
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
                    if (this.$props && typeof this.$props === 'object')
                        Object.keys(this.$props)
                            .filter(
                                // Select matching items
                                (key) => store[key] === undefined,
                            )
                            .forEach(
                                // Process the current item
                                (key) => (store[key] = this.$props[key]),
                            );

                    // Set $props to Alpine store
                    this.$props = store;
                } else {
                    AlpineComponentLoader._report(
                        'error',
                        `[ACL] Store "${storeName}" not found. Falling back to local state.`,
                        null,
                        {
                            tagName,
                            phase: 'store',
                        },
                    );
                    this.$props = window.Alpine.reactive(this.$props || {});
                }
            } else {
                // Initialize Alpine Store
                this.$props = window.Alpine.reactive(this.$props || {});
            }

            // Initialize persistence
            await this._initPersistence();

            // Track reactive updates while excluding $lastUpdated to prevent an infinite effect loop
            const updateRunner = window.Alpine.effect(() => {
                // Synchronize reactive state
                if (this.$props) {
                    Object.keys(this.$props).forEach((k) => {
                        // Process the current item
                        if (k !== '$lastUpdated') void this.$props[k];
                    });
                    this.$props.$lastUpdated = Date.now();
                }
            });
            if (updateRunner && window.Alpine.release)
                this._addCleanup(
                    // Register cleanup work
                    () => window.Alpine.release(updateRunner),
                );

            // Refresh expandos after store binding and attach a late Alpine scope if needed
            this._installAlpinePropsScope();
            if (this._root && this._root.children)
                Array.from(this._root.children).forEach((node) => {
                    // Process the current item
                    this._exposePropsToNode(node);
                });

            // We wrap in nextTick to ensure the DOM is settled before Alpine scans it
            return await new Promise((resolve) => {
                // Settle the asynchronous operation
                window.Alpine.nextTick(() => {
                    // Continue after the Alpine DOM update
                    if (this._root) window.Alpine.initTree(this._root);
                    resolve();
                });
            });
        }

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

        _dispatch(eventName) {
            this.dispatchEvent(
                new CustomEvent(eventName, {
                    bubbles: true,
                    composed: true,
                    detail: { props: this.$props },
                }),
            );
        }

        _dispatchAcl(eventName, detail = {}) {
            const eventDetail = createLifecycleEventDetail(this, tagName, detail);
            AlpineComponentLoader._observability.emit(eventName, eventDetail, { tagName });
            this.dispatchEvent(
                new CustomEvent(`acl:${eventName}`, {
                    bubbles: true,
                    composed: true,
                    detail: eventDetail,
                }),
            );
        }

        async _resolveContent(source) {
            const content = await AlpineComponentLoader.loadTemplate(source, settings),
                info = AlpineComponentLoader.getTemplateLoadInfo(source, settings);
            this._aclDebug.templateCacheHit = info?.cacheHit ?? null;
            this._aclDebug.templateCacheKey = info?.cacheKey ?? null;
            this._aclDebug.templateSource = source;
            return content;
        }

        async _pruneCache() {
            return await AlpineComponentLoader.pruneCaches(settings._templateCachePrefix, settings._templateCacheKey);
        }
    };
};
