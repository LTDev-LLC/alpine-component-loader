import AlpineComponentLoader from 'alpine-component-loader';
import { getOfflineStatus, registerOfflineWorker } from 'alpine-component-loader/offline';

const serviceWorkerStatus = document.querySelector('#service-worker-status'),
    networkStatus = document.querySelector('#network-status'),
    details = document.querySelector('#status-details'),
    refreshButton = document.querySelector('#refresh-status'),
    demoRoot = document.querySelector('#demo-root');

// Keep network state separate from service worker control state
const showNetworkStatus = () => {
    const online = navigator.onLine;
    networkStatus.dataset.state = online ? 'online' : 'offline';
    networkStatus.textContent = online ? 'Network online' : 'Offline mode';
};

// Render a serializable worker snapshot for manual inspection
const refreshStatus = async (message = null) => {
    const status = await getOfflineStatus();
    serviceWorkerStatus.dataset.state = status.controlled ? 'ready' : 'installing';
    serviceWorkerStatus.textContent = status.controlled
        ? 'Ready for offline reload'
        : status.supported
          ? 'Installing offline worker…'
          : 'Service workers unavailable';
    details.textContent = message || JSON.stringify(status, null, 2);
    return status;
};

// Bound the controller wait because first-load takeover varies by browser
const waitForControl = async () => {
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve) => {
        // Settle the asynchronous operation
        let timeout;
        const finish = () => {
            // Run the finish operation
            navigator.serviceWorker.removeEventListener('controllerchange', finish);
            clearTimeout(timeout);
            resolve();
        };
        timeout = setTimeout(finish, 3000);
        navigator.serviceWorker.addEventListener('controllerchange', finish, { once: true });
    });
};

addEventListener('online', showNetworkStatus);
addEventListener('offline', showNetworkStatus);
addEventListener('acl:offline-quota', (event) => {
    // Surface quota recovery without exposing cached response contents
    void refreshStatus(`Runtime cache quota recovery: ${event.detail.cacheName}`);
});
showNetworkStatus();
refreshButton.addEventListener(
    'click',
    // Handle the click event
    () => void refreshStatus(),
);

// Load the component graph before installing the matching offline bundle
try {
    const manifest = await fetch('./acl-manifest.json').then((response) => {
            // Handle the resolved operation
            if (!response.ok) throw new Error(`Manifest request failed with ${response.status}.`);
            return response.json();
        }),
        result = await AlpineComponentLoader.registerManifest(manifest, { prefetch: 'offline-demo' });
    await AlpineComponentLoader.start();

    // Confirm the live component tree renders before claiming offline readiness
    const shell = document.createElement('offline-demo-shell'),
        loaded = new Promise((resolve, reject) => {
            // Settle the asynchronous operation
            shell.addEventListener('loaded', resolve, { once: true });
            shell.addEventListener(
                'error',
                // Handle the error event
                (event) => reject(event.detail?.error || new Error('Component load failed.')),
                { once: true },
            );
        });
    demoRoot.replaceChildren(shell);
    await loaded;

    const registration = await registerOfflineWorker('./acl-sw.js', { scope: './' });
    await navigator.serviceWorker.ready;
    await waitForControl();
    const runtimeMessage = await fetch('./runtime-message.json?example=1').then((response) => {
            // Parse the runtime-routed demonstration response
            if (!response.ok) throw new Error(`Runtime message request failed with ${response.status}.`);
            return response.json();
        }),
        status = await refreshStatus();
    details.textContent = JSON.stringify(
        {
            selectedComponents: result.order,
            precachedTemplates: Object.keys(result.prefetched || {}),
            runtimeRoute: runtimeMessage.message,
            worker: status,
        },
        null,
        2,
    );
    window.__aclOfflineExample = {
        loader: AlpineComponentLoader,
        registration,
        ready: true,
    };
} catch (error) {
    serviceWorkerStatus.dataset.state = 'error';
    serviceWorkerStatus.textContent = 'Offline setup failed';
    details.textContent = error?.stack || String(error);
    window.__aclOfflineExample = {
        error,
        ready: false,
    };
}
