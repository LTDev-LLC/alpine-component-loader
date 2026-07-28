import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { parseCLIArguments, resolveServeTarget, resolveSkeletonTarget } from '../../bin/alpine-component-loader.mjs';
import {
    createRecursiveWatcher,
    diffInlineTemplates,
    injectHMRBootstrap,
    inspectInlineTemplates,
    startACLDevServer,
} from '../../server/dev-server.mjs';
import {
    createComponentManifest,
    generateComponentManifest,
    initializeComponent,
    validateProject,
    writeProjectFile,
} from '../../server/project-tools.mjs';
import { generateOfflineBundle } from '../../server/offline-generator.mjs';

// Track disposable resources centrally so every assertion gets clean teardown
const applications = new Set(),
    temporaryDirectories = new Set();

// Create the smallest project that covers serving watching and private-file denial
const createProject = async () => {
    const root = await mkdtemp(join(tmpdir(), 'acl-serve-test-'));
    temporaryDirectories.add(root);
    await mkdir(join(root, 'components'), { recursive: true });
    await writeFile(
        join(root, 'index.html'),
        '<!doctype html><html><head></head><body><script type="module">import Loader from "alpine-component-loader"; window.Loader = Loader;</script></body></html>',
    );
    await writeFile(join(root, 'components', 'card.html'), '<article>first</article>');
    await writeFile(join(root, 'app.css'), 'body { color: black; }');
    await writeFile(join(root, '.env'), 'SECRET=test');
    return root;
};

afterEach(async () => {
    // Clean up the completed test
    await Promise.all(
        Array.from(
            applications,
            // Transform the current item
            (application) => application.close(),
        ),
    );
    applications.clear();
    await Promise.all(
        Array.from(
            temporaryDirectories,
            // Transform the current item
            (directory) =>
                rm(directory, {
                    recursive: true,
                    force: true,
                }),
        ),
    );
    temporaryDirectories.clear();
});

test('HTML injection merges import maps before modules and remains idempotent', () => {
    // Exercise the test scenario
    const source = `<!doctype html><html><head>
        <script type="importmap">{"imports":{"example":"/example.js","alpine-component-loader":"/__acl_hmr/modules/index.min.js"}}</script>
        <script type="module">import 'example';</script>
    </head><body></body></html>`,
        transformed = injectHMRBootstrap(source);
    assert.match(transformed, /"example": "\/example\.js"/);
    assert.match(transformed, /"alpine-component-loader": "\/__acl_hmr\/modules\/index\.min\.js"/);
    assert.match(transformed, /"alpine-component-loader\/dev": "\/__acl_hmr\/modules\/dev\.min\.js"/);
    assert.match(transformed, /"alpine-component-loader\/testing": "\/__acl_hmr\/modules\/testing\.min\.js"/);
    assert.ok(transformed.indexOf('type="importmap"') < transformed.indexOf('type="module"'));
    assert.equal((transformed.match(/data-acl-hmr-client/g) || []).length, 1);
    assert.equal(injectHMRBootstrap(transformed), transformed);

    const unsupportedRoot = injectHMRBootstrap(
        '<head><script type="importmap">{"imports":{"alpine-component-loader":"/old.js"}}</script></head><body></body>',
    );
    assert.match(unsupportedRoot, /"alpine-component-loader": "\/__acl_hmr\/modules\/index\.js"/);
});

test('HTML injection handles malformed maps and documents without head, body, or doctype', () => {
    // Exercise the test scenario
    const malformed = '<script type="importmap">{bad}</script><main>Body</main>',
        transformed = injectHMRBootstrap(malformed);
    assert.match(transformed, /data-acl-hmr-importmap/);
    assert.match(transformed, /data-acl-hmr-client/);
    assert.ok(transformed.indexOf('data-acl-hmr-importmap') < transformed.indexOf('<main>'));
    const headless = injectHMRBootstrap('<!doctype html><main>Headless</main>');
    assert.match(headless, /^<!doctype html>\n<script type="importmap"/i);
    const invalidShape = injectHMRBootstrap('<head><script type="importmap">[]</script></head><body></body>');
    assert.match(invalidShape, /data-acl-hmr-importmap/);
});

