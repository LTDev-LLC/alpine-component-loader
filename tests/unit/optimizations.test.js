import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    createTemplateRequests,
    fetchTemplateText,
    readTemplateResponse,
} from '../../src/runtime/template-requests.js';
import { renderOrderedBatch } from '../../server/render-batch.mjs';
import { generateModulePreloads } from '../../server/module-preloads.mjs';
import { observeIntersection, subscribeEnvironment } from '../../src/runtime/environment.js';
import { scheduleInitialization } from '../../src/runtime/initialization-scheduler.js';
import { createSSRRenderer } from '../../server/ssr.mjs';
import { generateModuleGraph, moduleClosure } from '../../server/module-graph.mjs';
import { createDefaults, validateOptions } from '../../src/runtime/config.js';
import { DEFAULT_DATA_OPTIONS } from '../../src/runtime/data-options.js';
import { parseCLIArguments, runCLI } from '../../bin/alpine-component-loader.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { optionDefaults } from '../../scripts/option-descriptors.mjs';
import { generateOfflineBundle } from '../../server/offline-generator.mjs';

test('preload CLI writes reviewable HTML and honors dry-run and overwrite protection', async (t) => {
    // Exercise selectors and file-writing conventions through the public command
    const directory = await mkdtemp(join(tmpdir(), 'acl-preload-cli-')),
        manifest = join(directory, 'acl-manifest.json'),
        output = join(directory, 'preloads.html');
    // Inspect the controlled fixture and its completion
    t.after(() =>
        rm(directory, {
            recursive: true,
            force: true,
        }),
    );
    // Inspect the controlled fixture and its completion
    t.mock.method(process.stdout, 'write', () => true);
    await writeFile(
        manifest,
        JSON.stringify({
            version: 1,
            components: { 'initial-card': 'initial.html' },
            groups: { initial: ['initial-card'] },
        }),
    );
    const args = [
        'preload',
        manifest,
        '--entry-url',
        '/dist/index.min.js',
        '--tag',
        'initial-card',
        '--group',
        'initial',
        '--feature',
        'scheduler',
        '--out',
        output,
    ];

    const parsed = parseCLIArguments(args);
    assert.deepEqual(parsed.tags, ['initial-card']);
    assert.deepEqual(parsed.groups, ['initial']);
    assert.deepEqual(parsed.features, ['scheduler']);
    await runCLI([...args, '--dry-run', '--json']);
    await assert.rejects(readFile(output), { code: 'ENOENT' });
    await runCLI(args);
    const html = await readFile(output, 'utf8');
    assert.match(html, /initialization-scheduler.min.js/);
    assert.equal((html.match(/runtime\/loader.min.js/g) || []).length, 1);
    await assert.rejects(runCLI(args), /already exists|overwrite/i);
    await runCLI([...args, '--force']);
    assert.equal(await readFile(output, 'utf8'), html);
    // Inspect the controlled fixture and its completion
    assert.throws(() => parseCLIArguments(['preload', manifest]), /entry-url/);
});

// Expose controlled completion so ownership races can be asserted without timing assumptions
const deferred = () => {
    let resolve;
    // Inspect the controlled fixture and its completion
    const promise = new Promise((done) => {
        resolve = done;
    });
    return {
        promise,
        resolve,
    };
};

test('disposal cancels uncooperative transports and queued speculation never starts after cancellation', async () => {
    // Hold capacity while removing a queued transaction and disposing its active owner
    const store = createTemplateRequests(new Map(), () => 1),
        queuedController = new AbortController(),
        gate = deferred(),
        started = [];
    // Inspect the controlled fixture and its completion

    const task = (name) => (context) =>
        context.network(() => {
            started.push(name);
            return gate.promise;
        });

    const active = store.subscribe('active', { priority: 'prefetch' }, task('active')),
        queued = store.subscribe(
            'queued',
            {
                priority: 'prefetch',
                signal: queuedController.signal,
            },
            task('queued'),
        );
    // Inspect the controlled fixture and its completion
    await new Promise((resolve) => setTimeout(resolve, 0));
    queuedController.abort();
    await assert.rejects(queued, { code: 'ACL_LOAD_CANCELED' });
    store.dispose();
    await assert.rejects(active, { code: 'ACL_LOAD_CANCELED' });
    gate.resolve();
    // Inspect the controlled fixture and its completion
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(started, ['active']);
    await assert.rejects(store.subscribe('new', {}, task('new')), { code: 'ACL_LOADER_DISPOSED' });
});

