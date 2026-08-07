import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { build as viteBuild, createLogger as createViteLogger, createServer as createViteServer } from 'vite';
import { applyProjectConfiguration, parseCLIArguments, runCLI } from '../../bin/alpine-component-loader.mjs';
import {
    classifyAuditFindings,
    createAccessibilityBaseline,
    fingerprintAuditFinding,
    formatAuditReport,
} from '../../server/audit-runner.mjs';
import { loadProjectConfig } from '../../server/project-config.mjs';
import { generateRouteManifests } from '../../server/route-generator.mjs';
import { createSSRRenderer } from '../../server/ssr.mjs';
import { alpineComponentLoader } from '../../server/vite-plugin.mjs';
import {
    classifyWatchChange,
    configuredTasks,
    normalizeWatchTasks,
    startProjectWatcher,
} from '../../server/watch-coordinator.mjs';
import {
    connectExporter,
    createBatchExporter,
    createOpenTelemetryExporter,
    createSentryExporter,
} from '../../src/observability-exporters.js';
import { registerManifestFrom, registerRouteManifest } from '../../src/runtime/manifest-loader.js';

const packageVersion = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')).version,
    manifest = // Run this operation
        (source = 'components/example-card.html') => ({
            version: 1,
            components: {
                'base-card': { source: 'components/base-card.html' },
                'example-card': {
                    source,
                    dependencies: ['base-card'],
                },
            },
            groups: {
                page: ['example-card'],
            },
        });

test('project configuration rejects unknown keys and resolves paths from the config file', async () => {
    // Run this operation
    const root = await mkdtemp(join(tmpdir(), 'acl-config-')),
        nested = join(root, 'project');
    await mkdir(nested);
    await writeFile(
        join(nested, 'acl.config.mjs'),
        `export default {
            root: './app',
            components: { directory: './ui', manifest: './generated/manifest.json', inference: 'report' },
            routes: { outDir: './routes', entries: [{ key: 'home', path: '/' }] },
            watch: { tasks: ['manifest', 'routes'], debounce: 25, pollInterval: 0 }
        };`,
    );
    const loaded = await loadProjectConfig({ invocationDirectory: nested });
    assert.equal(loaded.config.root, join(nested, 'app'));
    assert.equal(loaded.config.components.directory, join(nested, 'ui'));
    assert.equal(loaded.config.routes.outDir, join(nested, 'routes'));
    assert.equal(loaded.config.watch.pollInterval, 0);
    await writeFile(join(nested, 'bad.mjs'), `export default { vite: { mystery: true } };`);
    await assert.rejects(
        loadProjectConfig({
            // Configure this value
            invocationDirectory: nested,
            configFile: 'bad.mjs',
        }),
        /unsupported key "mystery"/,
    );
    await writeFile(join(nested, 'bad-watch.mjs'), `export default { watch: { pollInterval: -1 } };`);
    await assert.rejects(
        loadProjectConfig({
            invocationDirectory: nested,
            configFile: 'bad-watch.mjs',
        }),
        /pollInterval must be a non-negative integer/,
    );
});

test('CLI flags override shared project configuration for route generation', async () => {
    // Run this operation
    const root = await mkdtemp(join(tmpdir(), 'acl-config-precedence-')),
        configFile = join(root, 'acl.config.mjs'),
        manifestFile = join(root, 'acl-manifest.json'),
        explicitOut = join(root, 'explicit-routes');
    await writeFile(manifestFile, `${JSON.stringify(manifest(), null, 2)}\n`);
    await writeFile(
        configFile,
        `export default {
            components: { directory: './components', manifest: './acl-manifest.json' },
            routes: {
                outDir: './configured-routes',
                entries: [{ key: 'configured', path: '/', components: ['example-card'] }]
            }
        };`,
    );
    const result = await runCLI(['routes', '--config', configFile, '--out-dir', explicitOut, '--dry-run']);
    assert.equal(result.plannedFiles.at(-1), join(explicitOut, 'acl-routes.json'));
    assert.deepEqual(Object.keys(result.index.routes), ['configured']);
});