test('inline template inspection isolates content-only edits conservatively', () => {
    // Exercise declarative and selector-backed templates inside one complete page
    const first = `<!doctype html><html><body>
        <template acl-component="inline-card" acl-props='{"count":"Number"}'><p>first</p></template>
        <template id="shadow-card"><strong>shadow first</strong></template>
        <inline-card></inline-card>
    </body></html>`,
        second = first.replace('<p>first</p>', '<p>second</p>'),
        inspected = inspectInlineTemplates(first);
    assert.equal(inspected.errors.length, 0);
    assert.deepEqual([...inspected.templates.keys()], ['component:inline-card', 'id:shadow-card']);
    assert.deepEqual(diffInlineTemplates(first, first), {
        mode: 'none',
        templates: [],
    });
    assert.deepEqual(diffInlineTemplates(first, second), {
        mode: 'inline',
        templates: [
            {
                html: '<p>second</p>',
                kind: 'component',
                name: 'inline-card',
            },
        ],
    });
    assert.equal(diffInlineTemplates(first, second.replace('<inline-card>', '<main><inline-card>')).mode, 'reload');
    assert.equal(
        diffInlineTemplates(first, second.replace('acl-props=', 'data-contract="changed" acl-props=')).mode,
        'reload',
    );
    assert.equal(
        diffInlineTemplates(first, second.replace('</body>', '<template id="new-card"></template></body>')).mode,
        'reload',
    );
    assert.equal(
        diffInlineTemplates(
            first,
            second.replace('</body>', '<template acl-component="inline-card"></template></body>'),
        ).mode,
        'reload',
    );
});

test('CLI parser uses the invocation directory and validates its command shape', () => {
    // Exercise the test scenario
    const invocationDirectory = resolve('/tmp/acl-invocation');
    assert.deepEqual(
        parseCLIArguments(
            ['serve', 'landing.html', '--root', 'demo', '--host=0.0.0.0', '--port', '0'],
            invocationDirectory,
        ),
        {
            command: 'serve',
            help: false,
            host: '0.0.0.0',
            port: 0,
            root: resolve(invocationDirectory, 'demo'),
            target: 'landing.html',
        },
    );
    assert.throws(
        // Run the operation expected to throw
        () => parseCLIArguments(['build'], invocationDirectory),
        /Unknown command/,
    );
    assert.throws(
        // Run the operation expected to throw
        () => parseCLIArguments(['serve', 'one.html', 'two.html'], invocationDirectory),
        /Only one serve path/,
    );
    assert.throws(
        // Run the operation expected to throw
        () => parseCLIArguments(['serve', '--unknown'], invocationDirectory),
        /Unknown option/,
    );
    assert.throws(
        // Run the operation expected to throw
        () => parseCLIArguments(['serve', '--port', 'not-a-port'], invocationDirectory),
        /Invalid port/,
    );
    assert.throws(
        // Run the operation expected to throw
        () => parseCLIArguments(['skeleton'], invocationDirectory),
        /requires a URL/,
    );
    assert.throws(
        // Run the operation expected to throw
        () => parseCLIArguments(['skeleton', 'index.html', '--mobile', 'wide'], invocationDirectory),
        /WIDTHxHEIGHT/,
    );
    assert.throws(
        // Run the operation expected to throw
        () => parseCLIArguments(['skeleton', 'index.html', '--mode', 'canvas'], invocationDirectory),
        /Unsupported skeleton mode/,
    );
});

test('CLI parser normalizes responsive skeleton generation options', async () => {
    // Exercise the test scenario
    const invocationDirectory = resolve('/tmp/acl-skeleton-invocation'),
        parsed = parseCLIArguments(
            [
                'skeleton',
                'https://example.test/dashboard',
                '--route',
                '/settings',
                '--include=user-card,info-card',
                '--exclude',
                'poll-card',
                '--mobile',
                '412x915',
                '--desktop=1600x1000',
                '--breakpoint',
                '800',
                '--timeout=20000',
                '--out-dir',
                'generated',
                '--mode',
                'both',
                '--allow-partial',
                '--force',
            ],
            invocationDirectory,
        );
    assert.deepEqual(parsed, {
        command: 'skeleton',
        help: false,
        root: invocationDirectory,
        target: 'https://example.test/dashboard',
        outDir: resolve(invocationDirectory, 'generated'),
        routes: ['/settings'],
        include: ['user-card', 'info-card'],
        exclude: ['poll-card'],
        timeout: 20000,
        viewports: {
            mobile: {
                width: 412,
                height: 915,
            },
            desktop: {
                width: 1600,
                height: 1000,
            },
        },
        breakpoint: 800,
        mode: 'both',
        allowPartial: true,
        force: true,
    });
    const resolved = await resolveSkeletonTarget(parsed);
    assert.deepEqual(resolved.target, {
        type: 'url',
        url: 'https://example.test/dashboard',
    });
    assert.equal(resolved.outDir, resolve(invocationDirectory, 'generated'));
    assert.equal(parseCLIArguments(['skeleton', 'index.html'], invocationDirectory).mode, 'css');
});

