// Select a runnable startup variant before evaluating Alpine, routes, or the application
const query = new URLSearchParams(location.search),
    status = document.querySelector('#startup-status');
// Keep application startup asynchronous without requiring top-level await in Vite 5 builds
const bootstrap = async () => {
    try {
        if (query.get('polyfills') === '1') {
            status.textContent = 'Waiting for Web Components readiness';
            const { loadPolyfills } = await import('alpine-component-loader/polyfills');
            await loadPolyfills();
        }
        const { default: Alpine } = await import('alpinejs'),
            { default: Loader } = await import(
                query.get('entry') === 'core' ? 'alpine-component-loader/core' : 'alpine-component-loader'
            );
        globalThis.Alpine = Alpine;
        status.textContent = 'Platform ready; registering routes';
        const { startApplication } = await import('./main.js');
        await startApplication({ Alpine, Loader });
        status.textContent = 'Application registration complete; route readiness is reported below';
    } catch (error) {
        status.textContent = 'Startup failed: ' + (error.code || error.message);
        document.querySelector('#retry-startup').hidden = false;
    }
};
void bootstrap();
document.querySelector('#retry-startup').addEventListener('click', () => location.reload());
