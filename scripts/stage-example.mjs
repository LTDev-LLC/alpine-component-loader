import { mkdtemp, readFile, readdir, rename, rm, stat, writeFile, cp, mkdir } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import { createMinifiedJavaScriptReader } from '../server/javascript-minifier.mjs';
import { generateOfflineBundle } from '../server/offline-generator.mjs';
import { generateSkeletons } from '../server/skeleton-generator.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    defaultOutputRoot = resolve(projectRoot, '_site'),
    alpineUrl = 'https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js',
    fontAwesomeUrl = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    confettiUrl = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js',
    repositoryUrl = 'https://github.com/LTDev-LLC/alpine-component-loader',
    exampleCatalog = new Map([
        [
            'a11y',
            {
                title: 'Accessibility Auditing',
                purpose:
                    'Run component audits, inspect scanner results, and exercise accessibility debugger integration.',
            },
        ],
        [
            'feature-lab',
            {
                title: 'Feature Lab',
                purpose:
                    'Explore the browser runtime, manifests, persistence, observability, security, and optional tooling.',
            },
        ],
        [
            'offline',
            {
                title: 'Offline Application',
                purpose:
                    'Test a generated precache graph, navigation fallback, runtime caching, and resilient offline reloads.',
            },
        ],
        [
            'playground',
            {
                title: 'ACL Playground',
                purpose:
                    'Edit a complete ACL dashboard with incremental HMR, diagnostics, themes, and accessibility auditing.',
            },
        ],
    ]),
    supportedExamples = new Set(exampleCatalog.keys()),
    backendExamples = new Map([
        ['feature-lab-ssr', 'requires its SSR server'],
        ['hmr', 'requires the development HMR server'],
        ['ssr', 'requires its SSR server'],
    ]),
    offlineRuntimeFiles = [
        'index.min.js',
        'acl-load-error.min.js',
        'offline.min.js',
        'runtime/loader.min.js',
        'runtime/config.min.js',
        'runtime/errors.min.js',
        'runtime/values.min.js',
        'runtime/props.min.js',
        'runtime/data-options.min.js',
        'runtime/registry.min.js',
        'runtime/contracts.min.js',
        'runtime/component/factory.min.js',
        'runtime/component/lifecycle-controller.min.js',
        'runtime/component/loading-controller.min.js',
        'runtime/component/data-gate-controller.min.js',
        'runtime/component/render-controller.min.js',
        'runtime/component/state-controller.min.js',
        'runtime/lifecycle.min.js',
        'runtime/caches.min.js',
        'runtime/template-cache.min.js',
        'runtime/rendering.min.js',
    ];

const pathExists = async (path) => {
    // Guard the path probe against expected missing files
    try {
        return await stat(path);
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }
};

// Publish one staging milestone to the command-line caller
const reportStageProgress = (message) => process.stdout.write(`[ACL Stage] ${message}\n`);

// Derive the browser import map from the package's actual distribution exports
export const createStagedPackageImports = async ({ root = projectRoot } = {}) => {
    const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')),
        packageName = String(packageJson.name || ''),
        imports = {};
    if (!packageName) throw new TypeError('package.json must define a package name.');
    // Include only exports backed by browser distribution modules
    for (const [subpath, definition] of Object.entries(packageJson.exports || {})) {
        const target = typeof definition === 'string' ? definition : definition?.import;
        if (typeof target !== 'string' || !target.startsWith('./dist/') || !target.endsWith('.js')) continue;
        const specifier = subpath === '.' ? packageName : `${packageName}${subpath.slice(1)}`;
        imports[specifier] = `/${target.slice(2).replace(/\.js$/, '.min.js')}`;
    }
    if (!imports[packageName]) throw new TypeError('package.json must expose the browser distribution root.');
    return imports;
};

// Visit one parsed node and its template-aware descendants
const visit = (node, callback) => {
    callback(node);
    // Recurse through ordinary parsed children
    for (const child of node.childNodes || []) visit(child, callback);
    if (node.content) visit(node.content, callback);
};

// Read a parsed script element's normalized type
const scriptType = (node) => {
    // Return null for non-script nodes
    return node.nodeName === 'script'
        ? node.attrs
              ?.find(
                  // Locate the type attribute without depending on source casing
                  (attribute) => attribute.name.toLowerCase() === 'type',
              )
              ?.value.toLowerCase()
        : null;
};

