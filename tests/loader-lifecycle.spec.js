import { expect, test, preparePage, alpineStubSource, projectRoot, featureLabPath } from './fixtures/loader.js';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

let baseUrl, counts;
test.beforeAll(async ({ loaderServer }) => {
    // Prepare the test group
    ({ baseUrl, counts } = loaderServer);
});

test('loaded fires after Alpine initTree has run', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('loaded-card', '${baseUrl}/templates/data.html');
        const el = document.createElement('loaded-card');
        el.addEventListener('loaded', () => window.__loadedSawInit = window.__initTreeRan === true);
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
            () => window.__loadedSawInit,
        ),
    ).toBe(true);
});

test('lazy light DOM placeholder is not captured as slot content', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.evaluate(() => {
        // Read the browser state
        window.IntersectionObserver = class {
            constructor(callback) {
                // Initialize class state
                this.callback = callback;
            }

            observe() {
                // Emit a deferred visible intersection for the fixture
                setTimeout(
                    // Run the scheduled delayed task
                    () => this.callback([{ isIntersecting: true }]),
                    0,
                );
            }

            disconnect() {
                // Provide the no-op observer cleanup required by the fixture
            }
        };
    });
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('slot-card', '${baseUrl}/templates/slot.html', {
            loading: 'lazy'
        });
        const el = document.createElement('slot-card');
        el.appendChild(document.createTextNode('real slot text'));
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    const slotState = await page.evaluate(() => {
        // Read the browser state
        const slot = window.el.querySelector('[data-acl-slot]');
        return {
            text: slot.textContent,
            hasPlaceholder: Boolean(slot.querySelector('[data-acl-placeholder]')),
        };
    });
    expect(slotState.text).toBe('real slot text');
    expect(slotState.hasPlaceholder).toBe(false);
});

test('dynamic loader syncs attribute updates and prunes keep-alive cache', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.registerDynamicLoader();
        await Promise.all(['one', 'two', 'three'].map(name =>
            Loader.define('dyn-' + name, '${baseUrl}/templates/simple.html', {
                attributes: { label: String }
            })
        ));
        const loader = document.createElement('acl-dynamic');
        loader.setAttribute('keep-alive', '');
        loader.setAttribute('keep-alive-max', '1');
        loader.setAttribute('is', 'dyn-one');
        loader.setAttribute('label', 'first');
        document.body.appendChild(loader);
        window.loader = loader;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.loader?.firstElementChild?._state === 'ready',
    );
    await page.evaluate(
        // Read the browser state
        () => window.loader.setAttribute('label', 'updated'),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.loader.firstElementChild.$props.label === 'updated',
    );

    await page.evaluate(
        // Read the browser state
        () => window.loader.setAttribute('is', 'dyn-two'),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.loader.firstElementChild?.localName === 'dyn-two',
    );
    await page.evaluate(
        // Read the browser state
        () => window.loader.setAttribute('is', 'dyn-three'),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.loader.firstElementChild?.localName === 'dyn-three',
    );

    const state = await page.evaluate(
        // Read the browser state
        () => ({
            activeLabel: window.loader.firstElementChild.$props.label,
            cacheKeys: Array.from(window.loader._cache.keys()),
        }),
    );
    expect(state.activeLabel).toBe('updated');
    expect(state.cacheKeys).toEqual(['dyn-two']);
});

test('fade transitions do not cache invisible styles on keep-alive children', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false, dynamicTransition: 'fade' });
        await Loader.start();
        await Loader.define('fade-one', '${baseUrl}/templates/simple.html');
        await Loader.define('fade-two', '${baseUrl}/templates/simple.html');
        await Loader.registerDynamicLoader();
        const dynamic = document.createElement('acl-dynamic');
        dynamic.setAttribute('keep-alive', '');
        dynamic.setAttribute('keep-alive-max', '2');
        dynamic.setAttribute('transition', 'fade');
        dynamic.setAttribute('transition-duration', '20');
        dynamic.setAttribute('is', 'fade-one');
        document.body.appendChild(dynamic);
        window.dynamic = dynamic;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.dynamic?.getAttribute('aria-busy') === 'false' &&
            window.dynamic.firstElementChild?.localName === 'fade-one',
    );
    await page.evaluate(
        // Read the browser state
        () => window.dynamic.setAttribute('is', 'fade-two'),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.dynamic?.getAttribute('aria-busy') === 'false' &&
            window.dynamic.firstElementChild?.localName === 'fade-two',
    );
    await page.evaluate(
        // Read the browser state
        () => window.dynamic.setAttribute('is', 'fade-one'),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.dynamic?.getAttribute('aria-busy') === 'false' &&
            window.dynamic.firstElementChild?.localName === 'fade-one',
    );

    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                opacity: window.dynamic.firstElementChild.style.opacity,
                transition: window.dynamic.firstElementChild.style.transition,
                computedOpacity: getComputedStyle(window.dynamic.firstElementChild).opacity,
            }),
        ),
    ).toEqual({
        opacity: '',
        transition: '',
        computedOpacity: '1',
    });
});

