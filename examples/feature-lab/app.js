import AlpineComponentLoader, { createIndexedDBPersistenceAdapter } from 'alpine-component-loader';
import ACLDebugger from 'alpine-component-loader/debugger';
import ACLA11y from 'alpine-component-loader/a11y';
import ACLA11yScanner from 'alpine-component-loader/a11y-scanner';
import { installFetchMock, mountComponent, recordACLEvents, waitForComponent } from 'alpine-component-loader/testing';

ACLDebugger.inject(AlpineComponentLoader);
const accessibilityObserver = ACLA11y.observe(AlpineComponentLoader);

const accessibilityScanner = ACLA11yScanner.mount({
    button: { companionSelector: '.debug-toggle' },
});
window.AlpineComponentLoader = AlpineComponentLoader;
window.ACLDebugger = ACLDebugger;
window.ACLA11y = ACLA11y;
window.__aclAccessibilityObserver = accessibilityObserver;
window.__aclAccessibilityScanner = accessibilityScanner;

const demoRuntimeEvents = [],
    adaptivePrefetchEvents = [];
let adaptivePrefetchResults = {};
// Run render adaptive prefetch for this example
const renderAdaptivePrefetch = () => {
    const output = document.getElementById('adaptive-prefetch-output');
    if (output)
        output.textContent = JSON.stringify(
            {
                events: adaptivePrefetchEvents,
                results: adaptivePrefetchResults,
            },
            null,
            2,
        );
};
[
    'loadstart',
    'loadend',
    'error',
    'cachehit',
    'cacheevict',
    'revalidated',
    'dev-reload-start',
    'dev-reload-end',
    'prefetchstart',
    'prefetchend',
    'prefetchskip',
    'a11y',
    // Complete the current demonstration operation
].forEach((name) => {
    // Handle the lifecycle event and release owned work
    document.addEventListener(`acl:${name}`, (event) => {
        const error = event.detail?.error,
            record = {
                event: `acl:${name}`,
                component: event.detail?.tagName || event.target?.localName || 'unknown',
                phase: event.detail?.phase || null,
                code: error?.code || null,
                status: error?.status ?? null,
                at: new Date().toLocaleTimeString(),
            };
        demoRuntimeEvents.unshift(record);
        demoRuntimeEvents.splice(10);
        const output = document.getElementById('runtime-event-log');
        if (output) output.textContent = JSON.stringify(demoRuntimeEvents, null, 2);
        if (name.startsWith('prefetch')) {
            adaptivePrefetchEvents.push({
                event: `acl:${name}`,
                tags: event.detail?.tags || [],
                reason: event.detail?.reason || null,
                fulfilled: event.detail?.fulfilled ?? null,
                rejected: event.detail?.rejected ?? null,
            });
            adaptivePrefetchEvents.splice(0, Math.max(0, adaptivePrefetchEvents.length - 8));
            renderAdaptivePrefetch();
        }
    });
});

AlpineComponentLoader.config({
    executeScripts: true,
    sanitize: false,
    basePath: new URL('./components/', document.baseURI).href,
    dynamicTransition: 'fade',
    templateCacheTtl: 60_000,
    templateCacheMax: 50,
    observability: {
        bufferSize: 80,
        performanceMarks: true,
        logger: false,
    },
    // Complete the current demonstration operation
    sourceResolver(source) {
        const aliases = {
            'demo:resolver': 'source-result.html',
            'demo:declarative': 'info-card.html',
        };
        return aliases[source] || source;
    },
});

const observedRuntimeRecords = [],
    // Complete the current demonstration operation
    renderObservedRuntimeRecords = () => {
        const output = document.getElementById('observability-live-output');
        if (output)
            output.textContent = JSON.stringify(
                // Select the values used by this demonstration
                observedRuntimeRecords.slice(-8).map((record) => ({
                    sequence: record.sequence,
                    type: record.type,
                    severity: record.severity,
                    tagName: record.tagName,
                    phase: record.phase,
                    duration: record.duration,
                    detail: record.detail,
                })),
                null,
                2,
            );
    },
    // Complete the current demonstration operation
    unsubscribeObservability = AlpineComponentLoader.subscribe((record) => {
        observedRuntimeRecords.push(record);
        observedRuntimeRecords.splice(0, Math.max(0, observedRuntimeRecords.length - 20));
        renderObservedRuntimeRecords();
    });
window.__aclObservedRuntimeRecords = observedRuntimeRecords;
window.addEventListener('pagehide', unsubscribeObservability, { once: true });