test('CLI parser covers route and watch options while preserving validation', () => {
    // Exercise every new repeatable and scalar CLI option
    const routes = parseCLIArguments(
            [
                'routes',
                'manifest.json',
                '--out-dir',
                'routes',
                '--route=/settings',
                '--route',
                '/profile',
                '--target',
                'index.html',
                '--timeout=2500',
                '--force',
                '--dry-run',
                '--json',
            ],
            '/project',
        ),
        watch = parseCLIArguments([
            'watch',
            '--task=manifest',
            '--task',
            'types',
            '--debounce=15',
            '--poll-interval=0',
            '--include-expensive',
        ]);
    assert.deepEqual(routes.routes, ['/settings', '/profile']);
    assert.equal(routes.timeout, 2500);
    assert.equal(routes.force, true);
    assert.equal(routes.json, true);
    assert.deepEqual(watch.tasks, ['manifest', 'types']);
    assert.equal(watch.debounce, 15);
    assert.equal(watch.pollInterval, 0);
    assert.equal(watch.includeExpensive, true);
    assert.throws(
        // Reject invalid watcher debounce values
        () => parseCLIArguments(['watch', '--debounce=-1']),
        /non-negative integer/,
    );
    assert.throws(
        // Reject invalid watcher polling values
        () => parseCLIArguments(['watch', '--poll-interval=-1']),
        /non-negative integer/,
    );
    assert.throws(
        // Reject unknown route generator options
        () => parseCLIArguments(['routes', '--mystery']),
        /Unknown option/,
    );
});

test('project configuration preserves explicit audit CLI flags', async () => {
    // Exercise every audit precedence predicate with explicit command flags
    const root = await mkdtemp(join(tmpdir(), 'acl-audit-precedence-')),
        options = parseCLIArguments(
            [
                'audit',
                'http://127.0.0.1:9000',
                '--root',
                root,
                '--route',
                '/settings',
                '--out',
                join(root, 'audit.json'),
                '--format',
                'json',
                '--timeout',
                '1200',
            ],
            root,
            { allowConfigured: true },
        ),
        resolved = await applyProjectConfiguration(options);
    assert.equal(resolved.root, root);
    assert.deepEqual(resolved.routes, ['http://127.0.0.1:9000', '/settings']);
    assert.equal(resolved.format, 'json');
    assert.equal(resolved.timeout, 1200);
});

test('route generation expands dependencies and emits deterministic independent shards', async () => {
    // Run this operation
    const root = await mkdtemp(join(tmpdir(), 'acl-routes-')),
        manifestFile = join(root, 'acl-manifest.json'),
        outDir = join(root, 'routes');
    await writeFile(manifestFile, `${JSON.stringify(manifest(), null, 2)}\n`);
    const options = {
            manifestFile,
            outDir,
            entries: [
                {
                    // Configure this value
                    key: 'settings/main',
                    path: '/settings',
                    groups: ['page'],
                },
                {
                    // Configure this value
                    key: 'empty',
                    path: '/empty',
                },
            ],
            force: true,
        },
        first = await generateRouteManifests(options),
        firstIndex = await readFile(join(outDir, 'acl-routes.json'), 'utf8'),
        second = await generateRouteManifests(options),
        secondIndex = await readFile(join(outDir, 'acl-routes.json'), 'utf8'),
        route = first.index.routes['settings/main'],
        shard = JSON.parse(await readFile(join(outDir, route.manifest), 'utf8'));
    assert.equal(firstIndex, secondIndex);
    assert.deepEqual(first.index, second.index);
    assert.deepEqual(route.components, ['base-card', 'example-card']);
    assert.match(route.manifest, /^\.\/acl-route-settings-main-[a-f0-9]{8}\.json$/);
    assert.match(route.revision, /^sha256-/);
    assert.deepEqual(Object.keys(shard.components), ['base-card', 'example-card']);
});