test('dynamic loader exposes fade, scale, slide, and blur transition presets', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('preset-one', '${baseUrl}/templates/simple.html');
        await Loader.define('preset-two', '${baseUrl}/templates/simple.html');
        await Loader.registerDynamicLoader();
        window.presetDynamics = ['fade', 'scale', 'slide-left', 'slide-right', 'blur'].map(mode => {
            const dynamic = document.createElement('acl-dynamic');
            dynamic.dataset.mode = mode;
            dynamic.setAttribute('transition', 'none');
            dynamic.setAttribute('is', 'preset-one');
            document.body.appendChild(dynamic);
            return dynamic;
        });
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.presetDynamics?.every(
                // Process the current value
                (dynamic) =>
                    dynamic.getAttribute('aria-busy') === 'false' && dynamic.firstElementChild?._state === 'ready',
            ),
    );
    const states = await page.evaluate(
        // Read the browser state
        () =>
            Object.fromEntries(
                window.presetDynamics.map((dynamic) => {
                    // Transform the current item
                    dynamic.setAttribute('transition', dynamic.dataset.mode);
                    dynamic.setAttribute('transition-duration', '1000');
                    dynamic.setAttribute('is', 'preset-two');
                    const style = dynamic.firstElementChild.style;
                    return [
                        dynamic.dataset.mode,
                        {
                            opacity: style.opacity,
                            transform: style.transform,
                            filter: style.filter,
                            transition: style.transition,
                            willChange: style.willChange,
                        },
                    ];
                }),
            ),
    );

    expect(
        Object.values(states).every(
            // Check every item
            (state) => state.opacity === '0',
        ),
    ).toBe(true);
    expect(states.fade.transition).toBe('opacity 1000ms ease-out');
    expect(states.scale.transform).toContain('scale(0.96)');
    expect(states['slide-left'].transform).toContain('translateX(-1.5rem)');
    expect(states['slide-right'].transform).toContain('translateX(1.5rem)');
    expect(states.blur.filter).toContain('blur(8px)');
    expect(states.scale.willChange).toBe('opacity, transform');
    expect(states.blur.willChange).toBe('opacity, filter');

    await page.evaluate(
        // Read the browser state
        () =>
            window.presetDynamics.forEach(
                // Process the current item
                (dynamic) => dynamic.remove(),
            ),
    );
});

