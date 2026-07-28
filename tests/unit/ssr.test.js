import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createLoader } from '../../src/index.js';

// Compare source development metadata with the package-injected published version
const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

test('source and published root entries import without browser globals', async () => {
    // Exercise the test scenario
    assert.equal(typeof globalThis.document, 'undefined');
    const source = await import('../../src/index.js'),
        published = await import('alpine-component-loader');
    assert.equal(source.default.version, 'development');
    assert.equal(published.default.version, version);
    await assert.rejects(
        source.default.start(),
        // Run the operation expected to reject
        (error) => error.code === 'ACL_ENVIRONMENT_UNAVAILABLE',
    );
});

test('the auto entry is a browser-only no-op during SSR', async () => {
    // Exercise the test scenario
    const auto = await import('alpine-component-loader/auto');
    assert.equal(auto.default.version, version);
    await auto.startAutoLoader();
});

test('debugger and dev utilities are safe to import during SSR', async () => {
    // Exercise the test scenario
    const debuggerModule = await import('alpine-component-loader/debugger'),
        devModule = await import('alpine-component-loader/dev');
    assert.equal(typeof debuggerModule.default.inject, 'function');
    assert.deepEqual(await devModule.reloadChangedTemplates('/card.html'), {
        sources: [],
        tags: [],
        reloaded: 0,
    });
    assert.throws(
        // Run the operation expected to throw
        () => devModule.connectACLDevServer(),
        /browser-compatible EventSource/,
    );
});

test('offline and accessibility utilities are explicit and SSR-safe', async () => {
    // Exercise the test scenario
    const offline = await import('alpine-component-loader/offline'),
        a11y = await import('alpine-component-loader/a11y'),
        scanner = await import('alpine-component-loader/a11y-scanner');
    await assert.rejects(offline.registerOfflineWorker(), /not available/);
    assert.throws(
        // Run the operation expected to throw
        () => a11y.observeAccessibility(null),
        /requires browser DOM APIs/,
    );
    assert.equal(typeof a11y.runBasicAccessibilityAudit, 'function');
    assert.equal(typeof scanner.default.mount, 'function');
    assert.throws(
        // Run the operation expected to throw
        () => scanner.mountAccessibilityScanner(),
        /requires browser DOM APIs/,
    );
});

test('isolated loader facade is configurable, observable, disposable, and SSR-safe', async () => {
    // Exercise synchronous facade fallbacks before its isolated runtime import settles
    const root = {
            name: 'initial',
        },
        loader = createLoader({
            root,
            cacheNamespace: 'unit-isolated',
            config: {
                debug: true,
            },
        }),
        events = [],
        unsubscribe = loader.subscribe(
            // Capture staged reports without requiring browser globals
            (event) => events.push(event),
        );
    assert.equal(loader.root, root);
    loader.root = null;
    assert.equal(loader.root, null);
    assert.equal(loader.globalConfig.cacheNamespace, 'unit-isolated');
    assert.equal(loader.has('missing-card'), false);
    assert.equal(loader.getDefinition('missing-card'), null);
    assert.deepEqual(loader.getRegisteredTags(), []);
    assert.deepEqual(loader.getDependencies('missing-card'), []);
    assert.deepEqual(loader.getMetrics().totals, {});
    assert.equal(loader.getDataCacheSize(), 0);
    assert.deepEqual(loader.getDataCacheInfo(), {
        size: 0,
        keys: [],
    });
    assert.equal(loader.getDataCacheInfo('missing'), null);
    assert.equal(loader.getTemplateLoadInfo('/missing.html'), null);
    assert.equal(loader.clearDataCache(), true);
    loader.clearMetrics();
    // Provide an inert reporting and debugger callback for facade delegation
    const reporter = () => {};
    loader._report = reporter;
    loader.toggleDebug = reporter;
    assert.equal(loader._report, reporter);
    assert.equal(loader.toggleDebug, reporter);
    loader.config({
        debug: false,
    });
    unsubscribe();

    // Exercise the same facade after its isolated runtime becomes active
    assert.equal(await loader.ready, loader);
    const activeUnsubscribe = loader.subscribe(
        // Retain the public subscription contract after activation
        (event) => events.push(event),
    );
    activeUnsubscribe();
    loader.stopObservingTemplates();
    loader.stopObservingPrefetch();
    loader.clearMetrics();
    assert.equal(loader.clearDataCache(), true);
    assert.match(loader.version, /development/);
    await loader.dispose({
        clearPersistentCaches: false,
    });
    await loader.dispose();
    assert.throws(
        // Reject new work after deterministic disposal
        () => loader.config({ debug: true }),
        // Match the public typed disposal error
        (error) => error.code === 'ACL_LOADER_DISPOSED',
    );
    assert.throws(
        // Reject deferred public methods after disposal
        () => loader.prefetchAll(),
        // Match the public typed disposal error
        (error) => error.code === 'ACL_LOADER_DISPOSED',
    );

    // Cover disposal requested before the loader's asynchronous import settles
    const early = createLoader({
        cacheNamespace: 'unit-early-dispose',
    });
    await early.dispose({
        clearPersistentCaches: false,
    });
    assert.equal(await early.ready, early);
});
