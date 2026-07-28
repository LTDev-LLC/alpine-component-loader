import { expect, test as base } from './test.js';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(__dirname, '../..');
export const featureLabPath = '/examples/feature-lab/';

let activeBaseUrl;

const mimeTypes = {
    '.js': 'text/javascript',
    '.html': 'text/html',
    '.css': 'text/css',
    '.json': 'application/json',
};

const send = (res, status, body, type = 'text/plain') => {
    // Send
    res.writeHead(status, {
        'content-type': type,
        connection: 'close',
    });
    res.end(body);
};

const sendJson = (res, data, status = 200) => {
    // Send json
    send(res, status, JSON.stringify(data), 'application/json');
};

const readRequestBody = async (req) => {
    // Read request body
    let body = '';
    // Process each chunk
    for await (const chunk of req) body += chunk;
    return body;
};

// Provide only the Alpine surface required for deterministic loader unit behavior
export const alpineStub = () =>
    `
<script>
window.__stores = {};
window.Alpine = {
    reactive(value) { return value; },
    effect(callback) { callback(); return callback; },
    release() {},
    nextTick(callback) { Promise.resolve().then(callback); },
    store(name, value) {
        if (arguments.length === 2) window.__stores[name] = value;
        return window.__stores[name];
    },
    destroyTree() {},
    initTree(root) {
        window.__initTreeRan = true;
        const nodes = [...root.querySelectorAll('[x-init], [x-text]')];
        for (const node of nodes) {
            const props = node.$props || node.closest('[data-acl-component]')?.$props || {};
            if (node.hasAttribute('x-init')) {
                new Function('$el', '$props', 'window', 'props', node.getAttribute('x-init'))(node, props, window, props);
            }
            if (node.hasAttribute('x-text')) {
                const value = new Function('$el', '$props', 'window', 'props', 'return (' + node.getAttribute('x-text') + ')')(node, props, window, props);
                node.textContent = value ?? '';
            }
        }
    }
};
</script>`;

export const alpineStubSource = () => {
    // Run the alpine stub source operation
    return alpineStub().replace(/<\/?script>/g, '');
};

// Reset each browser case to the same stubbed Alpine document
export const preparePage = async (page, html = '') => {
    await page.goto(`${activeBaseUrl}/blank`);
    await page.addScriptTag({ content: alpineStubSource() });
    if (html)
        await page.evaluate(
            // Read the browser state
            (markup) => document.body.insertAdjacentHTML('beforeend', markup),
            html,
        );
};

// Host templates APIs and built assets behind one request-counting fixture server