test('CLI parser normalizes project and offline commands', () => {
    // Exercise the test scenario
    const root = resolve('/tmp/acl-project-tools');
    assert.deepEqual(
        parseCLIArguments(['init', 'user-card', '--shadow', '--manifest', 'acl-manifest.json', '--dry-run'], root),
        {
            command: 'init',
            help: false,
            tag: 'user-card',
            directory: join(root, 'components'),
            manifestFile: join(root, 'acl-manifest.json'),
            shadow: true,
            force: false,
            dryRun: true,
            json: false,
        },
    );
    assert.deepEqual(parseCLIArguments(['manifest', 'ui', '--out', 'generated.json', '--json'], root), {
        command: 'manifest',
        help: false,
        directory: join(root, 'ui'),
        outFile: join(root, 'generated.json'),
        force: false,
        update: false,
        prune: false,
        dryRun: false,
        json: true,
    });
    assert.deepEqual(
        parseCLIArguments(
            [
                'offline',
                'acl-manifest.json',
                '--group',
                'critical',
                '--asset=app.css',
                '--config',
                'acl-offline.json',
                '--minify-js',
            ],
            root,
        ),
        {
            command: 'offline',
            help: false,
            manifestFile: join(root, 'acl-manifest.json'),
            outDir: join(root, 'offline'),
            groups: ['critical'],
            assets: ['app.css'],
            baseUrl: '/',
            namespace: 'default',
            configFile: join(root, 'acl-offline.json'),
            minifyJavaScriptAssets: true,
            force: false,
            dryRun: false,
            json: false,
        },
    );
    assert.deepEqual(parseCLIArguments(['create', 'demo', '--template', 'vite', '--dry-run'], root), {
        command: 'create',
        help: false,
        directory: join(root, 'demo'),
        template: 'vite',
        force: false,
        dryRun: true,
        json: false,
    });
    assert.deepEqual(parseCLIArguments(['audit', '/', '--route', '/settings', '--format', 'sarif'], root), {
        command: 'audit',
        help: false,
        root,
        routes: ['/', '/settings'],
        format: 'sarif',
        outFile: null,
        axe: true,
        timeout: 15000,
    });
});

test('project tools scaffold, infer dependencies, validate, and generate deterministic offline artifacts', async () => {
    // Exercise the test scenario
    const root = await mkdtemp(join(tmpdir(), 'acl-project-tools-'));
    temporaryDirectories.add(root);
    const components = join(root, 'components'),
        manifestFile = join(root, 'acl-manifest.json');
    await mkdir(components);
    await initializeComponent({
        tag: 'base-card',
        directory: components,
    });
    assert.equal(JSON.parse(await readFile(join(components, 'base-card.acl.json'), 'utf8')).version, 1);
    await writeFile(join(components, 'user-card.html'), '<base-card></base-card><p>User</p>');
    const generated = await generateComponentManifest({
        directory: components,
        outFile: manifestFile,
    });
    assert.deepEqual(generated.manifest.components['user-card'].dependencies, ['base-card']);
    assert.match(generated.manifest.components['user-card'].options.templateRevision, /^sha256-/);
    assert.equal((await validateProject(manifestFile)).valid, true);

    generated.manifest.groups.critical = ['user-card'];
    await writeFile(manifestFile, `${JSON.stringify(generated.manifest, null, 2)}\n`);
    await writeFile(join(root, 'app.css'), 'body { color: black; }');
    await mkdir(join(root, 'runtime', 'nested'), { recursive: true });
    await writeFile(join(root, 'runtime', 'index.js'), 'export const ready = true;');
    await writeFile(join(root, 'runtime', 'nested', 'feature.js'), 'export const feature = true;');
    const first = await generateOfflineBundle({
            manifestFile,
            outDir: join(root, 'offline-one'),
            groups: ['critical'],
            assets: ['app.css', 'runtime'],
            minifyJavaScriptAssets: true,
        }),
        second = await generateOfflineBundle({
            manifestFile,
            outDir: join(root, 'offline-two'),
            groups: ['critical'],
            assets: ['app.css', 'runtime'],
            minifyJavaScriptAssets: true,
        });
    assert.deepEqual(first.manifest, second.manifest);
    assert.deepEqual(first.manifest.components, ['base-card', 'user-card']);
    assert.deepEqual(
        first.manifest.entries
            .filter(
                // Select matching items
                (entry) => entry.url.startsWith('/runtime/'),
            )
            .map(
                // Transform the current item
                (entry) => entry.url,
            ),
        ['/runtime/index.min.js', '/runtime/nested/feature.min.js'],
    );
    assert.match(await readFile(join(root, 'offline-one', 'acl-sw.js'), 'utf8'), /PRECACHED/);
    await writeFile(join(root, 'index.html'), '<h1>Offline</h1>');
    await writeFile(
        join(root, 'acl-offline.json'),
        JSON.stringify({
            version: 1,
            activation: 'prompt',
            navigation: {
                fallback: 'index.html',
                allow: ['/app/'],
                strategy: 'network-first',
            },
            runtimeRoutes: [
                {
                    path: '/api/',
                    strategy: 'stale-while-revalidate',
                    maxEntries: 5,
                },
            ],
        }),
    );
    const configured = await generateOfflineBundle({
        manifestFile,
        outDir: join(root, 'offline-configured'),
        groups: ['critical'],
        assets: ['index.html'],
        configFile: join(root, 'acl-offline.json'),
    });
    assert.equal(configured.manifest.config.activation, 'prompt');
    assert.equal(configured.manifest.config.navigation.fallback, '/index.html');
    assert.match(configured.outputs.serviceWorker, /QuotaExceededError/);
    assert.match(configured.outputs.serviceWorker, /ACL_ACTIVATE/);
});