test('template byte guards reject misleading headers and transports report structured failures', async (t) => {
    // Use actual streamed bytes even when a declared length understates the response
    await assert.rejects(readTemplateResponse(new Response('12345', { headers: { 'content-length': '1' } }), 4), {
        code: 'ACL_TEMPLATE_TOO_LARGE',
    });
    await assert.rejects(readTemplateResponse(new Response('a', { headers: { 'content-length': '100' } }), 4), {
        code: 'ACL_TEMPLATE_TOO_LARGE',
    });
    assert.equal(await readTemplateResponse(new Response('éé'), 4), 'éé');
    const original = globalThis.fetch,
        settings = {
            templateTimeout: 0,
            templateMaxBytes: 100,
        },
        signal = new AbortController().signal;
    // Inspect the controlled fixture and its completion
    t.after(() => {
        globalThis.fetch = original;
    });
    // Inspect the controlled fixture and its completion
    globalThis.fetch = async () => new Response('missing', { status: 404 });
    await assert.rejects(fetchTemplateText('/404', settings, signal), {
        code: 'ACL_TEMPLATE_HTTP_ERROR',
        status: 404,
    });
    // Inspect the controlled fixture and its completion
    globalThis.fetch = async () => {
        throw new TypeError('offline');
    };
    await assert.rejects(fetchTemplateText('/offline', settings, signal), { code: 'ACL_TEMPLATE_FETCH_FAILED' });
    // Inspect the controlled fixture and its completion
    globalThis.fetch = async () => new Response('retry');
    assert.equal((await fetchTemplateText('/retry', settings, signal)).text, 'retry');
});

test('generated defaults remain isolated and shared descriptor validation rejects invalid configuration', () => {
    // Cover descriptor families while retaining complex callbacks by identity
    const first = createDefaults(DEFAULT_DATA_OPTIONS),
        second = createDefaults(DEFAULT_DATA_OPTIONS);
    first.data.timeout = 1;
    assert.equal(second.data.timeout, 30000);
    validateOptions({
        templateTimeout: 0,
        templateMaxBytes: Infinity,
        keepAliveMax: Infinity,
        hydrate: 'media',
        hydrateMedia: '(min-width: 1px)',
        hydrationScheduler: {},
        data: { retryJitter: 0.5 },
    });
    // Inspect the controlled fixture and its completion
    // Process the pending work in deterministic order
    for (const settings of [
        { templateTimeout: -1 },
        { templateMaxBytes: 0 },
        { prefetchConcurrency: 1.5 },
        { keepAliveMax: -1 },
        { persistVersion: 0 },
        { hydrate: 'unknown' },
        { hydrate: 'media' },
        { hydrationScheduler: true },
        { hydrationScheduler: { budgetMs: 0 } },
        { data: { retryJitter: 2 } },
        { data: { responseType: 'unknown' } },
    ])
        // Inspect the controlled fixture and its completion
        assert.throws(() => validateOptions(settings), TypeError);
});

