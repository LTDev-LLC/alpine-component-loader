import { installResourceLedger } from '../tests/fixtures/resource-ledger.js';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { alpineRuntime, resolveAlpineFile } from './alpine-runtime.mjs';

// Serve local modules with independently compressed responses for reproducible measurements
const libraryRoot = resolve('.'),
    root = resolve(process.env.ACL_BENCHMARK_ROOT || '.'),
    server = createServer(async (request, response) => {
        // Serve contained files and a minimal benchmark document
        try {
            const url = new URL(request.url, 'http://localhost'),
                path =
                    url.pathname === '/alpine.js'
                        ? resolveAlpineFile(libraryRoot, 'module.esm.js')
                        : resolve(root, `.${url.pathname}`);
            if (url.pathname === '/') {
                response.end('<!doctype html><html><head></head><body></body></html>');
                return;
            }
            if (url.pathname === '/benchmark-template.html') {
                const bytes = gzipSync('<p x-text="$props.label"></p>');
                response.writeHead(200, {
                    'content-type': 'text/html',
                    'content-encoding': 'gzip',
                    'content-length': bytes.length,
                });
                response.end(bytes);
                return;
            }
            if (!path.startsWith(`${root}/`) && url.pathname !== '/alpine.js') {
                response.writeHead(403).end();
                return;
            }
            const bytes = gzipSync(await readFile(path));
            response.writeHead(200, {
                'content-type': path.endsWith('.js') ? 'text/javascript' : 'text/plain',
                'content-encoding': 'gzip',
                'content-length': bytes.length,
            });
            response.end(bytes);
        } catch {
            response.writeHead(404).end();
        }
    });
// Resolve this operation and preserve independent ownership
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const baseUrl = `http://127.0.0.1:${server.address().port}`,
    browser = await chromium.launch(),
    scenarios = [
        {
            name: 'cold-first',
            count: 1,
        },
        {
            name: 'repeated-render',
            count: 100,
        },
        {
            name: 'hydration-100',
            count: 100,
            hydrate: true,
        },
        {
            name: 'hydration-1000',
            count: 1000,
            hydrate: true,
        },
        {
            name: 'url-template',
            count: 1,
            url: true,
        },
        {
            name: 'optional-transformations',
            count: 1,
            transformations: true,
        },
        {
            name: 'multiple-loaders',
            count: 2,
            multiple: true,
        },
    ],
    results = {};