test('dynamic switching cancels stale transitions, validates targets, preserves styles and focus, and clears removed targets', async ({
    page,
}) => {
    // Exercise the test scenario
    await preparePage(page);
    const pageErrors = [];
    page.on(
        'pageerror',
        // Handle the pageerror event
        (error) => pageErrors.push(error.message),
    );
    await page.evaluate(() => {
        // Read the browser state
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            // Return a mutable media-query fixture
            value: () => ({
                matches: Boolean(window.__reduceMotion),
                addEventListener() {
                    // Provide the no-op media query listener required by the fixture
                },
                removeEventListener() {
                    // Remove event listener
                },
            }),
        });
        document.startViewTransition = (callback) => {
            // Read the browser state
            window.__viewTransitionCalls = (window.__viewTransitionCalls || 0) + 1;
            callback();
            return {
                ready: Promise.reject(new Error('Transition was skipped')),
                updateCallbackDone: Promise.resolve(),
                finished: Promise.resolve(),
            };
        };
    });
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        const makeTemplate = label => {
            const template = document.createElement('template');
            template.innerHTML = '<button data-acl-autofocus>' + label + '</button>';
            return template;
        };
        await Loader.define('switch-one', makeTemplate('one'));
        await Loader.define('switch-two', makeTemplate('two'));
        await Loader.registerDynamicLoader();
        const dynamic = document.createElement('acl-dynamic');
        dynamic.setAttribute('transition', 'fade');
        dynamic.setAttribute('transition-duration', '40');
        dynamic.setAttribute('style', 'opacity:0.6;transition:color 2s linear');
        window.dynamicErrors = [];
        dynamic.addEventListener('acl:error', event => window.dynamicErrors.push(event.detail.error.code));
        dynamic.setAttribute('is', 'switch-one');
        document.body.appendChild(dynamic);
        window.dynamic = dynamic;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.dynamic?.firstElementChild?.localName === 'switch-one' &&
            window.dynamic.firstElementChild._state === 'ready' &&
            window.dynamic.firstElementChild.querySelector('button'),
    );
    await page.evaluate(() => {
        // Read the browser state
        window.dynamic.firstElementChild.querySelector('button').focus();
        window.dynamic.setAttribute('is', 'switch-two');
        window.dynamic.setAttribute('is', 'switch-one');
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.dynamic.getAttribute('aria-busy') === 'false' &&
            window.dynamic.firstElementChild?.localName === 'switch-one',
    );
    const state = await page.evaluate(
        // Read the browser state
        () => ({
            tag: window.dynamic.firstElementChild.localName,
            opacity: window.dynamic.firstElementChild.style.opacity,
            transition: window.dynamic.firstElementChild.style.transition,
            focused: document.activeElement?.textContent,
            viewTransitionCalls: window.__viewTransitionCalls || 0,
        }),
    );
    expect(state).toEqual({
        tag: 'switch-one',
        opacity: '0.6',
        transition: 'color 2s linear',
        focused: 'one',
        viewTransitionCalls: 0,
    });

    await page.evaluate(() => {
        // Read the browser state
        window.__reduceMotion = true;
        window.dynamic.setAttribute('transition', 'auto');
        window.dynamic.setAttribute('is', 'switch-two');
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.dynamic.firstElementChild?.localName === 'switch-two',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.__viewTransitionCalls || 0,
        ),
    ).toBe(0);

    await page.evaluate(() => {
        // Read the browser state
        window.__reduceMotion = false;
        window.dynamic.setAttribute('is', 'switch-one');
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.dynamic.getAttribute('aria-busy') === 'false' &&
            window.dynamic.firstElementChild?.localName === 'switch-one',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.__viewTransitionCalls || 0,
        ),
    ).toBe(1);
    expect(pageErrors).toEqual([]);

    await page.evaluate(
        // Read the browser state
        () => window.dynamic.setAttribute('is', 'missing-card'),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.dynamicErrors.length === 1,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.dynamicErrors,
        ),
    ).toEqual(['ACL_DYNAMIC_COMPONENT_MISSING']);
    await page.evaluate(
        // Read the browser state
        () => window.dynamic.removeAttribute('is'),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.dynamic.children.length === 0,
    );
});

test('dynamic removal performs one idempotent teardown per child', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false, dynamicTransition: 'none' });
        await Loader.start();
        window.dynamicLifecycle = { oneUnmounted: 0, oneCleanup: 0, twoUnmounted: 0, twoCleanup: 0 };
        await Loader.define('dynamic-life-one', '${baseUrl}/templates/simple.html', {
            hooks: {
                mounted() { return () => window.dynamicLifecycle.oneCleanup++; },
                unmounted() { window.dynamicLifecycle.oneUnmounted++; }
            }
        });
        await Loader.define('dynamic-life-two', '${baseUrl}/templates/simple.html', {
            hooks: {
                mounted() { return () => window.dynamicLifecycle.twoCleanup++; },
                unmounted() { window.dynamicLifecycle.twoUnmounted++; }
            }
        });
        await Loader.registerDynamicLoader('lifecycle-dynamic');
        const loader = document.createElement('lifecycle-dynamic');
        loader.setAttribute('transition', 'none');
        loader.setAttribute('is', 'dynamic-life-one');
        document.body.appendChild(loader);
        window.dynamicLoader = loader;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.dynamicLoader?.firstElementChild?._state === 'ready',
    );
    await page.evaluate(
        // Read the browser state
        () => window.dynamicLoader.setAttribute('is', 'dynamic-life-two'),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            window.dynamicLoader.firstElementChild?.localName === 'dynamic-life-two' &&
            window.dynamicLoader.firstElementChild._state === 'ready',
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.dynamicLifecycle.oneUnmounted === 1 && window.dynamicLifecycle.oneCleanup === 1,
    );
    await page.evaluate(
        // Read the browser state
        () => window.dynamicLoader.removeAttribute('is'),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () =>
            !window.dynamicLoader.firstElementChild &&
            window.dynamicLifecycle.twoUnmounted === 1 &&
            window.dynamicLifecycle.twoCleanup === 1,
    );
    await page.waitForTimeout(300);
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.dynamicLifecycle,
        ),
    ).toEqual({
        oneUnmounted: 1,
        oneCleanup: 1,
        twoUnmounted: 1,
        twoCleanup: 1,
    });
});

