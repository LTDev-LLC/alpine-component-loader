import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import {
    getTemplateCacheNames,
    isAbsoluteSource,
    joinBasePath,
    resolveComponentSource,
    setBoundedMapEntry,
    validateCustomElementName,
} from '../../src/runtime/config.js';
import {
    dataFetchCache,
    getDataCacheKey,
    normalizeBodyForCache,
    normalizeRequestForCache,
    parseBodyValue,
    pruneDataFetchCache,
} from '../../src/runtime/fetch-cache.js';
import { delayWithSignal, raceWithSignal } from '../../src/runtime/errors.js';
import {
    DATA_CACHE_BOUND_ATTRIBUTES,
    DATA_FETCH_ATTRIBUTES,
    DATA_OPTION_DESCRIPTORS,
    DATA_POLL_ATTRIBUTES,
    DEFAULT_DATA_OPTIONS,
    INTERNAL_COMPONENT_ATTRIBUTES,
    readBooleanAttribute,
    readDeclarativeOptionSettings,
    readNumberAttribute,
    resolveDataOptionSettings,
    validateDataOptionSettings,
} from '../../src/runtime/data-options.js';
import { applyLifecycleState, createLifecycleEventDetail } from '../../src/runtime/lifecycle.js';
import {
    createIndexedDBPersistenceAdapter,
    createPersistenceEnvelope,
    decodePersistedValue,
    snapshotPersistentProps,
} from '../../src/runtime/persistence.js';
import { parsePropDefinitions, validateSchemaShape } from '../../src/runtime/props.js';
import {
    normalizeManifest,
    normalizeSkeletonManifest,
    resolveManifestDependencyTags,
    resolveManifestPrefetchTags,
    settleNamedTasks,
} from '../../src/runtime/registry.js';
import {
    createTemplateCacheResponse,
    invalidateTemplateCacheHandle,
    invalidateTemplateCacheIndex,
    listTemplateCacheEntries,
    openTemplateCache,
    pruneTemplateCacheEntries,
    reconcileTemplateCacheEntries,
    settleTemplateCacheWrites,
    touchTemplateCacheEntry,
    writeTemplateCacheEntry,
} from '../../src/runtime/template-cache.js';
import {
    cloneDefinitionValue,
    cloneRuntimeValue,
    getTemplateLoadKey,
    mergeFetchOptions,
    normalizeForwardEvents,
    parseJson,
    parseListAttribute,
    resolveWindowPath,
    stableStringify,
    toCssString,
    toSearchParamsDeep,
    toUrlValue,
} from '../../src/runtime/values.js';