const sharedSheet = new CSSStyleSheet();
sharedSheet.replaceSync(`
      .shared-box {
        border: 1px solid #99f6e4;
        background: #ecfeff;
        color: #134e4a;
        border-radius: 8px;
        padding: 12px;
      }
    `);
AlpineComponentLoader.config({ sharedStyleSheets: [sharedSheet] });

AlpineComponentLoader.define('shadow-card', 'shadow-card.html', {
    shadow: true,
    attributes: {
        title: String,
        active: Boolean,
    },
});

AlpineComponentLoader.define('event-button', 'event-button.html', {
    shadow: true,
    events: { forward: ['action'] },
});

AlpineComponentLoader.define('strict-progress', 'strict-progress.html', {
    shadow: true,
    attributes: {
        percent: {
            type: Number,
            required: true,
            default: 0,
            // Complete the current demonstration operation
            validator: (value) => value >= 0 && value <= 100,
        },
    },
});

AlpineComponentLoader.define('external-icon', 'external-icon.html', {
    shadow: true,
    externalCss: ['https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'],
    attributes: {
        icon: String,
        label: String,
    },
});

AlpineComponentLoader.define('confetti-btn', 'x-confetti.html', {
    shadow: true,
    externalScripts: ['https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js'],
});

AlpineComponentLoader.define('boundary-demo', '#tpl-fallback-error', {
    fallback: '#tpl-fallback-error',
});

AlpineComponentLoader.define('grouped-card', 'response-mode.html', {
    shadow: true,
    attributes: { label: String },
    data: {
        src: '/demo-api/response?kind=text',
        responseType: 'text',
        target: 'payload',
        cacheStrategy: 'no-store',
    },
});

AlpineComponentLoader.define('source-demo', 'demo:resolver', {
    shadow: true,
    attributes: { label: String },
});

AlpineComponentLoader.define('lazy-image', 'lazy-image.html', {
    loading: 'lazy',
    loadingTemplate: 'loading-state.html',
});

AlpineComponentLoader.define('advanced-fetch', 'advanced-fetch.html', {
    shadow: true,
    data: {
        src: '/demo-api/audit?id=42&flaky=true',
        method: 'POST',
        body: { includeHistory: true },
        target: 'audit',
        retries: 1,
        retryDelay: 100,
        retryUnsafeMethods: true,
        cacheStrategy: 'network-first',
        options: { headers: { 'x-demo': 'grouped' } },
    },
});

AlpineComponentLoader.define('cache-control-demo', 'cache-control.html', {
    shadow: true,
    templateRevision: 'feature-lab-cache-v1',
    data: {
        src: '/demo-api/cache',
        target: 'payload',
        cacheStrategy: 'cache-first',
        cacheTtl: 30000,
    },
});

AlpineComponentLoader.define('loading-demo', 'loading-final.html', {
    shadow: true,
    data: { src: '/demo-api/slow' },
    loadingTemplate: 'loading-state.html',
});

AlpineComponentLoader.define('secure-render-demo', '#tpl-unsafe-content', {
    shadow: true,
    executeScripts: false,
    sanitize: true,
});

AlpineComponentLoader.define('mapped-event-demo', 'mapped-event.html', {
    shadow: true,
    events: {
        forward: [
            {
                from: 'internal-save',
                as: 'public-save',
            },
        ],
    },
});

AlpineComponentLoader.define('a11y-issues-demo', 'a11y-issues.html', {
    shadow: true,
});

AlpineComponentLoader.define('store-display', 'store-display.html', {
    shadow: true,
    bindStore: 'theme',
});

const lightAlertThemes = {
    success: {
        border: '#bbf7d0',
        accent: '#16a34a',
        bg: '#f0fdf4',
        text: '#14532d',
    },
    error: {
        border: '#fecaca',
        accent: '#dc2626',
        bg: '#fef2f2',
        text: '#991b1b',
    },
    warning: {
        border: '#fde68a',
        accent: '#d97706',
        bg: '#fffbeb',
        text: '#92400e',
    },
    info: {
        border: '#bae6fd',
        accent: '#0284c7',
        bg: '#f0f9ff',
        text: '#0c4a6e',
    },
};

// Run apply light alert theme for this example
const applyLightAlertTheme = ({ el, props }) => {
    const theme = lightAlertThemes[props.type] || lightAlertThemes.info;
    el.style.setProperty('--alert-border', theme.border);
    el.style.setProperty('--alert-accent', theme.accent);
    el.style.setProperty('--alert-bg', theme.bg);
    el.style.setProperty('--alert-text', theme.text);
};