test('idle loading work is canceled when a component disconnects before load', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.evaluate(() => {
        // Read the browser state
        window.__idleCallbacks = [];
        Object.defineProperty(window, 'requestIdleCallback', {
            configurable: true,
            value: (callback) => {
                // Run the value operation
                window.__idleCallbacks.push(callback);
                return 42;
            },
        });
        Object.defineProperty(window, 'cancelIdleCallback', {
            configurable: true,
            value: (id) => {
                // Run the value operation
                window.__idleCanceled = id;
            },
        });
    });
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('idle-cancel-card', '${baseUrl}/templates/simple.html', {
            loading: 'idle'
        });
        const el = document.createElement('idle-cancel-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.__idleCallbacks.length === 1,
    );
    await page.evaluate(
        // Read the browser state
        () => window.el.remove(),
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.__idleCanceled,
        ),
    ).toBe(42);
    await page.evaluate(
        // Read the browser state
        () => window.__idleCallbacks[0](),
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.el._state === 'ready',
        ),
    ).toBe(false);
});

test('disconnect cancels Alpine initialization listeners and timeout ownership', async ({ page }) => {
    // Exercise the test scenario
    await page.goto(`${baseUrl}/blank`);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        const template = document.createElement('template');
        template.id = 'alpine-wait-template';
        template.innerHTML = '<div id="waiting-for-alpine">waiting</div>';
        document.body.appendChild(template);
        await Loader.define('alpine-wait-card', '#alpine-wait-template');
        const el = document.createElement('alpine-wait-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => typeof window.el?._alpineWaitCleanup === 'function',
    );
    await page.evaluate(
        // Read the browser state
        () => window.el.remove(),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el._state === 'destroyed',
    );
    await page.addScriptTag({ content: alpineStubSource() });
    await page.evaluate(
        // Read the browser state
        () => document.dispatchEvent(new Event('alpine:init')),
    );
    const state = await page.evaluate(
        // Read the browser state
        () => ({
            state: window.el._state,
            initialized: window.el._state === 'ready',
            hasWaitCleanup: window.el._alpineWaitCleanup !== null,
            childCount: window.el._root.childNodes.length,
        }),
    );
    expect(state).toEqual({
        state: 'destroyed',
        initialized: false,
        hasWaitCleanup: false,
        childCount: 0,
    });
});

test('keep-alive reactivation restarts polling and light DOM slot observation', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('resume-card', '${baseUrl}/templates/slot.html', {
            data: {
                src: '${baseUrl}/api/count?name=resume',
                poll: 25
            }
        });
        const el = document.createElement('resume-card');
        el.setAttribute('keep-alive', '');
        el.append('initial slot');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready' && window.el.$props.$data?.count >= 2,
    );
    await page.evaluate(
        // Read the browser state
        () => window.el.remove(),
    );
    await page.waitForTimeout(50);
    const whileDetached = await page.evaluate(
        // Read the browser state
        () => window.el.$props.$data.count,
    );
    await page.waitForTimeout(80);
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.el.$props.$data.count,
        ),
    ).toBe(whileDetached);

    await page.evaluate(() => {
        // Read the browser state
        document.body.appendChild(window.el);
        const added = document.createElement('strong');
        added.id = 'added-after-resume';
        added.textContent = 'resumed slot';
        window.el.appendChild(added);
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        (count) => window.el.$props.$data?.count > count,
        whileDetached,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.el.querySelector('[data-acl-slot] #added-after-resume')?.textContent,
        ),
    ).toBe('resumed slot');
});

test('destroyed light DOM components reconnect without capturing rendered template nodes as slots', async ({
    page,
}) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('reconnect-card', '${baseUrl}/templates/slot.html');
        const el = document.createElement('reconnect-card');
        const content = document.createElement('span');
        content.id = 'consumer-slot';
        content.textContent = 'consumer';
        el.appendChild(content);
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    await page.evaluate(
        // Read the browser state
        () => window.el.remove(),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'destroyed',
    );
    await page.evaluate(
        // Read the browser state
        () => document.body.appendChild(window.el),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready' && window.el._state === 'ready',
    );
    const state = await page.evaluate(
        // Read the browser state
        () => ({
            slotContainers: window.el.querySelectorAll('[data-acl-slot]').length,
            templateRoots: window.el.querySelectorAll('#slot').length,
            consumerNodes: window.el.querySelectorAll('#consumer-slot').length,
            text: window.el.querySelector('[data-acl-slot]')?.textContent.trim(),
        }),
    );
    expect(state).toEqual({
        slotContainers: 1,
        templateRoots: 1,
        consumerNodes: 1,
        text: 'consumer',
    });
});

