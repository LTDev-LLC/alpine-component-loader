import { expect, test } from './fixtures/test.js';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load versioned budgets separately so regressions remain intentional review points
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    budgets = JSON.parse(await readFile(resolve(projectRoot, 'tests/performance-budgets.json'), 'utf8'));
let server, baseUrl, templateRequests;

test.beforeAll(async () => {
    // Prepare the test group
    templateRequests = 0;
    server = createServer(async (request, response) => {
        // Handle the HTTP request
        const url = new URL(request.url, `http://${request.headers.host}`);
        if (url.pathname === '/blank') {
            response.writeHead(200, { 'content-type': 'text/html' });
            response.end('<!doctype html><html lang="en"><title>ACL performance fixture</title><body></body></html>');
            return;
        }
        if (url.pathname === '/templates/benchmark.html') {
            templateRequests++;
            response.writeHead(200, { 'content-type': 'text/html' });
            response.end('<article x-data="{ count: 1 }"><span x-text="count"></span></article>');
            return;
        }
        if (/^\/(?:dist|node_modules)\//.test(url.pathname)) {
            const path = resolve(projectRoot, `.${url.pathname}`);
            // Guard the operation against runtime failures
            try {
                const contentType = extname(path) === '.js' ? 'text/javascript' : 'application/octet-stream';
                response.writeHead(200, { 'content-type': contentType });
                response.end(await readFile(path));
            } catch {
                response.writeHead(404).end('not found');
            }
            return;
        }
        response.writeHead(404).end('not found');
    });
    await new Promise(
        // Settle the asynchronous operation
        (resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise),
    );
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
    // Clean up the completed test group
    await new Promise(
        // Settle the asynchronous operation
        (resolvePromise) => server.close(resolvePromise),
    );
});

