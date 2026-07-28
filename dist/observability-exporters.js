// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

export const createBatchExporter = ({ send, batchSize = 20, flushInterval = 5_000, maxQueue = 200, retries = 2, retryDelay = 250, target = globalThis } = {})=>{
    if (typeof send !== 'function') throw new TypeError('ACL observability exporters require send(records).');
    if (!Number.isInteger(batchSize) || batchSize <= 0) throw new TypeError('batchSize must be a positive integer.');
    if (!Number.isInteger(maxQueue) || maxQueue <= 0) throw new TypeError('maxQueue must be a positive integer.');
    if (!Number.isFinite(flushInterval) || flushInterval < 0) throw new TypeError('flushInterval must be a non-negative finite number.');
    if (!Number.isInteger(retries) || retries < 0) throw new TypeError('retries must be a non-negative integer.');
    if (!Number.isFinite(retryDelay) || retryDelay < 0) throw new TypeError('retryDelay must be a non-negative finite number.');
    let queue = [], timer = null, flushing = null, disposed = false;
    const schedule = ()=>{
        if (disposed || timer || !queue.length || flushInterval <= 0) return;
        timer = setTimeout(// Run this operation
        ()=>{
            timer = null;
            void flush();
        }, flushInterval);
    }, deliver = async (records)=>{
        let lastError;
        // Process for
        for(let attempt = 0; attempt <= retries; attempt++){
            // Process try
            try {
                await send(records);
                return;
            } catch (error) {
                lastError = error;
                if (attempt < retries) // Wait before retrying the failed batch
                await new Promise((resolve)=>setTimeout(resolve, retryDelay * 2 ** attempt));
            }
        }
        throw lastError;
    }, flush = async ()=>{
        if (flushing) return flushing;
        if (!queue.length) return;
        clearTimeout(timer);
        timer = null;
        flushing = (async ()=>{
            // Process while
            while(queue.length){
                const records = queue.splice(0, batchSize);
                // Process try
                try {
                    await deliver(records);
                } catch  {
                    if (!disposed) {
                        queue.unshift(...records);
                        if (queue.length > maxQueue) queue.splice(0, queue.length - maxQueue);
                    }
                    break;
                }
            }
        })().finally(// Run this operation
        ()=>{
            flushing = null;
            if (queue.length) schedule();
        });
        return flushing;
    }, onPageHide = ()=>{
        void flush();
    }, listener = (record)=>{
        if (disposed) return;
        queue.push(record);
        if (queue.length > maxQueue) queue.splice(0, queue.length - maxQueue);
        if (queue.length >= batchSize) void flush();
        else schedule();
    };
    target.addEventListener?.('pagehide', onPageHide);
    Object.assign(listener, {
        flush,
        async dispose () {
            if (disposed) return;
            disposed = true;
            clearTimeout(timer);
            timer = null;
            target.removeEventListener?.('pagehide', onPageHide);
            await flushing;
            if (queue.length) {
                const remaining = queue;
                queue = [];
                await deliver(remaining).catch(()=>{});
            }
        }
    });
    Object.defineProperty(listener, 'size', {
        get: ()=>queue.length
    });
    return listener;
};
export const createBeaconExporter = ({ url, fetch: suppliedFetch = globalThis.fetch, navigator: suppliedNavigator = globalThis.navigator, headers = {}, ...batchOptions } = {})=>{
    if (!url) throw new TypeError('Beacon exporters require a URL.');
    return createBatchExporter({
        ...batchOptions,
        // Run this operation
        send: async (records)=>{
            const body = JSON.stringify({
                // Configure this value
                version: 1,
                records
            }), canBeacon = suppliedNavigator?.sendBeacon && !Object.keys(headers).length;
            if (canBeacon && suppliedNavigator.sendBeacon(url, new Blob([
                body
            ], {
                type: 'application/json'
            }))) return;
            if (typeof suppliedFetch !== 'function') throw new TypeError('Beacon fallback requires fetch().');
            const response = await suppliedFetch(url, {
                method: 'POST',
                headers: {
                    // Configure this value
                    'Content-Type': 'application/json',
                    ...headers
                },
                body,
                keepalive: true
            });
            if (!response.ok) throw new Error(`Observability export failed with HTTP ${response.status}.`);
        }
    });
};
export const createOpenTelemetryExporter = ({ tracer = null, meter = null, logger = null, maxSpans = 200 } = {})=>{
    const spans = new Map(), counter = meter?.createCounter?.('acl.runtime.records');
    const listener = (record)=>{
        // Process try
        try {
            counter?.add?.(1, {
                'acl.type': record.type,
                'acl.phase': record.phase || '',
                'acl.tag': record.tagName || ''
            });
            if (record.requestId && record.type.endsWith('start') && tracer?.startSpan) {
                spans.set(record.requestId, tracer.startSpan(`acl.${record.type}`, {
                    attributes: {
                        'acl.request_id': record.requestId,
                        'acl.tag': record.tagName || '',
                        'acl.phase': record.phase || ''
                    }
                }));
                // Process while
                while(spans.size > maxSpans){
                    const [key, span] = spans.entries().next().value;
                    span.end?.();
                    spans.delete(key);
                }
            } else if (record.requestId && record.type.endsWith('end')) {
                const span = spans.get(record.requestId);
                span?.setAttribute?.('acl.duration_ms', record.duration || 0);
                span?.setStatus?.({
                    code: record.severity === 'error' ? 2 : 1
                });
                span?.end?.();
                spans.delete(record.requestId);
            }
            logger?.emit?.({
                body: record.type,
                severityText: record.severity,
                attributes: record
            });
        } catch  {
        // Vendor integrations are isolated from the loader
        }
    };
    listener.dispose = ()=>{
        spans.forEach(// Run this operation
        (span)=>span.end?.());
        spans.clear();
    };
    return listener;
};
export const createSentryExporter = ({ client } = {})=>{
    if (!client) throw new TypeError('Sentry exporters require an existing client.');
    // Translate ACL records into Sentry events without exposing client failures
    return (record)=>{
        // Process try
        try {
            if (record.severity === 'error') client.captureMessage?.(record.detail?.message || record.type, {
                level: 'error',
                tags: {
                    // Configure this value
                    aclPhase: record.phase,
                    aclTag: record.tagName
                },
                extra: {
                    acl: record
                }
            });
            else client.addBreadcrumb?.({
                category: 'acl',
                level: record.severity,
                message: record.type,
                data: record
            });
        } catch  {
        // Vendor integrations are isolated from the loader
        }
    };
};
export const connectExporter = (loader, exporter)=>{
    if (typeof exporter !== 'function') throw new TypeError('ACL exporter must be a record listener.');
    const unsubscribe = loader.subscribe(exporter);
    return {
        // Run this operation
        flush: ()=>exporter.flush?.(),
        // Run this operation
        async dispose () {
            unsubscribe();
            await exporter.dispose?.();
        }
    };
};
export default {
    connectExporter,
    createBatchExporter,
    createBeaconExporter,
    createOpenTelemetryExporter,
    createSentryExporter
};