AlpineComponentLoader.define('light-alert', 'light-alert.html', {
    shadow: false,
    attributes: { type: String },
    hooks: {
        mounted: applyLightAlertTheme,
        updated: applyLightAlertTheme,
    },
});

AlpineComponentLoader.define('lifecycle-log', 'lifecycle-log.html', {
    shadow: true,
    attributes: {
        title: String,
        logs: Array,
    },
    hooks: {
        // Complete the current demonstration operation
        beforeMount() {
            this.$props.logs.push('beforeMount');
        },
        // Complete the current demonstration operation
        mounted() {
            this.$props.logs.push('mounted');
        },
        // Complete the current demonstration operation
        updated({ name }) {
            this.$props.logs.push(`updated:${name}`);
        },
    },
});

AlpineComponentLoader.define('shared-style-demo', 'shared-style.html', {
    shadow: true,
});

AlpineComponentLoader.define('inline-object-demo', {
    template: `
                <style>
                    :host { display: block; padding: 1rem; border: 1px solid #c4b5fd; border-radius: 8px; }
                    strong { color: #5b21b6; }
                </style>
                <article>
                    <strong x-text="$props.message"></strong>
                    <div><slot name="action"></slot></div>
                </article>
            `,
    shadow: true,
    attributes: { message: String },
});

AlpineComponentLoader.define('external-deps-demo', 'external-deps.html', {
    shadow: true,
    externalCss: [
        {
            url: 'data:text/css,.external-token{font-weight:800;color:%230f766e}',
            media: 'all',
            referrerPolicy: 'no-referrer',
            timeout: 2000,
        },
    ],
    externalScripts: [
        {
            url: 'data:text/javascript,window.__aclDemoExternalScript=true',
            referrerPolicy: 'no-referrer',
            timeout: 2000,
        },
    ],
});

AlpineComponentLoader.define('persistent-note', 'persistent-note.html', {
    shadow: true,
    attributes: {
        note: String,
        count: Number,
        storage: String,
    },
    persistDebounce: 250,
});

AlpineComponentLoader.define('dynamic-a', 'info-card.html', {
    shadow: true,
    attributes: {
        title: String,
        body: String,
    },
});

AlpineComponentLoader.define('dynamic-b', 'source-result.html', {
    shadow: true,
    attributes: { label: String },
});

AlpineComponentLoader.define('advanced-props-demo', 'advanced-props.html', {
    shadow: true,
    strictProps: true,
    attributes: {
        mode: {
            type: String,
            options: ['compact', 'comfortable'],
            default: 'comfortable',
            reflect: true,
        },
        score: {
            type: Number,
            default: 50,
            reflect: true,
            // Complete the current demonstration operation
            coerce: (value) => Number(String(value).replace('%', '')),
            // Complete the current demonstration operation
            validator: (value) => value >= 0 && value <= 100,
        },
        caption: {
            type: String,
            nullable: true,
        },
        tags: {
            type: Array,
            // Complete the current demonstration operation
            default: () => [],
        },
        profile: {
            type: Object,
            schema: {
                name: String,
                active: Boolean,
            },
        },
    },
});

const responseModes = [
    // Complete the current demonstration operation
    ['response-json-demo', 'json', (value) => JSON.stringify(value)],
    // Complete the current demonstration operation
    ['response-text-demo', 'text', (value) => value],
    // Complete the current demonstration operation
    ['response-auto-demo', 'auto', (value) => JSON.stringify(value)],
    // Complete the current demonstration operation
    ['response-blob-demo', 'blob', (value) => value.text()],
    // Complete the current demonstration operation
    ['response-buffer-demo', 'arrayBuffer', (value) => new TextDecoder().decode(value)],
    // Complete the current demonstration operation
    ['response-stream-demo', 'stream', (value) => new Response(value).text()],
];
// Complete the current demonstration operation
responseModes.forEach(([tagName, responseType, format]) => {
    AlpineComponentLoader.define(tagName, 'response-mode.html', {
        shadow: true,
        attributes: {
            label: {
                type: String,
                default: responseType,
            },
        },
        data: {
            src: `/demo-api/response?kind=${responseType}`,
            target: 'payload',
            responseType,
            cacheStrategy: 'no-store',
        },
        hooks: {
            // Complete the current demonstration operation
            async afterFetch(value) {
                return await format(value);
            },
        },
    });
});

AlpineComponentLoader.define('response-custom-demo', 'response-mode.html', {
    shadow: true,
    attributes: {
        label: {
            type: String,
            default: 'custom parser',
        },
    },
    data: {
        src: '/demo-api/response?kind=custom',
        target: 'payload',
        cacheStrategy: 'no-store',
        // Complete the current demonstration operation
        parser: async (response) => (await response.text()).split('|').join(' → '),
    },
});