test('project tools cover dry runs, overwrite protection, and aggregated diagnostics', async () => {
    // Exercise the test scenario
    const root = await mkdtemp(join(tmpdir(), 'acl-project-diagnostics-'));
    temporaryDirectories.add(root);
    const components = join(root, 'components'),
        manifestFile = join(root, 'acl-manifest.json');
    await mkdir(join(components, 'nested'), { recursive: true });
    const initialized = await initializeComponent({
        tag: 'draft-card',
        directory: components,
        manifestFile,
        shadow: true,
        dryRun: true,
    });
    assert.equal(initialized.dryRun, true);
    assert.deepEqual(initialized.files, []);
    assert.equal(initialized.manifest.components['draft-card'].options.shadow, true);
    await initializeComponent({
        tag: 'draft-card',
        directory: components,
        manifestFile,
        shadow: true,
    });
    await assert.rejects(
        initializeComponent({
            tag: 'draft-card',
            directory: components,
            manifestFile,
        }),
        /already contains/,
    );
    await assert.rejects(writeProjectFile(join(components, 'draft-card.html'), 'replacement'), /Refusing to overwrite/);
    await writeProjectFile(join(components, 'draft-card.html'), '<p>replacement</p>', { force: true });

    await writeFile(join(components, 'invalid.html'), '<div acl-props="{bad}"></div>');
    await writeFile(join(components, 'nested', 'draft-card.html'), '<p>duplicate</p>');
    const directoryValidation = await validateProject(components);
    assert.equal(directoryValidation.valid, false);
    assert.equal(
        directoryValidation.diagnostics.some(
            // Check the current item
            (item) => item.code === 'ACL_INVALID_COMPONENT_NAME',
        ),
        true,
    );
    assert.equal(
        directoryValidation.diagnostics.some(
            // Check the current item
            (item) => item.code === 'ACL_INVALID_DECLARATIVE_JSON',
        ),
        true,
    );
    assert.equal(
        directoryValidation.diagnostics.some(
            // Check the current item
            (item) => item.code === 'ACL_DUPLICATE_COMPONENT',
        ),
        true,
    );
    const missing = await validateProject(join(root, 'missing'));
    assert.equal(missing.diagnostics[0].code, 'ACL_TARGET_NOT_FOUND');

    await writeFile(
        manifestFile,
        JSON.stringify({
            version: 1,
            components: { 'missing-card': 'missing.html' },
        }),
    );
    const manifestValidation = await validateProject(manifestFile);
    assert.equal(manifestValidation.diagnostics[0].code, 'ACL_SOURCE_NOT_FOUND');
    await writeFile(manifestFile, '{invalid');
    assert.equal((await validateProject(manifestFile)).diagnostics[0].code, 'ACL_INVALID_MANIFEST');

    await rm(join(components, 'invalid.html'));
    await rm(join(components, 'nested', 'draft-card.html'));
    const created = await createComponentManifest({
        directory: components,
        outFile: manifestFile,
        basePath: '/components/',
    });
    assert.equal(created.basePath, '/components/');
    const dryManifest = await generateComponentManifest({
        directory: components,
        outFile: manifestFile,
        dryRun: true,
    });
    assert.deepEqual(dryManifest.files, []);
});

