import { expect, test, preparePage, alpineStubSource, projectRoot, featureLabPath } from './fixtures/loader.js';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

let baseUrl, counts;
test.beforeAll(async ({ loaderServer }) => {
    // Prepare the test group
    ({ baseUrl, counts } = loaderServer);
});

test('debugger tooltip exposes cache/data diagnostics without controls', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        import Debugger from '${baseUrl}/src/debugger.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        Debugger.inject(Loader);
        await Loader.define('debug-card', '${baseUrl}/templates/data.html', {
            data: { src: '${baseUrl}/api/count?name=debug' }
        });
        const el = document.createElement('debug-card');
        document.body.appendChild(el);
        await new Promise(resolve => el.addEventListener('loaded', resolve, { once: true }));
        await Loader.toggleDebug();
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    const box = await page.locator('debug-card').boundingBox();
    await page.mouse.move(box.x + 4, box.y + 4);
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => document.getElementById('acl-debug-tooltip')?.textContent.includes('Template cache'),
    );

    const state = await page.evaluate(() => {
        // Read the browser state
        const tooltip = document.getElementById('acl-debug-tooltip'),
            buttons = Array.from(tooltip.querySelectorAll('button')).map(
                // Transform the current item
                (button) => button.textContent,
            );
        return {
            text: tooltip.textContent,
            buttons,
        };
    });

    expect(state.text).toContain('Template cache');
    expect(state.text).toContain('Data URL:');
    expect(state.buttons).toEqual([]);
});

test('debugger records lifecycle events and exports redacted diagnostics', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        import Debugger, { redactDiagnostics } from '${baseUrl}/src/debugger.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        Debugger.inject(Loader);
        const template = document.createElement('template');
        template.id = 'diagnostic-template';
        template.innerHTML = '<p>diagnostic</p>';
        document.body.appendChild(template);
        await Loader.define('diagnostic-card', '#diagnostic-template');
        const el = document.createElement('diagnostic-card');
        document.body.appendChild(el);
        await new Promise(resolve => el.addEventListener('loaded', resolve, { once: true }));
        await Loader.toggleDebug();
        el.dispatchEvent(new CustomEvent('acl:error', {
            bubbles: true,
            composed: true,
            detail: { error: { code: 'ACL_DIAGNOSTIC_TEST' }, token: 'private-token' }
        }));
        await new Promise(resolve => requestAnimationFrame(resolve));
        window.diagnosticState = {
            snapshot: Debugger.getSnapshot(Loader),
            redacted: redactDiagnostics({
                authorization: 'Bearer private',
                dataUrl: 'https://example.test/data?token=private&mode=ok',
                nested: { password: 'private' }
            }),
            timelineText: document.getElementById('acl-debug-panel')._nodes.timeline.textContent,
            hasExport: Array.from(document.querySelectorAll('#acl-debug-panel button'))
                .some(button => button.textContent === 'Export diagnostics')
        };
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.diagnosticState,
    );
    const state = await page.evaluate(
        // Read the browser state
        () => window.diagnosticState,
    );
    expect(state.timelineText).toContain('error <diagnostic-card> ACL_DIAGNOSTIC_TEST');
    expect(state.snapshot.timeline).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                type: 'error',
                tag: 'diagnostic-card',
                code: 'ACL_DIAGNOSTIC_TEST',
            }),
        ]),
    );
    expect(state.snapshot.timeline[0].detail.token).toBe('[REDACTED]');
    expect(state.redacted.authorization).toBe('[REDACTED]');
    expect(state.redacted.nested.password).toBe('[REDACTED]');
    expect(state.redacted.dataUrl).toContain('token=%5BREDACTED%5D');
    expect(state.hasExport).toBe(true);
});