test('embedded facade and runtime options preserve validation parity, nested isolation, and callbacks', async () => {
    // Evaluate only the generated facade region so no browser capabilities are activated
    const facade = await readFile(new URL('../../src/index.js', import.meta.url), 'utf8'),
        runtime = await readFile(new URL('../../src/runtime/config.js', import.meta.url), 'utf8'),
        region = facade.slice(facade.indexOf('// BEGIN GENERATED OPTIONS'), facade.indexOf('// END GENERATED OPTIONS')),
        generated = runInNewContext(`${region}\n({ createDefaults, validateOptions });`),
        first = generated.createDefaults(),
        second = generated.createDefaults(),
        runtimeDefaults = createDefaults(DEFAULT_DATA_OPTIONS);
    assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(optionDefaults)));
    assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(runtimeDefaults)));
    // Mutate every literal container while retaining independent factories
    for (const key of ['data', 'security', 'errorCss', 'events']) {
        first[key].probe = true;
        runtimeDefaults[key].probe = true;
        assert.equal(second[key].probe, undefined);
        assert.equal(createDefaults(DEFAULT_DATA_OPTIONS)[key].probe, undefined);
    }
    first.events.forward.push('changed');
    first.externalCss.push('changed');
    assert.equal(second.events.forward.length, 0);
    assert.equal(second.externalCss.length, 0);
    // Compare failures including coercion, missing options, and exact error messages
    for (const settings of [
        {},
        { data: null },
        {
            templateTimeout: '0',
            templateMaxBytes: Infinity,
        },
        { data: { timeout: NaN } },
        { data: { retries: Infinity } },
        { data: { retryJitter: -0.1 } },
        { data: { responseType: 'bad' } },
        { templateMaxBytes: 1.1 },
        { keepAliveMax: -1 },
        { loading: 'bad' },
        {
            hydrate: 'media',
            hydrateMedia: ' ',
        },
        { hydrationScheduler: null },
        { hydrationScheduler: { maxTasksPerTurn: 1.2 } },
    ]) {
        // Capture cross-realm errors as stable messages rather than constructor identities
        const message = (validator) => {
            // Preserve success as well as the precise validation failure
            try {
                validator(settings);
                return null;
            } catch (error) {
                return error.message;
            }
        };
        assert.equal(message(generated.validateOptions), message(validateOptions));
    }
    // Inspect the controlled fixture and its completion
    const callback = () => {},
        settings = {
            sanitize: callback,
            hooks: { mounted: callback },
            data: { parser: callback },
        };
    generated.validateOptions(settings);
    validateOptions(settings);
    assert.equal(settings.sanitize, callback);
    assert.equal(settings.hooks.mounted, callback);
    assert.equal(settings.data.parser, callback);
    assert.match(runtime, /BEGIN GENERATED OPTIONS/);
    // Inspect the controlled fixture and its completion
    assert.throws(
        // Preserve the existing numeric validation diagnostic
        () => validateOptions({ templateTimeout: -1 }),
        /templateTimeout must be a non-negative finite number/,
    );
    assert.doesNotMatch(facade + runtime, /structuredClone|generated-options\.js|const constraints/);
    await assert.rejects(readFile(new URL('../../src/generated-options.js', import.meta.url)), { code: 'ENOENT' });
});

test('preload and offline graph selection includes only required environmental capabilities', async (t) => {
    // Cover manifest inference, dependency expansion, and imperative feature selection
    const directory = await mkdtemp(join(tmpdir(), 'acl-environment-offline-'));
    // Inspect the controlled fixture and its completion
    t.after(() =>
        rm(directory, {
            recursive: true,
            force: true,
        }),
    );
    await writeFile(join(directory, 'card.html'), '<p>Offline</p>');
    // Verify pause opt-outs and the default pause subscriptions independently
    for (const [options, expected] of [
        [{}, false],
        [{ loading: 'idle' }, false],
        [{ hydrate: 'interaction' }, false],
        [{ loading: 'lazy' }, true],
        [{ hydrate: 'visible' }, true],
        [{ data: { poll: 1000 } }, true],
        [
            {
                data: {
                    poll: 1000,
                    pauseWhenHidden: false,
                    pauseWhenOffline: false,
                },
            },
            false,
        ],
        [
            {
                data: {
                    poll: 1000,
                    pauseWhenHidden: false,
                    pauseWhenOffline: false,
                    pauseWhenOffscreen: true,
                },
            },
            true,
        ],
    ]) {
        const manifest = {
                version: 1,
                components: {
                    'environment-card': {
                        source: 'card.html',
                        options,
                    },
                },
            },
            hints = await generateModulePreloads({
                manifest,
                tags: ['environment-card'],
                entryUrl: '/dist/index.min.js?acl-instance=probe',
            });
        assert.equal(hints.urls.includes('/dist/runtime/environment.min.js'), expected);
        // Inspect the controlled fixture and its completion
        assert.equal(
            // Inspect the controlled fixture and its completion
            hints.urls.some((url) => url.includes('environment.min.js?')),
            false,
        );
        await writeFile(join(directory, 'acl-manifest.json'), JSON.stringify(manifest));
        const offline = await generateOfflineBundle({
            manifestFile: join(directory, 'acl-manifest.json'),
            outDir: directory,
            runtime: { entryUrl: '/dist/index.js' },
            dryRun: true,
        });
        assert.equal(offline.outputs.manifest.includes('/dist/runtime/environment.js'), expected);
    }
    const manifest = {
            version: 1,
            components: {
                'root-card': {
                    source: 'card.html',
                    dependencies: ['lazy-child'],
                },
                'lazy-child': {
                    source: 'card.html',
                    options: { loading: 'lazy' },
                },
            },
        },
        dependency = await generateModulePreloads({
            manifest,
            tags: ['root-card'],
            entryUrl: '/dist/index.js',
        }),
        explicit = await generateModulePreloads({
            manifest: {
                version: 1,
                components: {},
            },
            features: ['environment'],
            entryUrl: '/dist/index.js',
        });
    assert.ok(dependency.urls.includes('/dist/runtime/environment.js'));
    assert.ok(explicit.urls.includes('/dist/runtime/environment.js'));
});

