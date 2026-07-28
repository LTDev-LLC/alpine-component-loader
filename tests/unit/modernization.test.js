import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parseCLIArguments, runCLI } from '../../bin/alpine-component-loader.mjs';
import {
    ACL_MANIFEST_SCHEMA,
    generateContractArtifacts,
    generateManifestSchema,
    renderComponentDeclarations,
    renderCustomElementsManifest,
} from '../../server/contract-generator.mjs';
import {
    createOptionalDependencyError,
    loadOptionalDependency,
    requireOptionalDependency,
} from '../../server/optional-dependency.mjs';
import { createSSRRenderer } from '../../server/ssr.mjs';
import { normalizeContractSchema, normalizeComponentMetadata } from '../../src/runtime/contracts.js';
import { createObservability, redactRuntimeDetail } from '../../src/runtime/observability.js';

const execFileAsync = promisify(execFile);

const contractManifest = (source) => {
    // Run the contract manifest operation
    return {
        version: 1,
        components: {
            'profile-card': {
                source,
                options: {
                    shadow: true,
                    attributes: {
                        name: {
                            type: 'String',
                            required: true,
                        },
                        score: {
                            type: 'Number',
                            nullable: true,
                        },
                    },
                },
                metadata: {
                    description: 'Profile',
                    events: {
                        select: {
                            detail: {
                                type: 'object',
                                required: ['id'],
                                properties: {
                                    id: { type: 'integer' },
                                    label: {
                                        type: 'string',
                                        nullable: true,
                                    },
                                },
                            },
                        },
                    },
                    slots: { default: { description: 'Body' } },
                },
            },
        },
        groups: { profile: ['profile-card'] },
    };
};

test('optional tool loaders preserve tool failures and explain lean-install requirements', async () => {
    // Exercise every optional-tool boundary without depending on an omitted package
    const explicit = createOptionalDependencyError('example-tool', 'example generation');
    assert.equal(explicit.code, 'ACL_OPTIONAL_DEPENDENCY_MISSING');
    assert.equal(explicit.dependency, 'example-tool');
    assert.equal(explicit.feature, 'example generation');
    assert.equal(explicit.install, 'npm install example-tool');
    assert.match(explicit.message, /reinstall without "--omit=optional"/);

    const pathModule = await loadOptionalDependency('node:path', 'path resolution');
    assert.equal(typeof pathModule.resolve, 'function');
    await assert.rejects(
        loadOptionalDependency('acl-definitely-missing-optional-tool', 'fixture generation'),
        // Verify that missing dynamic imports receive the public error contract
        (error) => {
            assert.equal(error.code, 'ACL_OPTIONAL_DEPENDENCY_MISSING');
            assert.equal(error.dependency, 'acl-definitely-missing-optional-tool');
            assert.equal(error.feature, 'fixture generation');
            assert.ok(error.cause);
            return true;
        },
    );

    const failingModule =
        'data:text/javascript,' + encodeURIComponent('throw new Error("optional tool initialization failed")');
    await assert.rejects(
        loadOptionalDependency(failingModule, 'fixture generation'),
        /optional tool initialization failed/,
    );

    assert.deepEqual(
        requireOptionalDependency(
            // Return a synchronous optional-tool fixture
            (dependency) => ({ dependency }),
            'example-tool',
            'example generation',
        ),
        { dependency: 'example-tool' },
    );
    assert.throws(
        // Simulate CommonJS resolution failure from a lean installation
        () =>
            requireOptionalDependency(
                // Throw the standard CommonJS missing-module error
                () => {
                    const error = new Error('missing fixture');
                    error.code = 'MODULE_NOT_FOUND';
                    throw error;
                },
                'example-tool',
                'example generation',
            ),
        // Verify the translated synchronous error
        (error) => error.code === 'ACL_OPTIONAL_DEPENDENCY_MISSING' && error.cause?.code === 'MODULE_NOT_FOUND',
    );
    const initializationError = new Error('optional tool failed after loading');
    assert.throws(
        // Preserve failures thrown by an optional tool after resolution
        () =>
            requireOptionalDependency(
                // Throw the original initialization error
                () => {
                    throw initializationError;
                },
                'example-tool',
                'example generation',
            ),
        // Verify identity rather than a translated error
        (error) => error === initializationError,
    );
});

