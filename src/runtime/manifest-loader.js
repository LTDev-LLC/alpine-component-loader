// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js',
    importLocalModule = (specifier) => import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)),
    { ACLLoadError, toACLLoadError } = await importLocalModule('./errors.js'),
    pendingByLoader = new WeakMap();

const decodeJsonResponse = // Run this operation
    async (response, maxBytes) => {
        const declared = Number(response.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > maxBytes)
            throw new ACLLoadError(`Manifest response exceeds ${maxBytes} bytes.`, {
                code: 'ACL_MANIFEST_TOO_LARGE',
                phase: 'manifest',
            });
        let bytes;
        if (response.body?.getReader) {
            const reader = response.body.getReader(),
                chunks = [];
            let total = 0;
            // Process while
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                total += value.byteLength;
                if (total > maxBytes) {
                    await reader.cancel();
                    throw new ACLLoadError(`Manifest response exceeds ${maxBytes} bytes.`, {
                        code: 'ACL_MANIFEST_TOO_LARGE',
                        phase: 'manifest',
                    });
                }
                chunks.push(value);
            }
            bytes = new Uint8Array(total);
            let offset = 0;
            // Process forof
            for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.byteLength;
            }
        } else {
            bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.byteLength > maxBytes)
                throw new ACLLoadError(`Manifest response exceeds ${maxBytes} bytes.`, {
                    code: 'ACL_MANIFEST_TOO_LARGE',
                    phase: 'manifest',
                });
        }
        // Process try
        try {
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch (error) {
            throw new ACLLoadError('Manifest response contains invalid JSON.', {
                code: 'ACL_MANIFEST_INVALID_JSON',
                phase: 'manifest',
                cause: error,
            });
        }
    };

const fetchJson = // Run this operation
    async (
        source,
        {
            fetch: suppliedFetch = globalThis.fetch,
            signal = null,
            timeout = 10_000,
            maxBytes = 1024 * 1024,
            cache = 'default',
            integrity = '',
        } = {},
    ) => {
        if (typeof suppliedFetch !== 'function')
            throw new ACLLoadError('Manifest loading requires fetch().', {
                code: 'ACL_ENVIRONMENT_UNAVAILABLE',
                phase: 'environment',
            });
        if (!Number.isFinite(timeout) || timeout <= 0)
            throw new TypeError('Manifest timeout must be a positive finite number.');
        if (!Number.isInteger(maxBytes) || maxBytes <= 0)
            throw new TypeError('Manifest maxBytes must be a positive integer.');
        const url = new URL(source, globalThis.location?.href || 'http://localhost/'),
            controller = new AbortController(),
            abort = // Run this operation
                () => controller.abort(signal?.reason || 'Manifest request canceled'),
            timer = setTimeout(
                // Run this operation
                () => controller.abort('Manifest request timed out'),
                timeout,
            );
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
        // Process try
        try {
            const response = await suppliedFetch(url, {
                headers: { Accept: 'application/json' },
                cache,
                integrity,
                signal: controller.signal,
            });
            if (!response.ok)
                throw new ACLLoadError(`Manifest request failed with HTTP ${response.status}.`, {
                    code: 'ACL_MANIFEST_HTTP_ERROR',
                    phase: 'manifest',
                    status: response.status,
                    retryable: response.status >= 500,
                });
            return {
                value: await decodeJsonResponse(response, maxBytes),
                url: response.url || url.href,
            };
        } catch (error) {
            if (error instanceof ACLLoadError) throw error;
            const canceled = controller.signal.aborted,
                timedOut = !signal?.aborted && canceled;
            throw toACLLoadError(error, {
                code: timedOut ? 'ACL_MANIFEST_TIMEOUT' : canceled ? 'ACL_LOAD_CANCELED' : 'ACL_MANIFEST_FETCH_FAILED',
                phase: 'manifest',
                retryable: !canceled,
            });
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
        }
    };

export const registerManifestFrom = // Run this operation
    async (loader, source, options = {}) => {
        const url = new URL(source, globalThis.location?.href || 'http://localhost/'),
            key = `${url.href}::${options.integrity || ''}`,
            pending = pendingByLoader.get(loader) || new Map();
        pendingByLoader.set(loader, pending);
        if (pending.has(key)) return pending.get(key);
        const operation = // Run this operation
            (async () => {
                const { value: manifest, url: responseUrl } = await fetchJson(url, options),
                    manifestBase =
                        options.basePath ??
                        new URL(
                            typeof manifest.basePath === 'string' && manifest.basePath ? manifest.basePath : '.',
                            responseUrl,
                        ).href;
                let result;
                // Process try
                try {
                    result = await loader.registerManifest(manifest, {
                        basePath: manifestBase,
                        prefetch: options.prefetch,
                        concurrency: options.concurrency,
                    });
                } catch (error) {
                    throw new ACLLoadError('Manifest validation or registration failed.', {
                        code: 'ACL_MANIFEST_INVALID',
                        phase: 'manifest',
                        cause: error,
                    });
                }
                return {
                    ...result,
                    manifest,
                    manifestUrl: responseUrl,
                };
            })();
        pending.set(key, operation);
        // Process try
        try {
            return await operation;
        } catch (error) {
            if (pending.get(key) === operation) pending.delete(key);
            throw error;
        }
    };

const sriFromRevision = // Run this operation
    (revision) => {
        if (!String(revision || '').startsWith('sha256-')) return '';
        const encoded = revision.slice(7).replaceAll('-', '+').replaceAll('_', '/'),
            padding = '='.repeat((4 - (encoded.length % 4)) % 4);
        return `sha256-${encoded}${padding}`;
    };

export const registerRouteManifest = // Run this operation
    async (loader, routeKey, indexOrUrl, options = {}) => {
        let index = indexOrUrl,
            indexUrl = options.baseUrl || globalThis.location?.href || 'http://localhost/';
        if (typeof indexOrUrl === 'string' || indexOrUrl instanceof URL) {
            const loaded = await fetchJson(indexOrUrl, options);
            index = loaded.value;
            indexUrl = loaded.url;
        }
        if (!index || index.version !== 1 || !index.routes || typeof index.routes !== 'object')
            throw new ACLLoadError('Route indexes require version: 1 and a routes map.', {
                code: 'ACL_ROUTE_INDEX_INVALID',
                phase: 'manifest',
            });
        const key = String(routeKey),
            route = index.routes[key];
        if (!route?.manifest)
            throw new ACLLoadError(`Route index does not contain "${key}".`, {
                code: 'ACL_ROUTE_NOT_FOUND',
                phase: 'manifest',
            });
        return await registerManifestFrom(loader, new URL(route.manifest, indexUrl), {
            ...options,
            integrity: options.integrity || sriFromRevision(route.revision),
        });
    };

export default {
    // Configure this value
    registerManifestFrom,
    registerRouteManifest,
};