test('route crawling observes hosts in the document and open shadow roots', async () => {
    // Build a local route whose hosts exercise both traversal sources
    const root = await mkdtemp(join(tmpdir(), 'acl-routes-crawl-')),
        manifestFile = join(root, 'acl-manifest.json'),
        outDir = join(root, 'routes');
    await mkdir(join(root, 'components'));
    await writeFile(manifestFile, `${JSON.stringify(manifest(), null, 2)}\n`);
    await writeFile(
        join(root, 'index.html'),
        `<!doctype html><body>
            <example-card data-acl-component></example-card>
            <div id="shadow"></div>
            <script>
                const root = document.querySelector('#shadow').attachShadow({ mode: 'open' });
                root.innerHTML = '<unknown-card data-acl-component></unknown-card>';
            </script>
        </body>`,
    );
    const result = await generateRouteManifests({
        manifestFile,
        outDir,
        root,
        target: 'index.html',
        entries: [
            {
                key: 'home',
                path: '/',
                discover: true,
            },
        ],
        force: true,
    });
    assert.deepEqual(result.index.routes.home.components, ['base-card', 'example-card']);
    assert.ok(
        result.warnings.some(
            // Find the diagnostic for the crawled unknown host
            (warning) => warning.includes('<unknown-card>'),
        ),
    );
});

test('manifest URL loading deduplicates per loader, resolves paths, retries failures, and looks up exact routes', async () => {
    // Run this operation
    const sourceManifest = {
            version: 1,
            basePath: './templates/',
            components: { 'remote-card': 'remote-card.html' },
        },
        calls = [],
        suppliedFetch = // Run this operation
            async (url) => {
                calls.push(String(url));
                return new Response(JSON.stringify(sourceManifest), {
                    headers: { 'content-type': 'application/json' },
                });
            },
        createLoader = // Run this operation
            () => ({
                registrations: [],
                // Run this operation
                async registerManifest(value, options) {
                    this.registrations.push({
                        // Configure this value
                        value,
                        options,
                    });
                    return {
                        // Configure this value
                        registered: Object.keys(value.components),
                        prefetched: {},
                    };
                },
            }),
        firstLoader = createLoader(),
        secondLoader = createLoader(),
        [first, duplicate] = await Promise.all([
            registerManifestFrom(firstLoader, 'https://cdn.example/app/acl-manifest.json', {
                fetch: suppliedFetch,
            }),
            registerManifestFrom(firstLoader, 'https://cdn.example/app/acl-manifest.json', {
                fetch: suppliedFetch,
            }),
        ]);
    assert.equal(calls.length, 1);
    assert.equal(first, duplicate);
    assert.equal(firstLoader.registrations[0].options.basePath, 'https://cdn.example/app/templates/');
    await registerManifestFrom(secondLoader, 'https://cdn.example/app/acl-manifest.json', {
        fetch: suppliedFetch,
    });
    assert.equal(calls.length, 2);

    let attempts = 0;
    const retryLoader = createLoader(),
        retryFetch = // Run this operation
            async () => {
                attempts++;
                if (attempts === 1) throw new Error('temporary');
                return new Response(JSON.stringify(sourceManifest));
            };
    await assert.rejects(
        registerManifestFrom(retryLoader, 'https://cdn.example/retry.json', { fetch: retryFetch }),
        (error) => error.code === 'ACL_MANIFEST_FETCH_FAILED',
    );
    await registerManifestFrom(retryLoader, 'https://cdn.example/retry.json', { fetch: retryFetch });
    assert.equal(attempts, 2);

    const routeLoader = createLoader(),
        routeIndex = {
            version: 1,
            routes: {
                settings: {
                    manifest: './settings.json',
                    revision: 'sha256-YWJj',
                    components: ['remote-card'],
                },
            },
        },
        routeFetch = // Run this operation
            async (url, options) => {
                assert.equal(String(url), 'https://cdn.example/routes/settings.json');
                assert.equal(options.integrity, 'sha256-YWJj');
                return new Response(JSON.stringify(sourceManifest));
            };
    await registerRouteManifest(routeLoader, 'settings', routeIndex, {
        baseUrl: 'https://cdn.example/routes/acl-routes.json',
        fetch: routeFetch,
    });
    await assert.rejects(
        registerRouteManifest(routeLoader, 'set', routeIndex, { fetch: routeFetch }),
        // Run this operation
        (error) => error.code === 'ACL_ROUTE_NOT_FOUND',
    );
});