// Test pure runtime contracts directly so browser failures stay narrowly scoped
describe('runtime configuration and bounded caches', () => {
    // Define the test group
    test('data option descriptors keep grouped, declarative, observed, validation, and reactions aligned', () => {
        // Exercise the test scenario
        const settings = resolveDataOptionSettings(
            {
                data: {
                    responseType: 'text',
                    cacheMax: 0,
                    retryMaxDelay: 42,
                    pauseWhenHidden: false,
                    pauseWhenOffscreen: true,
                },
                persistVersion: 3,
            },
            {},
        );
        assert.equal(settings.responseType, 'text');
        assert.equal(settings.cacheMax, 0);
        assert.equal(settings.retryMaxDelay, 42);
        assert.equal(settings.pauseWhenHidden, false);
        assert.equal(settings.pauseWhenOffscreen, true);
        assert.equal(resolveDataOptionSettings({}, {}).pauseWhenOffscreen, false);
        assert.doesNotThrow(
            // Run the operation expected to succeed
            () =>
                validateDataOptionSettings({
                    data: settings,
                    persistVersion: 3,
                }),
        );
        assert.throws(
            // Run the operation expected to throw
            () =>
                validateDataOptionSettings({
                    data: {
                        ...settings,
                        retryJitter: 2,
                    },
                    persistVersion: 3,
                }),
            /between 0 and 1/,
        );
        assert.throws(
            // Run the operation expected to throw
            () =>
                validateDataOptionSettings({
                    data: settings,
                    persistVersion: 0,
                }),
            /positive integer/,
        );

        DATA_OPTION_DESCRIPTORS.filter(
            // Select matching items
            (descriptor) => descriptor.group,
        ).forEach((descriptor) => {
            // Process the current item
            assert.equal('setting' in descriptor, false);
        });

        const attributed = DATA_OPTION_DESCRIPTORS.filter(
            // Select matching items
            (descriptor) => descriptor.attribute,
        );
        assert.equal(INTERNAL_COMPONENT_ATTRIBUTES.size, attributed.length);
        attributed.forEach((descriptor) => {
            // Process the current item
            assert.equal(INTERNAL_COMPONENT_ATTRIBUTES.has(descriptor.attribute), true);
            const reactionSet =
                descriptor.reaction === 'fetch'
                    ? DATA_FETCH_ATTRIBUTES
                    : descriptor.reaction === 'poll'
                      ? DATA_POLL_ATTRIBUTES
                      : descriptor.reaction === 'cache-bound'
                        ? DATA_CACHE_BOUND_ATTRIBUTES
                        : null;
            if (reactionSet) assert.equal(reactionSet.has(descriptor.attribute), true);
        });
    });

    test('parses descriptor-driven declarative options with strict JSON and bounded primitives', () => {
        // Exercise the test scenario
        const attributes = new Map([
                ['data-src', '/api/items'],
                ['data-fetch-params', '{"limit":5}'],
                ['data-fetch-poll', '250'],
                ['data-fetch-options', '{"headers":{"x-test":"yes"}}'],
                ['data-retry-unsafe-methods', 'false'],
                ['pause-polling-when-hidden', '0'],
                ['persist-version', '2'],
            ]),
            element = {
                // Check whether attribute
                hasAttribute: (name) => attributes.has(name),
                // Get attribute
                getAttribute: (name) => attributes.get(name) ?? null,
            },
            parsed = readDeclarativeOptionSettings(element, {
                data: DEFAULT_DATA_OPTIONS,
                persistVersion: 1,
            });
        assert.equal(parsed.data.src, '/api/items');
        assert.deepEqual(parsed.data.params, { limit: 5 });
        assert.equal(parsed.data.poll, 250);
        assert.deepEqual(parsed.data.options, { headers: { 'x-test': 'yes' } });
        assert.equal(parsed.data.retryUnsafeMethods, false);
        assert.equal(parsed.data.pauseWhenHidden, false);
        assert.equal(parsed.persistVersion, 2);
        assert.equal(readBooleanAttribute(element, 'missing', true), true);
        assert.equal(readNumberAttribute(element, 'missing', 12), 12);
        attributes.set('invalid-number', '-1');
        assert.equal(readNumberAttribute(element, 'invalid-number', 12, { min: 0 }), 12);
    });

    test('normalizes namespaced versioned cache buckets', () => {
        // Exercise the test scenario
        assert.deepEqual(getTemplateCacheNames('Product Cards', '1.2.3'), {
            namespace: 'product-cards',
            prefix: 'alpine-component-loader-product-cards-',
            key: 'alpine-component-loader-product-cards-1.2.3',
        });
    });

    test('accepts valid generated names and rejects names without a hyphen', () => {
        // Exercise the test scenario
        fc.assert(
            fc.property(
                fc.stringMatching(/^[a-z][a-z0-9]{0,12}$/),
                fc.stringMatching(/^[a-z0-9]{1,12}$/),
                // Transform the current property
                (prefix, suffix) => validateCustomElementName(`${prefix}-${suffix}`) === `${prefix}-${suffix}`,
            ),
        );
        assert.throws(
            // Run the operation expected to throw
            () => validateCustomElementName('invalid'),
            /Invalid custom element name/,
        );
    });

    test('evicts the oldest settled metadata entry at its configured bound', () => {
        // Exercise the test scenario
        const map = new Map();
        setBoundedMapEntry(map, 'a', 1, 2);
        setBoundedMapEntry(map, 'b', 2, 2);
        setBoundedMapEntry(map, 'c', 3, 2);
        assert.deepEqual(
            [...map.entries()],
            [
                ['b', 2],
                ['c', 3],
            ],
        );

        setBoundedMapEntry(map, 'disabled', 4, 0);
        assert.equal(map.size, 0);
    });

    test('resolves sources through absolute-path and custom resolver rules', () => {
        // Exercise the test scenario
        assert.equal(isAbsoluteSource('https://example.test/card.html'), true);
        assert.equal(isAbsoluteSource('/card.html'), true);
        assert.equal(isAbsoluteSource('card.html'), false);
        assert.equal(joinBasePath('/components', 'card.html'), '/components/card.html');
        assert.equal(joinBasePath('/components', '/card.html'), '/card.html');
        assert.equal(
            resolveComponentSource(
                'card.html',
                {
                    basePath: '/components',
                    // Run the source resolver operation
                    sourceResolver: (source) => `themes/${source}`,
                },
                {},
            ),
            '/components/themes/card.html',
        );
        assert.throws(
            // Run the operation expected to throw
            () => validateCustomElementName('annotation-xml'),
            /Invalid custom element name/,
        );
    });
});

