import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createACLDevHMR } from '../../server/dev-server.mjs';
import { createMinifiedJavaScriptReader } from '../../server/javascript-minifier.mjs';
import { createSSRRenderer } from '../../server/ssr.mjs';

const exampleRoot = dirname(fileURLToPath(import.meta.url)),
    projectRoot = resolve(exampleRoot, '../..'),
    manifest = JSON.parse(await readFile(resolve(exampleRoot, 'acl-manifest.json'), 'utf8')),
    renderer = createSSRRenderer({
        manifest,
        root: exampleRoot,
    }),
    port = Number(process.env.PORT || 4175),
    registeredCount = Object.keys(manifest.components).length,
    contentTypes = {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.html': 'text/html',
        '.md': 'text/markdown',
        '.svg': 'image/svg+xml',
    },
    minifiedJavaScript = createMinifiedJavaScriptReader();

let activityRequests = 0,
    cacheRequests = 0,
    pollingRequests = 0,
    responseRequests = 0;

// Replace every declared page placeholder and reject incomplete template data
const renderPageTemplate = (pageTemplate, values) =>
    pageTemplate.replace(/\{\{([A-Z0-9_]+)\}\}/g, (placeholder, name) => {
        // Require every template token to have an explicit server value
        if (!(name in values)) throw new TypeError(`Missing page template value: ${name}`);
        return String(values[name]);
    });

// Render the complete feature lab with optional revision mismatch markup
const renderLab = async (mismatch) => {
    const pageTemplate = await readFile(resolve(exampleRoot, 'index.html.tmpl'), 'utf8'),
        requests = [
            {
                key: 'HERO',
                tagName: 'lab-hero',
                props: {
                    title: 'Server-rendered Feature Lab',
                    summary:
                        'Explore static rendering, typed props, slots, hydration, data, stores, persistence, events, sanitization, accessibility, and diagnostics',
                    mode: 'SSR → hydrate',
                    count: 0,
                },
                attributes: {
                    id: 'lab-hero',
                },
                slots: {
                    eyebrow: 'ACL v1.1.0 · Node + Declarative Shadow DOM',
                    default: 'This sentence and every component below remain meaningful when JavaScript is disabled',
                    actions: 'Matching revisions hydrate without requesting component templates',
                },
            },
            {
                key: 'METRIC_CONTRACTS',
                tagName: 'lab-metric',
                attributes: {
                    tone: 'indigo',
                },
                slots: {
                    value: String(registeredCount),
                    default: 'SSR component contracts',
                },
            },
            {
                key: 'METRIC_INSTANCES',
                tagName: 'lab-metric',
                attributes: {
                    tone: 'cyan',
                },
                slots: {
                    value: '22',
                    default: 'Server-rendered instances',
                },
            },
            {
                key: 'METRIC_REQUESTS',
                tagName: 'lab-metric',
                attributes: {
                    tone: 'green',
                },
                slots: {
                    value: '0',
                    default: 'Template requests on matching hydration',
                },
            },
            {
                key: 'SHADOW_ACTIVE',
                tagName: 'shadow-card',
                props: {
                    title: 'Active Shadow Component',
                    active: true,
                },
                attributes: {
                    id: 'shadow-active',
                },
            },
            {
                key: 'SHADOW_INACTIVE',
                tagName: 'shadow-card',
                props: {
                    title: 'Inactive Shadow Component',
                    active: false,
                },
                attributes: {
                    id: 'shadow-inactive',
                },
            },
            {
                key: 'PROGRESS_PRIMARY',
                tagName: 'strict-progress',
                props: {
                    percent: 75,
                },
                attributes: {
                    id: 'progress-primary',
                },
            },
            {
                key: 'PROGRESS_CLAMPED',
                tagName: 'strict-progress',
                props: {
                    percent: 125,
                },
                attributes: {
                    id: 'progress-clamped',
                },
            },
            {
                key: 'LIFECYCLE',
                tagName: 'lifecycle-log',
                props: {
                    title: 'Lifecycle hydration',
                },
                attributes: {
                    id: 'lifecycle-card',
                },
            },
            {
                key: 'SLOTS',
                tagName: 'lab-slot-panel',
                attributes: {
                    id: 'slot-projection',
                },
                slots: {
                    title: 'Named and default slots',
                    badge: 'Projected by the parser',
                    default: 'These consumer nodes stay in Light DOM and project through the adopted shadow root',
                    footer: 'Default, title, badge, and footer slots are all supplied by Node',
                },
            },
            {
                key: 'DATA',
                tagName: 'lab-data-card',
                props: {
                    heading: 'Normal data fetch after hydration',
                },
                attributes: {
                    id: 'hydration-data',
                },
            },
            {
                key: 'CACHE',
                tagName: 'cache-control-demo',
                attributes: {
                    id: 'cache-control',
                },
            },
            {
                key: 'POLLING',
                tagName: 'polling-demo',
                attributes: {
                    id: 'polling-card',
                },
            },
            {
                key: 'RESPONSE',
                tagName: 'response-json-demo',
                props: {
                    label: 'JSON response',
                },
                attributes: {
                    id: 'response-card',
                },
            },
            {
                key: 'COUNTER',
                tagName: 'lab-counter-card',
                props: {
                    label: 'Interactive event forwarding',
                    count: 2,
                },
                attributes: {
                    id: 'event-counter',
                },
            },
            {
                key: 'MAPPED_EVENT',
                tagName: 'mapped-event-demo',
                attributes: {
                    id: 'mapped-event-card',
                },
            },
            {
                key: 'STORE_PRIMARY',
                tagName: 'store-display',
                attributes: {
                    id: 'store-primary',
                },
            },
            {
                key: 'STORE_SECONDARY',
                tagName: 'store-display',
                attributes: {
                    id: 'store-secondary',
                },
            },
            {
                key: 'PERSISTENT_NOTE',
                tagName: 'persistent-note',
                props: {
                    note: '',
                    count: 0,
                    storage: 'localStorage',
                },
                attributes: {
                    id: 'persistent-note-card',
                },
            },
            {
                key: 'ADVANCED_PROPS',
                tagName: 'advanced-props-demo',
                props: {
                    mode: 'compact',
                    score: 72,
                    caption: null,
                    tags: ['typed', 'isolated'],
                    profile: {
                        name: 'Ada',
                        active: true,
                    },
                },
                attributes: {
                    id: 'advanced-props',
                },
            },
            {
                key: 'SECURITY',
                tagName: 'lab-security-card',
                attributes: {
                    id: 'security-probe',
                },
            },
            {
                key: 'A11Y_ISSUES',
                tagName: 'a11y-issues-demo',
                attributes: {
                    id: 'a11y-issues',
                },
            },
        ],
        rendered = await renderer.renderMany(requests),
        components = Object.fromEntries(
            requests.map(
                // Match each render result to its named page placeholder
                (request, index) => [request.key, rendered[index]],
            ),
        );

    // Corrupt only the counter revision for the explicit fallback demonstration
    if (mismatch)
        components.COUNTER = components.COUNTER.replace(
            /data-acl-revision="[^"]+"/,
            'data-acl-revision="outdated-feature-lab-revision"',
        );

    return renderPageTemplate(pageTemplate, {
        ...components,
        REGISTERED_COUNT: registeredCount,
        INSTANCE_COUNT: requests.length,
        MISMATCH_HREF: mismatch ? '/' : '/?mismatch=1',
        MISMATCH_LABEL: mismatch ? 'Return to matching revisions' : 'Open the revision-mismatch fallback',
        FALLBACK_MODE: mismatch ? 'requested' : 'off',
    });
};

