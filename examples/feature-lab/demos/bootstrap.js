// Await optional platform repairs before evaluating Alpine or an application's static imports
const script = document.querySelector('script[data-acl-bootstrap]'),
    query = new URLSearchParams(location.search),
    output = document.querySelector('[data-startup-status]'),
    timeline = document.querySelector('[data-startup-timeline]'),
    started = performance.now(),
    records = [];
// Report registration and initialization as distinct milestones
const record = (message) => {
    records.push({
        message,
        elapsedMs: Math.round(performance.now() - started),
    });
    if (output) output.textContent = message;
    if (timeline) timeline.textContent = JSON.stringify(records, null, 2);
};
// Subscribe before application imports so fast components cannot finish unnoticed
const loaded = (event) => {
    record('Component ready: ' + event.target.localName);
};
document.addEventListener('loaded', loaded);
// Handle the lifecycle event and release owned work
window.addEventListener('pagehide', () => document.removeEventListener('loaded', loaded), { once: true });
// Keep errors visible and provide a concrete retry after transport or initialization failure
try {
    if (query.get('polyfills') === '1') {
        record('Waiting for Web Components readiness');
        const map = JSON.parse(document.querySelector('script[type="importmap"]').textContent).imports,
            { loadPolyfills } = await import(map['alpine-component-loader/polyfills']);
        if (query.get('fallback') === '1') window.ShadyDOM = { force: true };
        await loadPolyfills({ url: new URL('./vendor/webcomponents/webcomponents-loader.js', import.meta.url).href });
        record('Web Components ready');
    }
    const alpine = document.createElement('script');
    alpine.src = script.dataset.alpine;
    await new Promise((resolve, reject) => {
        // Start the pinned Alpine build exactly once in this document
        alpine.onload = resolve;
        // Complete the current demonstration operation
        alpine.onerror = () => reject(new Error('Alpine download failed'));
        document.head.append(alpine);
    });
    record('Alpine available; registering application');
    await import(new URL(script.dataset.app, document.baseURI).href);
    record('Application registration complete; component readiness is reported separately');
    document.documentElement.dataset.bootstrapReady = 'true';
} catch (error) {
    record('Startup failed: ' + (error.code || error.message));
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Reload to retry startup';
    // Handle the lifecycle event and release owned work
    retry.addEventListener('click', () => location.reload());
    output?.after(retry);
    document.documentElement.dataset.bootstrapReady = 'error';
}