// Replace one authored import map without reserializing the surrounding document
export const updateStagedImportMap = (source, packageImports) => {
    const document = parse(source, { sourceCodeLocationInfo: true }),
        importMaps = [];
    let head = null;
    // Locate the explicit head and every authored import map
    visit(document, (node) => {
        // Collect relevant document nodes
        if (node.nodeName === 'head') head = node;
        if (scriptType(node) === 'importmap') importMaps.push(node);
    });
    if (importMaps.length > 1) throw new TypeError('Example page must not contain more than one import map.');

    let importMap = {
        imports: {},
    };
    if (importMaps.length === 1) {
        const location = importMaps[0].sourceCodeLocation;
        if (!location?.startTag || !location?.endTag)
            throw new TypeError('Example import map must use an explicit closing script tag.');
        const body = source.slice(location.startTag.endOffset, location.endTag.startOffset);
        // Parse the authored JSON without changing unrelated document text
        try {
            importMap = JSON.parse(body);
        } catch (error) {
            throw new TypeError(`Example import map is malformed: ${error.message}`);
        }
        if (!importMap || typeof importMap !== 'object' || Array.isArray(importMap))
            throw new TypeError('Example import map must contain a JSON object.');
        if (importMap.imports != null && (typeof importMap.imports !== 'object' || Array.isArray(importMap.imports)))
            throw new TypeError('Example import map imports must contain a JSON object.');
        const preserved = Object.fromEntries(
            Object.entries(importMap.imports || {}).filter(
                // Retain mappings owned by the example while replacing the complete ACL family
                ([specifier]) =>
                    specifier !== 'alpine-component-loader' && !specifier.startsWith('alpine-component-loader/'),
            ),
        );
        importMap.imports = {
            ...preserved,
            ...packageImports,
        };
        const replacement = `\n${JSON.stringify(importMap, null, 4)}\n`;
        return `${source.slice(0, location.startTag.endOffset)}${replacement}${source.slice(location.endTag.startOffset)}`;
    }

    if (!head?.sourceCodeLocation?.startTag)
        throw new TypeError('Example page must contain an explicit head element before staging.');
    importMap.imports = {
        ...packageImports,
    };
    const tag = `\n    <script type="importmap" data-acl-stage-importmap>\n${JSON.stringify(importMap, null, 4)
            .split('\n')
            .map(
                // Indent the generated JSON beneath its script element
                (line) => `        ${line}`,
            )
            .join('\n')}\n    </script>`,
        offset = head.sourceCodeLocation.startTag.endOffset;
    return `${source.slice(0, offset)}${tag}${source.slice(offset)}`;
};

// Pin staged relative URLs to the selected example regardless of host clean-URL behavior
export const updateStagedBaseHref = (source, name) => {
    const document = parse(source, { sourceCodeLocationInfo: true }),
        bases = [],
        href = `/examples/${validateExampleName(name)}/index.html`;
    let head = null;
    // Locate the explicit head and any authored base element
    visit(document, (node) => {
        // Collect relevant document nodes
        if (node.nodeName === 'head') head = node;
        if (node.nodeName === 'base') bases.push(node);
    });
    if (bases.length > 1) throw new TypeError('Example page must not contain more than one base element.');
    if (bases.length === 0) {
        if (!head?.sourceCodeLocation?.startTag)
            throw new TypeError('Example page must contain an explicit head element before staging.');
        const offset = head.sourceCodeLocation.startTag.endOffset,
            tag = `\n    <base href="${href}" data-acl-stage-base>`;
        return `${source.slice(0, offset)}${tag}${source.slice(offset)}`;
    }

    const base = bases[0],
        location = base.sourceCodeLocation,
        hrefLocation = location?.attrs?.href;
    if (!location?.startTag) throw new TypeError('Example base element must use an explicit start tag.');
    if (hrefLocation)
        return `${source.slice(0, hrefLocation.startOffset)}href="${href}"${source.slice(hrefLocation.endOffset)}`;

    const startTag = source.slice(location.startTag.startOffset, location.startTag.endOffset),
        closingLength = startTag.endsWith('/>') ? 2 : 1,
        offset = location.startTag.endOffset - closingLength;
    return `${source.slice(0, offset)} href="${href}"${source.slice(offset)}`;
};

