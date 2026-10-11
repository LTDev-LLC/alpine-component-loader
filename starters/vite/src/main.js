import { startRouter } from './router.js';
import './styles.css';

// Start after the bootstrap has selected its entry and completed platform readiness
export const startApplication = async ({ Alpine, Loader: AlpineComponentLoader }) => {
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

    // Initialize the selected entry, then register only the active route shard
    const start = async () => {
        Alpine.start();
        await AlpineComponentLoader.registerErrorBoundary();
        await AlpineComponentLoader.start();

        const router = await startRouter({
            Loader: AlpineComponentLoader,
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

    await start();
};