test('contract schemas normalize safely and reject recursion or unsupported keywords', () => {
    // Exercise the test scenario
    assert.deepEqual(
        normalizeContractSchema({
            type: 'object',
            properties: { count: { type: 'integer' } },
            required: ['count'],
            nullable: true,
        }),
        {
            type: 'object',
            properties: { count: { type: 'integer' } },
            required: ['count'],
            nullable: true,
        },
    );
    const recursive = { type: 'array' };
    recursive.items = recursive;
    assert.throws(
        // Run the operation expected to throw
        () => normalizeContractSchema(recursive),
        /recursive/,
    );
    assert.throws(
        // Run the operation expected to throw
        () =>
            normalizeContractSchema({
                type: 'string',
                format: 'raw-typescript',
            }),
        /unsupported key/,
    );
    assert.throws(
        // Run the operation expected to throw
        () => normalizeComponentMetadata({ events: { 'bad event': {} } }, 'bad-card'),
        /Invalid event/,
    );
});

test('contract schemas validate every JSON-safe shape and metadata boundary', () => {
    // Exercise the test scenario
    assert.deepEqual(normalizeContractSchema({ type: 'array' }), {
        type: 'array',
        items: { type: 'unknown' },
    });
    assert.deepEqual(
        normalizeContractSchema({
            type: 'string',
            enum: ['one', 2, false, null],
        }),
        {
            type: 'string',
            enum: ['one', 2, false, null],
        },
    );
    assert.throws(
        // Run the operation expected to throw
        () => normalizeContractSchema(null),
        /must be an object/,
    );
    assert.throws(
        // Run the operation expected to throw
        () => normalizeContractSchema({ type: 'unsupported' }),
        /unsupported type/,
    );
    assert.throws(
        // Run the operation expected to throw
        () =>
            normalizeContractSchema({
                type: 'string',
                enum: [{}],
            }),
        /JSON primitive/,
    );
    assert.throws(
        // Run the operation expected to throw
        () =>
            normalizeContractSchema({
                type: 'object',
                properties: [],
            }),
        /properties must be an object/,
    );
    assert.throws(
        // Run the operation expected to throw
        () =>
            normalizeContractSchema({
                type: 'object',
                properties: {},
                required: ['missing'],
            }),
        /declared properties/,
    );
    assert.throws(
        // Run the operation expected to throw
        () =>
            normalizeContractSchema({
                type: 'string',
                properties: {},
            }),
        /only with type "object"/,
    );
    assert.throws(
        // Run the operation expected to throw
        () =>
            normalizeContractSchema({
                type: 'string',
                items: { type: 'string' },
            }),
        /only with type "array"/,
    );
    let deep = { type: 'string' };
    // Iterate over the indexed values
    for (let index = 0; index < 22; index++)
        deep = {
            type: 'array',
            items: deep,
        };
    assert.throws(
        // Run the operation expected to throw
        () => normalizeContractSchema(deep),
        /maximum depth/,
    );
    assert.equal(normalizeComponentMetadata(null), null);
    assert.throws(
        // Run the operation expected to throw
        () => normalizeComponentMetadata([]),
        /must be an object/,
    );
    assert.throws(
        // Run the operation expected to throw
        () => normalizeComponentMetadata({ description: 1 }),
        /must be a string/,
    );
    assert.throws(
        // Run the operation expected to throw
        () => normalizeComponentMetadata({ events: [] }),
        /events.*must be an object/,
    );
    assert.throws(
        // Run the operation expected to throw
        () => normalizeComponentMetadata({ slots: [] }),
        /slots.*must be an object/,
    );
    assert.throws(
        // Run the operation expected to throw
        () => normalizeComponentMetadata({ slots: { 'bad slot': {} } }),
        /Invalid slot/,
    );
    assert.throws(
        // Run the operation expected to throw
        () => normalizeComponentMetadata({ events: { ready: { description: 5 } } }),
        /Invalid event/,
    );
    assert.throws(
        // Run the operation expected to throw
        () => normalizeComponentMetadata({ slots: { actions: { description: 7 } } }),
        /Invalid slot/,
    );
    assert.throws(
        // Run the operation expected to throw
        () => normalizeComponentMetadata({ unsupported: true }),
        /unsupported key/,
    );
    assert.deepEqual(
        normalizeComponentMetadata(
            {
                description: 'Documented',
                events: { ready: { description: 'Ready' } },
                slots: {
                    default: {},
                    actions: { description: 'Actions' },
                },
            },
            'typed-card',
        ),
        {
            description: 'Documented',
            events: { ready: { description: 'Ready' } },
            slots: {
                default: {},
                actions: { description: 'Actions' },
            },
        },
    );
});

