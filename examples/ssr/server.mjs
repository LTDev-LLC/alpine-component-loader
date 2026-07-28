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
        // Resolve bounded initial data without executing Alpine or following data.src
        dataResolver: async ({ tagName, props }) =>
            tagName === 'profile-card'
                ? {
                      status: `Profile data resolved safely by SSR for ${props.name}`,
                  }
                : undefined,
    }),
    policyRenderer = createSSRRenderer({
        manifest,
        root: exampleRoot,
        dataPolicy: {
            baseUrl: 'https://1.1.1.1/',
            allowedOrigins: ['https://1.1.1.1'],
            resolve: ({ props }) => ({
                params: { name: props.name },
            }),
            fetch: async (requestUrl) => {
                // Return bounded example policy data without an outbound request
                const name = new URL(requestUrl).searchParams.get('name') || 'the profile';
                return new Response(
                    JSON.stringify({
                        status: `Profile data fetched under SSR dataPolicy for ${name}`,
                    }),
                    {
                        headers: { 'content-type': 'application/json' },
                    },
                );
            },
        },
    }),
    port = Number(process.env.PORT || 4174),
    contentTypes = {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.html': 'text/html',
    },
    minifiedJavaScript = createMinifiedJavaScriptReader();

const hmr = await createACLDevHMR({
    root: exampleRoot,
    pageSources: [
        {
            path: 'index.html.tmpl',
            source: '/',
        },
    ],
    onFileChange: (file) => {
        // Future server renders must not retain an edited component template
        if (file.startsWith(`${resolve(exampleRoot, 'components')}/`) && extname(file) === '.html') {
            renderer.clearCache();
            policyRenderer.clearCache();
        }
    },
});

const server = createServer(async (request, response) => {
    // Handle the HTTP request
    try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        response.setHeader(
            'content-security-policy',
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
        );
        if (await hmr.handleRequest(request, response)) return;
        if (url.pathname === '/') {
            const pageTemplate = await readFile(resolve(exampleRoot, 'index.html.tmpl'), 'utf8'),
                hydrationMode = ['visible', 'idle', 'interaction', 'media'].includes(url.searchParams.get('hydrate'))
                    ? url.searchParams.get('hydrate')
                    : 'eager',
                selectedRenderer = url.searchParams.get('data') === 'policy' ? policyRenderer : renderer;
            let component = await selectedRenderer.render('profile-card', {
                props: {
                    name: 'Ada Lovelace',
                    count: 0,
                },
                slots: {
                    avatar: '<span class="avatar" aria-hidden="true">AL</span>',
                    default: '<p>Rendered by Node, then adopted by Alpine without a template request.</p>',
                },
                hydrate: hydrationMode,
                hydrateMedia: hydrationMode === 'media' ? '(min-width: 1px)' : undefined,
            });
            if (url.searchParams.has('mismatch'))
                component = component.replace(
                    /data-acl-revision="[^"]+"/,
                    'data-acl-revision="outdated-example-revision"',
                );
            response.setHeader('content-type', 'text/html');
            response.end(hmr.injectHTML(pageTemplate.replace('{{PROFILE_CARD}}', component)));
            return;
        }
        if (url.pathname === '/api/profile') {
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify({ status: 'Client-only fallback data response' }));
            return;
        }
        const roots = [
                ['/dist/', resolve(projectRoot, 'dist')],
                ['/node_modules/', resolve(projectRoot, 'node_modules')],
                ['/components/', resolve(exampleRoot, 'components')],
            ],
            mapping = roots.find(
                // Find the matching item
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
    // Report server startup
    return process.stdout.write(`[ACL SSR Example] http://127.0.0.1:${server.address().port}\n`);
});

// Release development resources before the example process exits
const shutdown = () => {
    hmr.close();
    minifiedJavaScript.clear();
    server.close();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
