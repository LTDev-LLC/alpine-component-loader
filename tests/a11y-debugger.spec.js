import { expect, test } from './fixtures/test.js';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Serve built artifacts through HTTP so module and DOM behavior match production
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let server, baseUrl;

test.beforeAll(async () => {
    // Prepare the test group
    server = createServer(async (request, response) => {
        // Handle the HTTP request
        const url = new URL(request.url, `http://${request.headers.host}`);
        if (url.pathname === '/blank') {
            response.writeHead(200, { 'content-type': 'text/html' });
            response.end('<!doctype html><html lang="en"><title>ACL diagnostics</title><body></body></html>');
            return;
        }
        if (url.pathname.startsWith('/dist/') || url.pathname.startsWith('/src/')) {
            // Guard the operation against runtime failures
            try {
                const path = resolve(projectRoot, `.${url.pathname}`);
                response.writeHead(200, {
                    'content-type': extname(path) === '.js' ? 'text/javascript' : 'application/octet-stream',
                });
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

test('optional accessibility audits feed debugger filtering, snapshots, and diffs', async ({ page }) => {
    // Exercise the test scenario
    await page.goto(`${baseUrl}/blank`);
    // Execute the audit and debugger integration inside the browser module graph
    await page.addScriptTag({
        type: 'module',
        content: `
            import Loader from '${baseUrl}/src/index.js';
            import Debugger, { createComponentSnapshot, diffDiagnosticSnapshots } from '${baseUrl}/src/debugger.js';
            import A11y from '${baseUrl}/src/a11y.js';
            const card = document.createElement('audit-card');
            card.dataset.aclComponent = 'AUDIT-CARD';
            card._state = 'ready';
            card.$props = { count: 1, $loading: false, $error: null };
            card._aclDebug = { source: '/audit-card.html', templateCacheHit: false, dataCacheHit: null };
            card.innerHTML = '<img src="avatar.png"><button></button><input><h2>Title</h2><h4>Skipped</h4>';
            document.body.appendChild(card);
            Debugger.inject(Loader);
            await Loader.toggleDebug();
            const controller = A11y.observe(Loader, { debounce: 0 });
            const resultPromise = new Promise(resolve => card.addEventListener('acl:a11y', event => resolve(event.detail), { once: true }));
            card.dispatchEvent(new CustomEvent('acl:loadend', { bubbles: true, composed: true, detail: { phase: 'component' } }));
            window.auditResult = await resultPromise;
            window.snapshotDiff = diffDiagnosticSnapshots(createComponentSnapshot(card), (() => {
                card.$props.count = 2;
                return createComponentSnapshot(card);
            })());
            window.auditController = controller;
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.auditResult,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () =>
                window.auditResult.violations.map(
                    // Transform the current item
                    (item) => item.rule,
                ),
        ),
    ).toEqual(['image-alt', 'control-name', 'form-label', 'heading-order']);
    await page.locator('#acl-debug-panel button[data-acl-debug-id]').click();
    await expect(page.locator('#acl-debug-panel')).toContainText('image-alt');
    await page.locator('#acl-debug-panel input[type="search"]').fill('missing-component');
    await expect(page.locator('#acl-debug-panel button[data-acl-debug-id]')).toHaveCount(0);
    expect(
        await page.evaluate(
            // Read the browser state
            () =>
                window.snapshotDiff.some(
                    // Check the current item
                    (change) => change.path.endsWith('.count'),
                ),
        ),
    ).toBe(true);
    await page.evaluate(
        // Read the browser state
        () => window.auditController.disconnect(),
    );
});

test('basic accessibility audit covers names, focus, semantics, structure, ARIA values, and language tags', async ({
    page,
}) => {
    // Exercise the test scenario
    await page.goto(`${baseUrl}/blank`);
    // Build one fixture that deterministically trips every expanded rule category
    await page.addScriptTag({
        type: 'module',
        content: `
            import { runBasicAccessibilityAudit } from '${baseUrl}/src/a11y.js';
            const fixture = document.createElement('section');
            fixture.innerHTML = \`
                <a href="#unnamed"></a>
                <h2></h2>
                <iframe></iframe>
                <div tabindex="2">Forced focus order</div>
                <div aria-hidden="true"><button type="button">Hidden action</button></div>
                <div role="button" aria-label="Interactive wrapper"><a href="#nested">Nested link</a></div>
                <div role="dialog"><p>Dialog content</p></div>
                <fieldset><input aria-label="Preference" type="checkbox"></fieldset>
                <details><p>Missing summary</p></details>
                <table><tbody><tr><td>Unlabelled data</td></tr></tbody></table>
                <svg role="img" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"></circle></svg>
                <button type="button" aria-expanded="sometimes">Toggle</button>
                <span lang="not_a_locale">Invalid language</span>
            \`;
            document.body.appendChild(fixture);
            window.broadAudit = runBasicAccessibilityAudit(fixture);
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => Array.isArray(window.broadAudit),
    );

    expect(
        await page.evaluate(
            // Read the browser state
            () =>
                window.broadAudit.map(
                    // Transform the current item
                    (item) => item.rule,
                ),
        ),
    ).toEqual([
        'link-name',
        'heading-name',
        'iframe-title',
        'positive-tabindex',
        'aria-hidden-focus',
        'interactive-nesting',
        'dialog-name',
        'fieldset-legend',
        'details-summary',
        'table-name',
        'table-headers',
        'graphic-name',
        'aria-value',
        'language-tag',
    ]);
    expect(
        await page.evaluate(
            // Read the browser state
            () =>
                window.broadAudit.every(
                    // Check every item
                    (item) => item.severity && item.selector && item.remediation,
                ),
        ),
    ).toBe(true);
});

test('accessibility observation logs only opted-in findings across load and development reloads', async ({ page }) => {
    // Exercise the test scenario
    await page.goto(`${baseUrl}/blank`);
    await page.addScriptTag({
        type: 'module',
        content: `
            import A11y from '${baseUrl}/src/a11y.js';
            const warnings = [], originalWarn = console.warn;
            console.warn = (...args) => warnings.push(args);
            const createCard = name => {
                const card = document.createElement(name);
                card.dataset.aclComponent = name.toUpperCase();
                card.innerHTML = '<img src="avatar.png">';
                document.body.appendChild(card);
                return card;
            };
            const emitAndWait = (card, type) => new Promise(resolve => {
                card.addEventListener('acl:a11y', resolve, { once: true });
                card.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
            });

            const quietCard = createCard('quiet-audit-card');
            const quiet = A11y.observe(null, { debounce: 0 });
            await emitAndWait(quietCard, 'acl:loadend');
            quiet.disconnect();

            const loggedCard = createCard('logged-audit-card');
            const logged = A11y.observe(null, { debounce: 0, logFindings: true });
            await emitAndWait(loggedCard, 'acl:loadend');
            loggedCard.querySelector('img').alt = 'Profile';
            await emitAndWait(loggedCard, 'acl:dev-reload-end');
            loggedCard.querySelector('img').removeAttribute('alt');
            await emitAndWait(loggedCard, 'acl:dev-reload-end');
            logged.disconnect();
            console.warn = originalWarn;
            window.a11yWarnings = warnings;
        `,
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => Array.isArray(window.a11yWarnings),
    );

    const warnings = await page.evaluate(
        // Read the browser state
        () =>
            window.a11yWarnings.map(
                // Transform the current item
                (args) => ({
                    message: args[0],
                    rules: args[1].map(
                        // Transform the current item
                        (item) => item.rule,
                    ),
                }),
            ),
    );
    expect(warnings).toEqual([
        {
            message: '[ACL A11y] Found 1 accessibility finding in <logged-audit-card>.',
            rules: ['image-alt'],
        },
        {
            message: '[ACL A11y] Found 1 accessibility finding in <logged-audit-card>.',
            rules: ['image-alt'],
        },
    ]);
});

test('scanner audits active light and open-shadow components in an accessible modal', async ({ page }) => {
    // Exercise the test scenario
    await page.goto(`${baseUrl}/blank`);
    await page.addScriptTag({
        type: 'module',
        content: `
            import Scanner from '${baseUrl}/src/a11y-scanner.js';
            const companion = document.createElement('button');
            companion.id = 'debug-companion';
            companion.textContent = 'Debug Mode';
            companion.style.cssText = 'position:fixed;right:20px;bottom:20px;padding:8px 16px;border:1px solid #374151;border-radius:20px;font-size:12px;font-weight:bold';
            document.body.appendChild(companion);

            const outer = document.createElement('outer-audit-card');
            outer.dataset.aclComponent = 'OUTER-AUDIT-CARD';
            const outerRoot = outer.attachShadow({ mode: 'open' });
            const nested = document.createElement('nested-audit-card');
            nested.dataset.aclComponent = 'NESTED-AUDIT-CARD';
            nested.attachShadow({ mode: 'open' }).innerHTML = '<button></button>';
            outerRoot.appendChild(nested);

            const light = document.createElement('light-audit-card');
            light.dataset.aclComponent = 'LIGHT-AUDIT-CARD';
            light.innerHTML = '<img src="avatar.png">';
            const failing = document.createElement('error-audit-card');
            failing.dataset.aclComponent = 'ERROR-AUDIT-CARD';
            document.body.append(outer, light, failing);

            window.failScannerAudit = true;
            window.scannerActivity = { active: 0, max: 0, events: [] };
            document.addEventListener('acl:a11y', event => {
                const component = event.composedPath().find(node => node.matches?.('[data-acl-component]'));
                if (component)
                    window.scannerActivity.events.push(component.localName);
            });
            const auditor = async (root, { basic }) => {
                window.scannerActivity.active++;
                window.scannerActivity.max = Math.max(window.scannerActivity.max, window.scannerActivity.active);
                await new Promise(resolve => setTimeout(resolve, 20));
                window.scannerActivity.active--;
                if ((root.host || root).localName === 'error-audit-card' && window.failScannerAudit)
                    throw new Error('Application auditor unavailable');
                return basic(root);
            };
            window.scanner = Scanner.mount({
                auditor,
                concurrency: 2,
                button: { companionSelector: '#debug-companion', gap: 8 },
            });
            window.ScannerModule = Scanner;
            try {
                Scanner.mount();
            } catch (error) {
                window.duplicateScannerError = error.message;
            }
        `,
    });

    await expect(page.getByRole('button', { name: 'A11y Audit' })).toBeVisible();
    const positions = await page.evaluate(() => {
        // Read the browser state
        const scanner = document.getElementById('acl-a11y-scanner-toggle').getBoundingClientRect(),
            companion = document.getElementById('debug-companion').getBoundingClientRect();
        return {
            scannerRight: scanner.right,
            scannerWidth: scanner.width,
            scannerHeight: scanner.height,
            companionLeft: companion.left,
            companionWidth: companion.width,
            companionHeight: companion.height,
        };
    });
    expect(positions.companionLeft - positions.scannerRight).toBeCloseTo(8, 0);
    expect(positions.scannerWidth).toBeCloseTo(positions.companionWidth, 0);
    expect(positions.scannerHeight).toBeCloseTo(positions.companionHeight, 0);
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.duplicateScannerError,
        ),
    ).toContain('already mounted');

    await page.getByRole('button', { name: 'A11y Audit' }).click();
    const modal = page.locator('#acl-a11y-scanner-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Scanned 4 components');
    await expect(modal).toContainText('2 findings, 1 error');
    await expect(modal).toContainText('control-name');
    await expect(modal).toContainText('image-alt');
    await expect(modal).toContainText('Application auditor unavailable');

    const firstResult = await page.evaluate(
        // Read the browser state
        () => ({
            tags: window.scanner.getResult().components.map(
                // Transform the current item
                (item) => item.tag,
            ),
            maxConcurrency: window.scannerActivity.max,
            events: window.scannerActivity.events,
        }),
    );
    expect(firstResult.tags).toEqual(['outer-audit-card', 'nested-audit-card', 'light-audit-card', 'error-audit-card']);
    expect(firstResult.maxConcurrency).toBe(2);
    expect(firstResult.events.sort()).toEqual(['light-audit-card', 'nested-audit-card', 'outer-audit-card']);

    const accessibility = await new AxeBuilder({ page }).include('#acl-a11y-scanner-modal').analyze();
    expect(
        accessibility.violations.filter(
            // Select matching items
            (item) => ['serious', 'critical'].includes(item.impact),
        ),
    ).toEqual([]);

    await page.locator('#debug-companion').focus();
    await expect(page.locator('button[aria-label="Close accessibility scanner"]')).toBeFocused();
    await page.locator('button[aria-label="Close accessibility scanner"]').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#acl-a11y-scanner-modal footer button', { hasText: 'Close' })).toBeFocused();

    await page.evaluate(() => {
        // Read the browser state
        document
            .querySelector('outer-audit-card')
            .shadowRoot.querySelector('nested-audit-card')
            .shadowRoot.querySelector('button').textContent = 'Save';
        document.querySelector('light-audit-card img').alt = 'Profile';
        window.failScannerAudit = false;
    });
    await page.getByRole('button', { name: 'Rescan' }).click();
    await expect(modal).toContainText('0 findings, 0 errors');
    await expect(modal).toContainText('No accessibility findings were detected.');

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(page.getByRole('button', { name: 'A11y Audit' })).toBeFocused();

    await page.getByRole('button', { name: 'A11y Audit' }).click();
    await expect(modal).toBeVisible();
    await modal.click({
        position: {
            x: 3,
            y: 3,
        },
    });
    await expect(modal).toBeHidden();

    expect(
        await page.evaluate(() => {
            // Read the browser state
            window.scanner.destroy();
            const removed =
                    !document.getElementById('acl-a11y-scanner-toggle') &&
                    !document.getElementById('acl-a11y-scanner-modal'),
                replacement = (window.ScannerReplacement = window.ScannerModule.mount());
            replacement.destroy();
            return removed;
        }),
    ).toBe(true);
});

test('debugger and scanner surfaces remain usable in a narrow mobile viewport', async ({ page }) => {
    // Exercise the test scenario
    await page.setViewportSize({
        width: 320,
        height: 568,
    });
    await page.goto(`${baseUrl}/blank`);
    await page.addScriptTag({
        type: 'module',
        content: `
            import Loader from '${baseUrl}/src/index.js';
            import Debugger from '${baseUrl}/src/debugger.js';
            import Scanner from '${baseUrl}/src/a11y-scanner.js';

            Debugger.inject(Loader);
            for (let index = 0; index < 24; index++) {
                const component = document.createElement('mobile-debug-card');
                component.dataset.aclComponent = 'MOBILE-DEBUG-CARD';
                component._state = 'ready';
                component.$props = { index, label: 'Mobile component ' + index };
                document.body.appendChild(component);
            }
            await Loader.toggleDebug();
            window.mobileLoader = Loader;
            window.MobileScanner = Scanner;
            window.layerScanner = Scanner.mount();
        `,
    });

    await expect(page.locator('#acl-debug-panel')).toBeVisible();
    await expect(page.locator('#acl-a11y-scanner-toggle')).toBeVisible();
    const debuggerLayout = await page.evaluate(() => {
        // Read the browser state
        const panel = document.getElementById('acl-debug-panel'),
            body = panel.querySelector('.acl-debug-panel-body'),
            close = panel.querySelector('[aria-label="Turn off debugging"]'),
            controls = panel.querySelector('.acl-debug-panel-controls'),
            lastControl = controls.lastElementChild;
        body.scrollTop = body.scrollHeight;
        const panelRect = panel.getBoundingClientRect(),
            bodyRect = body.getBoundingClientRect(),
            closeRect = close.getBoundingClientRect(),
            lastControlRect = lastControl.getBoundingClientRect();
        return {
            panel: {
                left: panelRect.left,
                top: panelRect.top,
                right: panelRect.right,
                bottom: panelRect.bottom,
            },
            viewport: {
                width: innerWidth,
                height: innerHeight,
            },
            bodyOverflowY: getComputedStyle(body).overflowY,
            bodyScrollable: body.scrollHeight > body.clientHeight,
            bodyFitsWidth: body.scrollWidth <= body.clientWidth,
            lastControlVisible: lastControlRect.top >= bodyRect.top && lastControlRect.bottom <= bodyRect.bottom + 1,
            closeWidth: closeRect.width,
            closeHeight: closeRect.height,
            panelZIndex: Number(getComputedStyle(panel).zIndex),
            scannerZIndex: Number(getComputedStyle(document.getElementById('acl-a11y-scanner-toggle')).zIndex),
        };
    });
    expect(debuggerLayout.panel.left).toBeGreaterThanOrEqual(0);
    expect(debuggerLayout.panel.top).toBeGreaterThanOrEqual(0);
    expect(debuggerLayout.panel.right).toBeLessThanOrEqual(debuggerLayout.viewport.width);
    expect(debuggerLayout.panel.bottom).toBeLessThanOrEqual(debuggerLayout.viewport.height);
    expect(debuggerLayout.bodyOverflowY).toBe('auto');
    expect(debuggerLayout.bodyScrollable).toBe(true);
    expect(debuggerLayout.bodyFitsWidth).toBe(true);
    expect(debuggerLayout.lastControlVisible).toBe(true);
    expect(debuggerLayout.closeWidth).toBeGreaterThanOrEqual(44);
    expect(debuggerLayout.closeHeight).toBeGreaterThanOrEqual(44);
    expect(debuggerLayout.scannerZIndex).toBeLessThan(debuggerLayout.panelZIndex);

    await page.evaluate(
        // Read the browser state
        () => window.layerScanner.destroy(),
    );
    await page.locator('#acl-debug-panel button[aria-label="Turn off debugging"]').click();
    await page.evaluate(() => {
        // Read the browser state
        document.querySelectorAll('mobile-debug-card').forEach(
            // Process the current item
            (component) => component.remove(),
        );
        const root = document.createElement('mobile-audit-card');
        root.dataset.aclComponent = 'MOBILE-AUDIT-CARD';
        document.body.appendChild(root);
        window.mobileScanner = window.MobileScanner.mount({
            root,
            // Run the auditor operation
            auditor: () =>
                Array.from(
                    { length: 28 },
                    // Transform the current item
                    (_, index) => ({
                        rule: 'mobile-rule-' + index,
                        severity: 'serious',
                        selector: '#mobile-target-' + 'x'.repeat(80),
                        remediation: 'Provide an accessible mobile treatment for finding ' + index,
                    }),
                ),
        });
    });
    await page.getByRole('button', { name: 'A11y Audit' }).click();

    const modal = page.locator('#acl-a11y-scanner-modal');
    await expect(modal).toContainText('28 findings');
    const scannerLayout = await page.evaluate(() => {
        // Read the browser state
        const dialog = document.querySelector('.acl-a11y-scanner-dialog'),
            results = document.querySelector('.acl-a11y-scanner-results'),
            footer = document.querySelector('.acl-a11y-scanner-footer'),
            close = document.querySelector('.acl-a11y-scanner-close'),
            footerButton = footer.querySelector('button'),
            dialogRect = dialog.getBoundingClientRect(),
            resultsRect = results.getBoundingClientRect(),
            footerRect = footer.getBoundingClientRect(),
            closeRect = close.getBoundingClientRect(),
            footerButtonRect = footerButton.getBoundingClientRect();
        return {
            dialog: {
                left: dialogRect.left,
                top: dialogRect.top,
                right: dialogRect.right,
                bottom: dialogRect.bottom,
            },
            viewport: {
                width: innerWidth,
                height: innerHeight,
            },
            resultsScrollable: results.scrollHeight > results.clientHeight,
            resultsFitsWidth: results.scrollWidth <= results.clientWidth,
            resultsAboveFooter: resultsRect.bottom <= footerRect.top + 1,
            footerVisible: footerRect.top >= 0 && footerRect.bottom <= innerHeight,
            closeWidth: closeRect.width,
            closeHeight: closeRect.height,
            footerButtonHeight: footerButtonRect.height,
        };
    });
    expect(scannerLayout.dialog.left).toBeGreaterThanOrEqual(0);
    expect(scannerLayout.dialog.top).toBeGreaterThanOrEqual(0);
    expect(scannerLayout.dialog.right).toBeLessThanOrEqual(scannerLayout.viewport.width);
    expect(scannerLayout.dialog.bottom).toBeLessThanOrEqual(scannerLayout.viewport.height);
    expect(scannerLayout.resultsScrollable).toBe(true);
    expect(scannerLayout.resultsFitsWidth).toBe(true);
    expect(scannerLayout.resultsAboveFooter).toBe(true);
    expect(scannerLayout.footerVisible).toBe(true);
    expect(scannerLayout.closeWidth).toBeGreaterThanOrEqual(44);
    expect(scannerLayout.closeHeight).toBeGreaterThanOrEqual(44);
    expect(scannerLayout.footerButtonHeight).toBeGreaterThanOrEqual(44);

    await page.setViewportSize({
        width: 568,
        height: 320,
    });
    const scannerLandscape = await page.evaluate(() => {
        // Read the browser state
        const dialog = document.querySelector('.acl-a11y-scanner-dialog').getBoundingClientRect(),
            footer = document.querySelector('.acl-a11y-scanner-footer').getBoundingClientRect();
        return {
            dialog: {
                left: dialog.left,
                top: dialog.top,
                right: dialog.right,
                bottom: dialog.bottom,
            },
            footerVisible: footer.top >= 0 && footer.bottom <= innerHeight,
            viewport: {
                width: innerWidth,
                height: innerHeight,
            },
        };
    });
    expect(scannerLandscape.dialog.left).toBeGreaterThanOrEqual(0);
    expect(scannerLandscape.dialog.top).toBeGreaterThanOrEqual(0);
    expect(scannerLandscape.dialog.right).toBeLessThanOrEqual(scannerLandscape.viewport.width);
    expect(scannerLandscape.dialog.bottom).toBeLessThanOrEqual(scannerLandscape.viewport.height);
    expect(scannerLandscape.footerVisible).toBe(true);

    await page.evaluate(
        // Read the browser state
        () => window.mobileScanner.destroy(),
    );
    await page.evaluate(
        // Read the browser state
        () => window.mobileLoader.toggleDebug(),
    );
    await expect(page.locator('#acl-debug-panel')).toBeVisible();
    const debuggerLandscape = await page.evaluate(() => {
        // Read the browser state
        const panel = document.getElementById('acl-debug-panel'),
            body = panel.querySelector('.acl-debug-panel-body'),
            rect = panel.getBoundingClientRect();
        return {
            panel: {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
            },
            bodyOverflowY: getComputedStyle(body).overflowY,
            bodyScrollable: body.scrollHeight > body.clientHeight,
            viewport: {
                width: innerWidth,
                height: innerHeight,
            },
        };
    });
    expect(debuggerLandscape.panel.left).toBeGreaterThanOrEqual(0);
    expect(debuggerLandscape.panel.top).toBeGreaterThanOrEqual(0);
    expect(debuggerLandscape.panel.right).toBeLessThanOrEqual(debuggerLandscape.viewport.width);
    expect(debuggerLandscape.panel.bottom).toBeLessThanOrEqual(debuggerLandscape.viewport.height);
    expect(debuggerLandscape.bodyOverflowY).toBe('auto');
    expect(debuggerLandscape.bodyScrollable).toBe(true);
    await page.locator('#acl-debug-panel button[aria-label="Turn off debugging"]').click();
});
