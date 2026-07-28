import Alpine from 'alpinejs';
import AlpineComponentLoader from 'alpine-component-loader';
import { startRouter } from './router.js';
import './styles.css';

globalThis.Alpine = Alpine;

const recentRecords = [],
    eventLog = document.querySelector('#event-log'),
    metricsOutput = document.querySelector('#metrics-output');

const renderRecords = () => {
    eventLog.replaceChildren(
        ...recentRecords.map((record) => {
            const item = document.createElement('li');
            item.textContent = `${record.type} · ${record.tagName || record.phase || 'loader'}`;
            return item;
        }),
    );
};

AlpineComponentLoader.config({
    observability: {
        bufferSize: 100,
        performanceMarks: true,
        logger: false,
    },
});

const unsubscribe = AlpineComponentLoader.subscribe((record) => {
    recentRecords.push(record);
    if (recentRecords.length > 6) recentRecords.shift();
    renderRecords();
});

const start = async () => {
    Alpine.start();
    await AlpineComponentLoader.registerErrorBoundary();
    await AlpineComponentLoader.start();

    const router = await startRouter({
        outlet: document.querySelector('#route-outlet'),
        status: document.querySelector('#route-status'),
        title: document.querySelector('#route-title'),
    });

    document.querySelector('#retry-route').addEventListener('click', async () => {
        await document.querySelector('#route-boundary').retry();
    });
    document.querySelector('#show-metrics').addEventListener('click', () => {
        metricsOutput.hidden = false;
        metricsOutput.textContent = JSON.stringify(AlpineComponentLoader.getMetrics(), null, 2);
    });
    document.querySelector('#clear-metrics').addEventListener('click', () => {
        AlpineComponentLoader.clearMetrics();
        metricsOutput.hidden = true;
        metricsOutput.textContent = '';
    });
    window.addEventListener(
        'pagehide',
        () => {
            router.stop();
            unsubscribe();
        },
        { once: true },
    );
};

start().catch((error) => {
    document.querySelector('#route-status').textContent = error.message;
    document.querySelector('#route-status').dataset.state = 'error';
    console.error('[ACL Vite starter]', error);
});