test('module graph generation follows structural imports and rejects missing dependencies', async (t) => {
    // Ignore import-looking text while separating eager edges from optional roots
    const directory = await mkdtemp(join(tmpdir(), 'acl-graph-'));
    // Inspect the controlled fixture and its completion
    t.after(() =>
        rm(directory, {
            recursive: true,
            force: true,
        }),
    );
    await writeFile(
        join(directory, 'index.js'),
        "import './eager.js'; const text = \"import('./fake.js')\"; export const optional = () => import('./optional.js');",
    );
    await writeFile(join(directory, 'eager.js'), 'export const value = 1;');
    await writeFile(join(directory, 'optional.js'), 'export const value = 2;');
    await writeFile(join(directory, 'index.min.js'), "import './unexpected.min.js';");
    const graph = await generateModuleGraph(directory, 'test', {});
    assert.deepEqual(Object.keys(graph.nodes).sort(), ['eager.js', 'index.js', 'optional.js']);
    assert.deepEqual(moduleClosure(graph, ['index.js']), ['eager.js', 'index.js']);
    assert.deepEqual(moduleClosure(graph, ['index.js'], true), ['eager.js', 'index.js', 'optional.js']);
    // Inspect the controlled fixture and its completion
    await assert.rejects(
        // Inspect the controlled fixture and its completion
        Promise.resolve().then(() => moduleClosure(graph, ['absent.js'])),
        /Unknown browser module/,
    );
    await rm(join(directory, 'eager.js'));
    await assert.rejects(generateModuleGraph(directory, 'test', {}), /Missing browser module/);
});

test('template subscribers cancel independently and abort only after the final owner leaves', async () => {
    // Share a transport and release its two independent subscribers
    const entries = new Map(),
        store = createTemplateRequests(entries, () => 2),
        gate = deferred(),
        a = new AbortController(),
        b = new AbortController();
    let signal,
        starts = 0;
    // Inspect the controlled fixture and its completion
    const task = (context) => {
            starts++;
            signal = context.signal;
            return gate.promise;
        },
        first = store.subscribe('key', { signal: a.signal }, task),
        second = store.subscribe('key', { signal: b.signal }, task);
    await Promise.resolve();
    a.abort();
    await assert.rejects(first, { code: 'ACL_LOAD_CANCELED' });
    assert.equal(signal.aborted, false);
    assert.equal(starts, 1);
    gate.resolve('shared');
    assert.equal(await second, 'shared');
    // Inspect the controlled fixture and its completion
    const pending = store.subscribe('other', { signal: b.signal }, (context) => {
        signal = context.signal;
        // Inspect the controlled fixture and its completion
        return new Promise(() => {});
    });
    await Promise.resolve();
    b.abort();
    await assert.rejects(pending, { code: 'ACL_LOAD_CANCELED' });
    assert.equal(signal.aborted, true);
    assert.equal(entries.size, 0);
});

test('speculative downloads share a total cap and foreground requests promote queued work', async () => {
    // Hold the admitted download while promoting another queued transaction
    const store = createTemplateRequests(new Map(), () => 1),
        gate = deferred(),
        seen = [];
    // Inspect the controlled fixture and its completion

    const task = (name) => (context) =>
        // Inspect the controlled fixture and its completion
        context.network(async () => {
            seen.push(name);
            if (name === 'first') await gate.promise;
            return name;
        });

    const first = store.subscribe('a', { priority: 'prefetch' }, task('first')),
        queued = store.subscribe('b', { priority: 'prefetch' }, task('second'));
    // Inspect the controlled fixture and its completion
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(seen, ['first']);
    const promoted = store.subscribe('b', {}, task('duplicate'));
    assert.equal(await promoted, 'second');
    assert.deepEqual(seen, ['first', 'second']);
    gate.resolve();
    assert.equal(await first, 'first');
    assert.equal(await queued, 'second');
    store.dispose();
});