const hmr = await createACLDevHMR({
    root: exampleRoot,
    pageSources: [
        {
            path: 'index.html.tmpl',
            source: '/',
        },
    ],
    onFileChange: (file) => {
        // Invalidate the Node renderer before browsers request the edited component
        if (file.startsWith(`${resolve(exampleRoot, 'components')}/`) && extname(file) === '.html')
            renderer.clearCache();
    },
});

// Write one JSON response with development-friendly cache headers
const sendJson = (response, value) => {
    response.setHeader('content-type', 'application/json');
    response.setHeader('cache-control', 'no-store');
    response.end(JSON.stringify(value));
};

const server = createServer(async (request, response) => {
    // Resolve and serve one feature lab request
    try {
        const url = new URL(request.url, 'http://127.0.0.1');
        response.setHeader(
            'content-security-policy',
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        );
        response.setHeader('x-content-type-options', 'nosniff');
        if (await hmr.handleRequest(request, response)) return;

        if (url.pathname === '/') {
            response.setHeader('content-type', 'text/html; charset=utf-8');
            response.setHeader('cache-control', 'no-store');
            response.end(hmr.injectHTML(await renderLab(url.searchParams.has('mismatch'))));
            return;
        }

        if (url.pathname === '/api/activity') {
            activityRequests++;
            sendJson(response, {
                message: 'Hydration fetch completed without replacing the server template.',
                state: `Client data request ${activityRequests}`,
            });
            return;
        }

        if (url.pathname === '/api/cache') {
            cacheRequests++;
            sendJson(response, {
                count: cacheRequests,
                at: new Date().toLocaleTimeString('en-US'),
            });
            return;
        }

        if (url.pathname === '/api/poll') {
            pollingRequests++;
            sendJson(response, {
                count: pollingRequests,
                state: 'active',
                at: new Date().toLocaleTimeString('en-US'),
            });
            return;
        }

        if (url.pathname === '/api/response') {
            responseRequests++;
            sendJson(response, {
                value: `Decoded JSON response ${responseRequests}`,
            });
            return;
        }

        // Keep the unrendered page template private to the server
        if (url.pathname === '/index.html.tmpl') {
            response.writeHead(404).end('not found');
            return;
        }

        const roots = [
                ['/dist/', resolve(projectRoot, 'dist')],
                ['/node_modules/', resolve(projectRoot, 'node_modules')],
                ['/components/', resolve(exampleRoot, 'components')],
            ],
            mapping = roots.find(
                // Find the matching static root
                ([prefix]) => url.pathname.startsWith(prefix),
            ),
            path = mapping
                ? resolve(mapping[1], url.pathname.slice(mapping[0].length))
                : resolve(exampleRoot, url.pathname.slice(1)),
            allowedRoot = mapping?.[1] || exampleRoot;

        if (!path.startsWith(`${allowedRoot}/`) && path !== allowedRoot) {
            response.writeHead(403).end('forbidden');
            return;
        }

        let body;
        // Mirror jsDelivr-style JavaScript URLs for the local hydration client
        try {
            body = await readFile(path);
        } catch (error) {
            if (error?.code !== 'ENOENT' || !url.pathname.endsWith('.min.js')) throw error;
            body = await minifiedJavaScript.read(path.replace(/\.min\.js$/, '.js'));
        }
        response.setHeader('content-type', contentTypes[extname(path)] || 'application/octet-stream');
        response.end(body);
    } catch (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.message);
    }
});

server.listen(port, '127.0.0.1', () => {
    // Report the local URL for users and browser tests
    process.stdout.write(`[ACL SSR Feature Lab] http://127.0.0.1:${server.address().port}\n`);
});

// Release development resources before the example process exits
const shutdown = () => {
    hmr.close();
    minifiedJavaScript.clear();
    server.close();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