test('contract generators emit deterministic typed elements and editor metadata', () => {
    // Exercise the test scenario
    const manifest = contractManifest('profile-card.html'),
        first = renderComponentDeclarations(manifest),
        second = renderComponentDeclarations(manifest),
        customElements = renderCustomElementsManifest(manifest);
    assert.equal(first, second);
    assert.match(first, /interface ProfileCardElement/);
    assert.match(first, /CustomEvent<\{ "id": number; "label"\?: string \| null; \}>/);
    assert.equal(customElements.modules[0].declarations[0].tagName, 'profile-card');
    assert.equal(customElements.modules[0].declarations[0].attributes[0].fieldName, 'name');
    assert.equal(customElements.modules[0].declarations[0].slots[0].name, '');
    assert.equal(ACL_MANIFEST_SCHEMA.properties.version.const, 1);
    const invalid = contractManifest('profile-card.html');
    invalid.components['profile-card'].options.attributes.raw = { type: 'HTMLElement & { unsafe: true }' };
    assert.throws(
        // Run the operation expected to throw
        () => renderComponentDeclarations(invalid),
        /unsupported prop type/,
    );
});

test('CLI parser normalizes types and schema generation contracts', () => {
    // Exercise the test scenario
    const cwd = '/tmp/acl-contract-test';
    assert.deepEqual(
        parseCLIArguments(
            ['types', 'manifest.json', '--out', 'elements.d.ts', '--custom-elements-out=elements.json', '--dry-run'],
            cwd,
        ),
        {
            command: 'types',
            help: false,
            manifestFile: resolve(cwd, 'manifest.json'),
            outFile: resolve(cwd, 'elements.d.ts'),
            customElementsFile: resolve(cwd, 'elements.json'),
            force: false,
            dryRun: true,
            json: false,
        },
    );
    assert.equal(parseCLIArguments(['schema', '--json'], cwd).outFile, resolve(cwd, 'acl-manifest.schema.json'));
    assert.throws(
        // Run the operation expected to throw
        () => parseCLIArguments(['types'], cwd),
        /requires a manifest/,
    );
});

test('contract artifact writers protect files and honor dry-run and force', async () => {
    // Exercise the test scenario
    const root = await mkdtemp(resolve(tmpdir(), 'acl-contract-writer-')),
        manifestFile = resolve(root, 'manifest.json'),
        outFile = resolve(root, 'generated', 'acl-components.d.ts'),
        customElementsFile = resolve(root, 'generated', 'custom-elements.json'),
        schemaFile = resolve(root, 'schema', 'acl-manifest.schema.json');
    await writeFile(manifestFile, JSON.stringify(contractManifest('profile-card.html')));
    const dry = await generateContractArtifacts({
        manifestFile,
        outFile,
        customElementsFile,
        dryRun: true,
    });
    assert.equal(dry.dryRun, true);
    assert.deepEqual(dry.files, []);
    await assert.rejects(
        // Run the operation expected to reject
        () => readFile(outFile),
        /ENOENT/,
    );
    const written = await generateContractArtifacts({
        manifestFile,
        outFile,
        customElementsFile,
    });
    assert.deepEqual(written.files, [outFile, customElementsFile]);
    assert.match(await readFile(outFile, 'utf8'), /ProfileCardElement/);
    await writeFile(outFile, 'user-owned');
    await assert.rejects(
        // Run the operation expected to reject
        () =>
            generateContractArtifacts({
                manifestFile,
                outFile,
                customElementsFile,
            }),
        /Refusing to overwrite/,
    );
    await generateContractArtifacts({
        manifestFile,
        outFile,
        customElementsFile,
        force: true,
    });
    const schemaDry = await generateManifestSchema({
        outFile: schemaFile,
        dryRun: true,
    });
    assert.deepEqual(schemaDry.files, []);
    await generateManifestSchema({ outFile: schemaFile });
    assert.equal(JSON.parse(await readFile(schemaFile, 'utf8')).properties.version.const, 1);
    await writeFile(schemaFile, '{}');
    await assert.rejects(
        // Run the operation expected to reject
        () => generateManifestSchema({ outFile: schemaFile }),
        /Refusing to overwrite/,
    );
    await generateManifestSchema({
        outFile: schemaFile,
        force: true,
    });
});