test('body limits count streamed bytes and timeouts remain active after response headers', async (t) => {
    // Exercise transports that return headers before a body has completed
    await assert.rejects(readTemplateResponse(new Response('oversized'), 3), { code: 'ACL_TEMPLATE_TOO_LARGE' });
    const original = globalThis.fetch;
    // Inspect the controlled fixture and its completion
    t.after(() => {
        globalThis.fetch = original;
    });
    let canceled = false;
    // Inspect the controlled fixture and its completion
    globalThis.fetch = async () =>
        new Response(
            new ReadableStream({
                // Inspect the controlled fixture and its completion
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('partial'));
                },
                // Inspect the controlled fixture and its completion
                cancel() {
                    canceled = true;
                },
            }),
        );
    await assert.rejects(
        fetchTemplateText(
            '/slow',
            {
                templateTimeout: 10,
                templateMaxBytes: 100,
            },
            new AbortController().signal,
        ),
        { code: 'ACL_TEMPLATE_TIMEOUT' },
    );
    assert.equal(canceled, true);
    // Inspect the controlled fixture and its completion
    globalThis.fetch = async () => new Response('normal');
    assert.equal(
        (
            await fetchTemplateText(
                '/normal',
                {
                    templateTimeout: 0,
                    templateMaxBytes: Infinity,
                },
                new AbortController().signal,
            )
        ).text,
        'normal',
    );
});

test('SSR streaming bounds lookahead, preserves order, and aborts on iterator closure', async () => {
    // A slow first render must not allow unbounded completed results behind it
    const first = deferred(),
        started = [],
        signals = [],
        stream = renderOrderedBatch(
            Array.from({ length: 6 }, (_, index) => ({ tagName: String(index) })),
            async (tag, options) => {
                started.push(tag);
                signals.push(options.signal);
                return tag === '0' ? first.promise : tag === '2' ? new Promise(() => {}) : tag;
            },
            { concurrency: 2 },
        ),
        iterator = stream[Symbol.asyncIterator](),
        next = iterator.next();
    // Inspect the controlled fixture and its completion
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(started, ['0', '1']);
    first.resolve('0');
    assert.equal((await next).value, '0');
    assert.deepEqual(started, ['0', '1']);
    assert.equal((await iterator.next()).value, '1');
    await iterator.return();
    assert.equal(signals.at(-1).aborted, true);
    assert.ok(started.length <= 3);
});

test('SSR later-window failures interrupt a blocked first result', async () => {
    // Fail fast without waiting for an earlier application resolver that never settles
    const stream = renderOrderedBatch(
        [{ tagName: 'slow' }, { tagName: 'bad' }],
        (tag) => (tag === 'slow' ? new Promise(() => {}) : Promise.reject(new Error('failed'))),
        { concurrency: 2 },
    );
    await assert.rejects(stream.next(), /failed/);
});

test('observer pools keep independent targets and remove the final environment listener', () => {
    // Verify ownership rather than relying on garbage-collection timing
    const instances = [],
        document = {
            defaultView: {
                IntersectionObserver: class {
                    constructor(callback) {
                        this.callback = callback;
                        this.targets = new Set();
                        instances.push(this);
                    }

                    observe(target) {
                        this.targets.add(target);
                    }

                    unobserve(target) {
                        this.targets.delete(target);
                    }

                    disconnect() {
                        this.disconnected = true;
                    }
                },
            },
        },
        one = { ownerDocument: document },
        two = { ownerDocument: document },
        received = [];
    // Inspect the controlled fixture and its completion

    const a = observeIntersection(one, () => received.push('one')),
        // Inspect the controlled fixture and its completion
        b = observeIntersection(two, () => received.push('two'));
    assert.equal(instances.length, 1);
    a.disconnect();
    instances[0].callback([{ target: one }, { target: two }]);
    assert.deepEqual(received, ['two']);
    assert.equal(instances[0].disconnected, undefined);
    b.disconnect();
    assert.equal(instances[0].disconnected, true);
    const target = new EventTarget(),
        // Inspect the controlled fixture and its completion
        offA = subscribeEnvironment(target, 'online', () => received.push('a')),
        // Inspect the controlled fixture and its completion
        offB = subscribeEnvironment(target, 'online', () => received.push('b'));
    offA();
    target.dispatchEvent(new Event('online'));
    offB();
    target.dispatchEvent(new Event('online'));
    assert.deepEqual(received, ['two', 'b']);
});