test('component, cache-hit, many-component, teardown, and debugger budgets', async ({
    page,
    browserName,
}, testInfo) => {
    // Exercise the test scenario
    const engineBudget = budgets.engines[browserName] || budgets.engines.chromium;
    await page.goto(`${baseUrl}/blank`);
    await page.addScriptTag({ url: `${baseUrl}/node_modules/alpinejs-315/dist/cdn.min.js` });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.Alpine?.version,
    );
    // Measure runtime work in the browser and return only aggregate samples
    await page.addScriptTag({
        type: 'module',
        content: `
            import Loader from '${baseUrl}/dist/index.js';
            import Debugger from '${baseUrl}/dist/debugger.js';
            import A11y from '${baseUrl}/dist/a11y.js';
            Loader.config({ autoStart: false, cacheNamespace: 'benchmark-' + Date.now() });
            Loader.define('benchmark-card', '${baseUrl}/templates/benchmark.html');
            await Loader.start();

            const percentile = (values, value) => {
                    const sorted = [...values].sort((a, b) => a - b);
                    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)];
                },
                median = values => percentile(values, 0.5),
                manyComponentRuns = [], teardownRuns = [], componentDurations = [];
            let coldRender100Ms = 0;
            for (let run = 0; run < 6; run++) {
                const start = performance.now(), elements = [];
                for (let index = 0; index < 100; index++) {
                    const element = document.createElement('benchmark-card');
                    elements.push(element);
                    document.body.appendChild(element);
                }
                await Promise.all(elements.map(element => new Promise(resolve => {
                    if (element._state === 'ready') resolve();
                    else element.addEventListener('loaded', resolve, { once: true });
                })));
                const duration = performance.now() - start;
                if (run === 0) coldRender100Ms = duration;
                const teardownStart = performance.now();
                elements.forEach(element => element.remove());
                await new Promise(resolve => setTimeout(resolve, 20));
                if (run > 0) {
                    // Keep cold network and template setup under its dedicated batch budget
                    componentDurations.push(...elements.map(element => element._perf?.duration || 0));
                    manyComponentRuns.push(duration);
                    teardownRuns.push(performance.now() - teardownStart);
                }
            }
            const manyComponentMedianMs = median(manyComponentRuns),
                warmRender100P95Ms = percentile(manyComponentRuns, 0.95),
                teardownMedianMs = median(teardownRuns),
                teardownP95Ms = percentile(teardownRuns, 0.95),
                maxComponentMs = Math.max(...componentDurations),
                cacheHitRuns = [];

            const thousandStart = performance.now(), thousand = [];
            for (let index = 0; index < 1000; index++) {
                const element = document.createElement('benchmark-card');
                thousand.push(element);
                document.body.appendChild(element);
            }
            await Promise.all(thousand.map(element => new Promise(resolve => {
                if (element._state === 'ready') resolve();
                else element.addEventListener('loaded', resolve, { once: true });
            })));
            const thousandComponentMs = performance.now() - thousandStart;
            thousand.forEach(element => element.remove());
            await new Promise(resolve => setTimeout(resolve, 20));
            for (let run = 0; run < 5; run++) {
                const cacheStart = performance.now();
                await Loader.loadTemplate('${baseUrl}/templates/benchmark.html');
                cacheHitRuns.push(performance.now() - cacheStart);
            }
            const cacheHitMedianMs = median(cacheHitRuns);
            const cacheHit = Loader.getTemplateLoadInfo('${baseUrl}/templates/benchmark.html')?.cacheHit;

            const preserved = document.createElement('benchmark-card');
            document.body.appendChild(preserved);
            await new Promise(resolve => preserved.addEventListener('loaded', resolve, { once: true }));
            const preservedStart = performance.now();
            await preserved.reload({ preserveState: true, clearTemplate: false, clearData: false, reason: 'benchmark' });
            const preservedReloadMs = performance.now() - preservedStart;
            preserved.remove();

            const cache = await caches.open(Loader.globalConfig._templateCacheKey);
            for (let index = 0; index < 120; index++)
                await cache.put('/benchmark-cache-' + index + '.html', new Response('fixture'));
            const pruneStart = performance.now();
            await Loader.pruneTemplateCache({ max: 20 });
            const cachePruneMs = performance.now() - pruneStart;
            const cacheEntriesAfterPrune = (await Loader.getTemplateCacheInfo()).size;
            const storageEstimate = await navigator.storage?.estimate?.() || {};

            const auditStart = performance.now();
            await A11y.audit(document);
            const accessibilityAuditMs = performance.now() - auditStart;

            for (let index = 0; index < 300; index++) {
                const marker = document.createElement('div');
                marker.dataset.aclComponent = 'benchmark-marker';
                document.body.appendChild(marker);
            }
            Debugger.inject(Loader);
            const debuggerRuns = [];
            for (let run = 0; run < 5; run++) {
                const debugStart = performance.now();
                await Loader.toggleDebug();
                await new Promise(resolve => requestAnimationFrame(resolve));
                debuggerRuns.push(performance.now() - debugStart);
                await Loader.toggleDebug();
            }
            await Loader.toggleDebug();
            const debuggerStartMedianMs = median(debuggerRuns);
            const debuggerRows = document.querySelectorAll('#acl-debug-panel button[data-acl-debug-id]').length;
            await new Promise(resolve => setTimeout(resolve, 300));
            const retainedComponentsAfterTeardown = document.querySelectorAll('benchmark-card').length;

            window.__aclPerformance = {
                coldRender100Ms,
                manyComponentMedianMs,
                warmRender100P95Ms,
                thousandComponentMs,
                maxComponentMs,
                cacheHitMedianMs,
                cacheHit,
                debuggerStartMedianMs,
                teardownMedianMs,
                teardownP95Ms,
                preservedReloadMs,
                cachePruneMs,
                accessibilityAuditMs,
                debuggerRows,
                retainedComponentsAfterTeardown,
                cacheEntriesAfterPrune,
                storageUsageBytes: storageEstimate.usage ?? null,
                storageQuotaBytes: storageEstimate.quota ?? null,
            };
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.__aclPerformance,
    );
    const metrics = await page.evaluate(
            // Read the browser state
            () => window.__aclPerformance,
        ),
        regressions = Object.fromEntries(
            // Run this operation
            Object.entries(engineBudget.baseline).map(([name, baseline]) => [
                name,
                Number((((metrics[name] - baseline) / baseline) * 100).toFixed(2)),
            ]),
        );
    console.log(
        `[ACL Performance] ${browserName}`,
        JSON.stringify({
            // Print the same diagnostic payload retained as a CI artifact
            metrics,
            regressions,
        }),
    );
    const artifactPath = testInfo.outputPath('performance-results.json');
    await writeFile(
        artifactPath,
        JSON.stringify(
            {
                metrics,
                browserName,
                budget: engineBudget,
                regressions,
            },
            null,
            2,
        ),
    );
    await testInfo.attach('performance-results.json', {
        path: artifactPath,
        contentType: 'application/json',
    });

    expect(templateRequests).toBe(1);
    expect(metrics.cacheHit).toBe(true);
    expect(metrics.retainedComponentsAfterTeardown).toBe(0);
    expect(metrics.cacheEntriesAfterPrune).toBeLessThanOrEqual(20);
    // Run this operation
    for (const [name, ceiling] of Object.entries(engineBudget.ceilings))
        expect(metrics[name], `${browserName} ${name}`).toBeLessThan(ceiling);
    // Run this operation
    for (const [name, regression] of Object.entries(regressions))
        expect(regression, `${browserName} ${name} historical regression`).toBeLessThan(
            engineBudget.maxRegressionPercent,
        );
});
