// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js', importLocalModule = (specifier)=>import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)), [{ VALID_RESPONSE_TYPES }, { ACLLoadError, delayWithSignal, getRetryAfterMs, raceWithSignal, toACLLoadError }, { cloneRuntimeValue, mergeFetchOptions, parseJson, toSearchParamsDeep, toUrlValue }, { dataFetchCache, getDataCacheKey, normalizeRequestForCache, parseBodyValue, pruneDataFetchCache }, { readBooleanAttribute, readNumberAttribute }] = await Promise.all([
    importLocalModule('../config.js'),
    importLocalModule('../errors.js'),
    importLocalModule('../values.js'),
    importLocalModule('../fetch-cache.js'),
    importLocalModule('../data-options.js')
]);
// Private custom-element controller with definition context supplied by the facade
export const withComponentData = (Base, { AlpineComponentLoader, settings, tagName, contentSource })=>{
    return class extends Base {
        _getFetchContext() {
            return {
                el: this,
                $el: this,
                props: this.$props,
                $props: this.$props,
                root: this._root,
                $root: this._root
            };
        }
        async _resolveFetchValue(attrName, configVal) {
            let result = {};
            const attrVal = this.getAttribute(attrName), context = this._getFetchContext();
            if (attrVal) {
                const trimmed = attrVal.trim(), invalid = Symbol('invalid'), parsed = parseJson(trimmed, invalid);
                if (parsed === invalid || !Array.isArray(parsed) && (!parsed || typeof parsed !== 'object')) AlpineComponentLoader._report('warn', `[ACL] ${attrName} must be a JSON object or array for <${tagName}>.`, null, {
                    tagName,
                    phase: 'fetch'
                });
                else result = parsed;
            }
            if (configVal) {
                result = {
                    ...result,
                    ...(typeof configVal === 'function' ? await configVal.call(this, context) : configVal) || {}
                };
            }
            return result;
        }
        async _resolveDataUrl(url) {
            const keys = await this._resolveFetchValue('data-fetch-keys', settings.data.keys), params = await this._resolveFetchValue('data-fetch-params', settings.data.params);
            let resolvedUrl = url;
            Object.entries(keys || {}).forEach(([key, value])=>{
                // Process the current item
                resolvedUrl = resolvedUrl.split(`:${key}`).join(toUrlValue(value));
            });
            const finalUrl = new URL(resolvedUrl, window.location.origin);
            // Process each entry
            for (const [key, value] of toSearchParamsDeep(params || {}))finalUrl.searchParams.append(key, value);
            return finalUrl.toString();
        }
        _getDataFetchTimeout() {
            const raw = this.getAttribute('data-fetch-timeout') ?? settings.data.timeout, timeout = Number(raw);
            return Number.isFinite(timeout) && timeout > 0 ? timeout : 30000;
        }
        _getDataFetchNumber(attrName, configValue, fallback) {
            const configured = Number(configValue), defaultValue = Number.isFinite(configured) && configured >= 0 ? configured : fallback;
            return readNumberAttribute(this, attrName, defaultValue, {
                min: 0
            });
        }
        _getDataFetchCacheTtl() {
            return readNumberAttribute(this, 'data-fetch-cache-ttl', Number(settings.data.cacheTtl), {
                min: 0
            });
        }
        _getDataFetchCacheMax() {
            return readNumberAttribute(this, 'data-fetch-cache-max', Number(settings.data.cacheMax), {
                min: 0
            });
        }
        _getDataResponseType() {
            const responseType = this.getAttribute('data-response-type') || settings.data.responseType || 'json';
            return VALID_RESPONSE_TYPES.has(responseType) ? responseType : 'json';
        }
        _getPollingPauseSetting(attributeName, groupName) {
            return readBooleanAttribute(this, attributeName, settings.data[groupName]);
        }
        _isPollingPaused() {
            const pauseWhenHidden = this._getPollingPauseSetting('pause-polling-when-hidden', 'pauseWhenHidden'), pauseWhenOffline = this._getPollingPauseSetting('pause-polling-when-offline', 'pauseWhenOffline'), pauseWhenOffscreen = this._getPollingPauseSetting('pause-polling-when-offscreen', 'pauseWhenOffscreen');
            return pauseWhenHidden && document.hidden || pauseWhenOffline && navigator.onLine === false || pauseWhenOffscreen && !this._pollIsIntersecting;
        }
        _getDataTarget() {
            return this.getAttribute('data-target') || settings.data.target || '$data';
        }
        _getDataCacheStrategy(skipCache = false) {
            if (skipCache) return 'no-store';
            const strategy = this.getAttribute('data-cache-strategy') || settings.data.cacheStrategy || 'cache-first';
            return [
                'cache-first',
                'network-first',
                'stale-while-revalidate',
                'no-store'
            ].includes(strategy) ? strategy : 'cache-first';
        }
        _setFetchedData(target, data) {
            if (!target || target === '$data') this.$props.$data = data;
            else this.$props[target] = data;
        }
        _clearFetchedData(target) {
            if (!target || target === '$data') this.$props.$data = null;
            else this.$props[target] = null;
        }
        async _buildDataFetchOptions() {
            let fetchOptions = mergeFetchOptions({
                method: 'GET',
                headers: {
                    Accept: 'application/json'
                }
            }, settings?.data?.options || {});
            fetchOptions.method = (this.getAttribute('data-method') || settings.data.method || fetchOptions.method || 'GET').toUpperCase();
            const rawBody = this.getAttribute('data-body') ?? settings.data.body ?? fetchOptions.body;
            if (rawBody != null && ![
                'GET',
                'HEAD'
            ].includes(fetchOptions.method)) {
                const body = parseBodyValue(rawBody);
                if (typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams) && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) {
                    const headers = new Headers(fetchOptions.headers || {});
                    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
                    fetchOptions.headers = Object.fromEntries(headers.entries());
                    fetchOptions.body = JSON.stringify(body);
                } else {
                    fetchOptions.body = body;
                }
            } else {
                delete fetchOptions.body;
            }
            if (typeof settings?.hooks?.beforeFetch === 'function') {
                // Guard the build data fetch options operation against runtime failures
                try {
                    const modified = await settings.hooks.beforeFetch.call(this, fetchOptions, this._getFetchContext());
                    if (modified && typeof modified === 'object') fetchOptions = modified;
                } catch (e) {
                    throw toACLLoadError(e, {
                        code: 'ACL_HOOK_FAILED',
                        phase: 'hook'
                    });
                }
            }
            return fetchOptions;
        }
        async _parseDataResponse(response) {
            if (typeof settings.data.parser === 'function') return await settings.data.parser.call(this, response, this._getFetchContext());
            let responseType = this._getDataResponseType();
            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            if (responseType === 'auto') {
                if (contentType.includes('application/json') || /application\/[a-z0-9.+-]+\+json\b/.test(contentType)) responseType = 'json';
                else if (contentType.startsWith('text/') || contentType.includes('xml') || contentType.includes('javascript')) responseType = 'text';
                else responseType = 'blob';
            }
            if (responseType === 'json') {
                if (!(contentType.includes('application/json') || /application\/[a-z0-9.+-]+\+json\b/.test(contentType))) throw new ACLLoadError('Invalid JSON response', {
                    code: 'ACL_INVALID_RESPONSE',
                    phase: 'parse'
                });
                return await response.json();
            }
            if (responseType === 'text') return await response.text();
            if (responseType === 'blob') return await response.blob();
            if (responseType === 'arrayBuffer') return await response.arrayBuffer();
            if (responseType === 'stream') return response.body;
            throw new ACLLoadError(`Unsupported response type "${responseType}".`, {
                code: 'ACL_INVALID_RESPONSE_TYPE',
                phase: 'parse'
            });
        }
        async _fetchResponseWithRetry(finalUrl, fetchOptions, controller) {
            const retries = this._getDataFetchNumber('data-retries', settings.data.retries, 0), retryDelay = this._getDataFetchNumber('data-retry-delay', settings.data.retryDelay, 250), retryMaxDelay = Math.max(retryDelay, this._getDataFetchNumber('data-retry-max-delay', settings.data.retryMaxDelay, 30000)), jitter = Math.max(0, Math.min(1, this._getDataFetchNumber('data-retry-jitter', settings.data.retryJitter, 0))), method = String(fetchOptions.method || 'GET').toUpperCase(), methodCanRetry = [
                'GET',
                'HEAD',
                'OPTIONS',
                'PUT',
                'DELETE'
            ].includes(method) || readBooleanAttribute(this, 'data-retry-unsafe-methods', settings.data.retryUnsafeMethods), transientStatuses = new Set([
                408,
                425,
                429,
                500,
                502,
                503,
                504
            ]);
            let lastError;
            // Iterate over the indexed values
            for(let attempt = 0; attempt <= retries; attempt++){
                // Guard the fetch response with retry operation against runtime failures
                try {
                    const res = await fetch(finalUrl, mergeFetchOptions(fetchOptions, {
                        signal: controller.signal
                    }));
                    if (!res.ok) {
                        const retryable = transientStatuses.has(res.status) && methodCanRetry, error = new ACLLoadError(`API Error: ${res.status}`, {
                            code: 'ACL_HTTP_ERROR',
                            phase: 'fetch',
                            status: res.status,
                            retryable
                        });
                        error.retryAfterMs = getRetryAfterMs(res);
                        throw error;
                    }
                    return await this._parseDataResponse(res);
                } catch (e) {
                    lastError = toACLLoadError(e, {
                        code: 'ACL_FETCH_FAILED',
                        phase: 'fetch',
                        retryable: methodCanRetry
                    });
                    if (controller.signal.aborted || attempt >= retries || lastError.retryable === false) throw lastError;
                    const exponentialDelay = Math.min(retryMaxDelay, retryDelay * 2 ** attempt), jitterMultiplier = jitter ? 1 + (Math.random() * 2 - 1) * jitter : 1, waitMs = lastError.retryAfterMs ?? Math.max(0, Math.round(exponentialDelay * jitterMultiplier));
                    await delayWithSignal(waitMs, controller.signal);
                }
            }
            throw lastError;
        }
        _createDataCacheEntry(cacheKey, finalUrl, fetchOptions, target, strategy, retainOverride = null) {
            const sharedController = new AbortController(), fetchTask = this._fetchResponseWithRetry(finalUrl, fetchOptions, sharedController), ttl = this._getDataFetchCacheTtl(), shouldRetain = retainOverride ?? (Number.isFinite(ttl) && ttl > 0), entry = {
                promise: fetchTask,
                controller: sharedController,
                cacheKey,
                finalUrl,
                target,
                strategy,
                request: normalizeRequestForCache(fetchOptions),
                expiresAt: shouldRetain ? Date.now() + ttl : Date.now(),
                lastAccess: Date.now(),
                subscribers: 0,
                settled: false,
                invalidated: false,
                retain: shouldRetain
            };
            dataFetchCache.set(cacheKey, entry);
            pruneDataFetchCache({
                cacheMax: this._getDataFetchCacheMax()
            });
            fetchTask.catch(()=>{
                // Handle the rejected operation
                if (dataFetchCache.get(cacheKey)?.promise === fetchTask) dataFetchCache.delete(cacheKey);
            }).finally(()=>{
                // Finalize the asynchronous operation
                entry.settled = true;
                entry.controller = null;
                if (!entry.retain && dataFetchCache.get(cacheKey)?.promise === fetchTask) dataFetchCache.delete(cacheKey);
                pruneDataFetchCache({
                    cacheMax: this._getDataFetchCacheMax()
                });
            });
            return entry;
        }
        async _consumeDataEntry(cacheEntry, cacheKey, signal, target) {
            // Reject results from entries evicted after this consumer subscribed
            const assertValid = ()=>{
                if (cacheEntry.invalidated) throw new ACLLoadError('Data cache entry was invalidated.', {
                    code: 'ACL_CACHE_INVALIDATED',
                    phase: 'cache',
                    retryable: true
                });
            };
            assertValid();
            cacheEntry.subscribers = (cacheEntry.subscribers || 0) + 1;
            cacheEntry.lastAccess = Date.now();
            if (dataFetchCache.get(cacheKey) === cacheEntry) {
                dataFetchCache.delete(cacheKey);
                dataFetchCache.set(cacheKey, cacheEntry);
            }
            // Guard the consume data entry operation against runtime failures
            try {
                const json = cloneRuntimeValue(await raceWithSignal(cacheEntry.promise, signal));
                assertValid();
                let processedData = json;
                if (typeof settings?.hooks?.afterFetch === 'function') {
                    // Guard the consume data entry operation against runtime failures
                    try {
                        processedData = await settings.hooks.afterFetch.call(this, json, this._getFetchContext());
                    } catch (e) {
                        throw toACLLoadError(e, {
                            code: 'ACL_HOOK_FAILED',
                            phase: 'hook'
                        });
                    }
                }
                assertValid();
                if (!signal.aborted) this._setFetchedData(target, processedData);
            } finally{
                cacheEntry.subscribers = Math.max((cacheEntry.subscribers || 1) - 1, 0);
                cacheEntry.lastAccess = Date.now();
                if (signal.aborted && cacheEntry.settled === false && cacheEntry.subscribers === 0) {
                    cacheEntry.controller.abort(signal.reason);
                    if (dataFetchCache.get(cacheKey) === cacheEntry) dataFetchCache.delete(cacheKey);
                }
            }
        }
        async _clearTemplateCache() {
            if (!settings.cacheTemplates || !('caches' in window)) return false;
            return await AlpineComponentLoader.clearTemplate(contentSource, settings._templateCacheKey);
        }
        async _clearDataCache() {
            if (this._aclDebug?.dataCacheKey && AlpineComponentLoader.clearDataCache(this._aclDebug.dataCacheKey)) return true;
            const currentDataSrc = this.getAttribute('data-src') || settings.data.src;
            if (!currentDataSrc) return false;
            const finalUrl = await this._resolveDataUrl(currentDataSrc);
            return AlpineComponentLoader.clearDataCache(finalUrl);
        }
        async _fetchData(url, skipCache = false, options = {}) {
            if (!url) return;
            // Abort any pending component request and init new controller
            if (this._fetchAbortController) this._fetchAbortController.abort();
            const controller = new AbortController(), generation = ++this._fetchGeneration;
            this._fetchAbortController = controller;
            const signal = controller.signal;
            const target = this._getDataTarget();
            // Initialize reactive states for loading and error resets
            this.$props.$loading = true;
            this.$props.$error = null;
            this._clearFetchedData(target);
            // Enforce request timeout via AbortController cancellation
            const timeoutMs = this._getDataFetchTimeout(), timeoutId = setTimeout(// Run the scheduled delayed task
            ()=>controller.abort('Timeout'), timeoutMs);
            // Guard the fetch data operation against runtime failures
            try {
                const finalUrl = await this._resolveDataUrl(url), fetchOptions = await this._buildDataFetchOptions();
                let explicitCacheKey = this.getAttribute('data-cache-key') ?? settings.data.cacheKey;
                if (typeof explicitCacheKey === 'function') explicitCacheKey = await explicitCacheKey.call(this, this._getFetchContext());
                const cacheVariant = {
                    responseType: this._getDataResponseType(),
                    parser: typeof settings.data.parser === 'function' ? tagName : null
                }, cacheIdentity = await getDataCacheKey(finalUrl, fetchOptions, explicitCacheKey, cacheVariant), cacheKey = cacheIdentity.key || `acl-no-store-${generation}`;
                let strategy = this._getDataCacheStrategy(skipCache);
                if (!cacheIdentity.cacheable || this._getDataResponseType() === 'stream') strategy = 'no-store';
                this._aclDebug.dataUrl = finalUrl;
                this._aclDebug.dataCacheKey = cacheKey;
                this._aclDebug.dataTarget = target;
                this._aclDebug.dataCacheStrategy = strategy;
                this._aclDebug.dataCacheBypassReason = cacheIdentity.reason || null;
                let cacheEntry = dataFetchCache.get(cacheKey);
                if (strategy === 'cache-first' && cacheEntry?.settled !== false && cacheEntry?.expiresAt && Date.now() > cacheEntry.expiresAt) {
                    dataFetchCache.delete(cacheKey);
                    cacheEntry = null;
                }
                this._aclDebug.dataCacheHit = Boolean(cacheEntry) && strategy !== 'no-store';
                if (this._aclDebug.dataCacheHit) this._dispatchAcl('cachehit', {
                    phase: 'data',
                    url: finalUrl,
                    strategy,
                    target
                });
                if (strategy === 'no-store') {
                    dataFetchCache.delete(cacheKey);
                    cacheEntry = this._createDataCacheEntry(cacheKey, finalUrl, fetchOptions, target, strategy, false);
                    dataFetchCache.delete(cacheKey);
                    await this._consumeDataEntry(cacheEntry, cacheKey, signal, target);
                } else if (strategy === 'network-first') {
                    const staleEntry = cacheEntry;
                    if (staleEntry) AlpineComponentLoader._detachedDataEntries.add(staleEntry);
                    dataFetchCache.delete(cacheKey);
                    cacheEntry = this._createDataCacheEntry(cacheKey, finalUrl, fetchOptions, target, strategy);
                    // Guard the fetch data operation against runtime failures
                    try {
                        await this._consumeDataEntry(cacheEntry, cacheKey, signal, target);
                    } catch (e) {
                        if (e?.code === 'ACL_CACHE_INVALIDATED') throw e;
                        if (staleEntry && !signal.aborted) {
                            await this._consumeDataEntry(staleEntry, cacheKey, signal, target);
                        } else {
                            throw e;
                        }
                    } finally{
                        if (staleEntry) AlpineComponentLoader._detachedDataEntries.delete(staleEntry);
                    }
                } else if (strategy === 'stale-while-revalidate' && cacheEntry?.settled !== false) {
                    await this._consumeDataEntry(cacheEntry, cacheKey, signal, target);
                    const refreshEntry = this._createDataCacheEntry(cacheKey, finalUrl, fetchOptions, target, strategy);
                    refreshEntry.promise.then(async ()=>{
                        // Handle the resolved operation
                        if (this.isConnected && !signal.aborted) await this._consumeDataEntry(refreshEntry, cacheKey, signal, target);
                        if (this.isConnected && !signal.aborted) this._dispatchAcl('revalidated', {
                            phase: 'data',
                            url: finalUrl,
                            strategy,
                            target
                        });
                    }).catch(()=>{
                    // Ignore detached revalidation failures
                    });
                } else {
                    if (!cacheEntry) cacheEntry = this._createDataCacheEntry(cacheKey, finalUrl, fetchOptions, target, strategy);
                    await this._consumeDataEntry(cacheEntry, cacheKey, signal, target);
                }
                this._aclDebug.dataCacheSize = dataFetchCache.size;
            } catch (e) {
                // Handle errors or timeout cancellations for the specific instance
                if (signal.aborted) {
                    if (signal.reason === 'Timeout') {
                        this.$props.$error = `Request timed out after ${timeoutMs}ms`;
                        this._clearFetchedData(target);
                        const timeoutError = new ACLLoadError(this.$props.$error, {
                            code: 'ACL_FETCH_TIMEOUT',
                            phase: 'fetch',
                            retryable: true
                        });
                        this._dispatchAcl('error', {
                            error: timeoutError,
                            phase: 'fetch',
                            url
                        });
                        if (options.throwOnError) throw timeoutError;
                    }
                    return;
                }
                if (e?.code === 'ACL_CACHE_INVALIDATED') return;
                AlpineComponentLoader._report('error', `[ACL] Fetch failed for ${url}`, e, {
                    tagName,
                    phase: 'fetch',
                    url
                });
                this.$props.$error = e.message;
                this._clearFetchedData(target);
                this._dispatchAcl('error', {
                    error: toACLLoadError(e, {
                        code: 'ACL_FETCH_FAILED',
                        phase: 'fetch'
                    }),
                    phase: 'fetch',
                    url
                });
                if (options.throwOnError) throw e;
            } finally{
                // Cleanup timers and unlock component loading states
                clearTimeout(timeoutId);
                this._aclDebug.dataCacheSize = dataFetchCache.size;
                if (this._fetchGeneration === generation && this._fetchAbortController === controller) {
                    this.$props.$loading = false;
                    this._fetchAbortController = null;
                }
            }
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