test('debugger virtualizes very large component lists', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        import Debugger from '${baseUrl}/src/debugger.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        Debugger.inject(Loader);
        for (let index = 0; index < 260; index++) {
            const el = document.createElement('div');
            el.dataset.aclComponent = 'virtual-' + index;
            document.body.appendChild(el);
        }
        await Loader.toggleDebug();
        await new Promise(resolve => requestAnimationFrame(resolve));
        const list = document.getElementById('acl-debug-panel')._nodes.list;
        const initialCount = list.querySelectorAll('button[data-acl-debug-id]').length;
        list.scrollTop = list.scrollHeight;
        list.dispatchEvent(new Event('scroll'));
        await new Promise(resolve => requestAnimationFrame(resolve));
        window.virtualState = {
            initialCount,
            finalCount: list.querySelectorAll('button[data-acl-debug-id]').length,
            hasLast: Array.from(list.querySelectorAll('button')).some(button => button.textContent.includes('260. <div>')),
            fullCount: 260
        };
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.virtualState,
    );
    const state = await page.evaluate(
        // Read the browser state
        () => window.virtualState,
    );
    expect(state.initialCount).toBeLessThan(state.fullCount);
    expect(state.finalCount).toBeLessThan(state.fullCount);
    expect(state.hasLast).toBe(true);
});

test('start still registers elements when cache pruning fails', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page, '<acl-component></acl-component><acl-dynamic></acl-dynamic>');
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        Object.defineProperty(caches, 'keys', {
            configurable: true,
            value: async () => { throw new Error('cache unavailable'); }
        });
        await Loader.start();
        window.startedState = {
            component: Boolean(customElements.get('acl-component')),
            dynamic: Boolean(customElements.get('acl-dynamic'))
        };
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.startedState,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.startedState,
        ),
    ).toEqual({
        component: true,
        dynamic: true,
    });
});

test('basePath applies only to relative sources and sourceResolver can rewrite sources', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, basePath: '${baseUrl}/components/' });
        await Loader.start();
        await Loader.define('absolute-card', '${baseUrl}/templates/simple.html', {
            attributes: { label: String }
        });
        await Loader.define('root-card', '/templates/simple.html', {
            attributes: { label: String }
        });
        await Loader.define('resolved-card', 'alias:simple', {
            sourceResolver(source) {
                return source === 'alias:simple' ? '${baseUrl}/templates/simple.html' : source;
            },
            attributes: { label: String }
        });
        document.body.append(
            Object.assign(document.createElement('absolute-card'), { id: 'absolute' }),
            Object.assign(document.createElement('root-card'), { id: 'root' }),
            Object.assign(document.createElement('resolved-card'), { id: 'resolved' })
        );
        document.getElementById('absolute').setAttribute('label', 'absolute');
        document.getElementById('root').setAttribute('label', 'root');
        document.getElementById('resolved').setAttribute('label', 'resolved');
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            ['absolute', 'root', 'resolved'].every(
                // Check every item
                (id) => document.getElementById(id)?._state === 'ready',
            ),
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                absolute: document.getElementById('absolute').textContent,
                root: document.getElementById('root').textContent,
                resolved: document.getElementById('resolved').textContent,
            }),
        ),
    ).toEqual({
        absolute: 'absolute',
        root: 'root',
        resolved: 'resolved',
    });
});

test('strict JSON parsing preserves apostrophes in valid JSON strings', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('quote-card', '${baseUrl}/templates/simple.html', {
            attributes: { config: Object }
        });
        const el = document.createElement('quote-card');
        el.setAttribute('config', JSON.stringify({ name: "O'Reilly" }));
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.el.$props.config,
        ),
    ).toEqual({ name: "O'Reilly" });
});