test('persistence helpers preserve false, zero, and empty string values', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('persist-card', '${baseUrl}/templates/simple.html', {
            persist: 'session',
            persistKey: 'persist-falsy',
            persistDebounce: 1
        });
        const el = document.createElement('persist-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    const state = await page.evaluate(async () => {
        // Read the browser state
        await window.el.$props.$persistence.$save({
            flag: false,
            count: 0,
            text: '',
        });
        await window.el.$props.$persistence.$flush();
        return {
            flag: await window.el.$props.$persistence.$get('flag', true),
            count: await window.el.$props.$persistence.$get('count', 9),
            text: await window.el.$props.$persistence.$get('text', 'fallback'),
            raw: sessionStorage.getItem('persist-falsy'),
        };
    });

    expect(state.flag).toBe(false);
    expect(state.count).toBe(0);
    expect(state.text).toBe('');
    expect(state.raw).toBe('{"version":1,"data":{"flag":false,"count":0,"text":""}}');
});

test('IndexedDB persistence restores, reads, and clears component state', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader, { createIndexedDBPersistenceAdapter } from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('indexeddb-card', '${baseUrl}/templates/simple.html', {
            attributes: { note: { type: String, default: 'fresh' } },
            persist: 'indexeddb',
            persistKey: 'persist-indexeddb',
            persistDebounce: 0
        });
        window.indexedDBAdapter = createIndexedDBPersistenceAdapter();
        const first = document.createElement('indexeddb-card');
        document.body.appendChild(first);
        window.indexedDBCards = { first };
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.indexedDBCards?.first._state === 'ready',
    );
    await page.evaluate(async () => {
        // Read the browser state
        await window.indexedDBCards.first.$props.$persistence.$save({ note: 'stored' });
        await window.indexedDBCards.first.$props.$persistence.$flush();
        window.indexedDBCards.first.remove();
        const second = document.createElement('indexeddb-card');
        document.body.appendChild(second);
        window.indexedDBCards.second = second;
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.indexedDBCards?.second._state === 'ready',
    );

    const restored = await page.evaluate(
        // Read the browser state
        async () => ({
            note: window.indexedDBCards.second.$props.note,
            stored: JSON.parse(await window.indexedDBAdapter.getItem('persist-indexeddb')),
        }),
    );
    expect(restored).toEqual({
        note: 'stored',
        stored: {
            version: 1,
            data: { note: 'stored' },
        },
    });

    const cleared = await page.evaluate(async () => {
        // Read the browser state
        await window.indexedDBCards.second.$props.$persistence.$clear();
        return await window.indexedDBAdapter.getItem('persist-indexeddb');
    });
    expect(cleared).toBeNull();
    await page.evaluate(
        // Read the browser state
        () => window.indexedDBAdapter.close(),
    );
});

test('persistence migrates versioned records and adapter failures stay inside the error boundary', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.evaluate(
        // Read the browser state
        () =>
            sessionStorage.setItem(
                'versioned-state',
                JSON.stringify({
                    version: 1,
                    data: { count: 2 },
                }),
            ),
    );
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('migrated-card', '${baseUrl}/templates/simple.html', {
            attributes: { count: { type: Number, default: 0 } },
            persist: 'session', persistKey: 'versioned-state', persistVersion: 2, persistDebounce: 0,
            persistMigrate(data, context) {
                window.__migrationContext = context;
                return { ...data, count: data.count + 1 };
            }
        });
        await Loader.define('failed-storage-card', '${baseUrl}/templates/simple.html', {
            persist: 'custom',
            persistAdapter: {
                getItem() { throw new DOMException('denied', 'SecurityError'); },
                setItem() { throw new DOMException('full', 'QuotaExceededError'); },
                removeItem() { throw new DOMException('denied', 'SecurityError'); }
            }
        });
        const migrated = document.createElement('migrated-card');
        const failed = document.createElement('failed-storage-card');
        window.persistenceErrors = [];
        failed.addEventListener('acl:error', event => window.persistenceErrors.push({
            code: event.detail.error.code,
            phase: event.detail.phase,
            operation: event.detail.operation,
        }));
        document.body.append(migrated, failed);
        window.cards = { migrated, failed };
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.cards?.migrated._state === 'ready' && window.cards.failed._state === 'ready',
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.persistenceErrors.length >= 1,
    );
    const state = await page.evaluate(async () => {
        // Read the browser state
        await window.cards.migrated.$props.$persistence.$flush();
        return {
            count: window.cards.migrated.$props.count,
            migration: {
                fromVersion: window.__migrationContext.fromVersion,
                toVersion: window.__migrationContext.toVersion,
                key: window.__migrationContext.key,
            },
            stored: JSON.parse(sessionStorage.getItem('versioned-state')),
            failedReady: window.cards.failed._state,
            errors: window.persistenceErrors,
        };
    });
    expect(state.count).toBe(3);
    expect(state.migration).toEqual({
        fromVersion: 1,
        toVersion: 2,
        key: 'versioned-state',
    });
    expect(state.stored).toEqual({
        version: 2,
        data: { count: 3 },
    });
    expect(state.failedReady).toBe('ready');
    expect(state.errors).toContainEqual({
        code: 'ACL_PERSISTENCE_FAILED',
        phase: 'persistence',
        operation: 'read',
    });
});

