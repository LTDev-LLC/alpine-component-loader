// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

// Compute component priorities only after scheduling has been enabled
export const scheduleComponentInitialization = (owner, component, settings, run, signal)=>{
    const mode = component._reloadGeneration ? 'eager' : component.hasAttribute('data-acl-ssr') ? component.getAttribute('hydrate') || settings.hydrate : component.getAttribute('loading') || settings.loading;
    return scheduleInitialization(owner, run, {
        signal,
        settings: settings.hydrationScheduler,
        priority: mode === 'idle' ? 2 : [
            'visible',
            'lazy',
            'media'
        ].includes(mode) ? 1 : 0
    });
};
const queues = new WeakMap();
// Admit short synchronous phases in bounded turns with stable priority order
export const scheduleInitialization = (owner, run, { signal, settings, priority = 1 } = {})=>{
    if (!settings) return Promise.resolve().then(run);
    if (signal?.aborted) return Promise.reject(signal.reason);
    let state = queues.get(owner);
    if (!state) {
        state = {
            jobs: [],
            timer: null,
            sequence: 0,
            running: false
        };
        queues.set(owner, state);
    }
    return new Promise((resolve, reject)=>{
        // Remove canceled tasks promptly instead of retaining component closures
        const job = {
            run,
            resolve,
            reject,
            priority,
            sequence: state.sequence++,
            signal,
            settings
        }, abort = ()=>{
            const index = state.jobs.indexOf(job);
            if (index >= 0) state.jobs.splice(index, 1);
            reject(signal.reason);
            if (!state.jobs.length) {
                clearTimeout(state.timer);
                state.timer = null;
            }
        };
        job.release = ()=>signal?.removeEventListener('abort', abort);
        signal?.addEventListener('abort', abort, {
            once: true
        });
        const tick = async ()=>{
            // Yield after the soft time budget or admission count is reached
            state.timer = null;
            state.running = true;
            const start = performance.now(), options = state.jobs[0]?.settings || settings;
            let count = 0;
            // Process queued work in a bounded deterministic order
            while(state.jobs.length && count < (options.maxTasksPerTurn ?? 4) && performance.now() - start < (options.budgetMs ?? 8)){
                // Resolve this operation and preserve independent ownership
                state.jobs.sort((a, b)=>a.priority - b.priority || a.sequence - b.sequence);
                const next = state.jobs.shift();
                next.release();
                if (next.signal?.aborted) {
                    next.reject(next.signal.reason);
                    continue;
                }
                // Release resources on both success and failure
                try {
                    next.resolve(await next.run());
                } catch (error) {
                    next.reject(error);
                }
                count++;
            }
            state.running = false;
            if (state.jobs.length) state.timer = setTimeout(tick, 0);
        };
        state.jobs.push(job);
        if (state.timer === null && !state.running) state.timer = setTimeout(tick, 0);
    });
};
