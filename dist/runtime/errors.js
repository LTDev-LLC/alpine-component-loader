// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js', importLocalModule = (specifier)=>import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)), { ACLLoadError } = await importLocalModule('../acl-load-error.js');
export { ACLLoadError };
// Resolve after a non-negative delay
export const delay = (ms)=>new Promise(// Settle the asynchronous operation
    (resolve)=>setTimeout(resolve, ms));
// Wait for a delay while releasing both timer and abort listener on either outcome
export const delayWithSignal = (ms, signal)=>new Promise((resolve, reject)=>{
        // Settle the asynchronous operation
        if (signal?.aborted) {
            reject(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason || 'Aborted')));
            return;
        }
        let settled = false;
        // Funnel timeout and abort completion through one idempotent resource-release path
        const cleanup = ()=>signal?.removeEventListener('abort', onAbort), finish = (callback, value)=>{
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            cleanup();
            callback(value);
        }, onAbort = ()=>finish(reject, signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason || 'Aborted'))), timeout = setTimeout(// Run the scheduled delayed task
        ()=>finish(resolve), Math.max(0, ms));
        signal?.addEventListener('abort', onAbort, {
            once: true
        });
    });
// Race any promise against an abort signal without leaving its listener attached
export const raceWithSignal = (promise, signal, createAbortError = ()=>{
    // Create the default abort error
    return new Error('Aborted');
})=>// Handle race with signal
    new Promise((resolve, reject)=>{
        // Settle the asynchronous operation
        if (signal?.aborted) {
            reject(createAbortError(signal.reason));
            return;
        }
        let settled = false;
        // Settle only once when the source promise and abort event race each other
        const cleanup = ()=>signal?.removeEventListener('abort', onAbort), finish = (callback, value)=>{
            if (settled) return;
            settled = true;
            cleanup();
            callback(value);
        }, onAbort = ()=>finish(reject, createAbortError(signal?.reason));
        signal?.addEventListener('abort', onAbort, {
            once: true
        });
        Promise.resolve(promise).then(// Handle the resolved operation
        (value)=>finish(resolve, value), // Handle the resolved operation
        (error)=>finish(reject, error));
    });
// Preserve typed loader errors or wrap unknown values with phase-specific defaults
export const toACLLoadError = (error, defaults = {})=>{
    if (error instanceof ACLLoadError) return error;
    return new ACLLoadError(error?.message || String(error), {
        ...defaults,
        cause: error
    });
};
// Parse Retry-After as either delta seconds or an HTTP date in milliseconds
export const getRetryAfterMs = (response)=>{
    const value = response?.headers?.get('retry-after');
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(value);
    return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
};