test('persistence rejects unversioned records without invoking migration', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.evaluate(
        // Read the browser state
        () => sessionStorage.setItem('unversioned-state', JSON.stringify({ count: 8 })),
    );
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false });
        await Loader.start();
        await Loader.define('unversioned-card', '${baseUrl}/templates/simple.html', {
            attributes: { count: { type: Number, default: 0 } },
            persist: 'session',
            persistKey: 'unversioned-state',
            persistVersion: 2,
            persistMigrate(data) {
                window.__unversionedMigrations++;
                return data;
            }
        });
        window.__unversionedMigrations = 0;
        const element = document.createElement('unversioned-card');
        window.__unversionedErrors = [];
        element.addEventListener('acl:error', event => window.__unversionedErrors.push({
            code: event.detail.error.code,
            operation: event.detail.operation,
        }));
        document.body.appendChild(element);
        window.unversionedElement = element;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.unversionedElement?._state === 'ready' && window.__unversionedErrors.length,
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                count: window.unversionedElement.$props.count,
                migrations: window.__unversionedMigrations,
                stored: JSON.parse(sessionStorage.getItem('unversioned-state')),
                errors: window.__unversionedErrors,
            }),
        ),
    ).toEqual({
        count: 0,
        migrations: 0,
        stored: { count: 8 },
        errors: [
            {
                code: 'ACL_PERSISTENCE_FAILED',
                operation: 'read',
            },
        ],
    });
});

test('loaded lifecycle hook runs after Alpine initTree', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('loaded-hook-card', '${baseUrl}/templates/data.html', {
            hooks: {
                loaded() {
                    window.__loadedHookSawInit = window.__initTreeRan === true;
                }
            }
        });
        const el = document.createElement('loaded-hook-card');
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
            () => window.__loadedHookSawInit,
        ),
    ).toBe(true);
});

test('async lifecycle hooks are awaited, receive fetch context, and release returned cleanups', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        window.__hookOrder = [];
        await Loader.define('async-hook-card', '${baseUrl}/templates/data.html', {
            data: { src: '${baseUrl}/api/count?name=hook-context' },
            hooks: {
                async beforeMount() { await Promise.resolve(); window.__hookOrder.push('before'); },
                beforeFetch(options, context) {
                    window.__fetchContextTag = context.el.localName;
                    return options;
                },
                async mounted() {
                    await Promise.resolve();
                    window.__hookOrder.push('mounted');
                    return () => window.__hookOrder.push('cleanup');
                },
                async loaded() { await Promise.resolve(); window.__hookOrder.push('loaded'); }
            }
        });
        const el = document.createElement('async-hook-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready' && window.__hookOrder.includes('loaded'),
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                order: window.__hookOrder,
                contextTag: window.__fetchContextTag,
            }),
        ),
    ).toEqual({
        order: ['before', 'mounted', 'loaded'],
        contextTag: 'async-hook-card',
    });
    await page.evaluate(
        // Read the browser state
        () => window.el.remove(),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el._state === 'destroyed',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => window.__hookOrder,
        ),
    ).toContain('cleanup');
});

