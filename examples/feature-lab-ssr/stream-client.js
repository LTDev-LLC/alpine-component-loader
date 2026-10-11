// Compare the real server batch and ordered streaming paths without replacing existing SSR output
const output = document.querySelector('#stream-results'),
    summary = document.querySelector('#stream-summary'),
    concurrency = document.querySelector('#stream-concurrency');
let controller;
// Retain partial output when the consumer closes the stream
const run = async (mode) => {
    controller?.abort();
    const current = (controller = new AbortController()),
        started = performance.now();
    output.replaceChildren();
    summary.textContent = 'Waiting for the deliberately slow first render…';
    // Handle both complete output and cancellation without an unhandled rejection
    try {
        const response = await fetch('/demo-stream?mode=' + mode + '&concurrency=' + concurrency.value, {
            signal: current.signal,
        });
        if (!response.ok) throw new Error(await response.text());
        const reader = response.body.getReader(),
            decoder = new TextDecoder();
        let buffered = '',
            count = 0;
        // Decode NDJSON incrementally, preserving boundaries across arbitrary network chunks
        while (true) {
            const chunk = await reader.read();
            if (current !== controller || current.signal.aborted) {
                await reader.cancel();
                return;
            }
            buffered += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
            let newline;
            // Consume complete records without buffering the entire HTTP response
            while ((newline = buffered.indexOf('\n')) >= 0) {
                const record = JSON.parse(buffered.slice(0, newline));
                buffered = buffered.slice(newline + 1);
                if (record.html) {
                    const region = document.createElement('article');
                    region.setAttribute('aria-label', 'Streamed result ' + record.index);
                    // HTML is the renderer's sanitized output from this same-origin demonstration endpoint
                    region.innerHTML = record.html;
                    output.append(region);
                    count++;
                }
                summary.textContent = JSON.stringify(
                    {
                        mode,
                        delivered: count,
                        elapsedMs: Math.round(performance.now() - started),
                        ...record.stats,
                    },
                    null,
                    2,
                );
                window.streamDemoResult = {
                    mode,
                    delivered: count,
                    ...record.stats,
                };
            }
            if (chunk.done) break;
        }
    } catch (error) {
        if (current !== controller) return;
        summary.textContent += current.signal.aborted
            ? '\nCanceled; already delivered results remain visible'
            : '\n' + error.message;
    }
};
// Handle the lifecycle event and release owned work
document.querySelector('#run-stream').addEventListener('click', () => {
    void run('stream');
});
// Handle the lifecycle event and release owned work
document.querySelector('#run-batch').addEventListener('click', () => {
    void run('batch');
});
// Handle the lifecycle event and release owned work
document.querySelector('#cancel-stream').addEventListener('click', () => controller?.abort());
// Handle the lifecycle event and release owned work
window.addEventListener('pagehide', () => controller?.abort(), { once: true });

// Repeated props/slots on one renderer demonstrate that cached parsed templates cannot leak render mutations
const reuse = document.querySelector('#reuse-results');
// Handle the lifecycle event and release owned work
document.querySelector('#run-reuse').addEventListener('click', async () => {
    // Run result for this example
    const result = await fetch('/demo-reuse').then((response) => response.json());
    reuse.textContent = JSON.stringify(result, null, 2);
});
