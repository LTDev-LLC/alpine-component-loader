import { expect, test, preparePage } from './fixtures/loader.js';

let baseUrl;

test.beforeAll(
    // Run this operation
    async ({ loaderServer }) => {
        ({ baseUrl } = loaderServer);
    },
);

test('progressive hydration gates only valid SSR markup and cleans every trigger', async ({ page }) => {
    // Run this operation
    await preparePage(page);
    await page.evaluate(
        // Run this operation
        () => {
            window.__visibleObservers = [];
            window.IntersectionObserver = class {
                // Run this operation
                constructor(callback, options) {
                    this.callback = callback;
                    this.options = options;
                    window.__visibleObservers.push(this);
                }

                // Run this operation
                observe() {}

                // Run this operation
                disconnect() {
                    this.disconnected = true;
                }
            };
            window.__idleCallbacks = [];
            window.requestIdleCallback = // Run this operation
                (callback) => {
                    window.__idleCallbacks.push(callback);
                    return window.__idleCallbacks.length;
                };
            window.cancelIdleCallback = // Run this operation
                () => {};
            window.__media = {
                matches: false,
                listeners: new Set(),
                // Run this operation
                addEventListener(_name, callback) {
                    this.listeners.add(callback);
                },
                // Run this operation
                removeEventListener(_name, callback) {
                    this.listeners.delete(callback);
                },
            };
            window.matchMedia = // Run this operation
                () => window.__media;
        },
    );
    await page.addScriptTag({
        type: 'module',
        content: `
            import Loader from '${baseUrl}/src/index.js';
            Loader.config({ autoStart: false, sanitize: false });
            const host = (tag, mode, revision = 'revision-1') => {
                const element = document.createElement(tag);
                element.setAttribute('data-acl-ssr', '1');
                element.setAttribute('data-acl-revision', revision);
                element.setAttribute('hydrate', mode);
                if (mode === 'media') element.setAttribute('hydrate-media', '(min-width: 1px)');
                element.innerHTML = '<template data-acl-ssr-shadow shadowrootmode="open"><span data-server>server</span></template>';
                document.body.appendChild(element);
                return element;
            };
            window.__hydrationHosts = {
                visible: host('visible-hydration-card', 'visible'),
                idle: host('idle-hydration-card', 'idle'),
                interaction: host('interaction-hydration-card', 'interaction'),
                media: host('media-hydration-card', 'media'),
                invalid: host('invalid-hydration-card', 'interaction', 'stale'),
            };
            for (const tag of ['visible-hydration-card', 'idle-hydration-card', 'interaction-hydration-card', 'media-hydration-card', 'invalid-hydration-card'])
                await Loader.define(tag, '${baseUrl}/templates/simple.html', {
                    shadow: true,
                    templateRevision: 'revision-1',
                    hydrate: tag.startsWith('media') ? 'media' : 'eager',
                    hydrateMedia: tag.startsWith('media') ? '(min-width: 1px)' : null,
                });
            await Loader.define('client-hydration-card', '${baseUrl}/templates/simple.html', {
                shadow: true,
                hydrate: 'interaction',
            });
            const client = document.createElement('client-hydration-card');
            document.body.appendChild(client);
            window.__hydrationHosts.client = client;
            await Loader.start();
            window.__hydrationLoaderReady = true;
        `,
    });
    await page.waitForFunction(
        // Run this operation
        () => window.__hydrationLoaderReady,
    );
    await expect
        .poll(
            // Run this operation
            () =>
                page.evaluate(
                    // Run this operation
                    () => ({
                        visible: window.__hydrationHosts.visible.getAttribute('data-acl-hydration-state'),
                        idle: window.__hydrationHosts.idle.getAttribute('data-acl-hydration-state'),
                        interaction: window.__hydrationHosts.interaction.getAttribute('data-acl-hydration-state'),
                        media: window.__hydrationHosts.media.getAttribute('data-acl-hydration-state'),
                        invalid: window.__hydrationHosts.invalid._state,
                        client: window.__hydrationHosts.client._state,
                    }),
                ),
        )
        .toEqual({
            visible: 'deferred',
            idle: 'deferred',
            interaction: 'deferred',
            media: 'deferred',
            invalid: 'ready',
            client: 'ready',
        });
    const rootMargin = await page.evaluate(
        // Run this operation
        () => window.__visibleObservers[0].options.rootMargin,
    );
    expect(rootMargin).toBe('100px');
    await page.evaluate(
        // Run this operation
        () => {
            window.__visibleObservers[0].callback([
                {
                    // Configure this value
                    target: window.__hydrationHosts.visible,
                    isIntersecting: true,
                },
            ]);
            window.__idleCallbacks[0]({
                // Configure this value
                didTimeout: false,
                // Run this operation
                timeRemaining: () => 10,
            });
            window.__hydrationHosts.interaction.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
            window.__media.matches = true;
            window.__media.listeners.forEach(
                // Run this operation
                (listener) => listener({ matches: true }),
            );
        },
    );
    await expect
        .poll(
            // Run this operation
            () =>
                page.evaluate(
                    // Run this operation
                    () =>
                        ['visible', 'idle', 'interaction', 'media'].map(
                            // Run this operation
                            (name) => ({
                                state: window.__hydrationHosts[name].getAttribute('data-acl-hydration-state'),
                                cleanups: window.__hydrationHosts[name]._hydrationCleanups?.length || 0,
                                server: Boolean(
                                    window.__hydrationHosts[name].shadowRoot.querySelector('[data-server]'),
                                ),
                            }),
                        ),
                ),
        )
        .toEqual([
            {
                // Configure this value
                state: 'hydrated',
                cleanups: 0,
                server: true,
            },
            {
                // Configure this value
                state: 'hydrated',
                cleanups: 0,
                server: true,
            },
            {
                // Configure this value
                state: 'hydrated',
                cleanups: 0,
                server: true,
            },
            {
                // Configure this value
                state: 'hydrated',
                cleanups: 0,
                server: true,
            },
        ]);
});