test('cleanup draining uses a bounded snapshot when a cleanup registers more work', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        window.cleanupCounts = { outer: 0, nested: 0 };
        await Loader.define('cleanup-snapshot-card', '${baseUrl}/templates/simple.html', {
            hooks: {
                mounted() {
                    const el = this;
                    return () => {
                        window.cleanupCounts.outer++;
                        el._addCleanup(() => window.cleanupCounts.nested++);
                    };
                }
            }
        });
        const el = document.createElement('cleanup-snapshot-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready',
    );
    await page.evaluate(
        // Read the browser state
        () => window.el.reload(),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.cleanupCounts.outer === 1 && window.el._state === 'ready',
    );
    await page.evaluate(
        // Read the browser state
        () => window.el.reload(),
    );
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.cleanupCounts.outer === 2 && window.cleanupCounts.nested === 1 && window.el._state === 'ready',
    );
    const state = await page.evaluate(
        // Read the browser state
        () => ({
            ...window.cleanupCounts,
            pending: window.el._cleanups?.length || 0,
        }),
    );
    expect(state).toEqual({
        outer: 2,
        nested: 1,
        pending: 3,
    });
});

test('persistence debounce shares one promise and flushes pending work during teardown', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        window.persistenceWrites = [];
        const adapter = {
            async getItem() { return null; },
            async setItem(key, value) { window.persistenceWrites.push(JSON.parse(value)); },
            async removeItem() {}
        };
        await Loader.define('persistence-dispose-card', '${baseUrl}/templates/simple.html', {
            persist: 'custom', persistAdapter: adapter, persistDebounce: 10000
        });
        const el = document.createElement('persistence-dispose-card');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready' && window.el.$props.$persistence,
    );
    await page.evaluate(() => {
        // Read the browser state
        const first = window.el.$props.$persistence.$save({ count: 1 }),
            second = window.el.$props.$persistence.$save({ count: 2 });
        window.persistenceSamePromise = first === second;
        window.persistenceSettled = false;
        Promise.all([first, second]).then(() => {
            // Handle the resolved operation
            window.persistenceSettled = true;
        });
        window.el.remove();
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el._state === 'destroyed' && window.persistenceSettled,
    );
    const state = await page.evaluate(
        // Read the browser state
        () => ({
            samePromise: window.persistenceSamePromise,
            writes: window.persistenceWrites,
            cleanups: window.el._cleanups?.length || 0,
            hasDispose: window.el._persistenceDispose !== null,
        }),
    );
    expect(state.samePromise).toBe(true);
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].data).toEqual({ count: 2 });
    expect(state.cleanups).toBe(0);
    expect(state.hasDispose).toBe(false);
});

test('automatic persistence snapshots current props when an immediate flush drains the debounce', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        window.persistenceRecord = null;
        const adapter = {
            async getItem() { return null; },
            async setItem(key, value) { window.persistenceRecord = JSON.parse(value); },
            async removeItem() { window.persistenceRecord = null; }
        };
        await Loader.define('persistence-flush-card', '${baseUrl}/templates/simple.html', {
            attributes: { note: String },
            persist: 'custom',
            persistAdapter: adapter,
            persistDebounce: 10000
        });
        const el = document.createElement('persistence-flush-card');
        el.setAttribute('note', 'before');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready' && window.el.$props.$persistence,
    );
    const record = await page.evaluate(async () => {
        // Read the browser state
        window.el.$props.note = 'after';
        await window.el.$props.$persistence.$flush();
        return window.persistenceRecord;
    });

    expect(record).toEqual({
        version: 1,
        data: { note: 'after' },
    });
});

test('persistence teardown releases effects and pagehide listeners even when a pending adapter write fails', async ({
    page,
}) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.evaluate(() => {
        // Read the browser state
        window.persistenceResourceState = {
            pagehide: 0,
            releases: 0,
        };
        const nativeAdd = window.addEventListener.bind(window),
            nativeRemove = window.removeEventListener.bind(window);
        window.addEventListener = (type, listener, options) => {
            // Read the browser state
            if (type === 'pagehide') window.persistenceResourceState.pagehide++;
            return nativeAdd(type, listener, options);
        };
        window.removeEventListener = (type, listener, options) => {
            // Read the browser state
            if (type === 'pagehide') window.persistenceResourceState.pagehide--;
            return nativeRemove(type, listener, options);
        };
        window.Alpine.release = () => {
            // Read the browser state
            return window.persistenceResourceState.releases++;
        };
    });
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('failing-dispose-card', '${baseUrl}/templates/simple.html', {
            persist: 'custom',
            persistDebounce: 10000,
            persistAdapter: {
                getItem() { return null; },
                setItem() { throw new DOMException('full', 'QuotaExceededError'); },
                removeItem() {}
            }
        });
        const el = document.createElement('failing-dispose-card');
        window.persistenceTeardownErrors = [];
        el.addEventListener('acl:error', event => window.persistenceTeardownErrors.push(event.detail.operation));
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el?._state === 'ready' && window.persistenceResourceState.pagehide === 1,
    );
    await page.evaluate(() => {
        // Read the browser state
        void window.el.$props.$persistence.$save({ current: true }).catch(() => {
            // Keep the intentionally rejected fixture write detached
        });
        window.el.remove();
    });
    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.el._state === 'destroyed',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                resources: window.persistenceResourceState,
                errors: window.persistenceTeardownErrors,
                dispose: window.el._persistenceDispose,
                helper: window.el.$props.$persistence,
                cleanups: window.el._cleanups?.length || 0,
            }),
        ),
    ).toEqual({
        resources: {
            pagehide: 0,
            releases: 2,
        },
        errors: ['write'],
        dispose: null,
        helper: undefined,
        cleanups: 0,
    });
});