// Link one generated stylesheet after authored page styles without changing source examples
export const updateStagedSkeletonStylesheet = (source) => {
    const document = parse(source, { sourceCodeLocationInfo: true });
    let head = null;
    // Locate the explicit document head before inspecting its owned descendants
    visit(document, (node) => {
        // Retain the one parsed head element
        if (node.nodeName === 'head') head = node;
    });
    if (!head?.sourceCodeLocation?.startTag)
        throw new TypeError('Example page must contain an explicit head element before staging.');

    const stylesheets = [],
        generated = [];
    visit(head, (node) => {
        // Select stylesheet links and any prior stage-owned skeleton link
        if (node.nodeName !== 'link') return;
        const attributes = Object.fromEntries(
            (node.attrs || []).map(
                // Normalize parsed link attributes into a lookup
                ({ name, value }) => [name.toLowerCase(), value],
            ),
        );
        if (
            String(attributes.rel || '')
                .toLowerCase()
                .split(/\s+/)
                .includes('stylesheet')
        )
            stylesheets.push(node);
        if ('data-acl-stage-skeletons' in attributes) generated.push(node);
    });
    if (generated.length > 1)
        throw new TypeError('Example page must not contain more than one staged skeleton stylesheet.');
    if (generated.length === 1) return source;

    const lastStylesheet = stylesheets.at(-1),
        offset = lastStylesheet?.sourceCodeLocation?.startTag?.endOffset || head.sourceCodeLocation.startTag.endOffset,
        tag = '\n    <link rel="stylesheet" href="./skeletons/acl-skeletons.css" data-acl-stage-skeletons>';
    return `${source.slice(0, offset)}${tag}${source.slice(offset)}`;
};

// Require one exact Alpine CDN runtime before publishing an example
const validateAlpineRuntime = (source, name) => {
    const document = parse(source),
        matches = [];
    // Collect matching deferred script elements
    visit(document, (node) => {
        // Ignore nodes that cannot load scripts
        if (node.nodeName !== 'script') return;
        const attributes = Object.fromEntries(
            (node.attrs || []).map(
                // Normalize parsed attributes into a lookup
                ({ name: key, value }) => [key, value],
            ),
        );
        if (attributes.src === alpineUrl && 'defer' in attributes) matches.push(node);
    });
    if (matches.length !== 1)
        throw new TypeError(
            `${name} must contain exactly one deferred Alpine runtime script using ${JSON.stringify(alpineUrl)}.`,
        );
};