test('scheduler checks elapsed phase time with a mocked clock and stable priorities', async (t) => {
    // Admit two five-millisecond phases under an eight-millisecond cooperative budget
    let now = 0;
    const turns = [],
        owner = {},
        order = [],
        settings = {
            budgetMs: 8,
            maxTasksPerTurn: 4,
        };
    // Inspect the controlled fixture and its completion
    t.mock.method(performance, 'now', () => now);
    // Inspect the controlled fixture and its completion
    t.mock.method(globalThis, 'setTimeout', (callback) => {
        turns.push(callback);
        return turns.length;
    });
    // Inspect the controlled fixture and its completion
    const tasks = [
        ['idle-a', 2],
        ['visible-a', 1],
        ['eager', 0],
        ['visible-b', 1],
        ['idle-b', 2],
    ].map(([name, priority]) =>
        scheduleInitialization(
            owner,
            () => {
                order.push(name);
                now += 5;
            },
            {
                settings,
                priority,
            },
        ),
    );
    await turns.shift()();
    assert.deepEqual(order, ['eager', 'visible-a']);
    assert.equal(turns.length, 1);
    await turns.shift()();
    assert.deepEqual(order, ['eager', 'visible-a', 'visible-b', 'idle-a']);
    await turns.shift()();
    await Promise.all(tasks);
    assert.equal(turns.length, 0);
});

test('scheduler yields between admission windows and drops canceled queued work', async () => {
    // Run a one-task turn with deterministic priority and a canceled idle task
    const owner = {},
        order = [],
        abort = new AbortController(),
        options = {
            settings: {
                budgetMs: 8,
                maxTasksPerTurn: 1,
            },
        },
        idle = scheduleInitialization(owner, () => order.push('idle'), {
            ...options,
            priority: 2,
            signal: abort.signal,
        }),
        visible = scheduleInitialization(owner, () => order.push('visible'), {
            ...options,
            priority: 1,
        }),
        eager = scheduleInitialization(owner, () => order.push('eager'), {
            ...options,
            priority: 0,
        });
    abort.abort(new Error('canceled'));
    await assert.rejects(idle, /canceled/);
    await eager;
    assert.deepEqual(order, ['eager']);
    await visible;
    assert.deepEqual(order, ['eager', 'visible']);
});

test('preload selection includes dependencies and declared capabilities without downloading all optional modules', async () => {
    // Match a pinned minified CDN family including loader instance identity
    const manifest = {
            version: 1,
            components: {
                'root-card': {
                    source: 'root.html',
                    dependencies: ['child-card'],
                    options: { persist: 'local' },
                },
                'child-card': 'child.html',
            },
            groups: { initial: ['root-card'] },
        },
        result = await generateModulePreloads({
            manifest,
            groups: ['initial'],
            entryUrl: 'https://cdn.example/v1/dist/index.min.js?acl-instance=one',
        });
    // Inspect the controlled fixture and its completion
    assert.ok(result.urls.includes('https://cdn.example/v1/dist/index.min.js?acl-instance=one'));
    assert.ok(result.urls.includes('https://cdn.example/v1/dist/runtime/loader.min.js'));
    assert.ok(!result.urls.includes('https://cdn.example/v1/dist/runtime/environment.min.js'));
    assert.ok(!result.urls.includes('https://cdn.example/v1/dist/runtime/environment.min.js?acl-instance=one'));
    assert.ok(result.urls.every((url) => new URL(url).pathname.endsWith('.min.js')));
    // Inspect the controlled fixture and its completion
    assert.ok(result.urls.some((url) => url.includes('persistence-controller.min.js')));
    // Inspect the controlled fixture and its completion
    assert.ok(!result.urls.some((url) => url.includes('data-controller.min.js')));
    assert.equal(result.urls.length, new Set(result.urls).size);
    await assert.rejects(
        generateModulePreloads({
            manifest,
            entryUrl: '/dist/index.js',
            features: ['unknown'],
        }),
        /Unsupported runtime capability/,
    );
});

