import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import {
    renderCssSkeletons,
    generateSkeletons,
    renderReservationCss,
    renderSkeletonHtml,
    renderSkeletonMask,
    renderSkeletonManifest,
    writeSkeletonArtifacts,
} from '../../server/skeleton-generator.mjs';

// Reuse one responsive capture shape across every deterministic renderer
const temporaryDirectories = new Set(),
    variants = {
        desktop: {
            display: 'block',
            width: 600,
            height: 240,
            inlineSizing: 'fixed',
            constrainInlineSize: true,
            blocks: [
                {
                    x: 5,
                    y: 10,
                    width: 50,
                    height: 20,
                    radius: 4,
                    pixelX: 30,
                    pixelEnd: 270,
                    pixelWidth: 300,
                    inlineAnchor: 'start',
                },
            ],
        },
        mobile: {
            display: 'block',
            width: 360,
            height: 320,
            inlineSizing: 'fill',
            constrainInlineSize: false,
            blocks: [
                {
                    x: 8,
                    y: 12,
                    width: 84,
                    height: 18,
                    radius: 4,
                    pixelX: 28.8,
                    pixelEnd: 28.8,
                    pixelWidth: 302.4,
                    inlineAnchor: 'center',
                },
            ],
        },
    };

afterEach(async () => {
    // Clean up the completed test
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

// Assert geometry and privacy without depending on a browser capture
test('renders responsive anonymous skeleton HTML, masks, and CSS workflows', () => {
    // Exercise the test scenario
    const html = renderSkeletonHtml(variants, 768),
        captures = new Map([['user-card', variants]]),
        css = renderReservationCss(captures, 768),
        cssFirst = renderCssSkeletons(captures, 768),
        mask = renderSkeletonMask(variants.desktop);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /max-width:767px/);
    assert.match(html, /inset-inline-start:30px/);
    assert.match(html, /inline-size:300px/);
    assert.equal(html.includes('private content'), false);
    assert.match(css, /user-card:not\(:defined\)/);
    assert.match(css, /acl-component\[tag="user-card"\]/);
    assert.match(css, /min-block-size:240px/);
    assert.match(css, /min-block-size:320px/);
    assert.match(css, /max-inline-size:100%;inline-size:600px/);
    assert.match(css, /inline-size:100%/);
    assert.match(mask, /^data:image\/svg\+xml,/);
    assert.match(decodeURIComponent(mask), /<rect x="50" y="10" width="500" height="20"/);
    assert.match(cssFirst, /--acl-skeleton-mask:url/);
    assert.match(cssFirst, /--acl-skeleton-mask-position:30px 10px/);
    assert.match(cssFirst, /--acl-skeleton-mask-size:300px 20px/);
    assert.match(cssFirst, /box-sizing:border-box;block-size:240px/);
    assert.match(cssFirst, /min-inline-size:0;max-inline-size:100%/);
    assert.match(cssFirst, /overflow:hidden/);
    assert.match(cssFirst, /background-color:var\(--acl-skeleton-base/);
    assert.match(cssFirst, /-webkit-mask-image:var/);
    assert.match(cssFirst, /mask-image:var/);
    assert.match(cssFirst, /prefers-reduced-motion:reduce/);
    assert.match(cssFirst, /max-width:767px/);
    assert.equal(cssFirst.includes('private content'), false);
});

test('renders every fixed, relative, end, stretch, inline, and positioned geometry branch', () => {
    // Exercise the test scenario
    const branchVariant = {
            display: 'inline',
            width: 400,
            height: 120,
            inlineSizing: 'layout',
            constrainInlineSize: false,
            layout: {
                marginBlockStart: 1,
                marginInlineEnd: 2,
                marginBlockEnd: 3,
                marginInlineStart: 4,
                alignSelf: 'center',
                justifySelf: 'end',
                verticalAlign: 'middle',
                position: 'absolute',
                insetBlockStart: 5,
                insetInlineEnd: 6,
                insetBlockEnd: 7,
                insetInlineStart: 8,
            },
            blocks: [
                {
                    x: 2,
                    y: 4,
                    width: 90,
                    height: 16,
                    radius: 8,
                    pixelX: 8,
                    pixelEnd: 32,
                    pixelWidth: 360,
                    inlineAnchor: 'stretch',
                },
                {
                    x: 75,
                    y: 25,
                    width: 20,
                    height: 12,
                    radius: 2,
                    pixelX: 300,
                    pixelEnd: 20,
                    pixelWidth: 80,
                    inlineAnchor: 'end',
                },
                {
                    x: 40,
                    y: 45,
                    width: 20,
                    height: 10,
                    radius: 2,
                    pixelX: 160,
                    pixelEnd: 160,
                    pixelWidth: 80,
                    inlineAnchor: 'relative',
                },
            ],
        },
        captures = new Map([['geometry-card', { desktop: branchVariant }]]),
        css = renderCssSkeletons(captures, 1, 'component-shell'),
        html = renderSkeletonHtml({ desktop: branchVariant }, 1),
        reservation = renderReservationCss(captures, 1, 'component-shell');
    assert.match(css, /inline-size:auto/);
    assert.match(css, /margin:1px 2px 3px 4px/);
    assert.match(css, /align-self:center/);
    assert.match(css, /justify-self:end/);
    assert.match(css, /vertical-align:middle/);
    assert.match(css, /position:absolute/);
    assert.match(css, /calc\(100% - 8px - 32px\)/);
    assert.match(css, /right 20px top 25px/);
    assert.match(css, /left 40% top 45px/);
    assert.match(html, /inset-inline-end:20px/);
    assert.match(html, /inset-inline-start:40%/);
    assert.match(reservation, /component-shell\[tag="geometry-card"\]/);
    assert.throws(
        // Run the operation expected to throw
        () => renderSkeletonHtml({}, 768),
        /viewport capture is required/,
    );
    assert.match(
        renderSkeletonMask({
            width: 0,
            height: 0,
            blocks: [
                {
                    x: 0,
                    y: 0,
                    width: 0,
                    height: 1,
                    radius: 2,
                },
            ],
        }),
        /data:image/,
    );
});

test('writes CSS by default while preserving manifest and combined artifact modes', async () => {
    // Exercise the test scenario
    const captures = new Map([['user-card', variants]]),
        first = renderSkeletonManifest(captures),
        second = renderSkeletonManifest(captures),
        directory = await mkdtemp(join(tmpdir(), 'acl-skeleton-test-'));
    temporaryDirectories.add(directory);
    assert.equal(first, second);
    assert.match(first, /export default manifest/);
    const cssFiles = await writeSkeletonArtifacts({
        captures,
        outDir: directory,
        breakpoint: 768,
    });
    assert.equal(cssFiles.mode, 'css');
    assert.deepEqual(cssFiles.files, [join(directory, 'acl-skeletons.css')]);
    assert.equal(cssFiles.manifestPath, null);
    assert.match(await readFile(cssFiles.cssSkeletonPath, 'utf8'), /mask-image/);

    const manifestFiles = await writeSkeletonArtifacts({
        captures,
        outDir: directory,
        breakpoint: 768,
        mode: 'manifest',
    });
    assert.deepEqual(manifestFiles.files, [
        join(directory, 'acl-skeletons.generated.js'),
        join(directory, 'acl-skeletons.generated.css'),
    ]);
    assert.equal(await readFile(manifestFiles.manifestPath, 'utf8'), first);
    assert.match(await readFile(manifestFiles.manifestCssPath, 'utf8'), /min-block-size:240px/);

    const bothFiles = await writeSkeletonArtifacts({
        captures,
        outDir: directory,
        breakpoint: 768,
        mode: 'both',
    });
    assert.equal(bothFiles.files.length, 3);
    await assert.rejects(
        writeSkeletonArtifacts({
            captures,
            outDir: directory,
            breakpoint: 768,
            mode: 'invalid',
        }),
        /Unsupported skeleton mode/,
    );

    const protectedPath = join(directory, 'acl-skeletons.generated.js');
    await writeFile(protectedPath, 'user-owned', 'utf8');
    await assert.rejects(
        writeSkeletonArtifacts({
            captures,
            outDir: directory,
            breakpoint: 768,
            mode: 'manifest',
        }),
        /Refusing to overwrite non-generated file/,
    );
    await writeSkeletonArtifacts({
        captures,
        outDir: directory,
        breakpoint: 768,
        mode: 'manifest',
        force: true,
    });
});

const createBrowserStub = ({
    captures = { 'user-card': variants.desktop },
    tags = ['user-card'],
    skipped = [],
    waitError = null,
    gotoError = null,
    registrationPending = false,
    registrationTags = tags,
    deferredCount = 0,
    capturableTags = null,
} = {}) => {
    // Create browser stub
    const pages = [],
        browser = {
            async newPage(options) {
                // Run the new page operation
                let evaluation = 0,
                    registrationWaitRequired = registrationPending;
                const page = {
                    options,
                    async goto() {
                        // Run the goto operation
                        if (gotoError) throw gotoError;
                    },
                    async addStyleTag() {
                        // Accept captured skeleton styles in the browser stub
                    },
                    async evaluate() {
                        // Run the evaluate operation
                        evaluation++;
                        if (evaluation === 1) return undefined;
                        if (evaluation === 2)
                            return {
                                tags: registrationTags,
                                stateful: !registrationWaitRequired,
                            };
                        if (evaluation === 3)
                            return {
                                tags,
                                skipped,
                            };
                        if (evaluation === 4) {
                            page.activationEvaluated = true;
                            return deferredCount;
                        }
                        if (evaluation === 5)
                            return waitError
                                ? tags.map(
                                      // Transform the current item
                                      (tagName) => ({
                                          tagName,
                                          states: ['loading'],
                                      }),
                                  )
                                : capturableTags || tags;
                        return captures;
                    },
                    async waitForFunction(_predicate, _argument, waitOptions) {
                        // Wait for function
                        if (registrationWaitRequired) {
                            registrationWaitRequired = false;
                            page.registrationWaited = true;
                            page.registrationWaitOptions = waitOptions;
                            return;
                        }
                        if (waitError) throw waitError;
                    },
                    async close() {
                        // Close
                        page.closed = true;
                    },
                };
                pages.push(page);
                return page;
            },
            async close() {
                // Close
                browser.closed = true;
            },
        };
    return {
        browser,
        pages,
        browserType: {
            // Run the name operation
            name: () => 'chromium',
            // Run the launch operation
            launch: async () => browser,
        },
    };
};

test('ignores ready component types that have no capturable layout', async () => {
    // Exercise the test scenario
    const directory = await mkdtemp(join(tmpdir(), 'acl-skeleton-layoutless-'));
    temporaryDirectories.add(directory);
    const progress = [],
        stub = createBrowserStub({
            captures: { 'user-card': variants.desktop },
            tags: ['user-card', 'hidden-diagnostics'],
            capturableTags: ['user-card'],
        }),
        result = await generateSkeletons(
            {
                target: {
                    type: 'remote',
                    url: 'https://example.test/',
                },
                routes: [],
                viewports: {
                    desktop: {
                        width: 800,
                        height: 600,
                    },
                },
                include: [],
                exclude: [],
                timeout: 10_000,
                mode: 'css',
                breakpoint: 700,
                outDir: directory,
                force: true,
            },
            {
                browserType: stub.browserType,
                // Run the on progress operation
                onProgress: (message) => progress.push(message),
            },
        );
    assert.deepEqual(result.components, ['user-card']);
    assert.deepEqual(result.failures, []);
    assert.match(progress.join('\n'), /Ignoring 1 ready component type without capturable layout/);
});

test('waits for asynchronous component registration before route discovery', async () => {
    // Exercise the test scenario
    const directory = await mkdtemp(join(tmpdir(), 'acl-skeleton-registration-'));
    temporaryDirectories.add(directory);
    const progress = [],
        stub = createBrowserStub({ registrationPending: true }),
        result = await generateSkeletons(
            {
                target: {
                    type: 'remote',
                    url: 'https://example.test/',
                },
                routes: [],
                viewports: {
                    desktop: {
                        width: 800,
                        height: 600,
                    },
                },
                include: [],
                exclude: [],
                timeout: 10_000,
                mode: 'css',
                breakpoint: 700,
                outDir: directory,
                force: true,
            },
            {
                browserType: stub.browserType,
                // Run the on progress operation
                onProgress: (message) => progress.push(message),
            },
        );
    assert.deepEqual(result.components, ['user-card']);
    assert.equal(stub.pages[0].registrationWaited, true);
    assert.equal(stub.pages[0].registrationWaitOptions.timeout, 5_000);
    assert.match(progress.join('\n'), /Waiting up to 5000ms for asynchronous registration/);
});

test('waits for a component inserted after the initial document scan', async () => {
    // Exercise the test scenario
    const directory = await mkdtemp(join(tmpdir(), 'acl-skeleton-late-insertion-'));
    temporaryDirectories.add(directory);
    const progress = [],
        stub = createBrowserStub({
            registrationPending: true,
            registrationTags: [],
        }),
        result = await generateSkeletons(
            {
                target: {
                    type: 'remote',
                    url: 'https://example.test/',
                },
                routes: [],
                viewports: {
                    desktop: {
                        width: 800,
                        height: 600,
                    },
                },
                include: [],
                exclude: [],
                timeout: 10_000,
                mode: 'css',
                breakpoint: 700,
                outDir: directory,
                force: true,
            },
            {
                browserType: stub.browserType,
                // Run the on progress operation
                onProgress: (message) => progress.push(message),
            },
        );
    assert.deepEqual(result.components, ['user-card']);
    assert.equal(stub.pages[0].registrationWaited, true);
    assert.match(progress.join('\n'), /after the initial document scan/);
});

test('activates deferred component types after registration before waiting for readiness', async () => {
    // Exercise the test scenario
    const directory = await mkdtemp(join(tmpdir(), 'acl-skeleton-deferred-'));
    temporaryDirectories.add(directory);
    const progress = [],
        stub = createBrowserStub({ deferredCount: 1 }),
        result = await generateSkeletons(
            {
                target: {
                    type: 'remote',
                    url: 'https://example.test/',
                },
                routes: [],
                viewports: {
                    desktop: {
                        width: 800,
                        height: 600,
                    },
                },
                include: [],
                exclude: [],
                timeout: 10_000,
                mode: 'css',
                breakpoint: 700,
                outDir: directory,
                force: true,
            },
            {
                browserType: stub.browserType,
                // Run the on progress operation
                onProgress: (message) => progress.push(message),
            },
        );
    assert.deepEqual(result.components, ['user-card']);
    assert.equal(stub.pages[0].activationEvaluated, true);
    assert.match(progress.join('\n'), /Activated 1 deferred component type after registration/);
});

test('orchestrates remote skeleton capture, warnings, partial failures, and cleanup', async () => {
    // Exercise the test scenario
    const directory = await mkdtemp(join(tmpdir(), 'acl-skeleton-orchestrator-'));
    temporaryDirectories.add(directory);
    const progress = [],
        preparedPages = [],
        stub = createBrowserStub({ skipped: ['acl-component'] }),
        result = await generateSkeletons(
            {
                target: {
                    type: 'remote',
                    url: 'https://example.test/',
                },
                routes: ['/one', '/two'],
                viewports: {
                    desktop: {
                        width: 800,
                        height: 600,
                    },
                },
                include: [],
                exclude: [],
                timeout: 50,
                maxBlocks: 12,
                mode: 'both',
                breakpoint: 700,
                outDir: directory,
                defaultComponentName: 'component-shell',
                force: true,
            },
            {
                browserType: stub.browserType,
                async preparePage(page, context) {
                    // Record per-route setup before navigation begins
                    preparedPages.push({
                        context,
                        page,
                    });
                },
                // Run the on progress operation
                onProgress: (message) => progress.push(message),
            },
        );
    assert.deepEqual(result.components, ['user-card']);
    assert.equal(result.target, 'https://example.test/');
    assert.equal(result.files.length, 3);
    assert.equal(preparedPages.length, 2);
    assert.deepEqual(
        preparedPages.map(
            // Read prepared route identities in capture order
            ({ context }) => context.routeUrl,
        ),
        ['https://example.test/one', 'https://example.test/two'],
    );
    assert.equal(preparedPages[0].context.viewportName, 'desktop');
    assert.deepEqual(preparedPages[0].context.viewport, {
        width: 800,
        height: 600,
    });
    assert.match(result.warnings.join('\n'), /Ignored another|missing one responsive capture/);
    assert.equal(stub.browser.closed, true);
    assert.equal(
        stub.pages.every(
            // Check every item
            (page) => page.closed,
        ),
        true,
    );
    assert.equal(
        progress.some(
            // Check the current item
            (message) => message.includes('Capturing 2 routes'),
        ),
        true,
    );

    const partialDirectory = await mkdtemp(join(tmpdir(), 'acl-skeleton-partial-'));
    temporaryDirectories.add(partialDirectory);
    const partialStub = createBrowserStub({ waitError: new Error('ready timeout') }),
        partial = await generateSkeletons(
            {
                target: {
                    type: 'remote',
                    url: 'https://example.test/',
                },
                routes: [],
                viewports: {
                    mobile: {
                        width: 320,
                        height: 640,
                    },
                },
                include: [],
                exclude: [],
                timeout: 5,
                outDir: partialDirectory,
                mode: 'css',
                allowPartial: true,
                force: true,
            },
            { browserType: partialStub.browserType },
        );
    assert.equal(partial.failures.length, 1);
    assert.match(partial.failures[0], /Still waiting for <user-card>/);
});

test('reports browser launch, navigation, empty capture, and include failures', async () => {
    // Exercise the test scenario
    const directory = await mkdtemp(join(tmpdir(), 'acl-skeleton-failures-'));
    temporaryDirectories.add(directory);
    const base = {
        target: {
            type: 'remote',
            url: 'https://example.test/',
        },
        routes: [],
        viewports: {
            desktop: {
                width: 800,
                height: 600,
            },
        },
        timeout: 5,
        outDir: directory,
        mode: 'css',
        force: true,
    };
    await assert.rejects(
        generateSkeletons(base, {
            browserType: {
                // Run the name operation
                name: () => 'firefox',
                launch: async () => {
                    // Run the launch operation
                    throw new Error('missing executable');
                },
            },
        }),
        /playwright install firefox/,
    );
    const navigation = createBrowserStub({
        captures: {},
        tags: [],
        gotoError: new Error('navigation failed'),
    });
    await assert.rejects(generateSkeletons(base, { browserType: navigation.browserType }), /Skeleton capture failed/);
    const empty = createBrowserStub({
        captures: {},
        tags: [],
    });
    await assert.rejects(generateSkeletons(base, { browserType: empty.browserType }), /No ready/);
    const missing = createBrowserStub({
        captures: {},
        tags: [],
    });
    await assert.rejects(
        generateSkeletons(
            {
                ...base,
                include: ['missing-card'],
            },
            { browserType: missing.browserType },
        ),
        /Included component/,
    );
});