test('nearest error boundaries own failures and retry successful descendants', async ({ page }) => {
    // Run this operation
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
            import Loader from '${baseUrl}/src/index.js';
            Loader.config({ autoStart: false, sanitize: false });
            await Loader.registerErrorBoundary();
            await Loader.define('retry-boundary-card', '${baseUrl}/api/flaky?name=boundary-runtime&fail=1', {
                shadow: true,
                retries: 0,
            });
            await Loader.define('nested-boundary-card', '${baseUrl}/missing-boundary-template.html', {
                shadow: true,
                retries: 0,
            });
            document.body.innerHTML = \`
                <acl-boundary id="retry-boundary">
                    <retry-boundary-card></retry-boundary-card>
                    <p slot="fallback" id="authored-fallback">Authored fallback</p>
                </acl-boundary>
                <acl-boundary id="outer-boundary">
                    <acl-boundary id="inner-boundary">
                        <nested-boundary-card></nested-boundary-card>
                    </acl-boundary>
                </acl-boundary>
            \`;
            await Loader.start();
            window.__boundariesReady = true;
        `,
    });
    await page.waitForFunction(
        // Run this operation
        () =>
            window.__boundariesReady &&
            document.querySelector('#retry-boundary')?.getAttribute('data-acl-boundary-state') === 'error' &&
            document.querySelector('#inner-boundary')?.getAttribute('data-acl-boundary-state') === 'error',
    );
    expect(
        await page.evaluate(
            // Run this operation
            () => ({
                retryErrors: document.querySelector('#retry-boundary').errors.length,
                authoredVisible: !document
                    .querySelector('#retry-boundary')
                    .shadowRoot.querySelector('slot[name="fallback"]').hidden,
                innerErrors: document.querySelector('#inner-boundary').errors.length,
                outerErrors: document.querySelector('#outer-boundary').errors.length,
                outerState: document.querySelector('#outer-boundary').getAttribute('data-acl-boundary-state'),
            }),
        ),
    ).toEqual({
        retryErrors: 1,
        authoredVisible: true,
        innerErrors: 1,
        outerErrors: 0,
        outerState: 'ready',
    });
    await page.evaluate(
        // Run this operation
        () => document.querySelector('#retry-boundary').retry(),
    );
    await page.waitForFunction(
        // Run this operation
        () => document.querySelector('#retry-boundary')?.getAttribute('data-acl-boundary-state') === 'ready',
    );
    expect(
        await page.evaluate(
            // Run this operation
            () => ({
                errors: document.querySelector('#retry-boundary').errors.length,
                child: document.querySelector('retry-boundary-card')._state,
            }),
        ),
    ).toEqual({
        // Configure this value
        errors: 0,
        child: 'ready',
    });
});