AlpineComponentLoader.define('polling-demo', 'x-polling.html', {
    shadow: true,
    data: {
        src: '/demo-api/poll',
        target: 'payload',
        poll: 1000,
        cacheStrategy: 'no-store',
        pauseWhenHidden: true,
        pauseWhenOffline: true,
        pauseWhenOffscreen: true,
    },
});

AlpineComponentLoader.define('recovery-demo', 'x-recovery.html', {
    shadow: true,
    data: {
        target: 'payload',
        timeout: 5000,
        cacheStrategy: 'no-store',
    },
});

AlpineComponentLoader.define('async-lifecycle-demo', 'async-lifecycle.html', {
    shadow: true,
    attributes: {
        logs: {
            type: Array,
            // Complete the current demonstration operation
            default: () => [],
        },
    },
    hooks: {
        // Complete the current demonstration operation
        async beforeMount({ props }) {
            await Promise.resolve();
            props.logs.push('async beforeMount complete');
        },
        // Complete the current demonstration operation
        mounted({ props }) {
            props.logs.push('mounted; cleanup registered');
            // Complete the current demonstration operation
            return () => {
                const count = (window.__aclLifecycleCleanups = (window.__aclLifecycleCleanups || 0) + 1);
                window.dispatchEvent(new CustomEvent('acl:lifecycle-cleanup', { detail: { count } }));
            };
        },
        // Complete the current demonstration operation
        activated({ props }) {
            props.logs.push('activated from keep-alive');
        },
        // Complete the current demonstration operation
        deactivated({ props }) {
            props.logs.push('deactivated into keep-alive');
        },
        // Complete the current demonstration operation
        loaded({ props }) {
            props.logs.push('loaded after Alpine initTree');
        },
    },
});

const adapterDemos = new Map([
    [
        'local',
        {
            tagName: 'local-adapter-note',
            label: 'localStorage adapter',
            key: 'acl:adapter-demo:local',
            adapter: window.localStorage,
        },
    ],
    [
        'session',
        {
            tagName: 'session-adapter-note',
            label: 'sessionStorage adapter',
            key: 'acl:adapter-demo:session',
            adapter: window.sessionStorage,
        },
    ],
    [
        'indexeddb',
        {
            tagName: 'indexeddb-adapter-note',
            label: 'IndexedDB adapter',
            key: 'acl:adapter-demo:indexeddb',
            adapter: createIndexedDBPersistenceAdapter({
                databaseName: 'alpine-component-loader-feature-lab',
                storeName: 'adapter-migrations',
            }),
        },
    ],
]);

// Seed each backend once so every adapter demonstrates the same schema migration
await Promise.all(
    // Complete the current demonstration operation
    Array.from(adapterDemos.values(), async (demo) => {
        if ((await demo.adapter.getItem(demo.key)) == null) {
            await demo.adapter.setItem(
                demo.key,
                JSON.stringify({
                    version: 1,
                    data: {
                        note: `Migrated ${demo.label} from schema v1`,
                        count: 1,
                    },
                }),
            );
        }
    }),
);

// Run read adapter record for this example
const readAdapterRecord = async (mode) => {
        const demo = adapterDemos.get(mode);
        if (!demo) throw new Error(`Unknown persistence adapter: ${mode}`);
        const raw = await demo.adapter.getItem(demo.key);
        return raw == null ? null : JSON.parse(raw);
    },
    // Complete the current demonstration operation
    renderAdapterPersistence = async (message = '') => {
        const records = Object.fromEntries(
                // Complete the current demonstration operation
                await Promise.all(Array.from(adapterDemos, async ([mode]) => [mode, await readAdapterRecord(mode)])),
            ),
            serialized = JSON.stringify(records, null, 2);
        document.getElementById('adapter-output').textContent = message ? `${message}\n${serialized}` : serialized;
    };

window.__aclAdapterPersistence = adapterDemos;
window.__readAdapterPersistence = readAdapterRecord;
// Complete the current demonstration operation
window.__inspectAdapterPersistence = () => renderAdapterPersistence();
// Complete the current demonstration operation
window.__flushAdapterPersistence = async () => {
    await Promise.all(
        // Complete the current demonstration operation
        Array.from(adapterDemos.values(), async (demo) => {
            const persistence = document.querySelector(demo.tagName)?.$props?.$persistence;
            if (!persistence) throw new Error(`${demo.label} persistence is not initialized.`);
            // Queue the current reactive state before forcing each pending write
            const pending = persistence.$save();
            await persistence.$flush();
            await pending;
        }),
    );
    await renderAdapterPersistence('Flushed current props:');
};

