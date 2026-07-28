import { expect, test, preparePage, projectRoot, featureLabPath } from './fixtures/loader.js';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

let baseUrl, counts;
test.beforeAll(async ({ loaderServer }) => {
    // Prepare the test group
    ({ baseUrl, counts } = loaderServer);
});

const openRealFeatureLab = async (page, { hash = '' } = {}) => {
    // Open real feature lab
    const errors = [],
        alpineSource = await readFile(join(projectRoot, 'node_modules/alpinejs-315/dist/cdn.min.js'), 'utf8'),
        fontAwesomeUrl = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
        confettiUrl = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
    page.on(
        'pageerror',
        // Handle the pageerror event
        (error) => errors.push(error.message),
    );
    page.on('console', (message) => {
        // Handle the console event
        if (message.type() === 'error') errors.push(message.text());
    });
    await page.route('https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js', (route) => {
        // Fulfill the routed Alpine request from the local fixture
        return route.fulfill({
            contentType: 'text/javascript',
            body: alpineSource,
        });
    });
    await page.route(fontAwesomeUrl, (route) => {
        // Fulfill the routed Font Awesome request from the local fixture
        return route.fulfill({
            contentType: 'text/css',
            body: '.fa-brands{display:inline-block}.fa-github::before{content:"GH"}.fa-facebook::before{content:"FB"}.fa-youtube::before{content:"YT"}',
        });
    });
    await page.route(confettiUrl, (route) => {
        // Fulfill the routed confetti request from the local fixture
        return route.fulfill({
            contentType: 'text/javascript',
            body: 'window.confetti = function () { window.__aclConfettiCalls = (window.__aclConfettiCalls || 0) + 1; };',
        });
    });
    await page.goto(`${baseUrl}${featureLabPath}${hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
        // Check whether the expected browser state is ready
        const adapters = Array.from(
            document.querySelectorAll('local-adapter-note, session-adapter-note, indexeddb-adapter-note'),
        );
        return (
            window.Alpine?.version &&
            document.querySelector('site-footer')?._state === 'ready' &&
            document.querySelector('response-stream-demo')?.$props.payload &&
            adapters.length === 3 &&
            adapters.every(
                // Check every item
                (element) => element._state === 'ready' && element.$props.$persistence,
            )
        );
    });
    return errors;
};

const assertFeatureSectionRange = async (page, start, end) => {
    // Run the assert feature section range operation
    const sections = page.locator('main section:not(.lab-overview)');
    // Iterate over the indexed values
    for (let number = start; number <= end; number++) {
        const section = sections.nth(number - 1),
            details = section.locator('details');
        await expect(section.locator('h2')).toContainText(`${number}.`);
        await expect(section).toBeVisible();
        await expect(details.locator('summary')).toHaveText('Example usage');
        await details.evaluate((element) => {
            // Read the browser state
            element.open = true;
        });
        await expect(details.locator('pre')).toBeVisible();
        await details.evaluate((element) => {
            // Read the browser state
            element.open = false;
        });
    }
};

test.describe('feature lab pages', () => {
    // Define the test group
    test.describe.configure({ mode: 'parallel' });

    test('feature lab loads main showcases without console errors', async ({ page }) => {
        // Exercise the test scenario
        const errors = [],
            alpineSource = await readFile(join(projectRoot, 'node_modules/alpinejs-315/dist/cdn.min.js'), 'utf8'),
            fontAwesomeUrl = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
            confettiUrl = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js',
            externalRequests = [],
            packageRequests = [];
        page.on('console', (msg) => {
            // Handle the console event
            if (msg.type() === 'error') errors.push(msg.text());
        });
        page.on(
            'pageerror',
            // Handle the pageerror event
            (error) => errors.push(error.message),
        );
        page.on('request', (request) => {
            // Record the local package family selected by the checked-in import map
            const pathname = new URL(request.url()).pathname;
            if (pathname.startsWith('/__acl_hmr/modules/')) packageRequests.push(pathname);
        });
        await page.route('https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js', (route) => {
            // Fulfill the routed Alpine request from the local fixture
            return route.fulfill({
                contentType: 'text/javascript',
                body: alpineSource,
            });
        });
        await page.route(fontAwesomeUrl, (route) => {
            // Handle the routed request
            externalRequests.push('fontawesome');
            return route.fulfill({
                contentType: 'text/css',
                body: '.fa-brands{display:inline-block}.fa-github::before{content:"GH"}.fa-facebook::before{content:"FB"}.fa-youtube::before{content:"YT"}',
            });
        });
        await page.route(confettiUrl, (route) => {
            // Handle the routed request
            externalRequests.push('confetti');
            return route.fulfill({
                contentType: 'text/javascript',
                body: 'window.confetti = function () { window.__aclConfettiCalls = (window.__aclConfettiCalls || 0) + 1; };',
            });
        });

        await page.goto(`${baseUrl}${featureLabPath}`, { waitUntil: 'domcontentloaded' });
        await page
            .waitForFunction(
                // Check whether the expected browser state is ready
                () =>
                    customElements.get('acl-component') && document.querySelector('advanced-fetch')?._state === 'ready',
                null,
                { timeout: 15_000 },
            )
            .catch(async (error) => {
                // Handle the rejected operation
                const state = await page.evaluate(
                    // Read the browser state
                    () => ({
                        hasLoader: Boolean(window.AlpineComponentLoader),
                        hasAclComponent: Boolean(customElements.get('acl-component')),
                        advancedExists: Boolean(document.querySelector('advanced-fetch')),
                        advancedInitialized: document.querySelector('advanced-fetch')?._state === 'ready',
                        advancedLoading: ['deferred', 'loading'].includes(
                            document.querySelector('advanced-fetch')?._state,
                        ),
                        advancedError: document.querySelector('advanced-fetch')?.$props?.$error,
                        registered: window.AlpineComponentLoader?.getRegisteredTags?.(),
                    }),
                );
                throw new Error(
                    `${error.message}\n${JSON.stringify(
                        {
                            state,
                            errors,
                        },
                        null,
                        2,
                    )}`,
                );
            });
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => document.querySelector('loading-demo')?._state === 'ready',
        );
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () =>
                document.querySelector('external-icon')?._state === 'ready' &&
                document.querySelector('confetti-btn')?._state === 'ready',
        );
        await page.evaluate(
            // Read the browser state
            () => window.AlpineComponentLoader.toggleDebug(),
        );
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => document.getElementById('acl-debug-panel')?.textContent.includes('Live components'),
        );
        await page.locator('#acl-debug-panel button[data-acl-debug-id]', { hasText: '<advanced-fetch>' }).click();
        await expect(page.locator('#acl-debug-panel')).toContainText('Selected: <advanced-fetch>');
        await expect(page.locator('#acl-debug-panel')).not.toContainText('Selected: <site-header>');
        await page.evaluate(
            // Read the browser state
            () => window.AlpineComponentLoader.toggleDebug(),
        );
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () =>
                [
                    'response-json-demo',
                    'response-text-demo',
                    'response-auto-demo',
                    'response-blob-demo',
                    'response-buffer-demo',
                    'response-stream-demo',
                    'response-custom-demo',
                ].every(
                    // Check every item
                    (tag) =>
                        document.querySelector(tag)?._state === 'ready' && document.querySelector(tag)?.$props.payload,
                ),
        );
        await page.waitForFunction(() => {
            // Check whether the expected browser state is ready
            const adapters = Array.from(
                document.querySelectorAll('local-adapter-note, session-adapter-note, indexeddb-adapter-note'),
            );
            return (
                adapters.length === 3 &&
                adapters.every(
                    // Check every item
                    (element) => element._state === 'ready' && element.$props.note?.includes('v1 → v2'),
                )
            );
        });
        await page.evaluate(async () => {
            // Read the browser state
            await window.demoRegistry();
            await window.demoTemplateCache();
            await window.demoAccessibility();
            await window.demoObserveTemplate();
            window.demoDiagnostics();
            const propsDemo = document.getElementById('advanced-props');
            propsDemo.score = 88;
            window.toggleUsagePanels(true);
        });
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => document.querySelector('observed-card')?._state === 'ready',
        );
        await page.evaluate(
            // Read the browser state
            () => window.scrollTo(0, document.body.scrollHeight),
        );
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => document.querySelector('site-footer')?._state === 'ready',
        );

        const state = await page.evaluate(
            // Read the browser state
            () => ({
                title:
                    document.querySelector('site-header')?.shadowRoot?.querySelector('h1')?.textContent ||
                    document.querySelector('h1')?.textContent,
                header: document.querySelector('site-header')?._state === 'ready',
                footer: document.querySelector('site-footer')?._state === 'ready',
                grouped: document.querySelector('grouped-card')?._state === 'ready',
                advanced: document.querySelector('advanced-fetch')?.$props.audit?.id,
                safeScript: window.__unsafeDemoScript === true,
                panel: document.getElementById('acl-debug-panel')?.textContent.includes('Data cache entries'),
                featureLab: {
                    jumpOptions: document.querySelectorAll('#feature-jump option').length,
                    usageDrawers: document.querySelectorAll('main section:not(.lab-overview) details').length,
                    openUsageDrawers: document.querySelectorAll('main section:not(.lab-overview) details[open]').length,
                    registry: document.getElementById('registry-output')?.textContent,
                    templateCache: document.getElementById('template-cache-output')?.textContent,
                    accessibility: document.getElementById('accessibility-output')?.textContent,
                    a11yLoaded: typeof window.ACLA11y?.observe === 'function',
                    observed: document.querySelector('observed-card')?._state === 'ready',
                    diagnostics: document.getElementById('diagnostics-output')?.textContent,
                    advancedScore: document.getElementById('advanced-props')?.$props.score,
                    reflectedScore: document.getElementById('advanced-props')?.getAttribute('score'),
                    responseValues: Array.from(
                        document.querySelectorAll(
                            [
                                'response-json-demo',
                                'response-text-demo',
                                'response-auto-demo',
                                'response-blob-demo',
                                'response-buffer-demo',
                                'response-stream-demo',
                                'response-custom-demo',
                            ].join(','),
                        ),
                    ).map(
                        // Transform the current item
                        (element) => element.$props?.payload,
                    ),
                    migratedNotes: Array.from(
                        document.querySelectorAll('local-adapter-note, session-adapter-note, indexeddb-adapter-note'),
                    ).map(
                        // Transform the current item
                        (element) => element.$props.note,
                    ),
                    customSanitized: Boolean(
                        document
                            .querySelector('custom-sanitizer-demo')
                            ?.shadowRoot?.querySelector('[data-sanitized="custom"]'),
                    ),
                    privateNodeRemoved: !document
                        .querySelector('custom-sanitizer-demo')
                        ?.shadowRoot?.querySelector('[data-private]'),
                },
                external: {
                    fontawesomeHead: Array.from(document.head.querySelectorAll('link')).some(
                        // Check the current item
                        (link) =>
                            link.href === 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
                    ),
                    fontawesomeShadow: Boolean(
                        document
                            .querySelector('external-icon')
                            ?.shadowRoot?.querySelector(
                                'link[href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"]',
                            ),
                    ),
                    confettiScript: Array.from(document.scripts).some(
                        // Check the current item
                        (script) =>
                            script.src ===
                            'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js',
                    ),
                    confettiReady: typeof window.confetti === 'function',
                    confettiText: document.querySelector('confetti-btn')?.shadowRoot?.textContent || '',
                },
                lightAlerts: Array.from(document.querySelectorAll('light-alert')).map(
                    // Transform the current item
                    (alert) => ({
                        type: alert.getAttribute('type'),
                        backgroundColor: getComputedStyle(alert).backgroundColor,
                        borderLeftColor: getComputedStyle(alert).borderLeftColor,
                        color: getComputedStyle(alert).color,
                    }),
                ),
                headings: Array.from(document.querySelectorAll('main h2')).map(
                    // Transform the current item
                    (node) => node.textContent.trim(),
                ),
                sourceDrawers: Array.from(document.querySelectorAll('main section:not(.lab-overview)')).map(
                    // Transform the current item
                    (section) => ({
                        heading: section.querySelector('h2')?.textContent.trim(),
                        hasSource: section.querySelector('details summary')?.textContent.trim() === 'Example usage',
                    }),
                ),
            }),
        );

        expect({
            title: state.title,
            header: state.header,
            footer: state.footer,
            grouped: state.grouped,
            advanced: state.advanced,
            safeScript: state.safeScript,
            panel: state.panel,
        }).toEqual({
            title: 'AlpineComponentLoader',
            header: true,
            footer: true,
            grouped: true,
            advanced: '42',
            safeScript: false,
            panel: true,
        });
        expect(externalRequests).toEqual(expect.arrayContaining(['fontawesome', 'confetti']));
        expect(state.external).toEqual({
            fontawesomeHead: true,
            fontawesomeShadow: true,
            confettiScript: true,
            confettiReady: true,
            confettiText: expect.stringContaining('Confetti script loaded:'),
        });
        expect(state.featureLab).toEqual(
            expect.objectContaining({
                jumpOptions: 39,
                usageDrawers: 38,
                openUsageDrawers: 38,
                observed: true,
                advancedScore: 88,
                reflectedScore: '88',
                customSanitized: true,
                privateNodeRemoved: true,
                migratedNotes: [
                    expect.stringContaining('v1 → v2'),
                    expect.stringContaining('v1 → v2'),
                    expect.stringContaining('v1 → v2'),
                ],
                registry: expect.stringContaining('"directDependencies"'),
                templateCache: expect.stringContaining('"entries"'),
                accessibility: expect.stringContaining('"component": "a11y-issues-demo"'),
                a11yLoaded: true,
                diagnostics: expect.stringContaining('"schemaVersion": 1'),
            }),
        );
        expect(state.featureLab.registry).toContain('"manifest-base"');
        expect(state.featureLab.templateCache).toContain('"revision": "feature-lab-cache-v1"');
        expect(state.featureLab.accessibility).toContain('"violations"');
        expect(state.featureLab.accessibility).toContain('"image-alt"');
        expect(state.featureLab.responseValues).toHaveLength(7);
        expect(state.featureLab.responseValues.every(Boolean)).toBe(true);
        expect(state.lightAlerts).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'success',
                    backgroundColor: 'rgb(240, 253, 244)',
                    borderLeftColor: 'rgb(22, 163, 74)',
                }),
                expect.objectContaining({
                    type: 'error',
                    backgroundColor: 'rgb(254, 242, 242)',
                    borderLeftColor: 'rgb(220, 38, 38)',
                }),
                expect.objectContaining({
                    type: 'warning',
                    backgroundColor: 'rgb(255, 251, 235)',
                    borderLeftColor: 'rgb(217, 119, 6)',
                }),
                expect.objectContaining({
                    type: 'info',
                    backgroundColor: 'rgb(240, 249, 255)',
                    borderLeftColor: 'rgb(2, 132, 199)',
                }),
            ]),
        );
        expect(
            new Set(
                state.lightAlerts.map(
                    // Transform the current item
                    (alert) => alert.backgroundColor,
                ),
            ).size,
        ).toBeGreaterThanOrEqual(4);
        expect(state.headings).toEqual(
            expect.arrayContaining([
                expect.stringContaining('1. Inline Templates'),
                expect.stringContaining('2. Shadow DOM & Typed Props'),
                expect.stringContaining('3. Lifecycle Hooks'),
                expect.stringContaining('4. External Dependencies'),
                expect.stringContaining('5. Strict Validation'),
                expect.stringContaining('6. Light DOM Slots'),
                expect.stringContaining('7. Lazy Loading'),
                expect.stringContaining('8. Declarative Loading'),
                expect.stringContaining('9. Declarative Fetching'),
                expect.stringContaining('10. Global Store Binding'),
                expect.stringContaining('11. Error Boundaries'),
                expect.stringContaining('12. Idle Loading'),
                expect.stringContaining('13. Dynamic Component Switching'),
                expect.stringContaining('14. Emits Helper'),
                expect.stringContaining('15. Shared Constructible Stylesheets'),
                expect.stringContaining('16. State Persistence'),
                expect.stringContaining('17. Grouped Data API'),
                expect.stringContaining('18. Source Resolver and Base Path'),
                expect.stringContaining('19. Advanced Data Fetching'),
                expect.stringContaining('20. Template and Data Cache Controls'),
                expect.stringContaining('21. Loading Templates and Safe Mode'),
                expect.stringContaining('22. Mapped Event Forwarding'),
                expect.stringContaining('23. Floating Debugger Panel'),
                expect.stringContaining('24. Registry, Manifests, Prefetch & Template Observation'),
                expect.stringContaining('25. Advanced Prop Contracts'),
                expect.stringContaining('26. Response Types & Custom Parsers'),
                expect.stringContaining('27. Polling, Cancellation & Recovery'),
                expect.stringContaining('28. Runtime Events & Typed Errors'),
                expect.stringContaining('29. Async Lifecycle, Cleanup & Keep-Alive'),
                expect.stringContaining('30. Dynamic Transitions, Focus & Bounded Keep-Alive'),
                expect.stringContaining('31. Persistence Adapters & Schema Migration'),
                expect.stringContaining('32. Sanitization, CSP & Asset Descriptors'),
                expect.stringContaining('33. Diagnostics, Cache Introspection & Export'),
                expect.stringContaining('34. Entry Points, SSR, HMR & TypeScript'),
                expect.stringContaining('35. Adaptive Prefetch'),
                expect.stringContaining('36. Structured Observability & Performance Metrics'),
                expect.stringContaining('37. Trusted Types & URL Policies'),
                expect.stringContaining('38. Browser Testing Utilities'),
            ]),
        );
        expect(state.sourceDrawers).toHaveLength(38);
        expect(
            state.sourceDrawers.filter(
                // Select matching items
                (item) => !item.hasSource,
            ),
        ).toEqual([]);
        const scannerExample = await page.evaluate(async () => {
            // Read the browser state
            const result = await window.__aclAccessibilityScanner.scan(),
                component = result.components.find(
                    // Find the matching item
                    (item) => item.tag === 'a11y-issues-demo',
                );
            return {
                componentCount: result.componentCount,
                errorCount: result.errorCount,
                tag: component?.tag,
                rules:
                    component?.violations.map(
                        // Run the scanner example operation
                        (item) => item.rule,
                    ) || [],
            };
        });
        expect(scannerExample).toEqual({
            componentCount: expect.any(Number),
            errorCount: 0,
            tag: 'a11y-issues-demo',
            rules: ['image-alt', 'control-name', 'form-label', 'positive-tabindex', 'aria-hidden-focus'],
        });
        expect(scannerExample.componentCount).toBeGreaterThan(1);

        const accessibility = await new AxeBuilder({ page }).exclude('#acl-debug-panel').analyze(),
            seriousNodes = accessibility.violations
                .filter(
                    // Select matching items
                    (violation) => ['serious', 'critical'].includes(violation.impact),
                )
                .flatMap(
                    // Expand the current item
                    (violation) =>
                        violation.nodes.map(
                            // Transform the current item
                            (node) => ({
                                id: violation.id,
                                target: node.target,
                            }),
                        ),
                ),
            intentionalNodes = seriousNodes.filter(
                // Select matching items
                (node) => JSON.stringify(node.target).includes('a11y-issues-demo'),
            ),
            unexpectedNodes = seriousNodes.filter(
                // Select matching items
                (node) => !JSON.stringify(node.target).includes('a11y-issues-demo'),
            );
        expect(
            intentionalNodes
                .map(
                    // Transform the current item
                    (node) => node.id,
                )
                .sort(),
        ).toEqual(['aria-hidden-focus', 'button-name', 'image-alt', 'tabindex']);
        expect(unexpectedNodes).toEqual([]);
        expect(packageRequests.length).toBeGreaterThan(8);
        expect(
            packageRequests.every(
                // Keep the example's entry points and deferred descendants in one minified family
                (pathname) => pathname.endsWith('.min.js'),
            ),
        ).toBe(true);
        expect(errors).toEqual([]);
    });

    test('complete feature lab runs with real Alpine and interactive bindings', async ({ page }) => {
        // Exercise the test scenario
        const errors = [],
            alpineSource = await readFile(join(projectRoot, 'node_modules/alpinejs-315/dist/cdn.min.js'), 'utf8'),
            fontAwesomeUrl = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
            confettiUrl = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
        page.on(
            'pageerror',
            // Handle the pageerror event
            (error) => errors.push(error.message),
        );
        page.on('console', (message) => {
            // Handle the console event
            if (message.type() === 'error') errors.push(message.text());
        });
        await page.route('https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js', (route) => {
            // Fulfill the routed Alpine request from the local fixture
            return route.fulfill({
                contentType: 'text/javascript',
                body: alpineSource,
            });
        });
        await page.route(fontAwesomeUrl, (route) => {
            // Fulfill the routed Font Awesome request from the local fixture
            return route.fulfill({
                contentType: 'text/css',
                body: '.fa-brands{display:inline-block}.fa-github::before{content:"GH"}.fa-facebook::before{content:"FB"}.fa-youtube::before{content:"YT"}',
            });
        });
        await page.route(confettiUrl, (route) => {
            // Fulfill the routed confetti request from the local fixture
            return route.fulfill({
                contentType: 'text/javascript',
                body: 'window.confetti = function () {};',
            });
        });

        await page.goto(`${baseUrl}${featureLabPath}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () =>
                window.Alpine?.version &&
                document.querySelector('inline-counter')?._state === 'ready' &&
                document.querySelector('response-stream-demo')?.$props.payload,
        );

        const counter = page.locator('inline-counter').first();
        await counter.locator('button').click();
        await expect(counter.locator('.count-badge')).toHaveText('1');

        const stores = page.locator('store-display');
        await stores.first().locator('button').click();
        await expect(stores.nth(1).locator('h3')).toContainText('Dark');

        await page.locator('#advanced-props').evaluate((element) => {
            // Read the browser state
            element.score = 91;
        });
        await expect(page.locator('#advanced-props')).toHaveAttribute('score', '91');

        await page.locator('async-lifecycle-demo').getByRole('button', { name: 'Reload and run cleanup' }).click();
        await expect(page.locator('#lifecycle-cleanup-count')).toHaveText('1');
        const lifecyclePanel = page.locator('#async-lifecycle-panel'),
            lifecycleToggle = lifecyclePanel.getByRole('button', { name: 'Toggle lifecycle component' });
        await lifecycleToggle.click();
        await expect
            .poll(
                // Read the state under test
                () =>
                    lifecyclePanel.locator('acl-dynamic').evaluate(
                        // Read the browser state
                        (element) => element.firstElementChild?.localName,
                    ),
            )
            .toBe('dynamic-a');
        await lifecycleToggle.click();
        await expect(page.locator('#lifecycle-cleanup-count')).toHaveText('2');

        const adapterNotes = [
            ['local-adapter-note', 'localStorage'],
            ['session-adapter-note', 'sessionStorage'],
            ['indexeddb-adapter-note', 'IndexedDB'],
        ];
        // Process each entry
        for (const [selector, label] of adapterNotes) {
            const adapterNote = page.locator(selector);
            await adapterNote
                .getByRole('textbox', { name: 'Persistent note' })
                .fill(`Flushed ${label} from the feature lab`);
            await adapterNote.getByRole('button', { name: /^Count/ }).click();
        }
        await page.getByRole('button', { name: 'Flush all adapters' }).click();
        await expect(page.locator('#adapter-output')).toContainText('Flushed current props:');
        // Process each entry
        for (const [, label] of adapterNotes)
            await expect(page.locator('#adapter-output')).toContainText(`Flushed ${label} from the feature lab`);
        await expect(page.locator('#adapter-output')).toContainText('"version": 2');

        const cacheDemo = page.locator('cache-control-demo'),
            initialCacheCount = await cacheDemo.evaluate(
                // Read the browser state
                (element) => element.$props.payload.count,
            );
        await cacheDemo.getByRole('button', { name: 'Clear data cache' }).click();
        await expect
            .poll(
                // Read the state under test
                () =>
                    cacheDemo.evaluate(
                        // Read the browser state
                        (element) => element.$props.payload,
                    ),
            )
            .toBeNull();
        await cacheDemo.getByRole('button', { name: 'Reload' }).click();
        await expect
            .poll(
                // Read the state under test
                () =>
                    cacheDemo.evaluate(
                        // Read the browser state
                        (element) => element.$props.payload?.count || 0,
                    ),
                { timeout: 15000 },
            )
            .toBe(1);
        expect(initialCacheCount).toBeGreaterThanOrEqual(1);
        expect(await page.locator('#feature-jump option').count()).toBe(39);
        expect(errors).toEqual([]);
    });

    test('feature lab sections 1-9 exercise templates, props, lifecycle, assets, slots, and declarative loading', async ({
        page,
    }) => {
        // Exercise the test scenario
        const errors = await openRealFeatureLab(page);
        await assertFeatureSectionRange(page, 1, 9);

        const inline = page.locator('inline-counter').first();
        await inline.getByRole('button').click();
        await expect(inline.locator('.count-badge')).toHaveText('1');

        const shadow = page.locator('shadow-card').first();
        await shadow.evaluate((element) => {
            // Read the browser state
            element.setAttribute('title', 'Updated shadow title');
            element.setAttribute('active', 'false');
        });
        await expect
            .poll(
                // Read the state under test
                () =>
                    shadow.evaluate(
                        // Read the browser state
                        (element) => ({
                            title: element.$props.title,
                            active: element.$props.active,
                        }),
                    ),
            )
            .toEqual({
                title: 'Updated shadow title',
                active: false,
            });

        const lifecycle = page.locator('lifecycle-log');
        await lifecycle.getByRole('button', { name: 'Update title' }).click();
        await expect
            .poll(
                // Read the state under test
                () =>
                    lifecycle.evaluate(
                        // Read the browser state
                        (element) => element.$props.logs,
                    ),
            )
            .toContain('updated:title');

        await page.locator('confetti-btn').getByRole('button', { name: 'Party Time' }).click();
        await expect
            .poll(
                // Read the state under test
                () =>
                    page.evaluate(
                        // Read the browser state
                        () => ({
                            clicks: window.__aclConfettiClicks,
                            calls: window.__aclConfettiCalls,
                        }),
                    ),
            )
            .toEqual({
                clicks: 1,
                calls: 1,
            });

        const progress = page.locator('strict-progress').first();
        await progress.evaluate(
            // Read the browser state
            (element) => element.setAttribute('percent', '45'),
        );
        await expect
            .poll(
                // Read the state under test
                () =>
                    progress.evaluate(
                        // Read the browser state
                        (element) => element.$props.percent,
                    ),
            )
            .toBe(45);

        const alert = page.locator('light-alert').first();
        await alert.evaluate((element) => {
            // Read the browser state
            const node = document.createElement('span');
            node.slot = 'title';
            node.textContent = 'Dynamically slotted';
            element.appendChild(node);
        });
        await expect(alert.locator('[data-acl-slot="title"]')).toContainText('Dynamically slotted');

        const lazy = page.locator('lazy-image').first();
        await lazy.evaluate(
            // Read the browser state
            (element) => element.reload(),
        );
        await expect
            .poll(
                // Read the state under test
                () =>
                    lazy.evaluate(
                        // Read the browser state
                        (element) => element._state === 'ready',
                    ),
            )
            .toBe(true);

        const declarative = page.locator('declarative-card').first();
        await declarative.evaluate(
            // Read the browser state
            (element) => element.setAttribute('title', 'Declarative update'),
        );
        await expect
            .poll(
                // Read the state under test
                () =>
                    declarative.evaluate(
                        // Read the browser state
                        (element) => element.$props.title,
                    ),
            )
            .toBe('Declarative update');

        const users = page.locator('api-user');
        await expect
            .poll(
                // Read the state under test
                () =>
                    users.first().evaluate(
                        // Read the browser state
                        (element) => element.$props.$data?.name,
                    ),
            )
            .toBe('Ada Lovelace');
        await expect
            .poll(
                // Read the state under test
                () =>
                    users.nth(1).evaluate(
                        // Read the browser state
                        (element) => element.$props.$data?.name,
                    ),
            )
            .toBe('Grace Hopper');
        await expect(users.nth(1).locator('.username')).toHaveText('@grace-hopper');
        await expect(users.nth(1).locator('.detail-row').last()).toContainText('United States Navy');
        expect(errors).toEqual([]);
    });

    test('feature lab sections 10-18 exercise stores, fallback, scheduling, dynamics, events, styles, persistence, and sources', async ({
        page,
    }) => {
        // Exercise the test scenario
        const errors = await openRealFeatureLab(page);
        await assertFeatureSectionRange(page, 10, 18);

        const stores = page.locator('store-display');
        await stores.first().getByRole('button').click();
        await expect(stores.nth(1).locator('h3')).toContainText('Dark');

        const boundary = page.locator('boundary-demo');
        await boundary.evaluate(
            // Read the browser state
            (element) => element.reload(),
        );
        await expect
            .poll(
                // Read the state under test
                () =>
                    boundary.evaluate(
                        // Read the browser state
                        (element) => element._state === 'ready',
                    ),
            )
            .toBe(true);

        const idle = page.locator('idle-card');
        await idle.evaluate(
            // Read the browser state
            (element) => element.reload(),
        );
        await expect
            .poll(
                // Read the state under test
                () =>
                    idle.evaluate(
                        // Read the browser state
                        (element) => element._state === 'ready',
                    ),
            )
            .toBe(true);

        const classicSelect = page.getByRole('combobox', { name: 'Classic dynamic component' });
        await classicSelect.selectOption('inline-counter');
        await expect
            .poll(
                // Read the state under test
                () =>
                    classicSelect
                        .locator('xpath=../..')
                        .locator('acl-dynamic')
                        .evaluate(
                            // Read the browser state
                            (element) => element.firstElementChild?.localName,
                        ),
            )
            .toBe('inline-counter');

        await page.locator('emit-demo').getByRole('button', { name: 'Emit Event' }).click();
        await expect(
            page
                .locator('emit-demo')
                .locator('xpath=..')
                .getByText(/Event Output:/),
        ).toContainText('Hello from Shadow DOM!');

        const sharedStyles = page.locator('shared-style-demo');
        expect(
            await sharedStyles.evaluateAll(
                // Read the matching browser state
                (elements) =>
                    elements.length === 2 &&
                    elements[0].shadowRoot.adoptedStyleSheets[0] === elements[1].shadowRoot.adoptedStyleSheets[0],
            ),
        ).toBe(true);
        await sharedStyles.first().evaluate(
            // Read the browser state
            (element) => element.reload(),
        );
        expect(
            await sharedStyles.evaluateAll(
                // Read the matching browser state
                (elements) =>
                    elements[0].shadowRoot.adoptedStyleSheets[0] === elements[1].shadowRoot.adoptedStyleSheets[0],
            ),
        ).toBe(true);

        const persistenceExamples = [
            ['local', 'localStorage'],
            ['session', 'sessionStorage'],
            ['indexeddb', 'IndexedDB'],
        ];
        // Process each entry
        for (const [mode, label] of persistenceExamples) {
            const persistent = page.locator(`persistent-note[persist="${mode}"]`),
                note = `Section sixteen ${label}`;
            await persistent.getByRole('textbox', { name: 'Persistent note' }).fill(note);
            await persistent.getByRole('button', { name: `Flush ${label}` }).click();
            await expect(persistent.getByRole('status')).toContainText(`Flushed ${label}`);
            await expect
                .poll(
                    // Read the state under test
                    () =>
                        persistent.evaluate(
                            // Read the browser state
                            (element) => element.$props.$persistence.$get('note'),
                        ),
                )
                .toBe(note);
            await persistent.getByRole('button', { name: `Clear ${label}` }).click();
            await expect(persistent.getByRole('status')).toContainText(`Cleared ${label} record`);
            await expect
                .poll(
                    // Read the state under test
                    () =>
                        persistent.evaluate(
                            // Read the browser state
                            (element) => element.$props.$persistence.$get(),
                        ),
                )
                .toBeNull();
        }

        const grouped = page.locator('grouped-card');
        await grouped.evaluate(
            // Read the browser state
            (element) => element.reload(),
        );
        expect(
            await grouped.evaluate(
                // Read the browser state
                (element) => element._state === 'ready',
            ),
        ).toBe(true);
        expect(
            await grouped.evaluate(
                // Read the browser state
                (element) => element.$props.payload,
            ),
        ).toBe('Decoded text response');

        const source = page.locator('source-demo');
        await source.evaluate(
            // Read the browser state
            (element) => element.reload(),
        );
        const resolvedSource = await page.evaluate(
            // Resolve the documented absolute base path from the active staged document
            () => new URL('./components/source-result.html', document.baseURI).href,
        );
        expect(
            await page.evaluate(
                // Read the browser state
                () => window.AlpineComponentLoader.getDefinition('source-demo').source,
            ),
        ).toBe(resolvedSource);
        expect(errors).toEqual([]);
    });

    test('feature lab sections 19-26 exercise fetch, cache, safety, forwarding, debugger, registry, props, and parsers', async ({
        page,
    }) => {
        // Exercise the test scenario
        const errors = await openRealFeatureLab(page, { hash: '#feature-23' }),
            featureLinks = page.locator('main > section:not(.lab-overview) > h2 > a.feature-heading-link'),
            feature23 = page.locator('#feature-23'),
            feature24Link = page.locator('#feature-24 > h2 > a.feature-heading-link'),
            featureJump = page.locator('#feature-jump');
        await expect(featureLinks).toHaveCount(38);
        await expect(feature23.locator('h2 > a.feature-heading-link')).toHaveAttribute('href', '#feature-23');
        await expect(featureJump).toHaveValue('feature-23');
        await expect
            .poll(async () => {
                // Read the state under test
                const top = await feature23.evaluate(
                    // Read the browser state
                    (element) => element.getBoundingClientRect().top,
                );
                return top >= 0 && top < 32;
            })
            .toBe(true);
        await feature24Link.click();
        await expect(page).toHaveURL(/#feature-24$/);
        await expect(featureJump).toHaveValue('feature-24');
        await expect
            .poll(async () => {
                // Read the state under test
                const top = await page.locator('#feature-24').evaluate(
                    // Read the browser state
                    (element) => element.getBoundingClientRect().top,
                );
                return top >= 0 && top < 32;
            })
            .toBe(true);
        await featureJump.selectOption('feature-25');
        await expect(page).toHaveURL(/#feature-25$/);
        await expect
            .poll(async () => {
                // Read the state under test
                const top = await page.locator('#feature-25').evaluate(
                    // Read the browser state
                    (element) => element.getBoundingClientRect().top,
                );
                return top >= 0 && top < 32;
            })
            .toBe(true);
        await assertFeatureSectionRange(page, 19, 26);

        const advanced = page.locator('advanced-fetch'),
            initialAuditCount = await advanced.evaluate(
                // Read the browser state
                (element) => element.$props.audit.count,
            );
        await advanced.evaluate(
            // Read the browser state
            (element) => element.reload(),
        );
        await expect
            .poll(
                // Read the state under test
                () =>
                    advanced.evaluate(
                        // Read the browser state
                        (element) => element.$props.audit?.count,
                    ),
            )
            .toBeGreaterThan(initialAuditCount);

        const cache = page.locator('cache-control-demo');
        await cache.getByRole('button', { name: 'Clear data cache' }).click();
        await expect
            .poll(
                // Read the state under test
                () =>
                    cache.evaluate(
                        // Read the browser state
                        (element) => element.$props.payload,
                    ),
            )
            .toBeNull();
        await cache.getByRole('button', { name: 'Reload' }).click();
        await expect
            .poll(
                // Read the state under test
                () =>
                    cache.evaluate(
                        // Read the browser state
                        (element) => element.$props.payload?.count,
                    ),
            )
            .toBe(1);
        await page.getByRole('button', { name: 'Inspect template cache' }).click();
        await expect(page.locator('#template-cache-output')).toContainText('feature-lab-cache-v1');

        const safe = page.locator('secure-render-demo');
        await safe.evaluate(
            // Read the browser state
            (element) => element.reload(),
        );
        expect(
            await safe.evaluate(
                // Read the browser state
                (element) => ({
                    hasScript: Boolean(element.shadowRoot.querySelector('script')),
                    hasInlineHandler: element.shadowRoot.querySelector('#unsafe-button')?.hasAttribute('onclick'),
                }),
            ),
        ).toEqual({
            hasScript: false,
            hasInlineHandler: false,
        });

        const mapped = page.locator('mapped-event-demo'),
            mappedOutput = mapped.locator('xpath=..').locator('.status-line');
        await mapped.getByRole('button').click();
        await expect(mappedOutput).toContainText('Received public-save');
        await mapped.evaluate(
            // Read the browser state
            (element) => element.reload(),
        );
        await mapped.getByRole('button').click();
        await expect(mappedOutput).toContainText('Received public-save');

        await page.getByRole('button', { name: 'Toggle Debug Panel' }).click();
        await expect(page.locator('#acl-debug-panel')).toBeVisible();
        await page.locator('#acl-debug-panel').getByRole('button', { name: 'Turn off debugging' }).click();
        await expect(page.locator('#acl-debug-panel')).toBeHidden();
        await page.getByRole('button', { name: 'Audit intentional issues' }).click();
        await expect(page.locator('#accessibility-output')).toContainText('"component": "a11y-issues-demo"');
        await expect(page.locator('#accessibility-output')).toContainText('"rule": "image-alt"');
        await page.getByRole('button', { name: 'Open A11y Audit' }).click();
        await expect(page.locator('#acl-a11y-scanner-modal')).toBeVisible();
        await expect(page.locator('#acl-a11y-scanner-modal')).toContainText('<a11y-issues-demo>');
        await expect(page.locator('#acl-a11y-scanner-modal')).toContainText('image-alt');
        await page
            .locator('#acl-a11y-scanner-modal')
            .getByRole('button', {
                name: 'Close',
                exact: true,
            })
            .click();
        await expect(page.locator('#acl-a11y-scanner-modal')).toBeHidden();

        await page.getByRole('button', { name: 'Inspect registry' }).click();
        await expect(page.locator('#registry-output')).toContainText('directDependencies');
        await expect(page.locator('#registry-output')).toContainText('manifest-base');
        await expect(page.locator('#registry-output')).toContainText('contractMetadata');
        await expect(page.locator('#registry-output')).toContainText('manifest-ready');
        await page.getByRole('button', { name: 'Insert observed template' }).click();
        await expect
            .poll(
                // Read the state under test
                () =>
                    page.locator('observed-card').evaluate(
                        // Read the browser state
                        (element) => element._state === 'ready',
                    ),
            )
            .toBe(true);

        await page.getByRole('button', { name: 'Set score property to 88' }).click();
        await expect(page.locator('#advanced-props')).toHaveAttribute('score', '88');

        const responseTags = [
            'response-json-demo',
            'response-text-demo',
            'response-auto-demo',
            'response-blob-demo',
            'response-buffer-demo',
            'response-stream-demo',
            'response-custom-demo',
        ];
        await page.locator('response-custom-demo').evaluate(
            // Read the browser state
            (element) => element.reload(),
        );
        expect(
            await page.evaluate(
                // Read the browser state
                (tags) =>
                    tags.every(
                        // Check every item
                        (tag) => Boolean(document.querySelector(tag)?.$props.payload),
                    ),
                responseTags,
            ),
        ).toBe(true);
        expect(errors).toEqual([]);
    });

    test('feature lab sections 27-34 exercise recovery, events, cleanup, transitions, migration, sanitization, diagnostics, and entries', async ({
        page,
    }) => {
        // Exercise the test scenario
        const errors = await openRealFeatureLab(page);
        await assertFeatureSectionRange(page, 27, 34);

        const polling = page.locator('polling-demo');
        await polling.getByRole('button', { name: 'Pause' }).click();
        await expect(polling).toHaveAttribute('data-fetch-poll', '0');
        await expect(polling.locator('p')).toContainText('Paused manually');
        await expect(polling.getByRole('button', { name: 'Pause' })).toBeDisabled();
        await polling.getByRole('button', { name: 'Resume' }).click();
        await expect(polling).toHaveAttribute('data-fetch-poll', '1000');
        await expect(polling.locator('p')).toContainText('active');
        await expect(polling.getByRole('button', { name: 'Resume' })).toBeDisabled();

        const recovery = page.locator('recovery-demo');
        await expect(recovery.locator('p')).toHaveText('Ready to test');
        await expect(recovery.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        await expect(recovery.getByRole('button', { name: 'Retry' })).toBeDisabled();
        await recovery.getByRole('button', { name: 'Start' }).click();
        await expect
            .poll(
                // Read the state under test
                () =>
                    recovery.evaluate(
                        // Read the browser state
                        (element) => element.$props.$loading,
                    ),
            )
            .toBe(true);
        await expect(recovery.locator('p')).toHaveText('Starting slow request…');
        await expect(recovery.getByRole('button', { name: 'Start' })).toBeDisabled();
        await recovery.getByRole('button', { name: 'Cancel' }).click();
        await expect
            .poll(
                // Read the state under test
                () =>
                    recovery.evaluate(
                        // Read the browser state
                        (element) => element.$props.$loading,
                    ),
            )
            .toBe(false);
        await expect(recovery.locator('p')).toHaveText('Canceled in feature lab');
        await expect(recovery.getByRole('button', { name: 'Retry' })).toBeEnabled();
        await recovery.getByRole('button', { name: 'Retry' }).click();
        await expect
            .poll(
                // Read the state under test
                () =>
                    recovery.evaluate(
                        // Read the browser state
                        (element) => element.$props.$loading,
                    ),
            )
            .toBe(true);
        await expect(recovery.locator('p')).toHaveText('Retrying slow request…');
        await expect
            .poll(
                // Read the state under test
                () =>
                    recovery.evaluate(
                        // Read the browser state
                        (element) => element.$props.payload?.message,
                    ),
                { timeout: 5000 },
            )
            .toContain('Loaded after');
        await recovery.getByRole('button', { name: 'Start' }).click();
        await expect
            .poll(
                // Read the state under test
                () =>
                    recovery.evaluate(
                        // Read the browser state
                        (element) => element.$props.$loading,
                    ),
            )
            .toBe(true);
        await recovery.getByRole('button', { name: 'Cancel' }).click();
        await expect(recovery.locator('p')).toHaveText('Canceled in feature lab');

        await page.getByRole('button', { name: 'Generate load events' }).click();
        await expect(page.locator('#runtime-event-log')).toContainText('acl:loadend');

        const lifecycle = page.locator('async-lifecycle-demo');
        await lifecycle.getByRole('button', { name: 'Reload and run cleanup' }).click();
        await expect(page.locator('#lifecycle-cleanup-count')).toHaveText('1');
        const lifecycleToggle = page.getByRole('button', { name: 'Toggle lifecycle component' });
        await lifecycleToggle.click();
        await lifecycleToggle.click();
        await expect
            .poll(
                // Read the state under test
                () =>
                    page
                        .locator('async-lifecycle-demo')
                        .first()
                        .evaluate(
                            // Read the browser state
                            (element) => element._state === 'ready',
                        ),
            )
            .toBe(true);

        const advancedSelect = page.getByRole('combobox', { name: 'Advanced dynamic component' });
        await page.getByRole('combobox', { name: 'Transition mode' }).selectOption('none');
        await advancedSelect.selectOption('dynamic-b');
        await expect
            .poll(
                // Read the state under test
                () =>
                    advancedSelect
                        .locator('xpath=../..')
                        .locator('acl-dynamic')
                        .evaluate(
                            // Read the browser state
                            (element) => element.firstElementChild?.localName,
                        ),
            )
            .toBe('dynamic-b');

        const adapterExamples = [
            ['local', 'local-adapter-note', 'localStorage adapter'],
            ['session', 'session-adapter-note', 'sessionStorage adapter'],
            ['indexeddb', 'indexeddb-adapter-note', 'IndexedDB adapter'],
        ];
        // Process each entry
        for (const [mode, selector, label] of adapterExamples) {
            const adapter = page.locator(selector),
                note = `Section thirty-one ${label}`;
            await adapter.getByRole('textbox', { name: 'Persistent note' }).fill(note);
            await adapter.getByRole('button', { name: `Flush ${label}` }).click();
            await expect(adapter.getByRole('status')).toContainText(`Flushed ${label}`);
            await expect
                .poll(
                    // Read the state under test
                    () =>
                        adapter.evaluate(
                            // Read the browser state
                            (element) => element.$props.$persistence.$get('note'),
                        ),
                )
                .toBe(note);
            expect(
                await page.evaluate(
                    // Read the browser state
                    (adapterMode) => window.__readAdapterPersistence(adapterMode),
                    mode,
                ),
            ).toEqual({
                version: 2,
                data: expect.objectContaining({ note }),
            });
            await adapter.getByRole('button', { name: `Clear ${label}` }).click();
            await expect(adapter.getByRole('status')).toContainText(`Cleared ${label} record`);
            await expect
                .poll(
                    // Read the state under test
                    () =>
                        adapter.evaluate(
                            // Read the browser state
                            (element) => element.$props.$persistence.$get(),
                        ),
                )
                .toBeNull();
        }

        const sanitizer = page.locator('custom-sanitizer-demo'),
            dependencies = page.locator('external-deps-demo');
        await Promise.all([
            sanitizer.evaluate(
                // Read the browser state
                (element) => element.reload(),
            ),
            dependencies.evaluate(
                // Read the browser state
                (element) => element.reload(),
            ),
        ]);
        expect(
            await sanitizer.evaluate(
                // Read the browser state
                (element) => Boolean(element.shadowRoot.querySelector('[data-sanitized="custom"]')),
            ),
        ).toBe(true);
        expect(
            await dependencies.evaluate(
                // Read the browser state
                (element) => element.shadowRoot.textContent.includes('Script loaded: yes'),
            ),
        ).toBe(true);

        await page.getByRole('button', { name: 'Create diagnostic snapshot' }).click();
        await expect(page.locator('#diagnostics-output')).toContainText('"schemaVersion": 1');

        expect(
            await page.evaluate(async () => {
                // Read the browser state
                const root = await import('../../dist/index.js'),
                    dev = await import('../../dist/dev.js'),
                    a11y = await import('../../dist/a11y.js'),
                    offline = await import('../../dist/offline.js'),
                    testing = await import('../../dist/testing.js');
                return {
                    root: typeof root.default.define,
                    hmr: typeof dev.connectACLDevServer,
                    a11y: typeof a11y.observeAccessibility,
                    offline: typeof offline.registerOfflineWorker,
                    testing: typeof testing.mountComponent,
                    autoStartedOnlyByDedicatedEntry: root.default.globalConfig.autoStart === true,
                };
            }),
        ).toEqual({
            root: 'function',
            hmr: 'function',
            a11y: 'function',
            offline: 'function',
            testing: 'function',
            autoStartedOnlyByDedicatedEntry: true,
        });
        expect(errors).toEqual([]);
    });

    test('feature lab sections 35-38 exercise adaptive prefetch, observability, security policies, and testing helpers', async ({
        page,
    }) => {
        // Exercise the test scenario
        const errors = await openRealFeatureLab(page);
        await assertFeatureSectionRange(page, 35, 38);

        const directPrefetch = await page.evaluate(
            // Run the browser demonstration
            () => window.demoAdaptivePrefetch('preview'),
        );
        expect(directPrefetch).toEqual({
            'manifest-base': 'fulfilled',
            'adaptive-card': 'fulfilled',
        });
        await expect(page.locator('#adaptive-prefetch-output')).toContainText('acl:prefetchstart');
        await expect(page.locator('#adaptive-prefetch-output')).toContainText('acl:prefetchend');
        await expect(page.locator('#adaptive-prefetch-output')).toContainText('"fulfilled": 2');

        await page.getByRole('button', { name: 'Disconnect observer' }).click();
        await expect(page.locator('#adaptive-prefetch-output')).toContainText('observer:disconnected');
        expect(
            await page.evaluate(
                // Read the browser state
                () => window.__aclAdaptivePrefetchController,
            ),
        ).toBeNull();

        await page.getByRole('button', { name: 'Reset observer' }).click();
        await page.getByRole('button', { name: 'Hover or focus to prefetch preview' }).focus();
        await expect(page.locator('#adaptive-prefetch-output')).toContainText('acl:prefetchend');
        expect(
            await page.evaluate(
                // Read the browser state
                () => Boolean(window.__aclAdaptivePrefetchController),
            ),
        ).toBe(true);

        const observability = await page.evaluate(
            // Run the browser demonstration
            () => window.demoObservability(),
        );
        expect(observability.totals.loadstart).toBeGreaterThanOrEqual(1);
        expect(observability.totals.loadend).toBeGreaterThanOrEqual(1);
        expect(observability.durations.loadend.count).toBeGreaterThanOrEqual(1);
        expect(observability.recent.length).toBeLessThanOrEqual(80);
        expect(observability.subscriberRecords).toBeGreaterThanOrEqual(1);
        expect(observability.performanceMeasures.length).toBeGreaterThanOrEqual(1);
        expect(JSON.stringify(observability.recent)).toContain('[redacted]');
        await expect(page.locator('#observability-metrics-output')).toContainText('performanceMeasures');
        await expect(page.locator('#observability-live-output')).toContainText('"type": "loadend"');

        await page.waitForFunction(
            // Check whether the security component is ready
            () => document.querySelector('security-policy-demo')?._state === 'ready',
        );
        const security = await page.evaluate(
            // Run the browser demonstration
            () => window.inspectSecurityPolicy(),
        );
        expect(security.trustedTypesPolicyCalls).toBeGreaterThanOrEqual(1);
        expect(security.urlPolicyCalls).toBeGreaterThanOrEqual(2);
        expect(security.allowedHref).toBe('./README.md');
        expect(security.blockedHref).toBeNull();
        await expect(page.locator('#security-policy-output')).toContainText('"blockedHref": null');

        const testing = await page.evaluate(
            // Run the browser demonstration
            () => window.runTestingDemo(),
        );
        expect(testing).toEqual(
            expect.objectContaining({
                tagName: expect.stringMatching(/^acl-test-/),
                initialName: 'Ada',
                updatedName: 'Grace',
                updatedCount: 2,
                payload: 'Loaded from installFetchMock',
                slottedText: 'Named slot mounted',
                requestCount: 1,
                destroyed: true,
                fetchRestored: true,
            }),
        );
        expect(testing.events).toEqual(
            expect.arrayContaining(['acl:loadstart', 'acl:loadend', 'acl:dev-reload-start', 'acl:dev-reload-end']),
        );
        expect(
            await page.locator('#testing-helper-fixture').evaluate(
                // Read the browser state
                (fixture) => fixture.childElementCount,
            ),
        ).toBe(0);
        await expect(page.locator('#testing-helper-output')).toContainText('"fetchRestored": true');

        await page.getByRole('button', { name: 'Clear retained metrics' }).click();
        await expect(page.locator('#observability-metrics-output')).toContainText('"totals": {}');
        expect(errors).toEqual([]);
    });
});
