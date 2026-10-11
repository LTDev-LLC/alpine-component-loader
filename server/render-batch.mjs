// Render only a bounded input-order window and cancel ownership when consumption stops
export const renderOrderedBatch = async function* (requests, render, { concurrency = 8, signal } = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1)
        throw new TypeError('SSR concurrency must be a positive integer');
    const controller = new AbortController(),
        // Resolve this operation and preserve independent ownership
        abort = () => controller.abort(signal.reason),
        iterator = (requests || [])[Symbol.iterator](),
        pending = [];
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    let ended = false;
    // Resolve this operation and preserve independent ownership
    const assertActive = () => {
            if (controller.signal.aborted) throw controller.signal.reason;
        },
        launch = () => {
            // Pull no farther than one concurrency window ahead of the consumer
            assertActive();
            const next = iterator.next();
            if (next.done) {
                ended = true;
                return;
            }
            const child = new AbortController(),
                release = [];
            // Combine batch and individual ownership without requiring AbortSignal.any
            for (const parent of [controller.signal, next.value.signal].filter(Boolean)) {
                // Resolve this operation and preserve independent ownership
                const cancel = () => child.abort(parent.reason);
                if (parent.aborted) cancel();
                else parent.addEventListener('abort', cancel, { once: true });
                // Resolve this operation and preserve independent ownership
                release.push(() => parent.removeEventListener('abort', cancel));
            }
            const operation = Promise.resolve()
                // Resolve this operation and preserve independent ownership
                .then(() => {
                    // Recheck ownership before invoking an application render callback
                    assertActive();
                    return render(next.value.tagName, {
                        ...next.value,
                        signal: child.signal,
                    });
                })
                // Resolve this operation and preserve independent ownership
                .finally(() => release.forEach((remove) => remove()));
            pending.push(operation);
            // Resolve this operation and preserve independent ownership
            operation.catch((error) => controller.abort(error));
        },
        wait = (operation) =>
            new Promise((resolve, reject) => {
                // Surface later-window failures even while the first render is still pending
                const onAbort = () => reject(controller.signal.reason);
                if (controller.signal.aborted) {
                    onAbort();
                    return;
                }
                controller.signal.addEventListener('abort', onAbort, { once: true });
                // Resolve this operation and preserve independent ownership
                operation.then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', onAbort));
            });
    // Release resources on both success and failure
    try {
        // Process queued work in a bounded deterministic order
        while (!ended && pending.length < concurrency) launch();
        // Process queued work in a bounded deterministic order
        while (pending.length) {
            const html = await wait(pending.shift());
            assertActive();
            yield html;
            if (!ended) launch();
        }
    } finally {
        controller.abort(new DOMException('SSR batch closed', 'AbortError'));
        signal?.removeEventListener('abort', abort);
        iterator.return?.();
    }
};