test.describe('isolated rendering and safety coverage', () => {
    // Define the test group
    test.describe.configure({ mode: 'parallel' });

    test('secure rendering disables scripts and strips unsafe attributes', async ({ page }) => {
        // Exercise the test scenario
        await preparePage(page);
        await page.addScriptTag({
            type: 'module',
            content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('safe-card', '${baseUrl}/templates/unsafe.html', {
            executeScripts: false, sanitize: true
        });
        const el = document.createElement('safe-card');
        document.body.appendChild(el);
        window.el = el;
    `,
        });

        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => window.el?._state === 'ready',
        );
        const state = await page.evaluate(() => {
            // Read the browser state
            window.el.querySelector('#unsafe').click();
            return {
                scriptRan: window.__unsafeScript === true,
                clickRan: window.__unsafeClick === true,
                hasOnclick: window.el.querySelector('#unsafe').hasAttribute('onclick'),
            };
        });
        expect(state).toEqual({
            scriptRan: false,
            clickRan: false,
            hasOnclick: false,
        });
    });

    test('light DOM CSS fallback scopes ordinary, host, and nested selectors without rewriting keyframes', async ({
        page,
    }) => {
        // Exercise the test scenario
        await preparePage(page, '<p id="outside-shared" class="shared">outside</p>');
        await page.evaluate(() => {
            // Read the browser state
            try {
                delete window.CSSScopeRule;
            } catch {}
        });
        await page.addScriptTag({
            type: 'module',
            content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        const template = document.createElement('template');
        template.innerHTML = \`
            <style>
                .shared, :host(.active) > .host-child { color: rgb(1, 2, 3); }
                @media (min-width: 0px) { .nested { background-color: rgb(4, 5, 6); } }
                @keyframes acl-scope-test { from { opacity: 0; } to { opacity: 1; } }
            </style>
            <p class="shared">inside</p><p class="host-child">host</p><p class="nested">nested</p>
        \`;
        await Loader.define('scoped-card', template);
        const el = document.createElement('scoped-card');
        el.classList.add('active');
        document.body.appendChild(el);
        window.el = el;
    `,
        });

        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => window.el?._state === 'ready',
        );
        const state = await page.evaluate(
            // Read the browser state
            () => ({
                inside: getComputedStyle(window.el.querySelector('.shared')).color,
                outside: getComputedStyle(document.querySelector('#outside-shared')).color,
                host: getComputedStyle(window.el.querySelector('.host-child')).color,
                nested: getComputedStyle(window.el.querySelector('.nested')).backgroundColor,
                css: window.el.querySelector('style').textContent,
            }),
        );
        expect(state.inside).toBe('rgb(1, 2, 3)');
        expect(state.outside).not.toBe('rgb(1, 2, 3)');
        expect(state.host).toBe('rgb(1, 2, 3)');
        expect(state.nested).toBe('rgb(4, 5, 6)');
        expect(state.css).toContain('@keyframes acl-scope-test');
        expect(state.css).toContain('scoped-card[data-scope=');
    });

    test('mapped event forwarding does not duplicate after reload', async ({ page }) => {
        // Exercise the test scenario
        await preparePage(page);
        await page.addScriptTag({
            type: 'module',
            content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('mapped-event-card', '${baseUrl}/templates/event.html', {
            shadow: true,
            events: { forward: [{ from: 'inner-save', as: 'outer-save' }] }
        });
        const el = document.createElement('mapped-event-card');
        let count = 0;
        el.addEventListener('outer-save', () => count++);
        document.body.appendChild(el);
        window.el = el;
        window.getCount = () => count;
    `,
        });

        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => window.el?._state === 'ready',
        );
        await page.evaluate(
            // Read the browser state
            () => window.el.shadowRoot.getElementById('fire').click(),
        );
        await page.evaluate(
            // Read the browser state
            () => window.el.reload(),
        );
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => window.el?._state === 'ready',
        );
        await page.evaluate(
            // Read the browser state
            () => window.el.shadowRoot.getElementById('fire').click(),
        );
        expect(
            await page.evaluate(
                // Read the browser state
                () => window.getCount(),
            ),
        ).toBe(2);
    });

    test('lazy loading falls back to eager when IntersectionObserver is unavailable', async ({ page }) => {
        // Exercise the test scenario
        await preparePage(page);
        await page.evaluate(() => {
            // Read the browser state
            delete window.IntersectionObserver;
        });
        await page.addScriptTag({
            type: 'module',
            content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('lazy-fallback-card', '${baseUrl}/templates/simple.html', {
            loading: 'lazy',
            attributes: { label: String }
        });
        const el = document.createElement('lazy-fallback-card');
        el.setAttribute('label', 'loaded');
        document.body.appendChild(el);
        window.el = el;
    `,
        });

        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => window.el?._state === 'ready',
        );
        expect(
            await page.evaluate(
                // Read the browser state
                () => window.el.textContent,
            ),
        ).toBe('loaded');
    });
});