export const test = base.extend({
    loaderServer: [
        async ({}, use) => {
            // Extend the test fixture
            let server, baseUrl, counts, moduleRequests;
            counts = new Map();
            moduleRequests = [];
            server = createServer(async (req, res) => {
                // Handle the HTTP request
                const url = new URL(req.url, `http://${req.headers.host}`);

                if (url.pathname === '/blank') {
                    send(res, 200, '<!doctype html><title>blank</title>', 'text/html');
                    return;
                }

                if (url.pathname === '/templates/simple.html') {
                    send(res, 200, '<span id="label" x-text="$props.label"></span>', 'text/html');
                    return;
                }

                if (url.pathname === '/templates/data.html') {
                    send(
                        res,
                        200,
                        '<button id="emit">emit</button><div id="ready" x-init="window.__componentData = $props.$data"></div>',
                        'text/html',
                    );
                    return;
                }

                if (url.pathname === '/templates/fallback.html') {
                    send(res, 200, '<div id="fallback">fallback loaded</div>', 'text/html');
                    return;
                }

                if (url.pathname === '/templates/slot.html') {
                    send(res, 200, '<div id="slot"><slot></slot></div>', 'text/html');
                    return;
                }

                if (url.pathname === '/templates/cache.html') {
                    const key = 'template-cache';
                    counts.set(key, (counts.get(key) || 0) + 1);
                    send(res, 200, `<div id="cache-count">${counts.get(key)}</div>`, 'text/html');
                    return;
                }

                if (url.pathname === '/templates/unsafe.html') {
                    send(
                        res,
                        200,
                        '<button id="unsafe" onclick="window.__unsafeClick = true">unsafe</button><script>window.__unsafeScript = true;</script>',
                        'text/html',
                    );
                    return;
                }

                if (url.pathname === '/templates/event.html') {
                    send(
                        res,
                        200,
                        '<button id="fire" onclick="this.dispatchEvent(new CustomEvent(\'inner-save\', { bubbles: true, detail: { ok: true } }))">fire</button>',
                        'text/html',
                    );
                    return;
                }

                if (url.pathname === '/templates/slow-template.html') {
                    setTimeout(
                        // Run the scheduled delayed task
                        () => send(res, 200, '<div id="slow-template">ready</div>', 'text/html'),
                        80,
                    );
                    return;
                }

                if (url.pathname === '/api/echo') {
                    sendJson(res, {
                        query: Object.fromEntries(url.searchParams.entries()),
                        headers: {
                            fromAttr: req.headers['x-from-attr'] || null,
                            fromHook: req.headers['x-from-hook'] || null,
                        },
                    });
                    return;
                }

                if (url.pathname === '/api/count') {
                    const key = url.searchParams.get('name') || 'default';
                    counts.set(key, (counts.get(key) || 0) + 1);
                    sendJson(res, {
                        count: counts.get(key),
                        query: Object.fromEntries(url.searchParams.entries()),
                    });
                    return;
                }

                if (url.pathname === '/api/error') {
                    sendJson(res, { error: true }, 500);
                    return;
                }

                if (url.pathname === '/api/slow') {
                    const delay = Number(url.searchParams.get('delay') || 100),
                        name = url.searchParams.get('name'),
                        key = `slow-${name || 'default'}`;
                    counts.set(key, (counts.get(key) || 0) + 1);
                    const requestCount = counts.get(key);
                    setTimeout(
                        // Run the scheduled delayed task
                        () =>
                            sendJson(res, {
                                delayed: true,
                                ...(name ? { count: requestCount } : {}),
                            }),
                        delay,
                    );
                    return;
                }

                if (url.pathname === '/api/network-clear-race') {
                    const key = url.searchParams.get('name') || 'network-clear-race';
                    counts.set(key, (counts.get(key) || 0) + 1);
                    const attempt = counts.get(key);
                    if (attempt > 1) {
                        await new Promise(
                            // Settle the asynchronous operation
                            (resolveDelay) => setTimeout(resolveDelay, 100),
                        );
                        sendJson(
                            res,
                            {
                                error: true,
                                attempt,
                            },
                            503,
                        );
                        return;
                    }
                    sendJson(res, {
                        ok: true,
                        count: attempt,
                    });
                    return;
                }

                if (url.pathname === '/api/headers') {
                    sendJson(res, {
                        headers: {
                            accept: req.headers.accept || null,
                            custom: req.headers['x-custom'] || null,
                        },
                    });
                    return;
                }

                if (url.pathname === '/api/text') {
                    send(res, 200, 'plain response', 'text/plain');
                    return;
                }

                if (url.pathname === '/api/vendor-json') {
                    send(res, 200, JSON.stringify({ vendor: true }), 'application/vnd.api+json');
                    return;
                }

                if (url.pathname === '/api/request') {
                    const body = await readRequestBody(req),
                        key = `${req.method}:${req.headers['x-custom'] || ''}:${body}:${url.search}`;
                    counts.set(key, (counts.get(key) || 0) + 1);
                    sendJson(res, {
                        method: req.method,
                        body,
                        count: counts.get(key),
                        headers: {
                            custom: req.headers['x-custom'] || null,
                            contentType: req.headers['content-type'] || null,
                        },
                    });
                    return;
                }

                if (url.pathname === '/api/flaky') {
                    const key = url.searchParams.get('name') || 'flaky';
                    counts.set(key, (counts.get(key) || 0) + 1);
                    if (counts.get(key) <= Number(url.searchParams.get('fail') || 1)) {
                        sendJson(
                            res,
                            {
                                error: true,
                                attempt: counts.get(key),
                            },
                            500,
                        );
                        return;
                    }
                    sendJson(res, {
                        ok: true,
                        attempt: counts.get(key),
                    });
                    return;
                }

                if (url.pathname === '/script/one.js') {
                    send(res, 200, 'window.__scriptOrder = (window.__scriptOrder || []).concat(1);', 'text/javascript');
                    return;
                }

                if (url.pathname === '/script/two.js') {
                    send(res, 200, 'window.__scriptOrder = (window.__scriptOrder || []).concat(2);', 'text/javascript');
                    return;
                }

                if (url.pathname === '/script/weird.js') {
                    send(res, 200, 'window.__weirdScriptLoaded = true;', 'text/javascript');
                    return;
                }

                if (url.pathname === '/script/slow.js') {
                    await new Promise(
                        // Settle the asynchronous operation
                        (resolveDelay) => setTimeout(resolveDelay, 100),
                    );
                    send(res, 200, 'window.__slowScriptLoaded = true;', 'text/javascript');
                    return;
                }

                if (url.pathname === '/style/weird.css') {
                    send(res, 200, 'body { --acl-weird-css: 1; }', 'text/css');
                    return;
                }

                if (url.pathname === '/style/slow.css') {
                    await new Promise(
                        // Settle the asynchronous operation
                        (resolveDelay) => setTimeout(resolveDelay, 75),
                    );
                    send(res, 200, 'body { --acl-slow-css: ready; }', 'text/css');
                    return;
                }

                if (
                    url.pathname.startsWith('/src/') ||
                    url.pathname.startsWith('/dist/') ||
                    url.pathname.startsWith('/__acl_hmr/modules/') ||
                    url.pathname === '/examples/feature-lab/styles.css' ||
                    url.pathname.startsWith('/examples/feature-lab/components/') ||
                    url.pathname.startsWith('/examples/feature-lab/skeletons/')
                ) {
                    // Guard the test operation against runtime failures
                    try {
                        const requestedPath = url.pathname,
                            packagePath = requestedPath.startsWith('/__acl_hmr/modules/')
                                ? `/dist/${requestedPath.slice('/__acl_hmr/modules/'.length)}`
                                : requestedPath,
                            readablePath =
                                packagePath.startsWith('/dist/') && packagePath.endsWith('.min.js')
                                    ? packagePath.replace(/\.min\.js$/, '.js')
                                    : packagePath,
                            filePath = join(projectRoot, readablePath.slice(1)),
                            ext = extname(filePath);
                        if (
                            (requestedPath.startsWith('/dist/') || requestedPath.startsWith('/__acl_hmr/modules/')) &&
                            requestedPath.endsWith('.js')
                        )
                            moduleRequests.push(`${requestedPath}${url.search}`);
                        send(res, 200, await readFile(filePath), mimeTypes[ext] || 'application/octet-stream');
                    } catch {
                        send(res, 404, 'not found');
                    }
                    return;
                }

                if (url.pathname === featureLabPath || url.pathname === `${featureLabPath}index.html`) {
                    send(
                        res,
                        200,
                        await readFile(join(projectRoot, featureLabPath.slice(1), 'index.html')),
                        'text/html',
                    );
                    return;
                }

                send(res, 404, 'not found');
            });

            await new Promise(
                // Settle the asynchronous operation
                (resolve) => server.listen(0, '127.0.0.1', resolve),
            );
            const { port } = server.address();
            baseUrl = `http://127.0.0.1:${port}`;
            activeBaseUrl = baseUrl;
            await use({
                baseUrl,
                counts,
                moduleRequests,
            });
            await new Promise(
                // Settle the asynchronous operation
                (resolveClose) => server.close(resolveClose),
            );
        },
        { scope: 'worker' },
    ],
    _aclResetLoaderCounts: [
        async ({ loaderServer }, use) => {
            // Extend the test fixture
            loaderServer.counts.clear();
            loaderServer.moduleRequests.length = 0;
            await use();
        },
        { auto: true },
    ],
});

export { expect };
