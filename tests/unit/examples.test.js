import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { injectHMRBootstrap } from '../../server/dev-server.mjs';

const examplesRoot = resolve('examples'),
    exampleModes = new Map([
        ['a11y', { importMap: 'index.html' }],
        ['feature-lab', { importMap: 'index.html' }],
        ['feature-lab-ssr', { importMap: null }],
        ['hmr', { importMap: 'index.html' }],
        ['offline', { importMap: null }],
        ['playground', { importMap: null }],
        ['ssr', { importMap: null }],
    ]),
    browserFileExtensions = new Set(['.html', '.js', '.json', '.tmpl']),
    packageUrlPattern =
        /(["'`])(?<url>(?:(?:https:\/\/cdn\.jsdelivr\.net\/(?:npm\/alpine-component-loader|gh\/LTDev-LLC\/alpine-component-loader)@[^/]+)?\/(?:dist|__acl_hmr\/modules)\/|(?:\.\.?\/)*dist\/)[^"'`\s]+\.js(?:[?#][^"'`\s]*)?)\1/g;

// Read every browser-facing source and generated artifact below one example
const readBrowserFiles = async (directory) => {
    const files = [];
    // Visit nested example assets in deterministic order
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
        // Compare directory entries by their checked-in name
        (left, right) => left.name.localeCompare(right.name),
    )) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...(await readBrowserFiles(path)));
        else if (entry.isFile() && browserFileExtensions.has(extname(entry.name)))
            files.push({
                path,
                source: await readFile(path, 'utf8'),
            });
    }
    return files;
};

// Decode the first valid import map from an example page
const readImportMap = (source) => {
    // Inspect authored script blocks until a valid import map is found
    for (const match of String(source).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
        if (!/\btype\s*=\s*(?:["']importmap["']|importmap)(?:\s|$)/i.test(match[1])) continue;
        return JSON.parse(match[2]);
    }
    throw new TypeError('Example page does not contain an import map.');
};

test('every maintained example uses the Feature Lab product header and footer', async () => {
    // Keep every example shell structurally and visually aligned with its canonical Feature Lab components
    const pages = new Map([
            ['a11y', 'index.html'],
            ['feature-lab', 'index.html'],
            ['feature-lab-ssr', 'index.html.tmpl'],
            ['hmr', 'index.html'],
            ['offline', 'index.html'],
            ['playground', 'index.html'],
            ['ssr', 'index.html.tmpl'],
        ]),
        productDescription = /A lightweight,\s*build-free component loader for\s*(?:<a[^>]*>)?Alpine\.js(?:<\/a>)?\.?/g;
    // Inspect each maintained static or server-rendered page source
    for (const [name, entry] of pages) {
        const source = await readFile(join(examplesRoot, name, entry), 'utf8'),
            shellStyles =
                name === 'feature-lab' ? source : await readFile(join(examplesRoot, name, 'styles.css'), 'utf8'),
            descriptions = source.match(productDescription) ?? [];
        assert.ok(descriptions.length >= 2, `${name} must use the product description in both shell regions`);
        assert.match(source, /class="subtitle"/, `${name} must use the Feature Lab header subtitle`);
        assert.match(source, /class="github-link"[^>]*target="_blank"[^>]*rel="noreferrer"/);
        assert.match(source, /class="container"[\s\S]*class="inner"[\s\S]*class="meta"/);
        assert.match(source, /LTDev LLC · MIT License/);
        assert.match(source, />GitHub<\/a>/);
        assert.match(source, />Issues<\/a>/);
        assert.match(source, />Alpine\.js<\/a>/);
        assert.match(source, /href="#top">Back to top<\/a>/);
        // Verify the stable visual tokens shared by the header and footer
        for (const visualContract of [
            /padding:\s*clamp\(1rem,\s*3vw,\s*2rem\)/,
            /font-size:\s*clamp\(1\.8rem,\s*4vw,\s*2\.5rem\)/,
            /max-width:\s*900px/,
            /gap:\s*1rem 2rem/,
            /outline:\s*3px solid rgba\(37,\s*99,\s*235,\s*0\.35\)/,
            /@media \(max-width:\s*760px\)/,
        ])
            assert.match(shellStyles, visualContract, `${name} must retain the Feature Lab shell style contract`);
    }
});

test('every runnable browser example selects the minified package family', async () => {
    // Keep the policy inventory aligned with every checked-in top-level example
    const actualExamples = (await readdir(examplesRoot, { withFileTypes: true }))
        .filter(
            // Retain only runnable example directories
            (entry) => entry.isDirectory(),
        )
        .map(
            // Reduce each directory to its stable name
            (entry) => entry.name,
        )
        .sort();
    assert.deepEqual(actualExamples, [...exampleModes.keys()].sort());

    // Verify each example exposes at least one package URL and never selects readable browser modules
    for (const [name, mode] of exampleModes) {
        const directory = join(examplesRoot, name),
            files = await readBrowserFiles(directory),
            packageUrls = files.flatMap(({ path, source }) =>
                Array.from(
                    source.matchAll(packageUrlPattern),
                    // Retain each browser URL together with its source path for useful failures
                    (match) => ({
                        file: relative(examplesRoot, path),
                        url: match.groups.url,
                    }),
                ),
            );
        assert.ok(packageUrls.length > 0, `${name} does not expose a browser package entry`);
        packageUrls.forEach(
            // Require every direct package and generated service-worker URL to stay minified
            ({ file, url }) =>
                assert.match(
                    new URL(url, 'https://acl.invalid/examples/').pathname,
                    /\.min\.js$/,
                    `${file} uses a readable package URL: ${url}`,
                ),
        );

        if (!mode.importMap) continue;
        const pagePath = join(directory, mode.importMap),
            source = await readFile(pagePath, 'utf8'),
            authoredMap = readImportMap(source),
            rootMapping = authoredMap.imports?.['alpine-component-loader'];
        assert.match(
            new URL(rootMapping, 'https://acl.invalid').pathname,
            /\/index\.min\.js$/,
            `${relative(examplesRoot, pagePath)} must select index.min.js`,
        );

        const injectedMap = readImportMap(injectHMRBootstrap(source)),
            packageMappings = Object.entries(injectedMap.imports).filter(
                // Select the complete loader package family added by the development server
                ([specifier]) =>
                    specifier === 'alpine-component-loader' || specifier.startsWith('alpine-component-loader/'),
            );
        assert.equal(packageMappings.length, 11, `${name} must expose every injected browser entry`);
        packageMappings.forEach(
            // Keep the injected application and HMR client on one minified identity
            ([specifier, url]) =>
                assert.match(
                    new URL(url, 'https://acl.invalid').pathname,
                    /\.min\.js$/,
                    `${name} maps ${specifier} to a readable URL`,
                ),
        );
    }

    const offlinePage = await readFile(join(examplesRoot, 'offline', 'index.html'), 'utf8');
    assert.match(offlinePage, /src="\.\/app\.min\.js"/);

    // Keep the focused examples aligned with newly documented opt-in workflows
    const offlinePolicy = JSON.parse(await readFile(join(examplesRoot, 'offline', 'acl-offline.json'), 'utf8')),
        generatedOfflineManifest = JSON.parse(
            await readFile(join(examplesRoot, 'offline', 'acl-precache-manifest.json'), 'utf8'),
        ),
        ssrServer = await readFile(join(examplesRoot, 'ssr', 'server.mjs'), 'utf8'),
        playground = await readFile(join(examplesRoot, 'playground', 'playground.js'), 'utf8'),
        accessibilityReadme = await readFile(join(examplesRoot, 'a11y', 'README.md'), 'utf8'),
        accessibilityBaseline = JSON.parse(
            await readFile(join(examplesRoot, 'a11y', 'acl-a11y-baseline.json'), 'utf8'),
        ),
        accessibilitySuppressions = JSON.parse(
            await readFile(join(examplesRoot, 'a11y', 'acl-a11y-suppressions.json'), 'utf8'),
        );
    assert.equal(offlinePolicy.navigation.strategy, 'network-first');
    assert.equal(offlinePolicy.runtimeRoutes[0].maxEntries, 4);
    assert.equal(generatedOfflineManifest.config.runtimeRoutes[0].cacheName, 'example-runtime');
    assert.match(ssrServer, /dataResolver/);
    assert.match(ssrServer, /dataPolicy/);
    assert.match(ssrServer, /hydrate/);
    assert.match(playground, /createLoader/);
    assert.match(playground, /loader\.dispose/);
    assert.match(accessibilityReadme, /alpine-component-loader audit/);
    assert.equal(accessibilityBaseline.version, 1);
    assert.deepEqual(accessibilityBaseline.findings, {});
    assert.ok(accessibilitySuppressions.suppressions[0].reason);
    assert.ok(Date.parse(accessibilitySuppressions.suppressions[0].expires) > Date.now());
});
