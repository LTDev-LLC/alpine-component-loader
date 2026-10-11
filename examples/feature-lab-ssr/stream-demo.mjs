import { createSSRRenderer } from '../../server/ssr.mjs';

// Exercise the renderer's real ordered iterator with cooperative application callbacks
export const streamDemo = async (request, response, { manifest, root, url }) => {
    const concurrency = Number(url.searchParams.get('concurrency') || 8);
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
        response.writeHead(400).end('Concurrency must be an integer from 1 to 8');
        return;
    }
    const controller = new AbortController(),
        stats = {
            started: 0,
            active: 0,
            peak: 0,
            completed: [],
            yielded: [],
        },
        renderer = createSSRRenderer({
            manifest,
            root,
            dataResolver: async ({ attributes, signal }) => {
                // Slow the first item so later completion cannot change output order
                const index = Number(attributes['data-stream-index']);
                stats.started++;
                stats.active++;
                stats.peak = Math.max(stats.peak, stats.active);
                // Release callback ownership on success, failure, or client disconnect
                try {
                    await new Promise((resolve, reject) => {
                        // Bound each fixture wait and remove abort subscriptions after settlement
                        const cleanup = () => signal.removeEventListener('abort', abort),
                            timer = setTimeout(
                                () => {
                                    cleanup();
                                    resolve();
                                },
                                index === 0 ? 600 : 150,
                            ),
                            abort = () => {
                                clearTimeout(timer);
                                cleanup();
                                reject(signal.reason);
                            };
                        if (signal.aborted) abort();
                        else signal.addEventListener('abort', abort, { once: true });
                    });
                    stats.completed.push(index);
                    return undefined;
                } finally {
                    stats.active--;
                }
            },
        }),
        // Complete the current demonstration operation
        requests = Array.from({ length: 12 }, (_, index) => ({
            tagName: 'lab-slot-panel',
            attributes: { 'data-stream-index': index },
            slots: {
                title: 'Ordered result ' + index,
                default: '<p>Isolated slot content for result ' + index + '</p>',
            },
        })),
        // Complete the current demonstration operation
        disconnect = () => {
            if (!response.writableEnded) controller.abort(new DOMException('Consumer disconnected', 'AbortError'));
        };
    response.on('close', disconnect);
    response.writeHead(200, {
        'content-type': 'application/x-ndjson',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
    });
    // Deliver already yielded HTML even if a later render is canceled or fails
    try {
        const output =
            url.searchParams.get('mode') === 'batch'
                ? await renderer.renderMany(requests, {
                      concurrency,
                      signal: controller.signal,
                  })
                : renderer.renderStream(requests, {
                      concurrency,
                      signal: controller.signal,
                  });
        let index = 0;
        // Consume no farther than the HTTP socket admits
        for await (const html of output) {
            stats.yielded.push(index);
            const writable = response.write(
                JSON.stringify({
                    index,
                    html,
                    stats,
                }) + '\n',
            );
            index++;
            if (!writable)
                await new Promise((resolve, reject) => {
                    // Remove both socket listeners regardless of which settles first
                    const cleanup = () => {
                            response.removeListener('drain', drain);
                            response.removeListener('close', close);
                        },
                        drain = () => {
                            cleanup();
                            resolve();
                        },
                        close = () => {
                            cleanup();
                            reject(new DOMException('Consumer disconnected', 'AbortError'));
                        };
                    response.once('drain', drain);
                    response.once('close', close);
                });
        }
        response.end(
            JSON.stringify({
                complete: true,
                stats,
            }) + '\n',
        );
    } catch (error) {
        if (!response.destroyed)
            response.end(
                JSON.stringify({
                    error: error.message,
                    stats,
                }) + '\n',
            );
    } finally {
        controller.abort();
        response.removeListener('close', disconnect);
        renderer.clearCache();
    }
};