test('cached SSR trees isolate slot content and reevaluate security policies per render', async () => {
    // Render distinct slot values from one source and then invalidate its parsed cache
    const root = await mkdtemp(join(tmpdir(), 'acl-parsed-')),
        file = join(root, 'card.html');
    // Release resources on both success and failure
    try {
        await writeFile(file, '<a href="/allowed">Link</a><slot></slot>');
        let calls = 0;
        const renderer = createSSRRenderer({
            root,
            manifest: {
                version: 1,
                components: { 'tree-card': 'card.html' },
            },
            renderLightDom: true,
            security: {
                // Inspect the controlled fixture and its completion
                urlPolicy() {
                    calls++;
                    return true;
                },
            },
        });
        assert.match(await renderer.render('tree-card', { slots: 'First' }), /First/);
        const second = await renderer.render('tree-card', { slots: 'Second' });
        assert.match(second, /Second/);
        assert.doesNotMatch(second, /First/);
        assert.equal(calls, 2);
        await writeFile(file, '<p>Updated</p>');
        renderer.clearCache();
        assert.match(await renderer.render('tree-card'), /Updated/);
    } finally {
        await rm(root, {
            recursive: true,
            force: true,
        });
    }
});

test('SSR failures after partial output preserve delivery and abort batch-owned work', async () => {
    // Fail a later render only after the consumer receives the first ordered result
    let reject;
    // Inspect the controlled fixture and its completion
    const failed = new Promise((_, rejectRender) => {
            reject = rejectRender;
        }),
        started = [],
        signals = [];
    // Inspect the controlled fixture and its completion

    const stream = renderOrderedBatch(
        ['first', 'failed', 'third', 'fourth'].map((tagName) => ({ tagName })),
        (tag, options) => {
            started.push(tag);
            signals.push(options.signal);
            return tag === 'failed' ? failed : tag === 'third' ? new Promise(() => {}) : tag;
        },
        { concurrency: 2 },
    );
    assert.equal((await stream.next()).value, 'first');
    const next = stream.next();
    // Inspect the controlled fixture and its completion
    await new Promise((resolve) => setTimeout(resolve, 0));
    reject(new Error('after partial output'));
    await assert.rejects(next, /after partial output/);
    assert.ok(!started.includes('fourth'));
    assert.equal(signals[2].aborted, true);
    assert.equal((await stream.next()).done, true);
});

test('cache invalidation drains foreground writes and suppresses quota retries from obsolete ownership', async () => {
    // Retain write ownership separately from metadata indexes during invalidation
    const {
        createTemplateCacheResponse,
        invalidateTemplateCacheIndex,
        settleTemplateCacheWrites,
        writeTemplateCacheEntry,
    } = await import('../../src/runtime/template-cache.js');
    // Process the pending work in deterministic order
    for (const quota of [false, true]) {
        const gate = deferred();
        let current = true,
            puts = 0,
            drained = false;
        // Inspect the controlled fixture and its completion
        const cache = {
            async put() {
                puts++;
                if (quota) throw new DOMException('Quota', 'QuotaExceededError');
                await gate.promise;
            },
        };
        // Inspect the controlled fixture and its completion

        const writing = writeTemplateCacheEntry(
            cache,
            'https://example.test/template',
            createTemplateCacheResponse('html', new Response('html')),
            {
                isCurrent: () => current,
                onQuota: () => gate.promise,
            },
        );
        invalidateTemplateCacheIndex(cache);
        // Inspect the controlled fixture and its completion
        const draining = settleTemplateCacheWrites(cache).then(() => {
            drained = true;
        });
        await Promise.resolve();
        assert.equal(drained, false);
        current = false;
        gate.resolve();
        assert.equal(await writing, false);
        await draining;
        assert.equal(puts, 1);
        assert.equal(drained, true);
    }
});