// Copy the readable distribution tree into virtual minified browser identities
const stageDistribution = async (sourceRoot, destinationRoot, minifiedFiles) => {
    await mkdir(destinationRoot, { recursive: true });
    // Materialize every readable distribution module at its virtual minified identity
    for (const entry of (await readdir(sourceRoot, { withFileTypes: true })).sort(
        // Compare entries by their stable file names
        (left, right) => left.name.localeCompare(right.name),
    )) {
        const sourcePath = join(sourceRoot, entry.name),
            destinationPath = join(destinationRoot, entry.name);
        if (entry.isDirectory()) {
            await stageDistribution(sourcePath, destinationPath, minifiedFiles);
            continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
        await writeFile(destinationPath.replace(/\.js$/, '.min.js'), await minifiedFiles.read(sourcePath));
    }
};

// Generate the stable root document for one selected example
const createRedirect = (name) => `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0; url=./examples/${name}/index.html">
    <title>Open ${name} example</title>
</head>
<body>
    <p><a href="./examples/${name}/index.html">Open the ${name} example</a></p>
</body>
</html>
`;

// Escape generated catalog values before inserting them into markup
const escapeHtml = (value) =>
    String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

// Generate one dependency-free Feature Lab styled catalog document
const createCatalog = (names, packageVersion, styles) => {
    const cards = names
        .map((name) => {
            // Render one allowlisted example card
            const details = exampleCatalog.get(name),
                safeName = escapeHtml(name);
            return `                <article class="example-card" data-example="${safeName}">
                    <div>
                        <span class="badge">Static</span>
                        <h3>${escapeHtml(details.title)}</h3>
                        <p>${escapeHtml(details.purpose)}</p>
                    </div>
                    <div class="card-actions">
                        <a class="primary-link" href="./examples/${safeName}/index.html">Open example</a>
                        <a class="secondary-link" href="./examples/${safeName}/README.md">Read guide</a>
                    </div>
                </article>`;
        })
        .join('\n');
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AlpineComponentLoader static examples</title>
    <style data-acl-stage-catalog>
${styles}
    </style>
</head>
<body>
    <header id="top" class="site-header">
        <div>
            <h1>AlpineComponentLoader</h1>
            <div class="subtitle">
                A lightweight, build-free component loader for
                <a href="https://alpinejs.dev/" target="_blank" rel="noreferrer">Alpine.js</a>
            </div>
            <a class="github-link" href="${repositoryUrl}" target="_blank" rel="noreferrer">View on GitHub</a>
        </div>
    </header>
    <main>
        <section class="catalog-overview" aria-labelledby="overview-heading">
            <p class="eyebrow">Deployment catalog</p>
            <h2 id="overview-heading">Explore ACL in the browser</h2>
            <p>Each example is bundled with the same production runtime and is ready to run on a plain static host.</p>
            <dl class="metrics">
                <div>
                    <dt>Examples</dt>
                    <dd>${names.length}</dd>
                </div>
                <div>
                    <dt>Package version</dt>
                    <dd>v${escapeHtml(packageVersion)}</dd>
                </div>
                <div>
                    <dt>Deployment</dt>
                    <dd>Static</dd>
                </div>
            </dl>
        </section>
        <section class="catalog-section" aria-labelledby="examples-heading">
            <div class="section-heading">
                <div>
                    <p class="eyebrow">Selected examples</p>
                    <h2 id="examples-heading">Choose an example</h2>
                </div>
            </div>
            <div class="example-grid">
${cards}
            </div>
        </section>
    </main>
    <footer class="site-footer">
        <div class="container">
            <div class="inner">
                <div class="meta">
                    <div><strong>AlpineComponentLoader</strong> - A lightweight, build-free component loader for
                        Alpine.js.</div>
                    <div>&copy; 2026 LTDev LLC · MIT License</div>
                </div>
                <nav aria-label="Footer">
                    <a href="${repositoryUrl}" target="_blank" rel="noreferrer">GitHub</a>
                    <a href="${repositoryUrl}/issues" target="_blank" rel="noreferrer">Issues</a>
                    <a href="https://alpinejs.dev/" target="_blank" rel="noreferrer">Alpine.js</a>
                    <a href="#top">Back to top</a>
                </nav>
            </div>
        </div>
    </footer>
</body>
</html>
`;
};

const catalogStyles = `:root {
    --primary: #1d4ed8;
    --primary-dark: #1e3a8a;
    --background: #f3f4f6;
    --surface: #ffffff;
    --text: #1f2937;
    --muted: #4b5563;
    --line: #e5e7eb;
    color-scheme: light;
}

:where(*) {
    box-sizing: border-box;
}

html {
    scroll-behavior: smooth;
}

body {
    min-height: 100vh;
    margin: 0;
    display: flex;
    flex-direction: column;
    background: var(--background);
    color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.6;
}

a {
    color: var(--primary);
    text-underline-offset: 0.18em;
}

a:focus-visible {
    outline: 3px solid rgba(37, 99, 235, 0.35);
    outline-offset: 3px;
}

.site-header {
    display: block;
    position: relative;
    z-index: 10;
    padding: clamp(1rem, 3vw, 2rem);
    border-bottom: 1px solid var(--line);
    background: var(--surface);
    text-align: center;
    box-sizing: border-box;
}

main {
    width: min(100% - 4rem, 1180px);
    margin-inline: auto;
}

.eyebrow {
    margin: 0;
    color: var(--primary);
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.11em;
    text-transform: uppercase;
}

h1 {
    margin: 0;
    color: var(--text);
    font-size: clamp(1.8rem, 4vw, 2.5rem);
    letter-spacing: 0;
    line-height: 1.2;
}

.site-header .subtitle {
    margin-top: 0.5rem;
    color: var(--muted);
    font-size: 1.1rem;
}

.github-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 1rem;
    color: var(--primary);
    font-weight: 600;
    text-decoration: none;
}

.github-link:hover {
    text-decoration: underline;
}

h2,
h3,
p {
    margin-top: 0;
}

main {
    flex: 1;
    padding-block: 2rem;
}

section {
    margin-bottom: 2rem;
    border-radius: 12px;
}

.catalog-overview {
    padding: clamp(1.5rem, 4vw, 2.5rem);
    overflow: hidden;
    background: linear-gradient(135deg, #0f172a, var(--primary-dark));
    box-shadow: 0 15px 35px rgba(15, 23, 42, 0.18);
    color: #ffffff;
}

.catalog-overview .eyebrow {
    color: #93c5fd;
}

.catalog-overview h2 {
    margin: 0.35rem 0 0.6rem;
    font-size: clamp(1.65rem, 4vw, 2.4rem);
}

.catalog-overview > p:not(.eyebrow) {
    max-width: 720px;
    color: #dbeafe;
}

.metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
    margin: 1.5rem 0 0;
}

.metrics div {
    border: 1px solid rgba(191, 219, 254, 0.25);
    border-radius: 0.75rem;
    padding: 0.85rem 1rem;
    background: rgba(15, 23, 42, 0.32);
}

.metrics dt {
    color: #bfdbfe;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.metrics dd {
    margin: 0.2rem 0 0;
    font-size: 1.15rem;
    font-weight: 800;
}

.catalog-section {
    border: 1px solid var(--line);
    padding: clamp(1.25rem, 4vw, 2rem);
    background: var(--surface);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 2rem;
    margin-bottom: 1.5rem;
}

.section-heading h2 {
    margin: 0.3rem 0 0;
    font-size: 1.6rem;
}

.section-heading > p {
    margin-bottom: 0;
    color: var(--muted);
}

.example-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.example-card {
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    background: #ffffff;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
    transition:
        border-color 160ms ease,
        box-shadow 160ms ease,
        transform 160ms ease;
}

.example-card > div:first-child {
    min-width: 0;
    flex: 1;
}

.example-card:hover {
    border-color: #bfdbfe;
    box-shadow: 0 10px 24px rgba(30, 64, 175, 0.11);
    transform: translateY(-2px);
}

.badge {
    display: inline-flex;
    border-radius: 999px;
    padding: 0.18rem 0.6rem;
    background: #dbeafe;
    color: #1e40af;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

.example-card h3 {
    margin: 0.85rem 0 0.45rem;
    font-size: 1.25rem;
}

.example-card p {
    margin-bottom: 0;
    color: var(--muted);
}

.card-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
}

.primary-link,
.secondary-link {
    border-radius: 0.55rem;
    padding: 0.55rem 0.8rem;
    font-weight: 750;
    text-decoration: none;
}

.primary-link {
    background: var(--primary);
    color: #ffffff;
}

.primary-link:hover {
    background: #1e40af;
}

.secondary-link {
    border: 1px solid #bfdbfe;
    background: #eff6ff;
}

.site-footer {
    display: block;
    width: 100%;
    margin-top: auto;
    border-top: 1px solid var(--line);
    color: var(--muted);
    background: var(--surface);
}

.site-footer .container {
    display: flex;
    max-width: 900px;
    margin: 0 auto;
    padding: clamp(1rem, 3vw, 2rem);
    box-sizing: border-box;
}

.site-footer .inner {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem 2rem;
}

.site-footer .meta {
    color: var(--muted);
    font-size: 0.9rem;
}

.site-footer .meta strong {
    color: var(--text);
}

.site-footer nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
}