describe('registry manifests and bounded task settlement', () => {
    // Define the test group
    test('normalizes manifest definitions and resolves prefetch groups', () => {
        // Exercise the test scenario
        const manifest = normalizeManifest({
            version: 1,
            components: {
                'A-Card': 'a.html',
                'b-card': {
                    source: 'b.html',
                    options: { shadow: true },
                },
            },
            groups: { critical: ['a-card', 'b-card'] },
        });
        assert.deepEqual(
            manifest.components.map(
                // Transform the current item
                (component) => component.tagName,
            ),
            ['a-card', 'b-card'],
        );
        assert.deepEqual(resolveManifestPrefetchTags(manifest, ['a-card', 'b-card'], ['critical', 'missing-card']), [
            'a-card',
            'b-card',
        ]);
        assert.deepEqual(resolveManifestPrefetchTags(manifest, ['a-card'], true), ['a-card']);
        assert.throws(
            // Run the operation expected to throw
            () =>
                normalizeManifest({
                    version: 1,
                    components: { 'bad-card': {} },
                }),
            /missing a source/,
        );
    });

    test('orders version-one manifest dependencies and rejects invalid graphs', () => {
        // Exercise the test scenario
        const manifest = normalizeManifest({
            version: 1,
            components: {
                'page-shell': {
                    source: 'page.html',
                    dependencies: ['user-card', 'site-icon'],
                },
                'user-card': {
                    source: 'user.html',
                    dependencies: ['site-icon'],
                },
                'site-icon': 'icon.html',
            },
            groups: { account: ['page-shell'] },
        });
        assert.deepEqual(manifest.order, ['site-icon', 'user-card', 'page-shell']);
        assert.deepEqual(resolveManifestDependencyTags(manifest, ['page-shell']), [
            'site-icon',
            'user-card',
            'page-shell',
        ]);
        assert.deepEqual(resolveManifestPrefetchTags(manifest, manifest.order, ['account']), [
            'site-icon',
            'user-card',
            'page-shell',
        ]);
        assert.throws(
            // Run the operation expected to throw
            () =>
                normalizeManifest({
                    version: 1,
                    components: {
                        'a-card': {
                            source: 'a.html',
                            dependencies: ['b-card'],
                        },
                        'b-card': {
                            source: 'b.html',
                            dependencies: ['a-card'],
                        },
                    },
                }),
            /a-card -> b-card -> a-card/,
        );
        assert.throws(
            // Run the operation expected to throw
            () =>
                normalizeManifest({
                    version: 1,
                    components: {
                        'a-card': {
                            source: 'a.html',
                            dependencies: ['missing-card'],
                        },
                    },
                }),
            /missing dependency/,
        );
    });

    test('tracks and prunes persistent template cache entries by age and capacity', async () => {
        // Exercise the test scenario
        const records = new Map(),
            cache = {
                async keys() {
                    // Run the keys operation
                    return [...records.keys()].map(
                        // Transform the current item
                        (url) => new Request(url),
                    );
                },
                async match(request) {
                    // Run the match operation
                    return records.get(typeof request === 'string' ? request : request.url)?.clone();
                },
                async put(request, response) {
                    // Run the put operation
                    records.set(typeof request === 'string' ? request : request.url, response.clone());
                },
                async delete(request) {
                    // Run the delete operation
                    return records.delete(typeof request === 'string' ? request : request.url);
                },
            };
        await cache.put(
            'https://example.test/old.html',
            createTemplateCacheResponse('old', null, {
                source: '/old.html',
                ttl: 10,
                fetchedAt: 1,
                lastAccess: 1,
            }),
        );
        await cache.put(
            'https://example.test/recent.html',
            createTemplateCacheResponse('recent', null, {
                source: '/recent.html',
                ttl: 10_000,
                fetchedAt: 100,
                lastAccess: 200,
            }),
        );
        await cache.put(
            'https://example.test/newest.html',
            createTemplateCacheResponse('newest', null, {
                source: '/newest.html',
                ttl: 10_000,
                fetchedAt: 100,
                lastAccess: 300,
            }),
        );
        const evicted = await pruneTemplateCacheEntries(cache, {
            max: 1,
            now: 500,
        });
        assert.deepEqual(
            evicted.map(
                // Transform the current item
                (entry) => [entry.source, entry.reason],
            ),
            [
                ['/old.html', 'expired'],
                ['/recent.html', 'capacity'],
            ],
        );
        assert.deepEqual(
            (await listTemplateCacheEntries(cache)).map(
                // Transform the current item
                (entry) => entry.source,
            ),
            ['/newest.html'],
        );
    });

    test('indexes cache metadata in bounded batches and reconciles revisions with concurrent deletion', async () => {
        // Exercise metadata reuse bounded hydration and shared eviction reconciliation
        const records = new Map();
        let matches = 0,
            activeMatches = 0,
            maxMatches = 0,
            activeDeletes = 0,
            maxDeletes = 0;
        const cache = {
            async keys() {
                // Return the current mock Cache API key set
                return [...records.keys()].map(
                    // Convert one stored URL into a request key
                    (url) => new Request(url),
                );
            },
            async match(request) {
                // Track bounded concurrent metadata matches
                matches++;
                activeMatches++;
                maxMatches = Math.max(maxMatches, activeMatches);
                await new Promise(
                    // Yield so concurrent metadata operations overlap
                    (resolvePromise) => setImmediate(resolvePromise),
                );
                activeMatches--;
                return records.get(typeof request === 'string' ? request : request.url)?.clone();
            },
            async put(request, response) {
                // Store one cloned response in the mock cache
                records.set(typeof request === 'string' ? request : request.url, response.clone());
            },
            async delete(request) {
                // Track concurrent victim deletion
                activeDeletes++;
                maxDeletes = Math.max(maxDeletes, activeDeletes);
                await new Promise(
                    // Yield so concurrent deletions overlap
                    (resolvePromise) => setImmediate(resolvePromise),
                );
                activeDeletes--;
                return records.delete(typeof request === 'string' ? request : request.url);
            },
        };
        // Seed enough unknown entries to cross one hydration batch boundary
        for (let index = 0; index < 10; index++) {
            await cache.put(
                `https://example.test/revision-${index}.html`,
                createTemplateCacheResponse(String(index), null, {
                    source: '/shared.html',
                    revision: String(index),
                    ttl: 10_000,
                    fetchedAt: 100,
                    lastAccess: index,
                }),
            );
        }
        assert.equal((await listTemplateCacheEntries(cache)).length, 10);
        assert.equal(matches, 10);
        assert.equal(maxMatches, 8);
        await listTemplateCacheEntries(cache);
        assert.equal(matches, 10);
        await cache.put(
            'https://example.test/unknown.html',
            createTemplateCacheResponse('new', null, {
                source: '/unknown.html',
                ttl: 10_000,
                fetchedAt: 100,
                lastAccess: 20,
            }),
        );
        await listTemplateCacheEntries(cache);
        assert.equal(matches, 11);
        const evicted = await reconcileTemplateCacheEntries(cache, {
            max: 100,
            source: '/shared.html',
            currentRequest: 'https://example.test/revision-9.html',
            now: 200,
        });
        assert.equal(evicted.length, 9);
        assert.ok(
            evicted.every(
                // Verify one reconciliation classified every stale revision
                (entry) => entry.reason === 'revision',
            ),
        );
        assert.ok(maxDeletes > 1);
        assert.deepEqual(
            (await listTemplateCacheEntries(cache)).map(
                // Project the surviving indexed sources
                (entry) => entry.source,
            ),
            ['/unknown.html', '/shared.html'],
        );
    });

    test('reuses cache handles and coalesces persistent access metadata without losing LRU order', async () => {
        // Exercise shared Cache handles and bounded last-access persistence
        const originalCaches = globalThis.caches,
            records = new Map();
        let opens = 0,
            puts = 0,
            releasePut = null,
            blockPut = false;
        const createCache = () => ({
            async keys() {
                // Return the current mock Cache API keys
                return [...records.keys()].map((url) => new Request(url));
            },
            async match(request) {
                // Return one cloned response
                return records.get(typeof request === 'string' ? request : request.url)?.clone();
            },
            async put(request, response) {
                // Track and optionally pause one persistent metadata write
                puts++;
                if (blockPut)
                    await new Promise(
                        // Expose a deterministic release for the pending write
                        (resolvePromise) => {
                            releasePut = resolvePromise;
                        },
                    );
                records.set(typeof request === 'string' ? request : request.url, response.clone());
            },
            async delete(request) {
                // Delete one mock Cache API entry
                return records.delete(typeof request === 'string' ? request : request.url);
            },
        });
        Object.defineProperty(globalThis, 'caches', {
            configurable: true,
            value: {
                async open() {
                    // Return a new handle so invalidation remains observable
                    opens++;
                    return createCache();
                },
            },
        });
        invalidateTemplateCacheHandle();
        invalidateTemplateCacheIndex();
        // Restore global Cache API state after the handle and write assertions
        try {
            const first = await openTemplateCache('hot-cache'),
                second = await openTemplateCache('hot-cache'),
                request = 'https://example.test/hot.html';
            assert.equal(first, second);
            assert.equal(opens, 1);
            await writeTemplateCacheEntry(
                first,
                request,
                createTemplateCacheResponse('hot', null, {
                    source: '/hot.html',
                    ttl: 10_000,
                    fetchedAt: 100,
                    lastAccess: 1_000,
                }),
            );
            await touchTemplateCacheEntry(
                first,
                request,
                'hot',
                records.get(request).clone(),
                {
                    source: '/hot.html',
                    ttl: 10_000,
                    fetchedAt: 100,
                    lastAccess: 1_500,
                },
                { coalesceMs: 1_000 },
            );
            assert.equal(puts, 1);
            assert.equal((await listTemplateCacheEntries(first))[0].lastAccess, 1_500);

            blockPut = true;
            const pending = touchTemplateCacheEntry(
                first,
                request,
                'hot',
                records.get(request).clone(),
                {
                    source: '/hot.html',
                    ttl: 10_000,
                    fetchedAt: 100,
                    lastAccess: 2_100,
                },
                { coalesceMs: 1_000 },
            );
            await Promise.resolve();
            assert.equal(
                await touchTemplateCacheEntry(
                    first,
                    request,
                    'hot',
                    records.get(request).clone(),
                    {
                        source: '/hot.html',
                        ttl: 10_000,
                        fetchedAt: 100,
                        lastAccess: 2_200,
                    },
                    { coalesceMs: 1_000 },
                ),
                true,
            );
            assert.equal(puts, 2);
            blockPut = false;
            releasePut();
            await settleTemplateCacheWrites(first, request);
            await pending;
            assert.equal((await listTemplateCacheEntries(first))[0].lastAccess, 2_200);

            invalidateTemplateCacheHandle('hot-cache');
            assert.notEqual(await openTemplateCache('hot-cache'), first);
            assert.equal(opens, 2);
        } finally {
            invalidateTemplateCacheHandle();
            invalidateTemplateCacheIndex();
            if (originalCaches === undefined) Reflect.deleteProperty(globalThis, 'caches');
            else
                Object.defineProperty(globalThis, 'caches', {
                    configurable: true,
                    value: originalCaches,
                });
        }
    });

    test('normalizes generated skeleton manifests without retaining entry objects', () => {
        // Exercise the test scenario
        const manifest = normalizeSkeletonManifest({
            version: 1,
            skeletons: { 'User-Card': { html: '<div aria-hidden="true"></div>' } },
        });
        assert.deepEqual(manifest, {
            version: 1,
            skeletons: [
                {
                    tagName: 'user-card',
                    html: '<div aria-hidden="true"></div>',
                },
            ],
        });
        assert.throws(
            // Run the operation expected to throw
            () =>
                normalizeSkeletonManifest({
                    version: 1,
                    skeletons: [],
                }),
            /skeletons map/,
        );
        assert.throws(
            // Run the operation expected to throw
            () =>
                normalizeSkeletonManifest({
                    version: 1,
                    skeletons: { invalid: { html: '<div></div>' } },
                }),
            /must contain a hyphen/,
        );
        assert.throws(
            // Run the operation expected to throw
            () =>
                normalizeSkeletonManifest({
                    version: 1,
                    skeletons: { 'empty-card': { html: '' } },
                }),
            /non-empty html/,
        );
    });

    test('returns settled named results when one bounded task fails', async () => {
        // Exercise the test scenario
        const results = await settleNamedTasks(
            ['a', 'b', 'c'],
            async (name) => {
                // Settle the named task
                if (name === 'b') throw new Error('failed');
                return name.toUpperCase();
            },
            2,
        );
        assert.deepEqual(results.a, {
            status: 'fulfilled',
            value: 'A',
        });
        assert.equal(results.b.status, 'rejected');
        assert.deepEqual(results.c, {
            status: 'fulfilled',
            value: 'C',
        });
    });
});

