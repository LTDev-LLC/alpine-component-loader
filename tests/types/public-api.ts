import AlpineComponentLoader, {
    ACLLoadError,
    createIndexedDBPersistenceAdapter,
    type ACLComponentOptions,
    type ACLManifest,
    type ACLSkeletonManifest,
    type ACLProps,
} from 'alpine-component-loader';
import AutoAlpineComponentLoader, { startAutoLoader } from 'alpine-component-loader/auto';
import ACLDebugger, { createDiagnosticSnapshot } from 'alpine-component-loader/debugger';
import connectACLDevServer, { reloadChangedTemplates } from 'alpine-component-loader/dev';
import { getOfflineStatus, registerOfflineWorker } from 'alpine-component-loader/offline';
import ACLA11y, { auditAccessibility } from 'alpine-component-loader/a11y';
import ACLA11yScanner, { mountAccessibilityScanner } from 'alpine-component-loader/a11y-scanner';
import ACLTesting, { installFetchMock, mountComponent, recordACLEvents, waitForComponent } from 'alpine-component-loader/testing';
import ACLSSR, { createSSRRenderer } from 'alpine-component-loader/ssr';
import { defineConfig } from 'alpine-component-loader/project';
import { startACLTestServer } from 'alpine-component-loader/testing/server';

interface CardProps extends ACLProps {
    count: number;
    label: string;
}

const options: ACLComponentOptions<CardProps> = {
    attributes: {
        count: { type: Number, default: 0, reflect: true },
        label: { type: String, nullable: true },
    },
    data: {
        src: '/api/card',
        responseType: 'json',
        retries: 2,
        pauseWhenOffscreen: true,
    },
    hooks: {
        async mounted({ props }) {
            props.count += 1;
            return () => undefined;
        },
        captureState: ({ props }) => ({ count: props.count }),
        restoreState: async () => undefined,
    },
    templateCacheTtl: 30_000,
    templateRevision: 'sha256-example',
};

AlpineComponentLoader.config({
    autoStart: false,
    executeScripts: false,
    sanitize: true,
    security: { urlPolicy: url => !url.includes('blocked') },
    observability: { bufferSize: 25, performanceMarks: false, logger: false },
    adaptivePrefetch: { triggers: ['hover', 'focus', 'visible'], concurrency: 2 },
});
AlpineComponentLoader.define('typed-card', '/components/card.html', options);
void AlpineComponentLoader.start();
const version: string = AlpineComponentLoader.version;
const autoVersion: string = AutoAlpineComponentLoader.version;
window.AlpineComponentLoaderConfig = { autoStart: false, cacheNamespace: 'typed-auto' };
void startAutoLoader();

const manifest: ACLManifest = {
    version: 1,
    components: {
        'base-card': 'base.html',
        'manifest-card': {
            source: 'card.html', dependencies: ['base-card'], options: { attributes: { count: Number } },
            metadata: {
                description: 'Typed card',
                events: { select: { detail: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } } },
                slots: { default: { description: 'Card body' } },
            },
        },
    },
    groups: { critical: ['manifest-card'] },
};
void AlpineComponentLoader.registerManifest(manifest, { prefetch: ['critical'], concurrency: 2 });
const skeletonManifest: ACLSkeletonManifest = {
    version: 1,
    skeletons: { 'typed-card': { html: '<div aria-hidden="true"></div>' } },
};
const registeredSkeletons: Promise<string[]> = AlpineComponentLoader.registerSkeletonManifest(skeletonManifest);
void AlpineComponentLoader.prefetchAll(null, { concurrency: 2 });
void AlpineComponentLoader.prefetchGraph(['manifest-card'], { concurrency: 2 });
const manifestDependencies: string[] = AlpineComponentLoader.getDependencies('manifest-card', { transitive: true });
const stopRecords = AlpineComponentLoader.subscribe(record => void record.sequence);
const metrics = AlpineComponentLoader.getMetrics();
AlpineComponentLoader.clearMetrics();
const prefetchObserver = AlpineComponentLoader.observePrefetch({ triggers: ['idle'] });
void prefetchObserver.then(controller => controller.disconnect());
AlpineComponentLoader.stopObservingPrefetch();
stopRecords();

ACLDebugger.inject(AlpineComponentLoader);
createDiagnosticSnapshot(AlpineComponentLoader, document);
void reloadChangedTemplates(['/components/card.html'], AlpineComponentLoader);
const connection = connectACLDevServer({ loader: AlpineComponentLoader });
const eventSource: EventSource | null = connection.eventSource;
connection.close();
void registerOfflineWorker('/acl-sw.js');
void getOfflineStatus();
void auditAccessibility(document);
const a11yController = ACLA11y.observe(AlpineComponentLoader);
a11yController.disconnect();
const scanner = mountAccessibilityScanner({
    auditor: async (root, { basic }) => basic(root),
    concurrency: 2,
    button: { companionSelector: '.debug-toggle', gap: 8 },
});
void scanner.scan();
scanner.close();
scanner.destroy();
const mountedScanner = ACLA11yScanner.mount();
mountedScanner.destroy();

const recorder = recordACLEvents(document);
void recorder.waitFor('acl:loadend');
recorder.stop();
const mock = installFetchMock([{ url: '/api/test', method: 'GET', body: { ok: true } }]);
mock.reset();
mock.restore();
void mountComponent({ template: '<p>Test</p>', slots: 'content' }).then(async mounted => {
    await waitForComponent(mounted.element);
    await mounted.update({ attributes: { label: 'updated' } });
    await mounted.unmount();
});
void ACLTesting.mountComponent({ template: '<p>Default export</p>' });

const renderer = createSSRRenderer({ manifest, root: '/project' });
void renderer.render('manifest-card', { props: { count: 1 }, slots: { default: '<p>Body</p>' } });
void renderer.renderMany([{ tagName: 'manifest-card', attributes: { lang: 'en' } }]);
renderer.clearCache();
void ACLSSR.createSSRRenderer({ manifest, root: '/project' });
defineConfig({ watch: { debounce: 50, pollInterval: 0 } });
void startACLTestServer({ watchFiles: true, watchDebounce: 50, watchPollInterval: 5000 });

const error = new ACLLoadError('failed', { code: 'ACL_TEST', phase: 'test', retryable: true });
const code: string = error.code;
const indexedDBAdapter = createIndexedDBPersistenceAdapter({
    databaseName: 'typed-components',
    storeName: 'state',
    indexedDBImpl: window.indexedDB,
});
indexedDBAdapter.close();

// @ts-expect-error response types are intentionally constrained to supported parser modes
AlpineComponentLoader.config({ data: { responseType: 'yaml' } });

void version;
void autoVersion;
void code;
void eventSource;
void registeredSkeletons;
void manifestDependencies;
void metrics;
