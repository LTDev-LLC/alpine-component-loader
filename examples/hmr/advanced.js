// Activate transformation and pending-request probes only when their controls are requested
const output = document.querySelector('#advanced-hmr-output'),
    root = document.querySelector('#advanced-hmr-fixture');
let loader,
    host,
    count = 0;
// Handle the lifecycle event and release owned work
document.querySelector('#mount-transform-probe').addEventListener('click', async () => {
    const { default: Loader } = await import('alpine-component-loader');
    loader = Loader;
    await loader.define('hmr-transform-probe', '/components/transform-card.html', {
        sanitize: false,
        executeScripts: true,
    });
    host = document.createElement('hmr-transform-probe');
    host.innerHTML = '<p>Consumer slot survives reload</p>';
    // Run ready for this example
    const ready = new Promise((resolve) => host.addEventListener('loaded', resolve, { once: true }));
    root.replaceChildren(host);
    await ready;
    output.textContent = 'Transformation probe ready; edit components/transform-card.html to exercise real HMR';
});
// Handle the lifecycle event and release owned work
document.querySelector('#reload-transform-probe').addEventListener('click', async () => {
    if (!host) return;
    await host.reload({
        preserveState: true,
        clearTemplate: false,
        clearData: false,
    });
    output.textContent = JSON.stringify(
        {
            scriptExecutions: window.hmrScriptExecutions,
            projected: host.textContent.includes('Consumer slot survives reload'),
            draft: host.querySelector('input').value,
        },
        null,
        2,
    );
});
// Use a separate loader so a controlled pending fixture cannot disturb the main HMR registry
for (const action of ['reload', 'remove'])
    // Handle the lifecycle event and release owned work
    document.querySelector('#pending-' + action).addEventListener('click', async () => {
        const { createLoader } = await import('alpine-component-loader'),
            owner = createLoader({
                root,
                config: {
                    cacheTemplates: false,
                    templateTimeout: 0,
                },
            }),
            nativeFetch = window.fetch;
        let starts = 0,
            aborted = 0;
        const source = new URL('/pending-hmr-fixture', location.href).href;
        window.fetch = async (url, options) => {
            // Control only the probe's template while preserving every other transport
            if (String(url) !== source) return nativeFetch(url, options);
            const index = ++starts;
            await new Promise((resolve, reject) => {
                // The superseded transport must release its timer on abort
                const cleanup = () => options.signal.removeEventListener('abort', abort),
                    timer = setTimeout(
                        () => {
                            cleanup();
                            resolve();
                        },
                        index === 1 ? 1500 : 20,
                    ),
                    abort = () => {
                        aborted++;
                        clearTimeout(timer);
                        cleanup();
                        reject(options.signal.reason);
                    };
                options.signal.addEventListener('abort', abort, { once: true });
            });
            return new Response('<p>' + (index === 1 ? 'Obsolete response' : 'Current response') + '</p>');
        };
        // Restore the shared fetch surface even when the probe fails
        try {
            const tag = 'pending-hmr-probe-' + ++count;
            await owner.ready;
            await owner.define(tag, source);
            await owner.start();
            const probe = document.createElement(tag);
            root.append(probe);
            // Complete the current demonstration operation
            await new Promise((resolve) => setTimeout(resolve, 100));
            if (action === 'remove') probe.remove();
            else await probe.reload();
            // Complete the current demonstration operation
            await new Promise((resolve) => setTimeout(resolve, 50));
            output.textContent = JSON.stringify(
                {
                    action,
                    starts,
                    aborted,
                    staleContentInserted: probe.textContent.includes('Obsolete response'),
                    currentContent: probe.textContent,
                },
                null,
                2,
            );
        } finally {
            await owner.dispose({ clearPersistentCaches: false });
            window.fetch = nativeFetch;
        }
    });