// Run this operation
test('parse5 inspection and sidecars drive safe manifest updates without losing unowned fields', async () => {
    const root = await mkdtemp(join(tmpdir(), 'acl-manifest-update-'));
    temporaryDirectories.add(root);
    const components = join(root, 'components'),
        manifestFile = join(root, 'acl-manifest.json');
    await mkdir(components);
    await writeFile(join(components, 'base-card.html'), '<p>Base</p>');
    await writeFile(join(components, 'extra-card.html'), '<p>Extra</p>');
    await writeFile(
        join(components, 'user-card.html'),
        `<!-- <extra-card></extra-card> -->
<template>
    <base-card
        data-fetch-options='{"headers":{"x-test":"ready"}}'
    ></base-card>
</template>`,
    );
    await writeFile(
        join(components, 'user-card.acl.json'),
        JSON.stringify({
            version: 1,
            dependencies: ['extra-card'],
            groups: ['critical'],
            options: { shadow: true },
            metadata: { description: 'Canonical user card' },
        }),
    );
    await writeFile(
        manifestFile,
        JSON.stringify({
            $schema: './acl-manifest.schema.json',
            version: 1,
            basePath: './',
            groups: {
                old: ['user-card', 'legacy-card'],
            },
            components: {
                'user-card': {
                    source: 'old-user.html',
                    dependencies: ['legacy-card'],
                    options: {
                        // Preserve one authored option while replacing generated revision state
                        fallback: 'fallback.html',
                        templateRevision: 'old',
                    },
                    metadata: { description: 'Old' },
                },
                'legacy-card': {
                    source: 'legacy.html',
                    dependencies: [],
                    options: {},
                },
            },
        }),
    );

    const updated = await generateComponentManifest({
        directory: components,
        outFile: manifestFile,
        update: true,
        dryRun: true,
    });
    assert.deepEqual(updated.manifest.components['user-card'].dependencies, ['base-card', 'extra-card']);
    assert.equal(updated.manifest.components['user-card'].options.shadow, true);
    assert.equal('fallback' in updated.manifest.components['user-card'].options, false);
    assert.equal(updated.manifest.components['user-card'].metadata.description, 'Canonical user card');
    assert.deepEqual(updated.manifest.groups.critical, ['user-card']);
    assert.deepEqual(updated.manifest.groups.old, ['legacy-card']);
    assert.equal(updated.warnings.length, 1);
    assert.equal(
        // Run this operation
        updated.changes.some((change) => change.path.includes('user-card')),
        true,
    );

    const pruned = await generateComponentManifest({
        directory: components,
        outFile: manifestFile,
        update: true,
        prune: true,
        dryRun: true,
    });
    assert.equal(pruned.manifest.components['legacy-card'], undefined);
    assert.equal(pruned.manifest.groups.old, undefined);
    // Run this operation
    assert.throws(() => parseCLIArguments(['manifest', '--prune'], root), /requires --update/);
});

test('checked-in offline example matches deterministic command output', async () => {
    // Exercise the test scenario
    const exampleRoot = resolve('examples/offline'),
        generated = await generateOfflineBundle({
            manifestFile: join(exampleRoot, 'acl-manifest.json'),
            outDir: exampleRoot,
            groups: ['offline-demo'],
            assets: [
                'index.html',
                'app.js',
                'styles.css',
                'acl-manifest.json',
                '../../dist/index.js',
                '../../dist/acl-load-error.js',
                '../../dist/offline.js',
                '../../dist/runtime/loader.js',
                '../../dist/runtime/config.js',
                '../../dist/runtime/errors.js',
                '../../dist/runtime/values.js',
                '../../dist/runtime/props.js',
                '../../dist/runtime/data-options.js',
                '../../dist/runtime/registry.js',
                '../../dist/runtime/contracts.js',
                '../../dist/runtime/component/factory.js',
                '../../dist/runtime/component/lifecycle-controller.js',
                '../../dist/runtime/component/loading-controller.js',
                '../../dist/runtime/component/data-gate-controller.js',
                '../../dist/runtime/component/render-controller.js',
                '../../dist/runtime/component/state-controller.js',
                '../../dist/runtime/lifecycle.js',
                '../../dist/runtime/caches.js',
                '../../dist/runtime/template-cache.js',
                '../../dist/runtime/rendering.js',
                'https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js',
            ],
            baseUrl: '/examples/offline',
            namespace: 'example',
            configFile: join(exampleRoot, 'acl-offline.json'),
            minifyJavaScriptAssets: true,
            dryRun: true,
        });
    assert.equal(await readFile(join(exampleRoot, 'acl-precache-manifest.json'), 'utf8'), generated.outputs.manifest);
    assert.equal(await readFile(join(exampleRoot, 'acl-sw.js'), 'utf8'), generated.outputs.serviceWorker);
});

test('CLI resolves a directory target as the static root and retains HTML targets', async () => {
    // Exercise the test scenario
    const root = await createProject(),
        siteRoot = join(root, 'site');
    await mkdir(siteRoot);
    await writeFile(join(siteRoot, 'index.html'), '<!doctype html><title>Site</title>');

    assert.deepEqual(await resolveServeTarget(parseCLIArguments(['serve', 'site/'], root)), {
        help: false,
        host: '127.0.0.1',
        port: 4173,
        root: siteRoot,
        index: 'index.html',
    });
    assert.deepEqual(await resolveServeTarget(parseCLIArguments(['serve', 'index.html'], root)), {
        help: false,
        host: '127.0.0.1',
        port: 4173,
        root,
        index: join(root, 'index.html'),
    });
});