test('CLI executes contract and project dry runs with text and JSON reporting', async () => {
    // Exercise the test scenario
    const root = await mkdtemp(resolve(tmpdir(), 'acl-cli-contracts-')),
        components = resolve(root, 'components'),
        manifestFile = resolve(root, 'acl-manifest.json'),
        output = [];
    await mkdir(components);
    await writeFile(resolve(components, 'profile-card.html'), '<p>Profile</p>');
    await writeFile(manifestFile, JSON.stringify(contractManifest('components/profile-card.html')));
    const originalWrite = process.stdout.write;
    process.stdout.write = (value) => {
        // Exercise the test scenario
        output.push(String(value));
        return true;
    };
    // Guard the operation against runtime failures
    try {
        assert.equal(await runCLI(['--help']), null);
        assert.equal(
            (
                await runCLI([
                    'types',
                    manifestFile,
                    '--out',
                    resolve(root, 'types.d.ts'),
                    '--custom-elements-out',
                    resolve(root, 'elements.json'),
                ])
            ).dryRun,
            false,
        );
        assert.equal((await runCLI(['schema', '--out', resolve(root, 'schema.json'), '--json'])).dryRun, false);
        assert.equal((await runCLI(['init', 'new-card', '--dir', components, '--json'])).tag, 'new-card');
        assert.equal((await runCLI(['manifest', components, '--out', resolve(root, 'generated.json')])).dryRun, false);
        assert.equal((await runCLI(['validate', manifestFile, '--json'])).valid, true);
    } finally {
        process.stdout.write = originalWrite;
    }
    assert.match(output.join(''), /Usage:|ACL Types|"command": "schema"|ACL Manifest/);
});

test('CLI executes through a package-manager binary symlink', async () => {
    // Reproduce the node_modules/.bin link used by npm and npx
    const root = await mkdtemp(resolve(tmpdir(), 'acl-cli-symlink-')),
        cliFile = fileURLToPath(new URL('../../bin/alpine-component-loader.mjs', import.meta.url)),
        linkedCLI = resolve(root, 'alpine-component-loader');
    await symlink(cliFile, linkedCLI);
    const { stderr, stdout } = await execFileAsync(process.execPath, [linkedCLI, '--help']);
    assert.equal(stderr, '');
    assert.match(stdout, /^Usage:/);
});

test('observability bounds and redacts records while isolating subscribers and loggers', () => {
    // Exercise the test scenario
    const observer = createObservability(),
        received = [];
    observer.configure({
        bufferSize: 2,
        logger: () => {
            // Run the logger operation
            throw new Error('logger failure');
        },
    });
    observer.subscribe(
        // Handle the published record
        (record) => received.push(record),
    );
    observer.subscribe(() => {
        // Handle the published record
        throw new Error('listener failure');
    });
    observer.emit('loadstart', {
        tagName: 'safe-card',
        requestId: 'one',
        url: 'https://example.test/a?token=secret',
        props: { secret: true },
    });
    observer.emit('loadend', {
        requestId: 'one',
        duration: 4,
    });
    observer.report('warn', 'warning', new Error('expected'));
    const metrics = observer.getMetrics();
    assert.equal(metrics.recent.length, 2);
    assert.equal(received.length, 3);
    assert.equal(redactRuntimeDetail({ authorization: 'secret' }).authorization, '[redacted]');
    assert.equal(metrics.totals.loadstart, 1);
    observer.clearMetrics();
    assert.deepEqual(observer.getMetrics().recent, []);
});