test.describe('debugger panel interactions', () => {
    // Define the test group
    test.describe.configure({ mode: 'parallel' });

    test('debugger panel exposes component list cache diagnostics and actions', async ({ page }) => {
        // Exercise the test scenario
        await preparePage(page);
        await page.addScriptTag({
            type: 'module',
            content: `
            import Loader from '${baseUrl}/src/index.js';
            import Debugger from '${baseUrl}/src/debugger.js';
            Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
            await Loader.start();
            Debugger.inject(Loader);
            await Loader.define('debug-panel-card', '${baseUrl}/templates/data.html', {
                data: { src: '${baseUrl}/api/count?name=debug-panel' }
            });
            const el = document.createElement('debug-panel-card');
            document.body.appendChild(el);
            await new Promise(resolve => el.addEventListener('loaded', resolve, { once: true }));
            await Loader.toggleDebug();
            window.el = el;
            window.Loader = Loader;
        `,
        });

        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => document.getElementById('acl-debug-panel')?.textContent.includes('Live components'),
        );
        const state = await page.evaluate(async () => {
            // Read the browser state
            const panel = document.getElementById('acl-debug-panel'),
                buttons = Array.from(panel.querySelectorAll('button')).map(
                    // Transform the current item
                    (button) => button.textContent,
                );
            return {
                text: panel.textContent,
                buttons,
                display: getComputedStyle(panel).display,
            };
        });

        expect(state.display).toBe('flex');
        expect(state.text).toContain('Data cache entries');
        expect(state.text).toContain('<debug-panel-card>');
        expect(state.buttons).toContain('Reload selected');
        expect(state.buttons).toContain('Clear selected cache');
        expect(state.buttons).toContain('Scroll to selected');

        await page.locator('#acl-debug-panel button', { hasText: '<debug-panel-card>' }).click();
        await expect(page.locator('#acl-debug-panel')).toContainText('Element content');
        await page.locator('#acl-debug-panel button', { hasText: 'Reload selected' }).click();
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => window.el?.$props?.$data?.count === 2,
        );
        await page.locator('#acl-debug-panel button', { hasText: 'Clear selected cache' }).click();
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => window.Loader.getDataCacheInfo().size === 0,
        );
        await page.locator('#acl-debug-panel button[aria-label="Turn off debugging"]').click();
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => window.Loader.globalConfig.debug === false,
        );
        await expect(page.locator('#acl-debug-panel')).not.toBeVisible();
    });

    test('debugger panel selection scrolls highlights and shows element content', async ({ page }) => {
        // Exercise the test scenario
        await preparePage(page);
        await page.addScriptTag({
            type: 'module',
            content: `
            import Loader from '${baseUrl}/src/index.js';
            import Debugger from '${baseUrl}/src/debugger.js';
            Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
            await Loader.start();
            Debugger.inject(Loader);

            const template = document.createElement('template');
            template.id = 'far-debug-template';
            template.innerHTML = \`
                <style>
                    :host {
                        display: block;
                        padding: 24px;
                        min-height: 90px;
                        border: 1px solid #94a3b8;
                        background: white;
                    }
                </style>
                <article>
                    <h2 x-text="$props.title"></h2>
                    <p>Rendered body content</p>
                </article>
            \`;
            document.body.appendChild(template);

            await Loader.define('far-debug-card', '#far-debug-template', {
                shadow: true,
                attributes: { title: String }
            });

            const spacer = document.createElement('div');
            spacer.style.height = '1600px';
            document.body.appendChild(spacer);

            const el = document.createElement('far-debug-card');
            el.setAttribute('title', 'Selected Far Card');
            document.body.appendChild(el);
            await new Promise(resolve => el.addEventListener('loaded', resolve, { once: true }));
            await Loader.toggleDebug();
            window.el = el;
        `,
        });

        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => document.getElementById('acl-debug-panel')?.textContent.includes('<far-debug-card>'),
        );
        await page.locator('#acl-debug-panel button', { hasText: '<far-debug-card>' }).click();

        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => window.scrollY > 800,
        );
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () =>
                Array.from(document.querySelectorAll('#acl-debug-overlays > div')).some(
                    // Check the current item
                    (box) => box.style.display !== 'none' && getComputedStyle(box).borderColor === 'rgb(56, 189, 248)',
                ),
        );

        const state = await page.evaluate(() => {
            // Read the browser state
            const panel = document.getElementById('acl-debug-panel'),
                selectedBox = Array.from(document.querySelectorAll('#acl-debug-overlays > div')).find(
                    // Find the matching item
                    (box) => box.style.display !== 'none' && getComputedStyle(box).borderColor === 'rgb(56, 189, 248)',
                );
            return {
                scrollY: window.scrollY,
                panelText: panel.textContent,
                selectedBorder: selectedBox && getComputedStyle(selectedBox).borderColor,
                selectedShadow: selectedBox && getComputedStyle(selectedBox).boxShadow,
            };
        });

        expect(state.scrollY).toBeGreaterThan(800);
        expect(state.selectedBorder).toBe('rgb(56, 189, 248)');
        expect(state.selectedShadow).toContain('rgba(14, 165, 233');
        expect(state.panelText).toContain('Element content');
        expect(state.panelText).toContain('Shadow DOM');
        expect(state.panelText).toContain('Selected Far Card');
        expect(state.panelText).toContain('Rendered body content');
    });

    test('debugger panel keeps fixed bounds and reveals hovered components in the live list', async ({ page }) => {
        // Exercise the test scenario
        await preparePage(page);
        await page.addScriptTag({
            type: 'module',
            content: `
            import Loader from '${baseUrl}/src/index.js';
            import Debugger from '${baseUrl}/src/debugger.js';
            Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
            await Loader.start();
            Debugger.inject(Loader);

            const template = document.createElement('template');
            template.id = 'debug-list-template';
            template.innerHTML = \`
                <style>
                    :host {
                        display: block;
                        width: 220px;
                        margin: 10px 0;
                        padding: 10px;
                        border: 1px solid #cbd5e1;
                        background: white;
                    }
                </style>
                <article>
                    <strong x-text="$props.label"></strong>
                    <p>Hover target content</p>
                </article>
            \`;
            document.body.appendChild(template);

            await Loader.define('debug-list-card', '#debug-list-template', {
                shadow: true,
                attributes: { label: String }
            });

            const entries = [];
            for (let i = 0; i < 36; i++) {
                const el = document.createElement('debug-list-card');
                el.setAttribute('label', 'Item ' + i);
                const loaded = new Promise(resolve => el.addEventListener('loaded', resolve, { once: true }));
                entries.push({ el, loaded });
                document.body.appendChild(el);
            }

            await Promise.all(entries.map(entry => entry.loaded));
            await Loader.toggleDebug();
            window.cards = entries.map(entry => entry.el);
        `,
        });

        await page.waitForFunction(() => {
            // Check whether the expected browser state is ready
            const panel = document.getElementById('acl-debug-panel'),
                list = panel?._nodes?.list;
            return panel && list && getComputedStyle(panel).display === 'flex' && list.scrollHeight > list.clientHeight;
        });

        await page.locator('debug-list-card').nth(35).hover();
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => document.getElementById('acl-debug-panel')?.textContent.includes('"label": "Item 35"'),
        );

        const state = await page.evaluate(() => {
            // Read the browser state
            const panel = document.getElementById('acl-debug-panel'),
                list = panel._nodes.list,
                selectedButton = Array.from(list.querySelectorAll('button')).find(
                    // Find the matching item
                    (button) => getComputedStyle(button).backgroundColor === 'rgb(29, 78, 216)',
                ),
                panelRect = panel.getBoundingClientRect(),
                listRect = list.getBoundingClientRect(),
                buttonRect = selectedButton?.getBoundingClientRect();

            return {
                display: getComputedStyle(panel).display,
                panelOverflow: getComputedStyle(panel).overflow,
                listOverflowY: getComputedStyle(list).overflowY,
                panelBottom: panelRect.bottom,
                viewportHeight: window.innerHeight,
                listCanScroll: list.scrollHeight > list.clientHeight,
                listScrollTop: list.scrollTop,
                selectedButtonText: selectedButton?.textContent,
                selectedButtonVisible: Boolean(
                    buttonRect && buttonRect.top >= listRect.top - 1 && buttonRect.bottom <= listRect.bottom + 1,
                ),
                panelText: panel.textContent,
            };
        });

        expect(state.display).toBe('flex');
        expect(state.panelOverflow).toBe('hidden');
        expect(state.listOverflowY).toBe('auto');
        expect(state.panelBottom).toBeLessThanOrEqual(state.viewportHeight);
        expect(state.listCanScroll).toBe(true);
        expect(state.listScrollTop).toBeGreaterThan(0);
        expect(state.selectedButtonText).toContain('36. <debug-list-card>');
        expect(state.selectedButtonVisible).toBe(true);
        expect(state.panelText).toContain('Selected: <debug-list-card>');
        expect(state.panelText).toContain('"label": "Item 35"');
        expect(state.panelText).toContain('Hover target content');
    });
});