test('development server rejects invalid roots, indexes, host names, and ports', async () => {
    // Exercise the test scenario
    const root = await createProject(),
        outside = await mkdtemp(join(tmpdir(), 'acl-serve-outside-'));
    temporaryDirectories.add(outside);
    await writeFile(join(root, '.hidden.html'), '<p>hidden</p>');
    await writeFile(join(outside, 'outside.html'), '<p>outside</p>');
    await assert.rejects(
        startACLDevServer({
            root,
            host: '',
            watchFiles: false,
        }),
        /Host must be/,
    );
    await assert.rejects(
        startACLDevServer({
            root,
            port: 70_000,
            watchFiles: false,
        }),
        /Invalid port/,
    );
    await assert.rejects(
        startACLDevServer({
            root: join(root, 'missing'),
            watchFiles: false,
        }),
        /root does not exist/,
    );
    await assert.rejects(
        startACLDevServer({
            root: join(root, 'index.html'),
            watchFiles: false,
        }),
        /root is not a directory/,
    );
    await assert.rejects(
        startACLDevServer({
            root,
            index: 'app.css',
            watchFiles: false,
        }),
        /must be an .html/,
    );
    await assert.rejects(
        startACLDevServer({
            root,
            index: join(outside, 'outside.html'),
            watchFiles: false,
        }),
        /inside the serve root/,
    );
    await assert.rejects(
        startACLDevServer({
            root,
            index: '.hidden.html',
            watchFiles: false,
        }),
        /cannot be a hidden/,
    );
    await assert.rejects(
        startACLDevServer({
            root,
            index: 'missing.html',
            watchFiles: false,
        }),
        /index does not exist/,
    );
});

