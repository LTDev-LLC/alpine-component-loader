import AlpineComponentLoader, { startAutoLoader } from 'alpine-component-loader/auto';

const status = document.getElementById('connection-status');

const log = document.getElementById('reload-log');

AlpineComponentLoader.config({ autoStart: true });
AlpineComponentLoader.define('hmr-demo-card', '/components/live-card.html', {
    shadow: true,
    attributes: { count: Number },
});
await startAutoLoader();

const observedTemplate = document.createElement('template');
observedTemplate.setAttribute('x-acl', 'auto-observed-note');
observedTemplate.innerHTML = '<p>Registered after startup by the auto entry observer.</p>';
document.body.appendChild(observedTemplate);

// Run bind injected connection for this example
const bindInjectedConnection = () => {
    const eventSource = window.__aclDevConnection?.eventSource;
    if (!eventSource) {
        requestAnimationFrame(bindInjectedConnection);
        return;
    }
    // Run show connected for this example
    const showConnected = () => {
        status.dataset.state = 'connected';
        status.textContent = 'HMR connected';
    };

    // Run show disconnected for this example

    const showDisconnected = () => {
        status.dataset.state = 'disconnected';
        status.textContent = 'Reconnecting…';
    };
    eventSource.addEventListener('open', showConnected);
    eventSource.addEventListener('error', showDisconnected);
    if (eventSource.readyState === EventSource.OPEN) showConnected();
};
bindInjectedConnection();

// Handle the lifecycle event and release owned work
window.addEventListener('acl:dev-reload', (event) => {
    window.__lastACLDevReload = event.detail;
    log.textContent = JSON.stringify(event.detail, null, 2);
});
window.__aclHMRExample = { loader: AlpineComponentLoader };
