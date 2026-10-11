// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

const suffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js', importLocalModule = (specifier)=>import(/* @vite-ignore */ specifier.replace(/\.js$/, suffix)), { ACLLoadError } = await importLocalModule('./errors.js');
// Preserve structured cancellation reasons without converting them into network failures
export const cancellationError = (signal)=>signal?.reason instanceof ACLLoadError ? signal.reason : new ACLLoadError('Template loading was canceled', {
        code: 'ACL_LOAD_CANCELED',
        phase: 'template',
        cause: signal?.reason
    });
// Race work against a signal even when a caller-supplied transport ignores cancellation
export const withSignal = (operation, signal)=>{
    if (!signal) return Promise.resolve(operation);
    if (signal.aborted) return Promise.reject(cancellationError(signal));
    return new Promise((resolve, reject)=>{
        // Remove listeners on either settlement path
        const abort = ()=>{
            signal.removeEventListener('abort', abort);
            reject(cancellationError(signal));
        };
        signal.addEventListener('abort', abort, {
            once: true
        });
        Promise.resolve(operation).then(resolve, reject).finally(()=>signal.removeEventListener('abort', abort));
    });
};
// Read decoded response bytes without retaining duplicate response bodies
export const readTemplateResponse = async (response, maxBytes, signal)=>{
    // Resolve this operation and preserve independent ownership
    const tooLarge = ()=>new ACLLoadError(`Template exceeds ${maxBytes} bytes`, {
            code: 'ACL_TEMPLATE_TOO_LARGE',
            phase: 'template'
        });
    if (Number(response.headers.get('content-length')) > maxBytes) {
        void response.body?.cancel?.().catch(()=>{});
        throw tooLarge();
    }
    if (!response.body?.getReader) {
        const bytes = new Uint8Array(await withSignal(response.arrayBuffer(), signal));
        if (bytes.byteLength > maxBytes) throw tooLarge();
        return new TextDecoder().decode(bytes);
    }
    const reader = response.body.getReader(), decoder = new TextDecoder(), parts = [];
    let total = 0, completed = false;
    // Consume bounded chunks and release the body on every exit
    try {
        // Process queued work in a bounded deterministic order
        while(true){
            const { done, value } = await withSignal(reader.read(), signal);
            if (done) {
                completed = true;
                break;
            }
            total += value.byteLength;
            if (total > maxBytes) throw tooLarge();
            parts.push(decoder.decode(value, {
                stream: true
            }));
        }
        parts.push(decoder.decode());
        return parts.join('');
    } finally{
        if (!completed) void reader.cancel?.().catch(()=>{});
        reader.releaseLock?.();
    }
};
// Bound the full network transaction including streaming response consumption
export const fetchTemplateText = async (source, settings, signal)=>{
    const controller = new AbortController(), // Resolve this operation and preserve independent ownership
    abort = ()=>controller.abort(signal.reason), timer = settings.templateTimeout > 0 ? setTimeout(// Resolve this operation and preserve independent ownership
    ()=>controller.abort(new ACLLoadError('Template request timed out', {
            code: 'ACL_TEMPLATE_TIMEOUT',
            phase: 'template',
            retryable: true
        })), settings.templateTimeout) : null;
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, {
        once: true
    });
    // Release resources on both success and failure
    try {
        const response = await withSignal(fetch(source, {
            cache: 'no-store',
            signal: controller.signal
        }), controller.signal);
        if (!response.ok) {
            void response.body?.cancel?.().catch(()=>{});
            throw new ACLLoadError(`HTTP ${response.status}`, {
                code: 'ACL_TEMPLATE_HTTP_ERROR',
                phase: 'template',
                status: response.status,
                retryable: response.status >= 500
            });
        }
        const text = await readTemplateResponse(response, settings.templateMaxBytes, controller.signal);
        return {
            text,
            response
        };
    } catch (error) {
        if (controller.signal.aborted) throw cancellationError(controller.signal);
        if (error instanceof ACLLoadError) throw error;
        throw new ACLLoadError('Template fetch failed', {
            code: 'ACL_TEMPLATE_FETCH_FAILED',
            phase: 'template',
            cause: error,
            retryable: true
        });
    } finally{
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
    }
};
// Coordinate subscriber ownership and a loader-wide speculative download queue
export const createTemplateRequests = (entries, getConcurrency)=>{
    const queue = [];
    let active = 0, disposed = false;
    const drain = ()=>{
        // Admit speculative jobs only while the global capacity permits
        while(queue.length && active < getConcurrency())start(queue.shift(), true);
    }, start = (job, speculative)=>{
        // Foreground promotions bypass speculative capacity without duplicating work
        if (job.entry.controller.signal.aborted) {
            job.reject(cancellationError(job.entry.controller.signal));
            return;
        }
        if (speculative) active++;
        Promise.resolve().then(job.run).then(job.resolve, job.reject)// Resolve this operation and preserve independent ownership
        .finally(()=>{
            if (speculative) active--;
            drain();
        });
    }, promote = (entry)=>{
        // Release any queued job needed by a foreground subscriber immediately
        entry.speculative = false;
        // Process queued work in a bounded deterministic order
        for(let index = queue.length - 1; index >= 0; index--)if (queue[index].entry === entry) start(queue.splice(index, 1)[0], false);
    }, subscribe = (key, options, task)=>{
        // Share work only while at least one subscriber still owns the transaction
        if (disposed) return Promise.reject(new ACLLoadError('Loader disposed', {
            code: 'ACL_LOADER_DISPOSED',
            phase: 'template'
        }));
        if (options.signal?.aborted) return Promise.reject(cancellationError(options.signal));
        let entry = entries.get(key);
        if (!entry) {
            entry = {
                controller: new AbortController(),
                subscribers: 0,
                settled: false,
                speculative: options.priority === 'prefetch'
            };
            const current = entry, context = {
                signal: entry.controller.signal,
                // Resolve this operation and preserve independent ownership
                ensureActive () {
                    if (current.controller.signal.aborted) throw cancellationError(current.controller.signal);
                },
                network (run) {
                    // Queue just downloads so cache lookups never consume network capacity
                    if (!current.speculative) return Promise.resolve().then(run);
                    // Resolve this operation and preserve independent ownership
                    return new Promise((resolve, reject)=>{
                        queue.push({
                            entry: current,
                            run,
                            resolve,
                            reject
                        });
                        drain();
                    });
                }
            };
            entry.promise = Promise.resolve()// Resolve this operation and preserve independent ownership
            .then(()=>task(context))// Resolve this operation and preserve independent ownership
            .finally(()=>{
                current.settled = true;
                if (entries.get(key) === current) entries.delete(key);
            });
            entries.set(key, entry);
        } else if (options.priority !== 'prefetch') promote(entry);
        const current = entry;
        current.subscribers++;
        return withSignal(withSignal(current.promise, current.controller.signal), options.signal).finally(()=>{
            // Abort only after the final consumer relinquishes unfinished work
            current.subscribers--;
            if (!current.subscribers && !current.settled) {
                current.controller.abort('No template subscribers');
                if (entries.get(key) === current) entries.delete(key);
                // Process queued work in a bounded deterministic order
                for(let index = queue.length - 1; index >= 0; index--)if (queue[index].entry === current) queue.splice(index, 1)[0].reject(cancellationError(current.controller.signal));
            }
        });
    };
    return {
        subscribe,
        dispose () {
            // Release background revalidation and direct API requests on loader disposal
            disposed = true;
            entries.forEach((entry)=>entry.controller.abort('Loader disposed'));
            queue.splice(0).forEach((job)=>job.reject(cancellationError(job.entry.controller.signal)));
            entries.clear();
        }
    };
};