describe('request identity', () => {
    // Define the test group
    test('stable serialization is independent of object insertion order', () => {
        // Exercise the test scenario
        fc.assert(
            fc.property(
                fc.dictionary(
                    fc.string({
                        minLength: 1,
                        maxLength: 8,
                    }),
                    fc.jsonValue(),
                ),
                (object) => {
                    // Transform the current property
                    const reversed = Object.fromEntries(Object.entries(object).reverse());
                    assert.equal(stableStringify(object), stableStringify(reversed));
                },
            ),
        );
    });

    test('cache keys are opaque and exclude response targets from identity', async () => {
        // Exercise the test scenario
        const options = {
                method: 'POST',
                headers: { authorization: 'Bearer secret' },
                body: 'same',
            },
            first = await getDataCacheKey('https://example.test/data', options, null, { responseType: 'json' }),
            second = await getDataCacheKey('https://example.test/data', options, null, { responseType: 'json' });
        assert.equal(first.key, second.key);
        assert.match(first.key, /^acl-data-/);
        assert.equal(first.key.includes('secret'), false);
    });

    test('binary request bodies bypass shared caching without an explicit key', () => {
        // Exercise the test scenario
        assert.equal(normalizeBodyForCache(new Blob(['binary'])).cacheable, false);
    });

    test('normalizes headers, declarative bodies, and cache pruning', async () => {
        // Exercise the test scenario
        assert.deepEqual(
            normalizeRequestForCache({
                method: 'GET',
                signal: new AbortController().signal,
                headers: [['X-Test', 'yes']],
                parser() {
                    // Provide a request-specific parser identity
                },
            }),
            {
                method: 'GET',
                headers: { 'x-test': 'yes' },
            },
        );
        assert.deepEqual(parseBodyValue('{"ok":true}'), { ok: true });
        assert.equal(parseBodyValue(' plain '), ' plain ');
        assert.equal(parseBodyValue(''), '');
        assert.equal(normalizeBodyForCache(new URLSearchParams([['a', '1']])).cacheable, true);
        const form = new FormData();
        form.append('name', 'value');
        assert.equal(normalizeBodyForCache(form).cacheable, true);
        const explicit = await getDataCacheKey('https://example.test/upload', { body: new Blob(['x']) }, 'upload-v1');
        assert.equal(explicit.cacheable, true);

        dataFetchCache.clear();
        dataFetchCache.set('pending', { settled: false });
        dataFetchCache.set('old', { settled: true });
        dataFetchCache.set('new', { settled: true });
        pruneDataFetchCache({ cacheMax: 2 });
        assert.equal(dataFetchCache.has('pending'), true);
        assert.equal(dataFetchCache.has('old'), false);
        dataFetchCache.set('settled-at-zero', { settled: true });
        pruneDataFetchCache({ cacheMax: 0 });
        assert.deepEqual([...dataFetchCache.keys()], ['pending']);
        dataFetchCache.clear();
    });

    test('abort-aware waits release their listeners on every settlement path', async () => {
        // Exercise the test scenario
        const createSignal = () => {
            const target = new EventTarget();
            target.aborted = false;
            target.reason = null;
            let activeListeners = 0;
            const add = target.addEventListener.bind(target),
                remove = target.removeEventListener.bind(target);
            target.addEventListener = (...args) => {
                // Exercise the test scenario
                activeListeners++;
                return add(...args);
            };
            target.removeEventListener = (...args) => {
                // Exercise the test scenario
                activeListeners--;
                return remove(...args);
            };
            target.abort = (reason) => {
                // Exercise the test scenario
                target.aborted = true;
                target.reason = reason;
                target.dispatchEvent(new Event('abort'));
            };
            target.listenerCount = () => {
                // Exercise the test scenario
                return activeListeners;
            };
            return target;
        };

        const completed = createSignal();
        assert.equal(await raceWithSignal(Promise.resolve('done'), completed), 'done');
        assert.equal(completed.listenerCount(), 0);
        await delayWithSignal(0, completed);
        assert.equal(completed.listenerCount(), 0);

        const canceled = createSignal(),
            pending = delayWithSignal(1000, canceled);
        canceled.abort(new Error('stop'));
        await assert.rejects(pending, /stop/);
        assert.equal(canceled.listenerCount(), 0);
    });
});