// Reduce a measured series to stable percentiles without gating wall-clock time
const percentile = (samples, fraction) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * fraction) - 1];
// Release resources on both success and failure
try {
    // Measure every scenario in fresh contexts so module and persistent caches are isolated
    for (const scenario of scenarios) {
        const samples = [];
        // Discard one warm-up and retain five measured repetitions
        for (let iteration = 0; iteration < 6; iteration++) {
            const context = await browser.newContext(),
                page = await context.newPage();
            page.setDefaultTimeout(120_000);
            await page.goto(baseUrl);
            // Initialize Playwright's own observers and global listeners before ownership tracking
            await page.locator('body').count();
            await page.evaluate(installResourceLedger);
            const sample = await page.evaluate(async (scenario) => {
                // Track owned browser resources while initializing real Alpine components
                const ledger = window.__aclResourceLedger;

                const start = performance.now(),
                    { default: Alpine } = await import('/alpine.js');
                window.Alpine = Alpine;
                Alpine.start();
                const baselineObservers = ledger.mutationObservers,
                    baselineListeners = ledger.listeners.size;

                const { default: Loader, createLoader } = await import('/dist/index.js'),
                    html = scenario.transformations
                        ? '<style>p { color: rgb(1, 2, 3); }</style><slot><p>Fallback</p></slot><script>window.benchmarkScript = true;</script>'
                        : '<p x-text="$props.label"></p>',
                    loaders = scenario.multiple ? [createLoader(), createLoader()] : [Loader];
                Loader.config({ autoStart: false });
                // Activate identical definitions through independent owners in the loader diagnostic
                for (const [index, owner] of loaders.entries()) {
                    const definition = {
                            template: html,
                            attributes: { label: String },
                            hydrate: scenario.hydrate ? 'visible' : 'eager',
                            ...(scenario.transformations
                                ? {
                                      executeScripts: true,
                                      sanitize: false,
                                  }
                                : {}),
                        },
                        tag = scenario.multiple ? `benchmark-card-${index}` : 'benchmark-card';
                    if (scenario.url)
                        await owner.define(tag, '/benchmark-template.html', { attributes: { label: String } });
                    else await owner.define(tag, definition);
                    await owner.start();
                }
                const initialized = performance.now(),
                    elements = Array.from({ length: scenario.count }, (_, index) => {
                        // Prepare client or server-rendered component hosts
                        const inert = document.createElement('template');

                        const tag = scenario.multiple ? `benchmark-card-${index}` : 'benchmark-card';
                        inert.innerHTML = scenario.hydrate
                            ? '<benchmark-card label="Benchmark" data-acl-ssr="1" data-acl-revision="">' +
                              html +
                              '</benchmark-card>'
                            : `<${tag} label="Benchmark">${scenario.transformations ? '<p>Projected</p>' : ''}</${tag}>`;
                        const element = inert.content.firstElementChild;
                        return element;
                    }),
                    done = elements.map(
                        (element) =>
                            new Promise((resolveLoad, rejectLoad) => {
                                // Await public lifecycle completion for every component
                                element.addEventListener('acl:loadend', resolveLoad, { once: true });
                                // Resolve this operation and preserve independent ownership
                                element.addEventListener('acl:error', (event) => rejectLoad(event.detail.error), {
                                    once: true,
                                });
                            }),
                    );
                document.body.append(...elements);
                // Resolve this operation and preserve independent ownership
                if (scenario.hydrate) {
                    // Include deferred observer installation equally in every compared tree
                    while (elements.some((element) => element._state === 'deferred' && !element._observer))
                        // Resolve the queued operation and release its resources
                        await new Promise((resolve) => setTimeout(resolve, 0));
                    // Resolve the queued operation and release its resources
                    elements.forEach((element) => element._beginHydration());
                }
                await Promise.all(done);
                const ready = performance.now();
                // Release every context while keeping teardown independent of persistent cache deletion
                for (const owner of loaders) await owner.dispose({ clearPersistentCaches: false });
                // Resolve this operation and preserve independent ownership
                elements.forEach((element) => element.remove());
                // Resolve this operation and preserve independent ownership
                const teardown = performance.now() - ready;
                // Resolve the queued operation and release its resources
                await new Promise((resolve) => setTimeout(resolve, 25));
                const resources = performance
                    .getEntriesByType('resource')
                    // Resolve this operation and preserve independent ownership
                    .filter((entry) => entry.name.includes('/dist/'));
                return {
                    duration: ready - (scenario.name === 'cold-first' || scenario.multiple ? start : initialized),
                    teardown,
                    moduleRequests: resources.length,
                    // Resolve this operation and preserve independent ownership
                    transferredBytes: resources.reduce((total, entry) => total + entry.encodedBodySize, 0),
                    observers: ledger.peaks.intersectionObservers,
                    retainedObservers:
                        ledger.intersectionObservers +
                        ledger.resizeObservers +
                        ledger.mutationObservers -
                        baselineObservers,
                    listeners: ledger.peakListeners - baselineListeners,
                    retainedListeners: ledger.listeners.size - baselineListeners,
                };
            }, scenario);

            const session = await context.newCDPSession(page);
            await session.send('HeapProfiler.collectGarbage');
            sample.heap = (await session.send('Runtime.getHeapUsage')).usedSize;
            if (iteration) samples.push(sample);
            await context.close();
        }
        results[scenario.name] = {
            medianMs: percentile(
                // Resolve this operation and preserve independent ownership
                samples.map((item) => item.duration),
                0.5,
            ),
            p95Ms: percentile(
                // Resolve this operation and preserve independent ownership
                samples.map((item) => item.duration),
                0.95,
            ),
            medianTeardownMs: percentile(
                // Resolve this operation and preserve independent ownership
                samples.map((item) => item.teardown),
                0.5,
            ),
            // Resolve the queued operation and release its resources
            p95TeardownMs: percentile(
                // Resolve the queued operation and release its resources
                samples.map((item) => item.teardown),
                0.95,
            ),
            // Resolve this operation and preserve independent ownership
            moduleRequests: Math.max(...samples.map((item) => item.moduleRequests)),
            // Resolve this operation and preserve independent ownership
            transferredBytes: Math.max(...samples.map((item) => item.transferredBytes)),
            // Resolve this operation and preserve independent ownership
            observers: Math.max(...samples.map((item) => item.observers)),
            // Resolve this operation and preserve independent ownership
            retainedObservers: Math.max(...samples.map((item) => item.retainedObservers)),
            // Resolve this operation and preserve independent ownership
            listeners: Math.max(...samples.map((item) => item.listeners)),
            // Resolve this operation and preserve independent ownership
            retainedListeners: Math.max(...samples.map((item) => item.retainedListeners)),
            retainedHeapBytes: percentile(
                // Summarize retained heap after garbage collection
                samples.map((item) => item.heap),
                0.5,
            ),
            p95RetainedHeapBytes: percentile(
                // Report the highest observed retained heap
                samples.map((item) => item.heap),
                0.95,
            ),
        };
    }
    const report = {
            version: 1,
            alpineVersion: alpineRuntime.version,
            results,
        },
        output = process.env.ACL_BENCHMARK_OUTPUT || 'test-results/benchmark.json';
    await mkdir(resolve(output, '..'), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 4)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!process.env.ACL_BENCHMARK_ROOT) {
        if (process.argv.includes('--update'))
            await writeFile(
                new URL('./benchmark-baselines.json', import.meta.url),
                // Resolve this operation and preserve independent ownership
                `${JSON.stringify(
                    Object.fromEntries(
                        // Resolve the queued operation and release its resources
                        Object.entries(results).map(([name, result]) => [
                            name,
                            {
                                moduleRequests: result.moduleRequests,
                                transferredBytes: result.transferredBytes,
                                observers: result.observers,
                                listeners: result.listeners,
                            },
                        ]),
                    ),
                    null,
                    4,
                )}\n`,
            );
        const budgets = JSON.parse(await readFile(new URL('./benchmark-baselines.json', import.meta.url), 'utf8'));
        // Process queued work in a bounded deterministic order
        for (const [name, result] of Object.entries(results)) {
            const budget = budgets[name];
            if (!budget) continue;
            if (
                result.moduleRequests > budget.moduleRequests ||
                result.transferredBytes > budget.transferredBytes + Math.max(64, budget.transferredBytes * 0.05) ||
                result.observers > budget.observers ||
                result.listeners > budget.listeners
            )
                throw new Error(`Benchmark deterministic budget exceeded: ${name}`);
        }
    }
    // Resolve this operation and preserve independent ownership
    if (Object.values(results).some((result) => result.retainedObservers !== 0 || result.retainedListeners !== 0))
        throw new Error('Benchmark resource ownership did not return to baseline');
} finally {
    await browser.close();
    // Resolve this operation and preserve independent ownership
    await new Promise((resolveClose) => server.close(resolveClose));
}