// Complete the current demonstration operation
adapterDemos.forEach((demo) =>
    AlpineComponentLoader.define(demo.tagName, 'persistent-note.html', {
        shadow: true,
        attributes: {
            note: String,
            count: Number,
            storage: String,
        },
        persist: 'custom',
        persistKey: demo.key,
        persistAdapter: demo.adapter,
        persistVersion: 2,
        persistDebounce: 100,
        // Complete the current demonstration operation
        async persistMigrate(data, { fromVersion }) {
            return {
                ...data,
                note: `${data.note} (v${fromVersion} → v2)`,
            };
        },
    }),
);

AlpineComponentLoader.define('custom-sanitizer-demo', '#tpl-custom-sanitizer', {
    shadow: true,
    executeScripts: false,
    // Complete the current demonstration operation
    async sanitize(fragment) {
        // Complete the current demonstration operation
        fragment.querySelectorAll('[data-private]').forEach((node) => node.remove());
        fragment.querySelector('[data-sanitize-root]')?.setAttribute('data-sanitized', 'custom');
    },
});

let trustedTypesPolicyCalls = 0,
    urlPolicyCalls = 0,
    featureLabTrustedTypesPolicy = null;
// Run create trusted html for this example
const createTrustedHTML = (html) => {
    trustedTypesPolicyCalls++;
    return html;
};
if (window.trustedTypes?.createPolicy) {
    // Complete the current demonstration operation
    try {
        featureLabTrustedTypesPolicy = window.trustedTypes.createPolicy('acl-feature-lab', {
            createHTML: createTrustedHTML,
        });
    } catch {
        // Fall back to the loader's policy interface when policy creation is restricted
    }
}
featureLabTrustedTypesPolicy ||= { createHTML: createTrustedHTML };

AlpineComponentLoader.define('security-policy-demo', 'security-policy.html', {
    shadow: true,
    sanitize: true,
    executeScripts: false,
    security: {
        trustedTypesPolicy: featureLabTrustedTypesPolicy,
        // Complete the current demonstration operation
        urlPolicy(value) {
            urlPolicyCalls++;
            // Complete the current demonstration operation
            try {
                return new URL(value, document.baseURI).origin === location.origin;
            } catch {
                return false;
            }
        },
    },
});

// Complete the current demonstration operation
window.inspectSecurityPolicy = () => {
    const element = document.querySelector('security-policy-demo'),
        result = {
            nativeTrustedTypes: Boolean(window.trustedTypes?.createPolicy),
            trustedTypesPolicyCalls,
            urlPolicyCalls,
            allowedHref: element?.shadowRoot.querySelector('#policy-allowed')?.getAttribute('href') || null,
            blockedHref: element?.shadowRoot.querySelector('#policy-blocked')?.getAttribute('href') || null,
        },
        output = document.getElementById('security-policy-output');
    if (output) output.textContent = JSON.stringify(result, null, 2);
    return result;
};

const featureLabManifest = {
    version: 1,
    components: {
        'manifest-base': {
            source: 'info-card.html',
            options: {
                shadow: true,
                attributes: {
                    title: String,
                    body: String,
                },
            },
        },
        'manifest-card': {
            source: 'info-card.html',
            dependencies: ['manifest-base'],
            options: {
                shadow: true,
                attributes: {
                    title: String,
                    body: String,
                },
            },
            metadata: {
                description: 'A feature-lab card registered from a version-one component manifest.',
                events: {
                    'manifest-ready': {
                        description: 'Reports that the manifest card is ready.',
                        detail: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                ready: { type: 'boolean' },
                            },
                            required: ['id', 'ready'],
                        },
                    },
                },
                slots: {
                    default: { description: 'Additional manifest card content.' },
                },
            },
        },
        'adaptive-card': {
            source: 'source-result.html',
            dependencies: ['manifest-base'],
            options: {
                shadow: true,
                attributes: { label: String },
            },
            metadata: {
                description: 'A dependency-aware target reserved for adaptive prefetch.',
            },
        },
    },
    groups: {
        dashboard: ['manifest-card'],
        preview: ['adaptive-card'],
    },
};

const manifestResult = await AlpineComponentLoader.registerManifest(featureLabManifest, {
    prefetch: ['dashboard'],
    concurrency: 2,
});
window.__aclManifestResult = manifestResult;
window.__aclFeatureLabManifest = featureLabManifest;
await AlpineComponentLoader.start();