describe('shared value normalization', () => {
    // Define the test group
    test('clones mutable runtime and definition values without sharing nested state', () => {
        // Exercise the test scenario
        const original = {
                nested: { count: 1 },
                list: [1, { ok: true }],
            },
            runtimeClone = cloneRuntimeValue(original),
            definitionClone = cloneDefinitionValue(original);
        runtimeClone.nested.count = 2;
        definitionClone.list[1].ok = false;
        assert.equal(original.nested.count, 1);
        assert.equal(original.list[1].ok, true);
        assert.equal(cloneRuntimeValue(null), null);
    });

    test('serializes style, URL, strict JSON lists, and nested query values', () => {
        // Exercise the test scenario
        assert.equal(
            toCssString({
                backgroundColor: 'red',
                lineHeight: 1,
            }),
            'background-color:red;line-height:1',
        );
        assert.equal(toUrlValue({ id: 2 }), '%7B%22id%22%3A2%7D');
        assert.deepEqual(parseJson('{"ok":true}'), { ok: true });
        assert.equal(parseJson("{'ok': true}"), null);
        assert.equal(parseJson('{broken', 'fallback'), 'fallback');
        assert.deepEqual(parseListAttribute('["a","b"]'), ['a', 'b']);
        assert.throws(
            // Run the operation expected to throw
            () => parseListAttribute('a, b'),
            /must be JSON arrays/,
        );
        assert.deepEqual(parseListAttribute(''), []);
        assert.equal(
            toSearchParamsDeep({
                filter: { state: 'open' },
                tag: ['a', 'b'],
                skip: null,
            }).toString(),
            'filter%5Bstate%5D=open&tag=a&tag=b',
        );
        assert.equal(getTemplateLoadKey('/card.html', { _templateCacheKey: 'v1' }), 'v1::/card.html');
    });

    test('merges fetch headers and normalizes forwarding rules', () => {
        // Exercise the test scenario
        assert.deepEqual(
            mergeFetchOptions(
                {
                    method: 'GET',
                    headers: {
                        accept: 'application/json',
                        'x-first': '1',
                    },
                },
                {
                    method: 'POST',
                    headers: { 'x-first': '2' },
                },
            ),
            {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    'x-first': '2',
                },
            },
        );
        assert.deepEqual(
            normalizeForwardEvents(
                ['save'],
                [
                    {
                        from: 'cancel',
                        as: 'dismiss',
                        bubbles: false,
                    },
                ],
            ),
            [
                {
                    from: 'save',
                    as: 'save',
                    bubbles: true,
                    composed: true,
                },
                {
                    from: 'cancel',
                    as: 'dismiss',
                    bubbles: false,
                    composed: true,
                },
            ],
        );
        assert.deepEqual(
            normalizeForwardEvents([
                {
                    event: 'legacy',
                    to: 'ignored',
                },
            ]),
            [],
        );
        assert.equal(resolveWindowPath('App.__proto__.secret'), null);
        assert.equal(resolveWindowPath('not valid!'), null);
    });
});