test('watch coordinator orders configured tasks and recovers after a failed generator', async () => {
    // Run this operation
    let queueRecovery = false,
        queuedRun = null;
    const root = await mkdtemp(join(tmpdir(), 'acl-watch-')),
        manifestFile = join(root, 'acl-manifest.json'),
        declarations = join(root, 'acl-components.d.ts'),
        events = [],
        watcher = await startProjectWatcher({
            config: {
                root,
                components: { manifest: manifestFile },
                contracts: {
                    // Configure this value
                    types: declarations,
                    customElements: join(root, 'custom-elements.json'),
                },
            },
            tasks: ['types'],
            // Run this operation
            onProgress: ({ task, status }) => {
                events.push(`${task}:${status}`);
                if (queueRecovery && status === 'start') {
                    queueRecovery = false;
                    queuedRun = Promise.resolve().then(
                        // Queue after the coordinator publishes its active run promise
                        () => watcher.run('queued'),
                    );
                }
            },
        });
    assert.ok(watcher.results.types.error);
    await writeFile(manifestFile, `${JSON.stringify(manifest('example-card.html'))}\n`);
    queueRecovery = true;
    await watcher.run('recovery');
    await queuedRun;
    assert.equal(watcher.results.types.error, undefined);
    assert.deepEqual(events, [
        'types:start',
        'types:error',
        'types:start',
        'types:complete',
        'types:start',
        'types:complete',
    ]);
    assert.ok((await stat(declarations)).isFile());
    await watcher.close();
    assert.equal(await watcher.run('closed'), watcher.results);
    await watcher.close();
});

test('watch coordinator rejects missing configuration and empty task graphs', async () => {
    // Cover validation before the filesystem watcher boundary
    await assert.rejects(startProjectWatcher(), /requires normalized project configuration/);
    await assert.rejects(
        startProjectWatcher({
            config: { root: '/project' },
            pollInterval: 0,
        }),
        /has no configured tasks/,
    );
});

test('watch task selection classifies dependencies and keeps browser work opt-in', () => {
    // Cover inferred task selection and change fan-out without opening a watcher
    const root = '/project',
        config = {
            root,
            components: {
                directory: join(root, 'components'),
                manifest: join(root, 'acl-manifest.json'),
            },
            contracts: {
                types: join(root, 'acl-components.d.ts'),
                manifestSchema: join(root, 'manifest.schema.json'),
            },
            routes: {
                manifest: join(root, 'acl-manifest.json'),
                outDir: join(root, 'routes'),
                entries: [
                    {
                        key: 'home',
                        path: '/',
                        discover: true,
                    },
                ],
            },
            offline: {
                manifest: join(root, 'acl-manifest.json'),
                outDir: join(root, 'offline'),
            },
        };
    assert.deepEqual(configuredTasks(config), ['manifest', 'types', 'schema', 'routes', 'offline']);
    assert.deepEqual(normalizeWatchTasks(config, null, false), ['manifest', 'types', 'schema', 'offline']);
    assert.deepEqual(normalizeWatchTasks(config, ['audit', 'routes'], false), ['routes', 'audit']);
    assert.deepEqual(
        classifyWatchChange(join(root, 'components', 'card.html'), config, [
            'manifest',
            'types',
            'schema',
            'routes',
            'offline',
            'audit',
        ]),
        ['manifest', 'types', 'routes', 'offline', 'audit'],
    );
    assert.deepEqual(
        classifyWatchChange(config.components.manifest, config, ['manifest', 'types', 'routes', 'offline']),
        ['types', 'routes', 'offline'],
    );
    assert.deepEqual(classifyWatchChange(join(root, 'index.html'), config, ['manifest', 'audit']), [
        'manifest',
        'audit',
    ]);
    assert.throws(
        // Reject task names outside the supported coordinator graph
        () => normalizeWatchTasks(config, ['mystery'], false),
        /Unsupported ACL watch task/,
    );
});