test('development inline HMR validates revisions, patches templates, and reloads active hosts', async ({ page }) => {
    // Exercise the complete revision protocol through a browser-compatible event source
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
            import Loader from '${baseUrl}/src/index.js';
            import { connectACLDevServer } from '${baseUrl}/src/dev.js';

            Loader.config({ autoStart: false, sanitize: false });
            document.body.innerHTML = '<template id="inline-card-template"><p>before</p></template><inline-hmr-card></inline-hmr-card>';
            await Loader.define('inline-hmr-card', '#inline-card-template', { shadow: true });
            await Loader.start();
            const host = document.querySelector('inline-hmr-card');
            while (host._state !== 'ready') await new Promise(resolve => setTimeout(resolve));

            class FakeEventSource {
                constructor(url) {
                    this.url = url;
                    this.listeners = new Map();
                }
                addEventListener(name, listener) {
                    this.listeners.set(name, listener);
                }
                removeEventListener(name) {
                    this.listeners.delete(name);
                }
                close() {
                    this.closed = true;
                }
                emit(value) {
                    this.listeners.get('message')?.({ data: JSON.stringify(value) });
                }
            }

            const originalFetch = globalThis.fetch;
            globalThis.fetch = async () => new Response(JSON.stringify({
                revision: 'revision-1',
                source: '/index.html',
                templates: [{
                    kind: 'id',
                    name: 'inline-card-template',
                    html: '<p>after</p>',
                }],
            }));
            const connection = connectACLDevServer({
                loader: Loader,
                EventSourceImpl: FakeEventSource,
            });
            const reloaded = new Promise(resolve => addEventListener('acl:dev-reload', event => resolve(event.detail), { once: true }));
            connection.eventSource.emit({
                type: 'acl:inline-template-changed',
                revision: 'revision-1',
                source: '/index.html',
                url: '/revision.json',
                templates: [{ kind: 'id', name: 'inline-card-template' }],
            });
            const detail = await reloaded;
            while (host._state !== 'ready') await new Promise(resolve => setTimeout(resolve));
            window.__inlineHmr = {
                detail,
                content: host.shadowRoot.textContent.trim(),
                sourceOpen: connection.eventSource !== null,
            };
            connection.close();
            window.__inlineHmr.closed = connection.eventSource === null;
            globalThis.fetch = originalFetch;
        `,
    });
    await page.waitForFunction(
        // Wait for the ordered inline update and component reload
        () => window.__inlineHmr,
    );
    const result = await page.evaluate(
        // Read the completed development update
        () => window.__inlineHmr,
    );
    expect(result.detail.tags).toEqual(['inline-hmr-card']);
    expect(result.detail.reloaded).toBe(1);
    expect(result.content).toContain('after');
    expect(result.sourceOpen).toBe(true);
    expect(result.closed).toBe(true);
});

test('form-associated components submit, restore, validate, disable, and retain a hidden fallback', async ({
    // Run this operation
    page,
}) => {
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
            import Loader from '${baseUrl}/src/index.js';
            Loader.config({ autoStart: false, sanitize: false });
            await Loader.define('native-form-card', '${baseUrl}/templates/simple.html', {
                shadow: true,
                attributes: {
                    value: { type: String, default: 'initial' },
                    disabledState: Boolean,
                },
                form: { value: 'value', state: 'value', disabled: 'disabledState' },
            });
            document.body.innerHTML = '<form id="native-form"><native-form-card name="choice" value="initial"></native-form-card></form>';
            await Loader.start();
            const element = document.querySelector('native-form-card');
            while (element._state !== 'ready') await new Promise(resolve => setTimeout(resolve));
            const values = () => Object.fromEntries(new FormData(document.querySelector('#native-form')));
            const initial = values();
            element.setFormValue('changed', 'changed');
            const changed = values();
            element.setValidity({ customError: true }, 'Choose another value');
            const invalid = {
                valid: element.checkValidity(),
                reported: element.reportValidity(),
                message: element.validationMessage,
                willValidate: element.willValidate,
                validity: element.validity.valid,
                labels: element.labels.length,
                helperForm: element.$props.$form.form === document.querySelector('#native-form'),
                helperLabels: element.$props.$form.labels.length,
            };
            element.setValidity({});
            element.formStateRestoreCallback('restored');
            const restored = values();
            document.querySelector('#native-form').reset();
            const reset = values();
            element.setAttribute('disabled', '');
            const disabled = values();

            const original = HTMLElement.prototype.attachInternals;
            HTMLElement.prototype.attachInternals = undefined;
            await Loader.define('fallback-form-card', '${baseUrl}/templates/simple.html', {
                shadow: true,
                attributes: { value: { type: String, default: 'fallback' } },
                form: { value: 'value' },
            });
            const fallback = document.createElement('fallback-form-card');
            fallback.name = 'fallback-choice';
            fallback.setAttribute('name', 'fallback-choice');
            fallback.setAttribute('value', 'fallback');
            document.querySelector('#native-form').appendChild(fallback);
            HTMLElement.prototype.attachInternals = original;
            while (fallback._state !== 'ready') await new Promise(resolve => setTimeout(resolve));
            window.__formResult = {
                initial,
                changed,
                invalid,
                restored,
                reset,
                disabled,
                fallback: values(),
                proxy: Boolean(fallback.querySelector('[data-acl-form-proxy]')),
                formLinked: fallback.form === document.querySelector('#native-form'),
            };
        `,
    });
    await page.waitForFunction(
        // Run this operation
        () => window.__formResult,
    );
    expect(
        await page.evaluate(
            // Run this operation
            () => window.__formResult,
        ),
    ).toEqual({
        initial: { choice: 'initial' },
        changed: { choice: 'changed' },
        invalid: {
            // Configure this value
            valid: false,
            reported: false,
            message: 'Choose another value',
            willValidate: true,
            validity: false,
            labels: 0,
            helperForm: true,
            helperLabels: 0,
        },
        restored: { choice: 'restored' },
        reset: { choice: 'initial' },
        disabled: {},
        fallback: { 'fallback-choice': 'fallback' },
        proxy: true,
        formLinked: true,
    });
});