test('SSR renderer emits sanitized DSD, typed props, slots, revisions, and client fallback hosts', async () => {
    // Exercise the test scenario
    const root = await mkdtemp(resolve(tmpdir(), 'acl-ssr-')),
        components = resolve(root, 'components');
    await mkdir(components);
    const source =
            '<style>:host{display:block}</style><article><script>alert(1)</script><a href=" javascript:alert(1) ">Bad</a><template><img src=x onerror="alert(1)"></template><slot></slot></article>',
        revision = `sha256-${createHash('sha256').update(source).digest('base64url')}`;
    await writeFile(resolve(components, 'profile-card.html'), source);
    const manifest = contractManifest('components/profile-card.html');
    manifest.components['profile-card'].options.templateRevision = revision;
    manifest.components['light-card'] = {
        source: 'components/profile-card.html',
        options: { shadow: false },
    };
    const renderer = createSSRRenderer({
            manifest,
            root,
        }),
        html = await renderer.render('profile-card', {
            props: {
                name: 'Ada',
                score: null,
            },
            slots: { default: '<p onclick="bad()">Hello</p>' },
        });
    assert.match(html, /<template data-acl-ssr-shadow shadowrootmode="open" shadowrootserializable>/);
    assert.match(html, /data-acl-revision="sha256-/);
    assert.doesNotMatch(html, /<script|javascript:|onclick|onerror/);
    assert.match(html, /name="Ada"/);
    await assert.rejects(
        // Run the operation expected to reject
        () => renderer.render('profile-card', { attributes: { 'data-acl-ssr': 'override' } }),
        /reserved host attribute/,
    );
    await assert.rejects(
        // Run the operation expected to reject
        () => renderer.render('profile-card', { props: { missing: true } }),
        /Unknown prop/,
    );
    assert.equal(
        await renderer.render('light-card', { slots: '<p>Client</p>' }),
        '<light-card><p>Client</p></light-card>',
    );
    const dataRenderer = createSSRRenderer({
            manifest,
            root,
            renderLightDom: true,
            // Run this operation
            dataResolver: async ({ tagName, props }) => ({
                tagName,
                name: props.name,
                boundary: '</script><script>alert(1)</script>',
            }),
        }),
        lightHtml = await dataRenderer.render('light-card', {
            props: {},
            slots: '<p>Server slot</p>',
        });
    assert.match(lightHtml, /<light-card data-acl-ssr="1"/);
    assert.match(lightHtml, /<article>/);
    assert.match(lightHtml, /data-acl-ssr-data/);
    assert.match(lightHtml, /\\u003c\/script>/);
    assert.doesNotMatch(lightHtml, /<script>alert/);
    await assert.rejects(
        // Run this operation
        () =>
            createSSRRenderer({
                manifest,
                root,
                // Run this operation
                dataResolver: () => 1n,
            }).render('light-card'),
        /serializable/,
    );
    await writeFile(resolve(components, 'profile-card.html'), `${source}\nchanged`);
    renderer.clearCache();
    await assert.rejects(
        // Run the operation expected to reject
        () => renderer.render('profile-card'),
        /revision mismatch/,
    );
    assert.match(await readFile(resolve(components, 'profile-card.html'), 'utf8'), /changed/);
});

test('SSR source boundaries reject traversal and unsafe network targets while custom fetch remains explicit', async () => {
    // Exercise the test scenario
    const root = await mkdtemp(resolve(tmpdir(), 'acl-ssr-boundary-')),
        outside = await mkdtemp(resolve(tmpdir(), 'acl-ssr-outside-'));
    await writeFile(resolve(outside, 'outside.html'), '<p>outside</p>');
    await symlink(resolve(outside, 'outside.html'), resolve(root, 'linked.html'));
    const localManifest = (source) => {
        // Run the local manifest operation
        return {
            version: 1,
            components: {
                'boundary-card': {
                    source,
                    options: { shadow: true },
                },
            },
        };
    };
    await assert.rejects(
        // Run the operation expected to reject
        () =>
            createSSRRenderer({
                manifest: localManifest('linked.html'),
                root,
            }).render('boundary-card'),
        /escapes/,
    );
    await assert.rejects(
        // Run the operation expected to reject
        () =>
            createSSRRenderer({
                manifest: localManifest('#selector'),
                root,
            }).render('boundary-card'),
        /Unsupported/,
    );
    await assert.rejects(
        // Run the operation expected to reject
        () =>
            createSSRRenderer({
                manifest: localManifest('.'),
                root,
            }).render('boundary-card'),
        /project root/,
    );

    const privateRenderer = createSSRRenderer({
        manifest: localManifest('https://127.0.0.1/card.html'),
        root,
    });
    await assert.rejects(
        // Run the operation expected to reject
        () => privateRenderer.render('boundary-card'),
        /non-public address/,
    );
    const credentialRenderer = createSSRRenderer({
        manifest: localManifest('https://user:pass@example.test/card.html'),
        root,
    });
    await assert.rejects(
        // Run the operation expected to reject
        () => credentialRenderer.render('boundary-card'),
        /credentials/,
    );
    const httpRenderer = createSSRRenderer({
        manifest: localManifest('http://example.test/card.html'),
        root,
    });
    await assert.rejects(
        // Run the operation expected to reject
        () => httpRenderer.render('boundary-card'),
        /Unsupported template source/,
    );

    const calls = [],
        customRenderer = createSSRRenderer({
            manifest: localManifest('https://private.internal/card.html'),
            root,
            fetch: async (url, options) => {
                // Fetch
                calls.push({
                    url: String(url),
                    redirect: options.redirect,
                });
                return new Response('<article><slot></slot></article>', { headers: { 'content-length': '39' } });
            },
        }),
        rendered = await customRenderer.renderMany([
            {
                tagName: 'boundary-card',
                slots: 'one',
            },
            {
                tagName: 'boundary-card',
                slots: 'two',
            },
        ]);
    assert.equal(rendered.length, 2);
    assert.equal(calls.length, 1);
    customRenderer.clearCache();
    await customRenderer.render('boundary-card');
    assert.equal(calls.length, 2);

    const oversized = createSSRRenderer({
        manifest: localManifest('https://private.internal/large.html'),
        root,
        maxTemplateBytes: 4,
        // Fetch
        fetch: async () => new Response('12345', { headers: { 'content-length': '5' } }),
    });
    await assert.rejects(
        // Run the operation expected to reject
        () => oversized.render('boundary-card'),
        /exceeds 4 bytes/,
    );

    const timed = createSSRRenderer({
        manifest: localManifest('https://private.internal/slow.html'),
        root,
        timeout: 5,
        // Fetch
        fetch: async (_url, { signal }) => ({
            ok: true,
            status: 200,
            headers: new Headers(),
            body: {
                // Return the abort-aware response reader fixture
                getReader: () => ({
                    // Wait until timeout aborts the pending read
                    read: () =>
                        new Promise(
                            // Settle the pending read from the abort signal
                            (resolveRead, rejectRead) =>
                                signal.addEventListener(
                                    'abort',
                                    // Handle the abort event
                                    () => rejectRead(new DOMException('timeout', 'AbortError')),
                                    { once: true },
                                ),
                        ),
                }),
            },
        }),
    });
    await assert.rejects(
        // Run the operation expected to reject
        () => timed.render('boundary-card'),
        // Run the operation expected to reject
        (error) => error.name === 'AbortError',
    );

    const redirectedToHttp = createSSRRenderer({
        manifest: localManifest('https://private.internal/redirect.html'),
        root,
        // Fetch
        fetch: async () =>
            new Response(null, {
                status: 302,
                headers: { location: 'http://private.internal/card.html' },
            }),
    });
    await assert.rejects(
        // Run the operation expected to reject
        () => redirectedToHttp.render('boundary-card'),
        /require HTTPS/,
    );
});