let adaptivePrefetchController = null,
    stopTemplateObservation = null;
// Run start adaptive prefetch for this example
const startAdaptivePrefetch = async () => {
    adaptivePrefetchController = await AlpineComponentLoader.observePrefetch({
        triggers: ['hover', 'focus'],
        hoverDelay: 75,
        concurrency: 2,
    });
    window.__aclAdaptivePrefetchController = adaptivePrefetchController;
    return adaptivePrefetchController;
};
// Complete the current demonstration operation
window.resetAdaptivePrefetch = async () => {
    AlpineComponentLoader.stopObservingPrefetch();
    adaptivePrefetchEvents.length = 0;
    adaptivePrefetchResults = {};
    await startAdaptivePrefetch();
    renderAdaptivePrefetch();
};
// Complete the current demonstration operation
window.stopAdaptivePrefetch = () => {
    AlpineComponentLoader.stopObservingPrefetch();
    adaptivePrefetchController = null;
    window.__aclAdaptivePrefetchController = null;
    adaptivePrefetchEvents.push({
        event: 'observer:disconnected',
        tags: [],
        reason: null,
        fulfilled: null,
        rejected: null,
    });
    renderAdaptivePrefetch();
};
// Complete the current demonstration operation
window.demoAdaptivePrefetch = async (target = 'preview') => {
    adaptivePrefetchController ||= await startAdaptivePrefetch();
    const results = await adaptivePrefetchController.prefetch(target);
    // Select the values used by this demonstration
    adaptivePrefetchResults = Object.fromEntries(Object.entries(results).map(([tag, result]) => [tag, result.status]));
    renderAdaptivePrefetch();
    return adaptivePrefetchResults;
};
await startAdaptivePrefetch();
// Handle the lifecycle event and release owned work
window.addEventListener('pagehide', () => AlpineComponentLoader.stopObservingPrefetch(), { once: true });

// Complete the current demonstration operation
window.demoRegistry = async () => {
    const tags = AlpineComponentLoader.getRegisteredTags(),
        prefetched = await AlpineComponentLoader.prefetchGraph(['manifest-card'], { concurrency: 2 }),
        definition = AlpineComponentLoader.getDefinition('manifest-card'),
        output = document.getElementById('registry-output');
    output.textContent = JSON.stringify(
        {
            version: AlpineComponentLoader.version,
            registeredCount: tags.length,
            hasManifestCard: AlpineComponentLoader.has('manifest-card'),
            definition: {
                tagName: definition?.tagName,
                source: definition?.source,
                dependencies: definition?.dependencies,
            },
            directDependencies: AlpineComponentLoader.getDependencies('manifest-card'),
            transitiveDependencies: AlpineComponentLoader.getDependencies('manifest-card', {
                transitive: true,
            }),
            contractMetadata: featureLabManifest.components['manifest-card'].metadata,
            manifestResult,
            // Select the values used by this demonstration
            prefetched: Object.fromEntries(Object.entries(prefetched).map(([tag, result]) => [tag, result.status])),
        },
        null,
        2,
    );
};

// Complete the current demonstration operation
window.demoTemplateCache = async (prune = false) => {
    const evicted = prune ? await AlpineComponentLoader.pruneTemplateCache() : [],
        info = await AlpineComponentLoader.getTemplateCacheInfo(),
        output = document.getElementById('template-cache-output');
    output.textContent = JSON.stringify(
        {
            size: info.size,
            // Select the values used by this demonstration
            evicted: evicted.map((entry) => ({
                source: entry.source,
                reason: entry.reason,
            })),
            // Select the values used by this demonstration
            entries: info.entries.map((entry) => ({
                source: entry.source,
                revision: entry.revision,
                ttl: entry.ttl,
                lastAccess: entry.lastAccess,
            })),
        },
        null,
        2,
    );
};

// Complete the current demonstration operation
window.demoAccessibility = async () => {
    const element = document.querySelector('a11y-issues-demo'),
        result = await accessibilityObserver.audit(element),
        output = document.getElementById('accessibility-output');
    output.textContent = JSON.stringify(
        {
            component: element.localName,
            duration: Number(result.duration.toFixed(2)),
            violations: result.violations,
        },
        null,
        2,
    );
};

