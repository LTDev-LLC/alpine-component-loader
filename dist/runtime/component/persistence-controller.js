// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

const currentModuleUrl = new URL(import.meta.url), moduleSuffix = currentModuleUrl.pathname.endsWith('.min.js') ? '.min.js' : '.js', resolveLocalModule = (specifier)=>{
    const resolved = new URL(specifier.replace(/\.js$/, moduleSuffix), currentModuleUrl);
    return resolved.href;
}, importLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), [{ hasOwn }, { toACLLoadError }, { cloneRuntimeValue }, { readNumberAttribute }, { createIndexedDBPersistenceAdapter, createPersistenceEnvelope, decodePersistedValue, snapshotPersistentProps }] = await Promise.all([
    importLocalModule('../config.js'),
    importLocalModule('../errors.js'),
    importLocalModule('../values.js'),
    importLocalModule('../data-options.js'),
    importLocalModule('../persistence.js')
]);
// Initialize storage, reactive saves, and teardown only for components that opt into persistence
export const initializeComponentPersistence = async (component, { AlpineComponentLoader, settings, tagName })=>{
    const mode = component.getAttribute('persist') || settings.persist;
    if (!mode) return;
    // Normalize identity and route all adapter failures through the component error boundary
    const key = component.getAttribute('persist-key') || settings.persistKey || `acl:${component.localName}:${component.id || 'default'}`, debounceMs = Math.max(0, parseInt(component.getAttribute('persist-debounce') || settings.persistDebounce || '250', 10) || 0), version = Math.max(1, readNumberAttribute(component, 'persist-version', Number(settings.persistVersion) || 1, {
        min: 1
    })), reportPersistenceError = (error, operation)=>{
        const wrapped = toACLLoadError(error, {
            code: 'ACL_PERSISTENCE_FAILED',
            phase: 'persistence'
        });
        AlpineComponentLoader._report('warn', `[ACL] Persistence ${operation} failed for ${key}`, wrapped, {
            tagName,
            phase: 'persistence',
            operation
        });
        component._dispatchAcl('error', {
            error: wrapped,
            phase: 'persistence',
            operation,
            key
        });
        return wrapped;
    };
    let adapter = settings.persistAdapter;
    if (!adapter) {
        // Guard the init persistence operation against runtime failures
        try {
            const normalizedMode = String(mode).toLowerCase();
            if (normalizedMode === 'indexeddb') adapter = AlpineComponentLoader._indexedDBPersistenceAdapter ||= createIndexedDBPersistenceAdapter();
            else {
                const storage = normalizedMode === 'local' ? window.localStorage : window.sessionStorage;
                adapter = {
                    getItem: storage.getItem.bind(storage),
                    setItem: storage.setItem.bind(storage),
                    removeItem: storage.removeItem.bind(storage)
                };
            }
        } catch (error) {
            reportPersistenceError(error, 'initialize');
            return;
        }
    }
    if (!adapter || ![
        'getItem',
        'setItem',
        'removeItem'
    ].every(// Check every item
    (method)=>typeof adapter[method] === 'function')) {
        reportPersistenceError(new TypeError('Persistence adapter must implement getItem, setItem, and removeItem.'), 'initialize');
        return;
    }
    // Debounce timer for persistence
    let _timer = null, pendingValue, pendingHasValue = false, pendingDeferred = null, writeChain = Promise.resolve(), disposed = false, disposePromise = null, persistRunner = null, onPageHide = null;
    // Create the single promise shared by every save in one debounce window
    const createDeferred = ()=>{
        let resolve, reject;
        // Capture settlement functions so saveNow can complete the shared caller promise
        const promise = new Promise((resolvePromise, rejectPromise)=>{
            // Settle the asynchronous operation
            resolve = resolvePromise;
            reject = rejectPromise;
        });
        return {
            promise,
            resolve,
            reject
        };
    };
    // JSON serialization happens inside Alpine effects so nested mutations are tracked
    const getSnapshot = ()=>snapshotPersistentProps(component.$props);
    // Read, decode, migrate, and rewrite one persisted record behind the error boundary
    const readData = async ()=>{
        // Guard the init persistence operation against runtime failures
        try {
            const raw = await adapter.getItem(key);
            if (raw == null) return null;
            const decoded = await decodePersistedValue(raw, {
                version,
                key,
                component,
                migrate: settings.persistMigrate
            });
            if (decoded.shouldWrite) await adapter.setItem(key, JSON.stringify(decoded.envelope));
            return decoded.data;
        } catch (error) {
            reportPersistenceError(error, 'read');
            return null;
        }
    };
    // Perform immediate save
    const saveNow = async (value, hasValue = false)=>{
        if (_timer) clearTimeout(_timer);
        _timer = null;
        const deferred = pendingDeferred;
        pendingDeferred = null;
        pendingValue = undefined;
        pendingHasValue = false;
        const data = cloneRuntimeValue(hasValue ? value : getSnapshot()), operation = writeChain.catch(()=>{
        // Drain a failed predecessor before writing the latest value
        }).then(()=>{
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
    component.$props.$persistence = {
        $key: key,
        // Queue the latest explicit value or a flush-time snapshot for serialized writing
        $save (value) {
            if (disposed) return Promise.resolve();
            const hasValue = arguments.length > 0;
            pendingValue = value;
            pendingHasValue = hasValue;
            if (debounceMs > 0) {
                if (_timer) clearTimeout(_timer);
                pendingDeferred ||= createDeferred();
                _timer = setTimeout(()=>{
                    // Run the scheduled delayed task
                    void saveNow(pendingValue, pendingHasValue).catch(()=>{
                    // Keep scheduled write failures on the returned persistence promise
                    });
                }, debounceMs);
                return pendingDeferred.promise;
            }
            return saveNow(value, hasValue);
        },
        // Cancel queued state and serialize adapter removal after earlier writes
        $clear: async ()=>{
            // Run the $clear operation
            if (_timer) clearTimeout(_timer);
            _timer = null;
            pendingValue = undefined;
            pendingHasValue = false;
            pendingDeferred?.resolve();
            pendingDeferred = null;
            // Serialize removal after prior writes while allowing a failed predecessor to drain
            const operation = writeChain.catch(()=>{
            // Drain a failed predecessor before clearing storage
            }).then(()=>{
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
        $get: async (storedKey = null, fallback = null)=>{
            // Run the $get operation
            const stored = await readData();
            if (storedKey) return stored && hasOwn(stored, storedKey) ? stored[storedKey] : fallback;
            return stored ?? fallback;
        },
        // Drain the pending debounce immediately and await all serialized writes
        $flush: async ()=>{
            // Run the $flush operation
            if (_timer) return await saveNow(pendingValue, pendingHasValue);
            return await writeChain;
        }
    };
    // Restore state on load
    const stored = await readData();
    if (stored && typeof stored === 'object') // Process each prop name
    {
        for(const propName in component.$props)if (hasOwn(stored, propName)) component.$props[propName] = cloneRuntimeValue(stored[propName]);
    }
    // Start saving on Alpine updates
    persistRunner = window.Alpine.effect(()=>{
        // Track persistent props now while deferring snapshots to avoid same-tick stale writes
        getSnapshot();
        void component.$props.$persistence.$save().catch(()=>{
        // Keep reactive persistence failures inside the runtime boundary
        });
    });
    // Flush on page exit as a best-effort safeguard for queued writes
    if (debounceMs > 0) {
        onPageHide = ()=>{
            // Run the with component state operation
            void component.$props.$persistence.$flush().catch(()=>{
            // Ignore best-effort page teardown failures
            });
        };
        window.addEventListener('pagehide', onPageHide);
    }
    // Release the Alpine effect and page listener once, then settle pending writes
    const dispose = ({ flush = true } = {})=>{
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
        disposePromise = (async ()=>{
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
    component._persistenceDispose = dispose;
    component._addCleanup(()=>{
        // Dispose persistence without flushing during ordinary cleanup
        void dispose({
            flush: false
        }).catch(()=>{
        // Ignore cleanup failures already reported by the persistence boundary
        });
    });
};