test('static server injects only the primary index and enforces its HTTP boundary', async () => {
    // Exercise the test scenario
    const root = await createProject(),
        application = await startACLDevServer({
            root,
            port: 0,
            watchFiles: false,
        });
    applications.add(application);

    const indexResponse = await fetch(application.url),
        indexHtml = await indexResponse.text();
    assert.equal(indexResponse.status, 200);
    assert.match(indexHtml, /data-acl-hmr-importmap/);
    assert.match(indexHtml, /data-acl-hmr-client/);

    const directIndex = await fetch(`${application.origin}/index.html`);
    assert.match(await directIndex.text(), /data-acl-hmr-client/);
    const component = await fetch(`${application.origin}/components/card.html`);
    assert.equal(await component.text(), '<article>first</article>');

    const head = await fetch(`${application.origin}/app.css`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-type'), 'text/css; charset=utf-8');
    assert.equal(await head.text(), '');
    assert.equal((await fetch(`${application.origin}/missing.txt`)).status, 404);
    assert.equal((await fetch(`${application.origin}/.env`)).status, 403);
    assert.equal((await fetch(`${application.origin}/%2e%2e%2f.env`)).status, 403);
    assert.equal((await fetch(`${application.origin}/%E0%A4%A`)).status, 403);
    assert.equal((await fetch(application.url, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${application.origin}/__acl_hmr/events`, { method: 'POST' })).status, 405);
    assert.match(await (await fetch(`${application.origin}/__acl_hmr/client.js`)).text(), /connectACLDevServer/);
    assert.equal((await fetch(`${application.origin}/__acl_hmr/alpine.js`)).status, 200);
    assert.equal((await fetch(`${application.origin}/__acl_hmr/modules/dev.js`)).status, 200);
    assert.equal((await fetch(`${application.origin}/__acl_hmr/modules/testing.js`)).status, 200);
    assert.equal((await fetch(`${application.origin}/__acl_hmr/modules/observability-exporters.js`)).status, 200);
    assert.equal((await fetch(`${application.origin}/__acl_hmr/modules/missing.js`)).status, 404);

    await mkdir(join(root, 'guide'));
    await mkdir(join(root, 'empty'));
    await writeFile(join(root, 'guide', 'index.html'), '<h1>Guide</h1>');
    const directoryRedirect = await fetch(`${application.origin}/guide`, { redirect: 'manual' });
    assert.equal(directoryRedirect.status, 301);
    assert.equal(directoryRedirect.headers.get('location'), '/guide/');
    assert.equal(await (await fetch(`${application.origin}/guide/`)).text(), '<h1>Guide</h1>');
    assert.equal((await fetch(`${application.origin}/empty/`)).status, 404);

    const inlinePage = `<!doctype html><html><head></head><body>
        <template acl-component="inline-card"><p>first</p></template>
        <inline-card></inline-card>
    </body></html>`;
    await writeFile(join(root, 'index.html'), inlinePage);
    await (await fetch(`${application.origin}/index.html`)).text();
    await writeFile(join(root, 'index.html'), inlinePage.replace('<p>first</p>', '<p>second</p>'));
    const inlineChange = await application.broadcastChange(application.indexPath);
    assert.deepEqual(inlineChange.message.templates, [
        {
            kind: 'component',
            name: 'inline-card',
        },
    ]);
    assert.equal(inlineChange.message.type, 'acl:inline-template-changed');
    const revisionResponse = await fetch(`${application.origin}${inlineChange.message.url}`),
        revision = await revisionResponse.json();
    assert.equal(revisionResponse.headers.get('cache-control'), 'no-store');
    assert.equal(revision.revision, inlineChange.message.revision);
    assert.equal(revision.templates[0].html, '<p>second</p>');
    // Push enough revisions to evict the original bounded record
    for (let index = 0; index < 32; index++) {
        await writeFile(join(root, 'index.html'), inlinePage.replace('<p>first</p>', `<p>revision ${index}</p>`));
        await application.broadcastChange(application.indexPath);
    }
    assert.equal((await fetch(`${application.origin}${inlineChange.message.url}`)).status, 404);
    assert.equal((await fetch(`${application.origin}/__acl_hmr/templates/999999`)).status, 404);

    assert.equal(await application.broadcastChange(root), null);
    assert.equal(await application.broadcastChange(join(root, '.secret.html')), null);
    assert.equal(application.broadcast({ type: 'test' }).clients, 0);
    assert.equal(application.clients, 0);
});

test('static server synthesizes missing .min.js files from readable JavaScript', async () => {
    // Exercise project and package minification through the public HTTP boundary
    const root = await createProject(),
        scripts = join(root, 'scripts'),
        readablePath = join(scripts, 'feature.js'),
        readableSource = `// @license Local Minification Test
// Development-only comment that should be removed
const deliberatelyLongLocalIdentifier = 40;
export const minificationRevision = deliberatelyLongLocalIdentifier + 2;
`;
    await mkdir(scripts);
    await writeFile(readablePath, readableSource);
    await writeFile(join(scripts, 'physical.js'), 'window.generatedPhysical = true;');
    await writeFile(join(scripts, 'physical.min.js'), 'window.physicalMinified = true;');
    await writeFile(join(root, '.private.js'), 'window.privateValue = true;');
    const application = await startACLDevServer({
        root,
        port: 0,
        watchFiles: false,
    });
    applications.add(application);

    const first = await fetch(`${application.origin}/scripts/feature.min.js?revision=one`),
        firstBody = await first.text(),
        repeated = await fetch(`${application.origin}/scripts/feature.min.js?revision=two`),
        repeatedBody = await repeated.text();
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.equal(first.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(Buffer.byteLength(firstBody) < Buffer.byteLength(readableSource));
    assert.match(firstBody, /@license Local Minification Test/);
    assert.doesNotMatch(firstBody, /Development-only comment/);
    assert.equal(repeatedBody, firstBody);

    const head = await fetch(`${application.origin}/scripts/feature.min.js`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get('content-length')), Buffer.byteLength(firstBody));
    assert.equal(await head.text(), '');

    await writeFile(
        readablePath,
        `// @license Local Minification Test
export const minificationRevision = "second-version";
`,
    );
    const changedBody = await (await fetch(`${application.origin}/scripts/feature.min.js`)).text();
    assert.notEqual(changedBody, firstBody);
    assert.match(changedBody, /second-version/);

    assert.equal(
        await (await fetch(`${application.origin}/scripts/physical.min.js`)).text(),
        'window.physicalMinified = true;',
    );
    assert.equal((await fetch(`${application.origin}/app.min.css`)).status, 404);
    assert.equal((await fetch(`${application.origin}/scripts/missing.min.js`)).status, 404);
    assert.equal((await fetch(`${application.origin}/.private.min.js`)).status, 403);
    assert.equal((await fetch(`${application.origin}/%2e%2e%2fprivate.min.js`)).status, 403);

    const readablePackage = await (await fetch(`${application.origin}/__acl_hmr/modules/index.js`)).text(),
        minifiedPackageResponse = await fetch(`${application.origin}/__acl_hmr/modules/index.min.js?local`),
        minifiedPackage = await minifiedPackageResponse.text();
    assert.equal(minifiedPackageResponse.status, 200);
    assert.equal(minifiedPackageResponse.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.ok(Buffer.byteLength(minifiedPackage) < Buffer.byteLength(readablePackage));
    assert.match(minifiedPackage, /@license AlpineComponentLoader/);
    assert.equal((await fetch(`${application.origin}/__acl_hmr/modules/runtime/component/factory.min.js`)).status, 200);
    assert.equal((await fetch(`${application.origin}/__acl_hmr/modules/runtime/missing.min.js`)).status, 404);
});

test('failed JavaScript minification returns a generic error and remains retryable', async () => {
    // Exercise parser failure without exposing source details or poisoning the cache
    const root = await createProject(),
        invalidPath = join(root, 'invalid.js');
    await writeFile(invalidPath, 'export const = "private-source-marker";');
    const application = await startACLDevServer({
        root,
        port: 0,
        watchFiles: false,
    });
    applications.add(application);

    const originalError = console.error;
    let loggedError = '';
    // Capture the server-side diagnostic while keeping the response generic
    console.error = (...values) => {
        loggedError = values.map(String).join(' ');
    };
    let failed;
    // Guard the temporary console replacement across the asynchronous request
    try {
        failed = await fetch(`${application.origin}/invalid.min.js`);
    } finally {
        console.error = originalError;
    }
    const failureBody = await failed.text();
    assert.equal(failed.status, 500);
    assert.equal(failureBody, 'Internal server error');
    assert.doesNotMatch(failureBody, /private-source-marker/);
    assert.match(loggedError, /Failed to serve/);

    await writeFile(invalidPath, 'export const recovered = true;');
    const recovered = await fetch(`${application.origin}/invalid.min.js`);
    assert.equal(recovered.status, 200);
    assert.match(await recovered.text(), /export const recovered=!0/);
});

test('custom nested index is rooted at the served directory and injected at both routes', async () => {
    // Exercise the test scenario
    const root = await createProject();
    await mkdir(join(root, 'pages'));
    await writeFile(join(root, 'pages', 'landing.html'), '<!doctype html><title>Landing</title>');
    await writeFile(join(root, 'pages', 'fragment.html'), '<p>fragment</p>');
    const application = await startACLDevServer({
        root,
        index: 'pages/landing.html',
        port: 0,
        watchFiles: false,
    });
    applications.add(application);

    assert.match(await (await fetch(application.url)).text(), /data-acl-hmr-client/);
    assert.match(await (await fetch(`${application.origin}/pages/landing.html`)).text(), /data-acl-hmr-client/);
    assert.equal(await (await fetch(`${application.origin}/pages/fragment.html`)).text(), '<p>fragment</p>');
});

test('recursive watcher publishes component and page reload messages over SSE', async () => {
    // Exercise the test scenario
    const root = await createProject(),
        application = await startACLDevServer({
            root,
            port: 0,
            watchDebounce: 10,
        });
    applications.add(application);
    const response = await fetch(`${application.origin}/__acl_hmr/events`),
        reader = response.body.getReader(),
        decoder = new TextDecoder();
    let buffered = '';

    const readMessage = async () => {
        // Read message
        let timeoutId;
        const timeout = new Promise((_, reject) => {
            // Settle the asynchronous operation
            timeoutId = setTimeout(
                // Run the scheduled delayed task
                () => reject(new Error('Timed out waiting for SSE message')),
                3000,
            );
            timeoutId.unref?.();
        });
        // Guard the read message operation against runtime failures
        try {
            return await Promise.race([
                (async () => {
                    // Read message
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) throw new Error('SSE stream ended before a message arrived');
                        buffered += decoder.decode(value, { stream: true });
                        const match = /data: ([^\n]+)\n\n/.exec(buffered);
                        if (match) {
                            buffered = buffered.slice(match.index + match[0].length);
                            return JSON.parse(match[1]);
                        }
                    }
                })(),
                timeout,
            ]);
        } finally {
            clearTimeout(timeoutId);
        }
    };

    await writeFile(join(root, 'components', 'card.html'), '<article>second</article>');
    assert.deepEqual(await readMessage(), {
        type: 'acl:template-changed',
        source: '/components/card.html',
        fallback: true,
    });
    await writeFile(join(root, 'app.css'), 'body { color: blue; }');
    assert.deepEqual(await readMessage(), {
        type: 'acl:page-reload',
        source: '/app.css',
    });
    await reader.cancel();
});

test('recursive watcher validates polling and supports disabled safety scans with idempotent close', async () => {
    // Exercise watcher option validation and disabled periodic scans
    const root = await createProject();
    await assert.rejects(
        createRecursiveWatcher({
            root,
            onChange() {
                // Keep invalid-option verification free of notifications
            },
            pollInterval: -1,
        }),
        /non-negative integer/,
    );
    const watcher = await createRecursiveWatcher({
        root,
        onChange() {
            // Keep the disabled-polling watcher callback inert
        },
        debounce: 0,
        pollInterval: 0,
    });
    assert.ok(['recursive', 'directory'].includes(watcher.backend));
    assert.equal(watcher.pollInterval, 0);
    watcher.close();
    watcher.close();
});