// Complete the current demonstration operation
window.demoObserveTemplate = async () => {
    stopTemplateObservation ||= AlpineComponentLoader.observeTemplates();
    if (!AlpineComponentLoader.has('observed-card')) {
        const template = document.createElement('template');
        template.setAttribute('acl-component', 'observed-card');
        template.setAttribute('acl-props', '{ "message": "String" }');
        template.innerHTML =
            '<div class="surface"><strong x-text="$props.message"></strong><p>Registered by MutationObserver after start().</p></div>';
        document.body.appendChild(template);
        await customElements.whenDefined('observed-card');
    }
    const card = document.createElement('observed-card');
    card.setAttribute('message', 'Dynamically observed template is live');
    document.getElementById('observed-template-target').replaceChildren(card);
    document.getElementById('observation-status').textContent =
        'Template observer registered <observed-card> successfully.';
};

// Complete the current demonstration operation
window.demoDiagnostics = () => {
    const snapshot = ACLDebugger.getSnapshot(AlpineComponentLoader),
        templateInfo = AlpineComponentLoader.getTemplateLoadInfo('info-card.html'),
        output = document.getElementById('diagnostics-output');
    output.textContent = JSON.stringify(
        {
            schemaVersion: snapshot.schemaVersion,
            loaderVersion: snapshot.loaderVersion,
            registeredTags: snapshot.registeredTags.length,
            renderedComponents: snapshot.components.length,
            timelineEntries: snapshot.timeline?.length || 0,
            requestActivityEntries: snapshot.requestActivity?.length || 0,
            componentSnapshots: snapshot.snapshots?.length || 0,
            dataCache: AlpineComponentLoader.getDataCacheInfo(),
            templateInfo,
        },
        null,
        2,
    );
};

// Run clear aclperformance measures for this example
const clearACLPerformanceMeasures = () => {
    performance
        .getEntriesByType('measure')
        // Select the values used by this demonstration
        .filter((entry) => entry.name.startsWith('acl:'))
        // Complete the current demonstration operation
        .forEach((entry) => performance.clearMeasures(entry.name));
};
// Complete the current demonstration operation
window.clearObservabilityDemo = () => {
    AlpineComponentLoader.clearMetrics();
    observedRuntimeRecords.length = 0;
    clearACLPerformanceMeasures();
    renderObservedRuntimeRecords();
    const snapshot = AlpineComponentLoader.getMetrics(),
        output = document.getElementById('observability-metrics-output');
    if (output)
        output.textContent = JSON.stringify(
            {
                totals: snapshot.totals,
                durations: snapshot.durations,
                recent: snapshot.recent,
                subscriberRecords: observedRuntimeRecords.length,
                performanceMeasures: [],
            },
            null,
            2,
        );
    return snapshot;
};
// Complete the current demonstration operation
window.demoObservability = async () => {
    window.clearObservabilityDemo();
    const element = document.querySelector('cache-control-demo');
    await element.reload({
        preserveState: true,
        clearTemplate: false,
        clearData: false,
        reason: 'feature-lab-observability',
    });
    const snapshot = AlpineComponentLoader.getMetrics(),
        measures = performance
            .getEntriesByType('measure')
            // Select the values used by this demonstration
            .filter((entry) => entry.name.startsWith('acl:'))
            .slice(-8)
            // Select the values used by this demonstration
            .map((entry) => ({
                name: entry.name,
                duration: Number(entry.duration.toFixed(2)),
            })),
        result = {
            totals: snapshot.totals,
            durations: snapshot.durations,
            recent: snapshot.recent,
            subscriberRecords: observedRuntimeRecords.length,
            performanceMeasures: measures,
        },
        output = document.getElementById('observability-metrics-output');
    if (output) output.textContent = JSON.stringify(result, null, 2);
    renderObservedRuntimeRecords();
    return result;
};