test('disconnecting a loading component releases its ownership of slow shared assets', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    let releaseAssetRoute;
    const assetRouteGate = new Promise((resolve) => {
        // Settle the asynchronous operation
        releaseAssetRoute = resolve;
    });
    await page.route('**/style/component-slow.css', async (route) => {
        // Handle the routed request
        await assetRouteGate;
        await route.fulfill({
            contentType: 'text/css',
            body: 'body { --acl-released-slow-asset: 1; }',
        });
    });
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('slow-asset-owner', '${baseUrl}/templates/simple.html', {
            shadow: true,
            externalCss: [{ url: '${baseUrl}/style/component-slow.css', timeout: 10000 }]
        });
        const el = document.createElement('slow-asset-owner');
        document.body.appendChild(el);
        window.el = el;
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => document.head.querySelector('link[href$="/style/component-slow.css"]'),
    );
    // Guard the operation against runtime failures
    try {
        await page.evaluate(
            // Read the browser state
            () => window.el.remove(),
        );
        await page.waitForFunction(
            // Check whether the expected browser state is ready
            () => window.el._state === 'destroyed',
            null,
            { timeout: 1200 },
        );
        expect(
            await page.evaluate(
                // Read the browser state
                () => ({
                    activeLoad: window.el._activeLoadPromise,
                    loadController: window.el._loadAbortController,
                    initialized: window.el._state === 'ready',
                    cleanups: window.el._cleanups?.length || 0,
                }),
            ),
        ).toEqual({
            activeLoad: null,
            loadController: null,
            initialized: false,
            cleanups: 0,
        });
    } finally {
        releaseAssetRoute();
        await page.unrouteAll({ behavior: 'wait' });
    }
});

test('props support coercion, nullability, nested schemas, reflection, and strict validation', async ({ page }) => {
    // Exercise the test scenario
    await preparePage(page);
    await page.addScriptTag({
        type: 'module',
        content: `
        import Loader from '${baseUrl}/src/index.js';
        Loader.config({ autoStart: false, executeScripts: true, sanitize: false });
        await Loader.start();
        await Loader.define('advanced-prop-card', '${baseUrl}/templates/simple.html', {
            attributes: {
                label: { type: String, coerce: value => value.toUpperCase() },
                note: { type: String, nullable: true },
                score: { type: Number, reflect: true },
                config: {
                    type: Object,
                    default: () => ({ profile: { name: 'fallback' } }),
                    schema: { profile: { type: Object, required: true, schema: { name: { type: String, required: true } } } }
                }
            }
        });
        await Loader.define('strict-prop-card', '${baseUrl}/templates/simple.html', {
            strictProps: true,
            attributes: { count: { type: Number, required: true } }
        });
        const el = document.createElement('advanced-prop-card');
        el.setAttribute('label', 'hello');
        el.setAttribute('note', 'null');
        el.setAttribute('config', '{"profile":{"name":"valid"}}');
        document.body.appendChild(el);
        const strict = document.createElement('strict-prop-card');
        let strictError = false;
        try { strict._updateProp('count', 'not-a-number'); } catch (error) { strictError = error instanceof TypeError; }
        el.score = 7;
        window.propState = {
            el,
            strictError,
        };
    `,
    });

    await page.waitForFunction(
        // Check whether the expected browser state is ready
        () => window.propState?.el._state === 'ready',
    );
    expect(
        await page.evaluate(
            // Read the browser state
            () => ({
                label: window.propState.el.$props.label,
                note: window.propState.el.$props.note,
                score: window.propState.el.$props.score,
                reflectedScore: window.propState.el.getAttribute('score'),
                config: window.propState.el.$props.config,
                strictError: window.propState.strictError,
            }),
        ),
    ).toEqual({
        label: 'HELLO',
        note: null,
        score: 7,
        reflectedScore: '7',
        config: { profile: { name: 'valid' } },
        strictError: true,
    });
});