.site-footer a {
    color: var(--primary);
    font-weight: 600;
    text-decoration: none;
}

.site-footer a:hover {
    text-decoration: underline;
}

@media (max-width: 760px) {
    main {
        width: min(100% - 2rem, 1180px);
    }

    .section-heading {
        align-items: flex-start;
        flex-direction: column;
    }

    .metrics {
        grid-template-columns: 1fr;
    }

    .example-card {
        align-items: flex-start;
        flex-direction: column;
    }

    .card-actions {
        justify-content: flex-start;
    }

    .site-footer .inner {
        align-items: flex-start;
        flex-direction: column;
    }
}

@media (prefers-reduced-motion: reduce) {
    html {
        scroll-behavior: auto;
    }

    .example-card {
        transition: none;
    }
}
`;

// Materialize application minification and route-specific Offline outputs
const stageOfflineArtifacts = async (root, minifiedFiles, { includeSkeletons = false } = {}) => {
    const exampleRoot = resolve(root, 'examples/offline'),
        applicationPath = resolve(exampleRoot, 'app.js');
    await writeFile(resolve(exampleRoot, 'app.min.js'), await minifiedFiles.read(applicationPath));
    await generateOfflineBundle({
        manifestFile: resolve(exampleRoot, 'acl-manifest.json'),
        outDir: exampleRoot,
        groups: ['offline-demo'],
        assets: [
            'index.html',
            'app.js',
            'styles.css',
            'acl-manifest.json',
            ...(includeSkeletons ? ['skeletons/acl-skeletons.css'] : []),
            ...offlineRuntimeFiles.map(
                // Resolve each published runtime module from the nested example
                (path) => `../../dist/${path}`,
            ),
            alpineUrl,
        ],
        baseUrl: '/examples/offline',
        namespace: 'example',
        configFile: resolve(exampleRoot, 'acl-offline.json'),
        minifyJavaScriptAssets: true,
        force: true,
    });
};

// Fulfill staging-only third-party resources locally so capture output is reproducible
const createStagedPagePreparation = (root, additionalPreparation) => {
    let alpineSource = null;
    return async (page, context) => {
        alpineSource ||= await readFile(resolve(root, 'node_modules/alpinejs-315/dist/cdn.min.js'), 'utf8');
        await page.route(alpineUrl, (route) =>
            route.fulfill({
                body: alpineSource,
                contentType: 'text/javascript',
            }),
        );
        await page.route(fontAwesomeUrl, (route) =>
            route.fulfill({
                body: '.fa-brands{display:inline-block}',
                contentType: 'text/css',
            }),
        );
        await page.route(confettiUrl, (route) =>
            route.fulfill({
                body: 'window.confetti = function () {};',
                contentType: 'text/javascript',
            }),
        );
        await additionalPreparation?.(page, context);
    };
};

// Swap a completed staging directory into place while retaining failure recovery
const replaceOutput = async (stagedRoot, outputRoot) => {
    const previous = await pathExists(outputRoot),
        backupRoot = `${outputRoot}.acl-backup-${process.pid}-${Date.now()}`;
    if (previous) await rename(outputRoot, backupRoot);
    // Restore the previous artifact if the final rename fails
    try {
        await rename(stagedRoot, outputRoot);
    } catch (error) {
        if (previous && !(await pathExists(outputRoot))) await rename(backupRoot, outputRoot);
        throw error;
    }
    if (previous)
        await rm(backupRoot, {
            recursive: true,
            force: true,
        });
};

// Normalize one exact static example selector
export const validateExampleName = (value = 'playground') => {
    const name = value === undefined ? 'playground' : String(value);
    if (supportedExamples.has(name)) return name;
    if (backendExamples.has(name)) throw new TypeError(`Cannot stage "${name}": ${backendExamples.get(name)}.`);
    throw new TypeError(
        `Unknown static example "${name}". Expected one of: ${[...supportedExamples].sort().join(', ')}.`,
    );
};

// Validate and deduplicate static example selectors while retaining their first order
export const normalizeExampleNames = (values = []) => {
    if (!Array.isArray(values)) throw new TypeError('Stage example selections must be an array.');
    const candidates = values.length === 0 ? ['playground'] : values,
        normalized = [],
        selected = new Set();
    // Validate the complete list before staging and retain each first occurrence
    for (const value of candidates) {
        const name = validateExampleName(value);
        if (selected.has(name)) continue;
        selected.add(name);
        normalized.push(name);
    }
    return normalized;
};

// Create one atomic static artifact containing every selected example
export const stageExamples = async (
    { names = [], root = projectRoot, outputRoot = defaultOutputRoot } = {},
    dependencies = {},
) => {
    const exampleNames = normalizeExampleNames(names),
        builtRoot = resolve(root, 'dist'),
        output = resolve(outputRoot),
        captureSkeletons = dependencies.generateSkeletons || generateSkeletons,
        report = typeof dependencies.onProgress === 'function' ? dependencies.onProgress : reportStageProgress,
        preparePage = createStagedPagePreparation(root, dependencies.prepareSkeletonPage);
    // Preflight every input before creating a temporary artifact
    for (const name of exampleNames) {
        if (!(await pathExists(resolve(root, 'examples', name, 'index.html'))))
            throw new TypeError(`Static example entry does not exist: examples/${name}/index.html`);
    }
    if (!(await pathExists(resolve(builtRoot, 'index.js'))))
        throw new TypeError('ACL distribution is missing. Run npm run build before staging.');

    const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')),
        packageImports = await createStagedPackageImports({ root }),
        temporaryRoot = await mkdtemp(resolve(dirname(output), `.${basename(output)}-acl-stage-`)),
        minifiedFiles = createMinifiedJavaScriptReader();
    // Clean an incomplete temporary artifact after any staging failure
    try {
        await mkdir(resolve(temporaryRoot, 'examples'), { recursive: true });
        await stageDistribution(builtRoot, resolve(temporaryRoot, 'dist'), minifiedFiles);
        // Copy and transform each selected example in command-line order
        for (const name of exampleNames) {
            const exampleRoot = resolve(root, 'examples', name),
                stagedExampleRoot = resolve(temporaryRoot, 'examples', name),
                entryPath = resolve(stagedExampleRoot, 'index.html');
            await cp(exampleRoot, stagedExampleRoot, { recursive: true });
            const source = await readFile(entryPath, 'utf8');
            validateAlpineRuntime(source, name);
            await writeFile(entryPath, updateStagedImportMap(updateStagedBaseHref(source, name), packageImports));
            if (name === 'offline') await stageOfflineArtifacts(temporaryRoot, minifiedFiles);
            report(`Generating responsive skeletons for ${name}...`);
            const skeletonResult = await captureSkeletons(
                {
                    target: {
                        type: 'local',
                        root: temporaryRoot,
                        index: relative(temporaryRoot, entryPath),
                    },
                    routes: [],
                    include: [],
                    exclude: [],
                    timeout: 15_000,
                    viewports: {
                        mobile: {
                            width: 390,
                            height: 844,
                        },
                        desktop: {
                            width: 1440,
                            height: 900,
                        },
                    },
                    breakpoint: 768,
                    mode: 'css',
                    allowPartial: false,
                    force: true,
                    outDir: resolve(stagedExampleRoot, 'skeletons'),
                },
                {
                    browserType: dependencies.browserType,
                    preparePage,
                    // Prefix generator milestones with the selected example
                    onProgress: (message) => report(`[${name}] ${message}`),
                },
            );
            await writeFile(entryPath, updateStagedSkeletonStylesheet(await readFile(entryPath, 'utf8')));
            if (name === 'offline')
                await stageOfflineArtifacts(temporaryRoot, minifiedFiles, {
                    includeSkeletons: true,
                });
            report(
                `Generated ${skeletonResult.components.length} component skeleton${skeletonResult.components.length === 1 ? '' : 's'} for ${name}.`,
            );
        }
        if (exampleNames.length === 1) {
            await writeFile(resolve(temporaryRoot, 'index.html'), createRedirect(exampleNames[0]));
        } else {
            await writeFile(
                resolve(temporaryRoot, 'index.html'),
                createCatalog(exampleNames, packageJson.version, catalogStyles),
            );
            await writeFile(resolve(temporaryRoot, 'styles.css'), catalogStyles);
        }

        await replaceOutput(temporaryRoot, output);
        const mode = exampleNames.length === 1 ? 'redirect' : 'catalog';
        process.stdout.write(`[ACL Stage] Staged ${exampleNames.join(', ')} as a ${mode} at ${output}\n`);
        return {
            examples: exampleNames,
            mode,
            outputRoot: output,
        };
    } catch (error) {
        await rm(temporaryRoot, {
            recursive: true,
            force: true,
        });
        throw error;
    } finally {
        minifiedFiles.clear();
    }
};

// Retain the singular staging helper for repository callers
export const stageExample = async (
    { name = 'playground', root = projectRoot, outputRoot = defaultOutputRoot } = {},
    dependencies = {},
) =>
    await stageExamples(
        {
            names: [name],
            root,
            outputRoot,
        },
        dependencies,
    );

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
    const arguments_ = process.argv.slice(2);
    // Report command-line validation without an internal stack trace
    try {
        await stageExamples({
            names: arguments_,
        });
    } catch (error) {
        process.stderr.write(`[ACL Stage] ${error.message}\n`);
        process.exitCode = 1;
    }
}