// Complete the current demonstration operation
window.runTestingDemo = async () => {
    const output = document.getElementById('testing-helper-output'),
        fixture = document.getElementById('testing-helper-fixture'),
        originalFetch = window.fetch,
        recorder = recordACLEvents(fixture, [
            'acl:loadstart',
            'acl:loadend',
            'acl:dev-reload-start',
            'acl:dev-reload-end',
        ]),
        mock = installFetchMock([
            {
                match: /\/demo-api\/testing$/,
                method: 'GET',
                response: { message: 'Loaded from installFetchMock' },
            },
            {
                // Complete the current demonstration operation
                match: () => true,
                // Complete the current demonstration operation
                response: ({ request }) => originalFetch(request),
            },
        ]);
    let mounted = null,
        result = null;
    fixture.replaceChildren();
    output.textContent = 'Running browser testing helpers…';
    // Complete the current demonstration operation
    try {
        mounted = await mountComponent({
            loader: AlpineComponentLoader,
            container: fixture,
            template: `
                        <article class="surface">
                            <strong x-text="$props.name"></strong>
                            <span x-text="$props.count"></span>
                            <p x-text="$props.payload?.message"></p>
                            <slot name="note"></slot>
                        </article>
                    `,
            options: {
                shadow: true,
                attributes: {
                    name: {
                        type: String,
                        required: true,
                    },
                    count: Number,
                },
                data: {
                    src: '/demo-api/testing',
                    target: 'payload',
                    cacheStrategy: 'no-store',
                },
            },
            attributes: {
                name: 'Ada',
                count: 1,
            },
            slots: { note: '<em>Named slot mounted</em>' },
        });
        await waitForComponent(mounted.element, { state: 'ready' });
        const initialName = mounted.element.$props.name,
            payload = mounted.element.$props.payload?.message,
            slottedText = mounted.element.querySelector('[slot="note"]')?.textContent || null;
        await mounted.update({
            attributes: { name: 'Grace' },
            properties: { count: 2 },
        });
        await mounted.reload({
            preserveState: true,
            clearTemplate: false,
            clearData: false,
            reason: 'feature-lab-testing',
        });
        const tagName = mounted.element.localName,
            updatedName = mounted.element.$props.name,
            updatedCount = mounted.element.$props.count,
            element = mounted.element;
        await mounted.unmount();
        await waitForComponent(element, { state: 'destroyed' });
        result = {
            tagName,
            initialName,
            updatedName,
            updatedCount,
            payload,
            slottedText,
            // Select the values used by this demonstration
            requestCount: mock.requests.filter((request) => /\/demo-api\/testing$/.test(request.url)).length,
            // Select the values used by this demonstration
            events: recorder.records.map((event) => event.type),
            destroyed: element._state === 'destroyed',
        };
    } catch (error) {
        output.textContent = JSON.stringify(
            {
                error: error.message,
            },
            null,
            2,
        );
        throw error;
    } finally {
        await mounted?.unmount();
        recorder.stop();
        mock.restore();
        if (result) {
            result.fetchRestored = window.fetch === originalFetch;
            output.textContent = JSON.stringify(result, null, 2);
        }
    }
    return result;
};

const sections = Array.from(document.querySelectorAll('main > section:not(.lab-overview)')),
    featureJump = document.getElementById('feature-jump');
// Complete the current demonstration operation
sections.forEach((section, index) => {
    section.id ||= `feature-${index + 1}`;
    const headingNode = section.querySelector('h2'),
        heading = headingNode?.textContent.replace(/\s+/g, ' ').trim() || `Feature ${index + 1}`,
        option = document.createElement('option');
    if (headingNode && !headingNode.querySelector(':scope > .feature-heading-link')) {
        const link = document.createElement('a');
        link.className = 'feature-heading-link';
        link.href = `#${section.id}`;
        link.append(...headingNode.childNodes);
        headingNode.appendChild(link);
    }
    option.value = section.id;
    option.textContent = heading;
    featureJump.appendChild(option);
});
document.getElementById('feature-count').textContent = String(sections.length);
document.getElementById('registered-count').textContent = String(AlpineComponentLoader.getRegisteredTags().length);
document.getElementById('loader-version').textContent = AlpineComponentLoader.version;
// Run scroll to feature hash for this example
const scrollToFeatureHash = (behavior) => {
    // Run target for this example
    const target = sections.find((section) => `#${section.id}` === location.hash);
    if (!target) return;
    featureJump.value = target.id;
    // Complete the current demonstration operation
    requestAnimationFrame(() =>
        target.scrollIntoView({
            behavior,
            block: 'start',
        }),
    );
};
// Handle the lifecycle event and release owned work
featureJump.addEventListener('change', () => {
    if (!featureJump.value) return;
    if (location.hash === `#${featureJump.value}`) scrollToFeatureHash('smooth');
    else location.hash = featureJump.value;
});
// Handle the lifecycle event and release owned work
window.addEventListener('hashchange', () => scrollToFeatureHash('smooth'));
scrollToFeatureHash('auto');
// Handle the lifecycle event and release owned work
window.addEventListener('load', () => scrollToFeatureHash('auto'), { once: true });
let componentLayoutFrame = null;
// Handle the lifecycle event and release owned work
document.addEventListener('acl:loadend', () => {
    cancelAnimationFrame(componentLayoutFrame);
    // Complete the current demonstration operation
    componentLayoutFrame = requestAnimationFrame(() => scrollToFeatureHash('auto'));
});
// Complete the current demonstration operation
window.toggleUsagePanels = (open) =>
    // Complete the current demonstration operation
    document.querySelectorAll('main section details').forEach((details) => {
        details.open = open;
    });