test('core preload selection resolves shared dependencies and explicit transformation groups', async () => {
    // Cover minified versioned bases, legacy entry queries, and additive selectors
    const manifest = {
            version: 1,
            components: {
                'capability-card': {
                    source: 'card.html',
                    options: {
                        hydrate: 'interaction',
                        executeScripts: true,
                        cacheTemplates: false,
                    },
                },
            },
        },
        hints = await generateModulePreloads({
            manifest,
            tags: ['capability-card'],
            entryUrl: 'https://cdn.example/acl@1.2.0/dist/core.min.js?acl-instance=legacy',
            features: ['styles', 'slots'],
        });
    assert.ok(hints.urls.includes('https://cdn.example/acl@1.2.0/dist/core.min.js?acl-instance=legacy'));
    assert.equal(hints.urls.length, new Set(hints.urls).size);
    // Required optional groups are explicit dependencies, and implementation URLs are shared
    for (const feature of ['hydration', 'triggers', 'styles', 'slots', 'scripts'])
        assert.ok(hints.urls.includes(`https://cdn.example/acl@1.2.0/dist/runtime/component/${feature}.min.js`));
    assert.ok(
        !hints.urls.some((url) => {
            // Exclude the unselected entry and persistent cache backend
            return /\/(?:index|template-cache)\.min\.js/.test(url);
        }),
    );
});

test('offline content inspection includes local loading and fallback transformations', async (t) => {
    // Derive optional content features from files already read by offline generation
    const directory = await mkdtemp(join(tmpdir(), 'acl-capability-offline-'));
    t.after(() => {
        // Remove the temporary offline project
        return rm(directory, {
            recursive: true,
            force: true,
        });
    });
    await writeFile(join(directory, 'card.html'), '<p>Plain</p>');
    await writeFile(join(directory, 'loading.html'), '<style>p { color: red; }</style><p>Loading</p>');
    await writeFile(join(directory, 'fallback.html'), '<slot><p>Fallback</p></slot>');
    await writeFile(
        join(directory, 'acl-manifest.json'),
        JSON.stringify({
            version: 1,
            components: {
                'offline-feature-card': {
                    source: 'card.html',
                    options: {
                        loadingTemplate: 'loading.html',
                        fallback: 'fallback.html',
                    },
                },
            },
        }),
    );
    const bundle = await generateOfflineBundle({
        manifestFile: join(directory, 'acl-manifest.json'),
        outDir: directory,
        runtime: { entryUrl: '/dist/core.min.js' },
        dryRun: true,
    });
    assert.match(bundle.outputs.manifest, /component\/styles.min.js/);
    assert.match(bundle.outputs.manifest, /component\/slots.min.js/);
    assert.match(bundle.outputs.manifest, /\/dist\/core.min.js/);
    assert.doesNotMatch(bundle.outputs.manifest, /component\/scripts.min.js/);
    const entry = JSON.parse(bundle.outputs.manifest).entries.find(
        // Hash the file actually delivered by the selected minified runtime entry
        (asset) => asset.url === '/dist/core.min.js',
    );
    assert.equal(
        entry.revision,
        `sha256-${createHash('sha256')
            .update(await readFile(resolve('dist/core.min.js')))
            .digest('base64url')}`,
    );
});

test('a completely consumed template stream releases its lock without canceling the response', async () => {
    // Successful reads must not abort an already completed native network response
    let canceled = 0,
        released = 0;
    const response = {
        headers: new Headers(),
        body: {
            getReader() {
                // Model an already completed stream without introducing browser timing assumptions
                return {
                    async read() {
                        // Return completion without scheduling another transport operation
                        return { done: true };
                    },
                    async cancel() {
                        // Record attempts to cancel a successfully consumed stream
                        canceled++;
                    },
                    releaseLock() {
                        // Always release body ownership after consumption
                        released++;
                    },
                };
            },
        },
    };
    assert.equal(await readTemplateResponse(response, 1024), '');
    assert.equal(canceled, 0);
    assert.equal(released, 1);
});

test('relative core preload entries retain their public identity and shared dependency URLs', async () => {
    // Normalize relative entry paths before choosing the generated graph root
    const hints = await generateModulePreloads({
        manifest: {
            version: 1,
            components: {},
        },
        entryUrl: 'core.min.js?acl-instance=relative',
    });
    assert.ok(hints.urls.includes('/core.min.js?acl-instance=relative'));
    assert.ok(!hints.urls.includes('/index.min.js?acl-instance=relative'));
    assert.ok(hints.urls.includes('/runtime/context.min.js'));
});
