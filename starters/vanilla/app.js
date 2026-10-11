let greetingReady = false;
const status = document.querySelector('#startup-status');
// Report startup separately from the greeting component's completion
try {
    // Select an explicit startup variant without downloading unused public entries
    const startup = new URLSearchParams(location.search),
        useCore = startup.get('entry') === 'core';

    if (startup.get('polyfills') === '1') {
        const { default: loadPolyfills } = await import('alpine-component-loader/polyfills');
        status.textContent = 'Waiting for Web Components readiness';
        await loadPolyfills();
    }

    // Load and start Alpine only after any requested platform repairs have completed
    const { default: Alpine } = await import('alpinejs');
    globalThis.Alpine = Alpine;
    Alpine.start();

    const { default: AlpineComponentLoader } = await import(
        useCore ? 'alpine-component-loader/core' : 'alpine-component-loader'
    );

    await AlpineComponentLoader.registerManifestFrom('./acl-manifest.json');
    // Core startup requires explicit ownership of the boundary used by index.html
    if (useCore) await AlpineComponentLoader.registerErrorBoundary();
    document.querySelector('hello-card').addEventListener(
        'loaded',
        () => {
            greetingReady = true;
            status.textContent = 'Greeting component ready';
        },
        { once: true },
    );
    document.querySelector('hello-card').addEventListener('acl:error', (event) => {
        status.textContent = 'Component failed: ' + (event.detail?.error?.code || event.detail?.error?.message);
        document.querySelector('#retry-startup').hidden = false;
    });
    await AlpineComponentLoader.start();
    if (!greetingReady) status.textContent = 'Registration complete; waiting for the greeting component';
} catch (error) {
    status.textContent = 'Startup failed: ' + (error.code || error.message);
    document.querySelector('#retry-startup').hidden = false;
}
document.querySelector('#retry-startup').addEventListener('click', () => location.reload());