describe('props, lifecycle, and persistence', () => {
    // Define the test group
    test('normalizes serialized definitions and validates nested schemas', () => {
        // Exercise the test scenario
        const definitions = parsePropDefinitions({
            count: 'Number',
            profile: {
                type: 'Object',
                schema: {
                    name: {
                        type: 'String',
                        required: true,
                    },
                },
            },
        });
        assert.equal(definitions.count, Number);
        assert.equal(definitions.profile.type, Object);
        assert.throws(
            // Run the operation expected to throw
            () => parsePropDefinitions({ count: 'number' }),
            /Unsupported prop type/,
        );
        assert.match(validateSchemaShape({ name: 4 }, definitions.profile.schema, 'profile'), /must be a string/);
        assert.match(validateSchemaShape({}, definitions.profile.schema, 'profile'), /Missing required field/);
    });

    test('applies explicit lifecycle state invariants', () => {
        // Exercise the test scenario
        const attributes = new Map(),
            host = {
                setAttribute(name, value) {
                    // Set attribute
                    attributes.set(name, value);
                },
            };
        applyLifecycleState(host, 'loading');
        assert.equal(host._state, 'loading');
        assert.equal(attributes.get('aria-busy'), 'true');
        applyLifecycleState(host, 'ready');
        assert.equal(host._state, 'ready');
        assert.equal(attributes.get('aria-busy'), 'false');
        assert.throws(
            // Run the operation expected to throw
            () => applyLifecycleState(host, 'unknown'),
            /Unknown lifecycle state/,
        );
        const detail = createLifecycleEventDetail({ $props: { ok: true } }, 'test-card', { phase: 'test' });
        assert.equal(detail.tagName, 'test-card');
        assert.equal(detail.phase, 'test');
        assert.equal(typeof detail.timestamp, 'number');
    });

    test('requires versioned persistence, migrates envelopes, and strips helper props', async () => {
        // Exercise the test scenario
        assert.deepEqual(await decodePersistedValue(null), {
            data: null,
            fromVersion: null,
            shouldWrite: false,
            envelope: null,
        });
        await assert.rejects(decodePersistedValue('{"count":2}'), /must use a \{ version, data \} envelope/);
        await assert.rejects(decodePersistedValue('{"version":0,"data":{}}'), /positive integers/);
        const decoded = await decodePersistedValue('{"version":1,"data":{"count":2}}', {
            version: 2,
            // Run the migrate operation
            migrate: (data, context) => ({
                ...data,
                migratedFrom: context.fromVersion,
            }),
        });
        assert.equal(decoded.shouldWrite, true);
        assert.deepEqual(
            decoded.envelope,
            createPersistenceEnvelope(2, {
                count: 2,
                migratedFrom: 1,
            }),
        );
        assert.deepEqual(
            snapshotPersistentProps({
                count: 2,
                $reload() {
                    // Provide a helper excluded from persistence snapshots
                },
                $error: null,
            }),
            { count: 2 },
        );
    });

    test('rejects IndexedDB persistence when the storage API or names are unavailable', () => {
        // Exercise the test scenario
        assert.throws(
            // Run the operation expected to throw
            () => createIndexedDBPersistenceAdapter({ indexedDBImpl: null }),
            /not available/,
        );
        assert.throws(
            // Run the operation expected to throw
            () =>
                createIndexedDBPersistenceAdapter({
                    indexedDBImpl: {
                        open() {
                            // Provide the minimum IndexedDB stub for name validation
                        },
                    },
                    databaseName: '',
                }),
            /non-empty strings/,
        );
        assert.throws(
            // Run the operation expected to throw
            () =>
                createIndexedDBPersistenceAdapter({
                    indexedDBImpl: {
                        open() {
                            // Provide the minimum IndexedDB stub for name validation
                        },
                    },
                    storeName: '',
                }),
            /non-empty strings/,
        );
    });
});
