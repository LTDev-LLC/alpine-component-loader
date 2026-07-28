// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const currentModuleUrl = new URL(import.meta.url),
    moduleSuffix = currentModuleUrl.pathname.endsWith('.min.js') ? '.min.js' : '.js',
    resolveLocalModule = (specifier) => {
        const resolved = new URL(specifier.replace(/\.js$/, moduleSuffix), currentModuleUrl);
        if (currentModuleUrl.searchParams.has('acl-instance'))
            resolved.searchParams.set('acl-instance', currentModuleUrl.searchParams.get('acl-instance'));
        return resolved.href;
    },
    importLocalModule = (specifier) => import(/* @vite-ignore */ resolveLocalModule(specifier)),
    importDeferredLocalModule = (specifier) => import(/* @vite-ignore */ resolveLocalModule(specifier)),
    [{ ACLLoadError, toACLLoadError }, { readBooleanAttribute, readNumberAttribute }] = await Promise.all([
        importLocalModule('../errors.js'),
        importLocalModule('../data-options.js'),
    ]);

let dataRuntimePromise = null;

// Load and memoize optional data modules when a component first needs them
const loadDataRuntime = () => {
    if (dataRuntimePromise) return dataRuntimePromise;
    // Share one loading transaction and allow retries after a failed import
    const loading = Promise.all([
        importDeferredLocalModule('./data-controller.js'),
        importDeferredLocalModule('../fetch-cache.js'),
    ])
        .then(([controller, cache]) => ({
            controller,
            cache,
        }))
        .catch((error) => {
            if (dataRuntimePromise === loading) dataRuntimePromise = null;
            throw new ACLLoadError('Unable to load the component data runtime.', {
                code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
                phase: 'runtime-import',
                cause: error,
                retryable: true,
            });
        });
    dataRuntimePromise = loading;
    return loading;
};

// Keep the component contract synchronous while installing data behavior on first activation
export const withComponentDataGate = (Base, context) => {
    const { AlpineComponentLoader, settings, contentSource } = context;
    return class extends Base {
        async _ensureDataRuntime() {
            if (!this._dataRuntimePromise) {
                const loading = loadDataRuntime()
                    .then(
                        // Install the concrete data controller after its modules arrive
                        ({ controller, cache }) => {
                            AlpineComponentLoader._dataRuntime = cache;
                            const DataController = controller.withComponentData(class {}, context);
                            // Install the deferred controller methods on this component instance
                            for (const name of Reflect.ownKeys(DataController.prototype)) {
                                if (name === 'constructor') continue;
                                Object.defineProperty(
                                    this,
                                    name,
                                    Object.getOwnPropertyDescriptor(DataController.prototype, name),
                                );
                            }
                            return this;
                        },
                    )
                    .catch((error) => {
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
            return readNumberAttribute(this, 'data-fetch-cache-max', Number(settings.data.cacheMax), { min: 0 });
        }

        _getPollingPauseSetting(attributeName, groupName) {
            return readBooleanAttribute(this, attributeName, settings.data[groupName]);
        }

        _isPollingPaused() {
            const pauseWhenHidden = this._getPollingPauseSetting('pause-polling-when-hidden', 'pauseWhenHidden'),
                pauseWhenOffline = this._getPollingPauseSetting('pause-polling-when-offline', 'pauseWhenOffline'),
                pauseWhenOffscreen = this._getPollingPauseSetting('pause-polling-when-offscreen', 'pauseWhenOffscreen');
            return (
                (pauseWhenHidden && document.hidden) ||
                (pauseWhenOffline && navigator.onLine === false) ||
                (pauseWhenOffscreen && !this._pollIsIntersecting)
            );
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
                        ...detail,
                    });
                    if (typeof cleanup === 'function') {
                        if (cleanupEpoch === this._cleanupEpoch && this._state !== 'destroyed')
                            this._addCleanup(cleanup);
                        else cleanup();
                    }
                    return cleanup;
                } catch (error) {
                    throw toACLLoadError(error, {
                        code: 'ACL_HOOK_FAILED',
                        phase: 'hook',
                    });
                }
            }
        }
    };
};