test('Vite plugin injects base-aware maps, external delivery, virtual routes, and copied modules', async () => {
    // Run this operation
    const root = await mkdtemp(join(tmpdir(), 'acl-vite-')),
        external = alpineComponentLoader({
            generate: false,
            moduleDelivery: 'external',
            moduleBase: 'https://cdn.example/acl/1.2.0/',
        });
    await external.config({ root });
    external.configResolved({
        // Configure this value
        root,
        base: '/app/',
        command: 'build',
        build: { outDir: 'dist' },
    });
    const html = external.transformIndexHtml('<!doctype html><html><head></head><body></body></html>', {});
    assert.match(html, /https:\/\/cdn\.example\/acl\/1\.2\.0\/index\.js/);
    assert.match(external.load(external.resolveId('virtual:alpine-component-loader/routes')), /registerRouteManifest/);

    const copied = alpineComponentLoader({ generate: false });
    await copied.config({ root });
    copied.configResolved({
        // Configure this value
        root,
        base: '/nested/',
        command: 'build',
        build: { outDir: 'build' },
    });
    const copiedHtml = copied.transformIndexHtml('<html><head></head></html>', {});
    assert.ok(copiedHtml.includes(`/nested/assets/alpine-component-loader/${packageVersion}/index.js`));
    copied.configResolved({
        // Verify the common root-base path never becomes a protocol-relative URL
        root,
        base: '/',
        command: 'build',
        build: { outDir: 'build' },
    });
    const rootBaseHtml = copied.transformIndexHtml('<html><head></head></html>', {});
    assert.ok(
        rootBaseHtml.includes(
            `"alpine-component-loader": "/assets/alpine-component-loader/${packageVersion}/index.js"`,
        ),
    );
    assert.doesNotMatch(rootBaseHtml, /"alpine-component-loader": "\/\/assets\//);
    await copied.writeBundle();
    assert.ok(
        (await stat(join(root, 'build', 'assets', 'alpine-component-loader', packageVersion, 'index.js'))).isFile(),
    );
});

test('Vite hooks serve native files, emit targeted HMR, validate delivery, and copy routes', async () => {
    // Exercise middleware and hook branches outside a full Vite build
    const root = await mkdtemp(join(tmpdir(), 'acl-vite-hooks-')),
        routeDirectory = join(root, 'route-source'),
        plugin = alpineComponentLoader({
            generate: false,
            routeDirectory: 'generated-routes',
        });
    await mkdir(routeDirectory);
    await writeFile(join(routeDirectory, 'acl-routes.json'), '{"version":1,"routes":{}}');
    await writeFile(
        join(root, 'acl.config.mjs'),
        `export default { routes: { outDir: './route-source', entries: [] } };`,
    );
    await plugin.config({ root });
    plugin.configResolved({
        root,
        base: '/application/',
        command: 'serve',
        build: { outDir: 'output' },
    });
    const middleware = [];
    plugin.configureServer({
        middlewares: {
            // Capture each registered development middleware
            use: (handler) => middleware.push(handler),
        },
    });
    const served = {
        statusCode: 0,
        headers: {},
        // Record the response content type
        setHeader(name, value) {
            this.headers[name] = value;
        },
        // Resolve the middleware response body
        end(value) {
            this.body = value;
        },
    };
    await middleware[0](
        { url: '/@acl/index.js' },
        served,
        // Fail if a readable package module is not served
        () => assert.fail('native module was not served'),
    );
    assert.equal(served.statusCode, 200);
    assert.equal(served.headers['Content-Type'], 'text/javascript; charset=utf-8');
    let nextCalls = 0;
    await middleware[0](
        { url: '/other' },
        {},
        // Count unrelated middleware fallthrough
        () => nextCalls++,
    );
    await middleware[0](
        { url: '/@acl/../package.json' },
        {},
        // Count traversal-safe middleware fallthrough
        () => nextCalls++,
    );
    assert.equal(nextCalls, 2);

    const messages = [],
        hot = await plugin.handleHotUpdate({
            file: join(root, 'components', 'card.html'),
            server: {
                ws: {
                    // Capture the targeted ACL HMR message
                    send: (message) => messages.push(message),
                },
            },
        });
    assert.deepEqual(hot, []);
    assert.equal(messages[0].event, 'acl:template-changed');
    assert.equal(
        await plugin.handleHotUpdate({
            file: join(root, 'styles.css'),
            server: {
                ws: {
                    // Ignore messages on non-template updates
                    send() {},
                },
            },
        }),
        undefined,
    );
    assert.match(plugin.load(plugin.resolveId('virtual:alpine-component-loader/client')), /import\.meta\.hot/);
    assert.match(plugin.load(plugin.resolveId('virtual:alpine-component-loader/routes')), /@acl-routes/);
    assert.equal(plugin.resolveId('alpine-component-loader'), null);
    assert.equal(plugin.resolveId('ordinary-module'), null);
    assert.equal(plugin.load('ordinary-module'), null);

    plugin.configResolved({
        root,
        base: '/application/',
        command: 'build',
        build: { outDir: 'output' },
    });
    await plugin.writeBundle();
    assert.ok((await stat(join(root, 'output', 'generated-routes', 'acl-routes.json'))).isFile());

    await assert.rejects(
        alpineComponentLoader({
            generate: false,
            moduleDelivery: 'invalid',
        }).config({ root }),
        /moduleDelivery/,
    );
    await assert.rejects(
        alpineComponentLoader({
            generate: false,
            moduleDelivery: 'external',
        }).config({ root }),
        /requires moduleBase/,
    );
});

test('Vite development and production integration preserve native external module delivery', async () => {
    // Run this operation
    const root = await realpath(await mkdtemp(join(tmpdir(), 'acl-vite-integration-'))),
        repositoryRoot = await realpath('.'),
        warnings = [],
        logger = createViteLogger('silent');
    // Record ordinary Vite warnings emitted while analyzing runtime modules
    logger.warn = (message) => warnings.push(String(message));
    // Record warnings that Vite deduplicates across repeated transforms
    logger.warnOnce = (message) => warnings.push(String(message));
    await mkdir(join(root, 'node_modules'));
    await symlink(repositoryRoot, join(root, 'node_modules', 'alpine-component-loader'), 'dir');
    await writeFile(
        join(root, 'index.html'),
        '<!doctype html><html><head></head><body><script type="module" src="/main.js"></script></body></html>',
    );
    await writeFile(
        join(root, 'main.js'),
        "import Loader from 'alpine-component-loader'; window.__aclVite = Loader.version;",
    );
    const server = await createViteServer({
        root,
        appType: 'custom',
        logLevel: 'silent',
        customLogger: logger,
        optimizeDeps: { noDiscovery: true },
        server: { middlewareMode: true },
        plugins: [alpineComponentLoader({ generate: false })],
    });
    // Process try
    try {
        const [developmentHtml, developmentModule] = await Promise.all([
            server.transformIndexHtml('/index.html', await readFile(join(root, 'index.html'), 'utf8')),
            server.transformRequest('/main.js'),
        ]);
        await server.transformRequest(`/@fs${repositoryRoot}/dist/runtime/rendering.js`);
        assert.match(developmentHtml, /"alpine-component-loader": "\/@acl\/index\.js"/);
        assert.match(developmentHtml, /virtual:alpine-component-loader\/client/);
        assert.match(developmentModule.code, /\/@fs\/.*\/dist\/index\.js/);
        assert.ok(server.config.server.fs.allow.includes(repositoryRoot));
        assert.doesNotMatch(warnings.join('\n'), /dynamic import cannot be analyzed/i);
    } finally {
        await server.close();
    }

    await viteBuild({
        root,
        base: '/nested/',
        logLevel: 'silent',
        plugins: [alpineComponentLoader({ generate: false })],
        build: { outDir: 'production' },
    });
    const productionHtml = await readFile(join(root, 'production', 'index.html'), 'utf8');
    assert.ok(productionHtml.includes(`/nested/assets/alpine-component-loader/${packageVersion}/index.js`));
    assert.ok(
        (
            await stat(
                join(root, 'production', 'assets', 'alpine-component-loader', packageVersion, 'runtime', 'loader.js'),
            )
        ).isFile(),
    );
});

test('SSR data policy authorizes bounded JSON requests and rejects conflicts and private redirects', async () => {
    // Run this operation
    const root = await mkdtemp(join(tmpdir(), 'acl-ssr-policy-')),
        template = '<p x-data>Policy data</p>',
        source = join(root, 'policy-card.html');
    await writeFile(source, template);
    const policyManifest = {
            version: 1,
            components: {
                'policy-card': {
                    source: 'policy-card.html',
                    options: {
                        shadow: true,
                        data: {
                            src: '/api/:id',
                            keys: { id: 7 },
                            params: { mode: 'ssr' },
                        },
                    },
                },
            },
        },
        requests = [],
        renderer = createSSRRenderer({
            root,
            manifest: policyManifest,
            dataPolicy: {
                baseUrl: 'https://1.1.1.1/app/',
                allowedOrigins: ['https://1.1.1.1'],
                fetch: async (url, options) => {
                    requests.push({
                        // Configure this value
                        url: String(url),
                        options,
                    });
                    return new Response(JSON.stringify({ source: 'policy' }), {
                        headers: { 'content-type': 'application/json' },
                    });
                },
            },
        }),
        html = await renderer.render('policy-card');
    assert.match(html, /data-acl-ssr-data>{"source":"policy"}/);
    assert.equal(requests[0].url, 'https://1.1.1.1/api/7?mode=ssr');
    assert.equal(requests[0].options.redirect, 'manual');
    assert.throws(
        () =>
            createSSRRenderer({
                root,
                manifest: policyManifest,
                // Run this operation
                dataResolver: () => ({}),
                dataPolicy: {
                    baseUrl: 'https://1.1.1.1/',
                    allowedOrigins: ['https://1.1.1.1'],
                },
            }),
        /mutually exclusive/,
    );

    const redirected = createSSRRenderer({
        root,
        manifest: policyManifest,
        dataPolicy: {
            baseUrl: 'https://1.1.1.1/',
            allowedOrigins: ['https://1.1.1.1', 'https://127.0.0.1'],
            fetch: async () =>
                new Response(null, {
                    status: 302,
                    headers: { location: 'https://127.0.0.1/private' },
                }),
        },
    });
    await assert.rejects(redirected.render('policy-card'), /non-public address/);
});

test('observability exporters batch, bound, retry, map vendors, and disconnect safely', async () => {
    // Run this operation
    const delivered = [];
    let attempts = 0;
    const exporter = createBatchExporter({
        batchSize: 10,
        maxQueue: 3,
        flushInterval: 0,
        retries: 1,
        retryDelay: 0,
        // Run this operation
        async send(records) {
            attempts++;
            if (attempts === 1) throw new Error('retry');
            delivered.push(records);
        },
    });
    exporter({ type: 'one' });
    exporter({ type: 'two' });
    exporter({ type: 'three' });
    exporter({ type: 'four' });
    await exporter.flush();
    assert.equal(attempts, 2);
    assert.deepEqual(
        delivered[0].map(
            // Run this operation
            (item) => item.type,
        ),
        ['two', 'three', 'four'],
    );

    const spans = [],
        logs = [],
        otel = createOpenTelemetryExporter({
            tracer: {
                // Run this operation
                startSpan(name) {
                    const span = {
                        // Configure this value
                        name,
                        // Run this operation
                        end: () => spans.push(name),
                    };
                    return span;
                },
            },
            logger: {
                // Run this operation
                emit: (record) => logs.push(record),
            },
        });
    otel({
        // Configure this value
        type: 'fetchstart',
        requestId: 'r1',
        severity: 'info',
    });
    otel({
        // Configure this value
        type: 'fetchend',
        requestId: 'r1',
        severity: 'info',
    });
    assert.deepEqual(spans, ['acl.fetchstart']);
    assert.equal(logs.length, 2);

    const captured = [],
        sentry = createSentryExporter({
            client: {
                // Run this operation
                captureMessage: (message) => captured.push(message),
                // Run this operation
                addBreadcrumb: (crumb) => captured.push(crumb.message),
            },
        });
    sentry({
        // Configure this value
        type: 'loaded',
        severity: 'info',
    });
    sentry({
        // Configure this value
        type: 'failed',
        severity: 'error',
        detail: { message: 'boom' },
    });
    assert.deepEqual(captured, ['loaded', 'boom']);

    let listener,
        unsubscribed = false;
    const connection = connectExporter(
        {
            // Run this operation
            subscribe(value) {
                listener = value;
                // Return the loader subscription cleanup hook
                return () => {
                    unsubscribed = true;
                };
            },
        },
        exporter,
    );
    listener({ type: 'connected' });
    await connection.dispose();
    assert.equal(unsubscribed, true);
});

test('accessibility baselines use stable fingerprints and classify every status across formats', () => {
    // Run this operation
    const finding = {
            route: 'http://127.0.0.1:1234/settings?tab=a',
            engine: 'acl',
            rule: 'control-name',
            severity: 'serious',
            selector: '#save',
            remediation: 'Add a name',
        },
        initial = classifyAuditFindings({
            routes: [
                {
                    // Configure this value
                    route: finding.route,
                    violations: [finding],
                    errors: [],
                },
            ],
        }),
        baseline = createAccessibilityBaseline(initial.allViolations),
        sameFinding = {
            // Configure this value
            ...finding,
            route: 'https://example.test/settings?tab=a',
        },
        suppressedFinding = {
            // Configure this value
            ...finding,
            selector: '#cancel',
        },
        classified = classifyAuditFindings({
            routes: [
                {
                    route: sameFinding.route,
                    violations: [sameFinding, suppressedFinding],
                    errors: ['page failed'],
                },
            ],
            baseline: {
                ...baseline,
                findings: {
                    ...baseline.findings,
                    resolved: {
                        // Configure this value
                        ...finding,
                        route: '/resolved',
                        selector: '#old',
                    },
                },
            },
            suppressions: [
                {
                    rule: 'control-name',
                    selector: '#cancel',
                    reason: 'Third-party control',
                    expires: '2099-01-01T00:00:00Z',
                },
                {
                    rule: 'old-rule',
                    reason: 'Expired migration',
                    expires: '2020-01-01T00:00:00Z',
                },
            ],
        });
    assert.equal(fingerprintAuditFinding(finding), fingerprintAuditFinding(sameFinding));
    assert.deepEqual(
        classified.allViolations.map(
            // Run this operation
            (item) => item.status,
        ),
        ['unchanged', 'suppressed'],
    );
    assert.equal(classified.resolved.length, 1);
    assert.equal(classified.expiredSuppressions.length, 1);
    const report = {
        version: 1,
        routes: classified.routes,
        resolved: classified.resolved,
        expiredSuppressions: classified.expiredSuppressions,
        newViolationCount: 0,
        consoleErrors: 1,
    };
    assert.match(formatAuditReport(report, 'console'), /\[suppressed\/serious\]/);
    assert.match(formatAuditReport(report, 'junit'), /Suppression expired/);
    const sarif = JSON.parse(formatAuditReport(report, 'sarif'));
    assert.ok(
        sarif.runs[0].results.some(
            // Run this operation
            (item) => item.baselineState === 'absent',
        ),
    );
    assert.ok(
        sarif.runs[0].results.some(
            // Run this operation
            (item) => item.properties.status === 'expired',
        ),
    );
});
