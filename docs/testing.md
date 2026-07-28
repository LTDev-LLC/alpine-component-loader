# Testing utilities

The `alpine-component-loader/testing` entry provides small browser helpers for mounting components, waiting for lifecycle states, recording ACL events, and mocking fetch. Importing the entry is SSR-safe; calling DOM helpers requires a real browser or browser-like test environment.

## Running browser tests

Install the repository dependencies with Node.js 22 or newer. The checked-in
Playwright packages use one exact version so the installer and test runner
always expect the same browser revisions:

```bash
npm ci
npm run playwright:install -- chromium firefox webkit
```

The install command downloads all three supported engines. To install only one
engine, pass just `chromium`, `firefox`, or `webkit`. On Linux CI runners, use
`npm run playwright:install:ci -- <browser>` to install the browser and its
system dependencies.

Repository test scripts perform the matching install preflight automatically:

```bash
npm run test:browser          # Chromium
npm run test:other-browsers   # Firefox and WebKit
npm run test:cross-browser    # Chromium, Firefox, and WebKit
```

For direct Playwright CLI use, install browsers before running tests. The
command is `npx playwright install`, not `npx install playwright`:

```bash
npx playwright install chromium firefox webkit
npx playwright test
```

Use the helpers from a browser test module compiled or served by the application:

```js
import {
    installFetchMock,
    mountComponent,
    recordACLEvents,
    waitForComponent,
} from 'alpine-component-loader/testing';
```

The test page must load a compatible Alpine 3.14-3.x build, assign it to `window.Alpine`, and start it once as part of fixture setup. Do not call `Alpine.start()` independently in every test.

Representative runner commands are:

```bash
npx playwright test
npx playwright test tests/profile-card.spec.js --project=chromium
```

Playwright test callbacks run in Node, so call DOM helpers in page-loaded browser code or through `page.evaluate()` after exposing a browser-resolvable test-support module. Browser-mode runners may import the helpers directly in the test module.

## Mount, update, and unmount

`mountComponent()` defines a unique inline custom-element name by default, starts or reuses a loader, mounts it, and waits for the requested lifecycle state:

```js
const mounted = await mountComponent({
    template: `
        <article>
            <h2 x-text="$props.name"></h2>
            <slot></slot>
        </article>
    `,
    options: {
        shadow: true,
        attributes: {
            name: { type: String, required: true },
            count: Number,
        },
    },
    attributes: { name: 'Ada' },
    properties: { count: 3 },
    slots: '<p>Maintainer</p>',
});

try {
    console.assert(mounted.element.shadowRoot.querySelector('h2').textContent === 'Ada');

    await mounted.update({
        attributes: { name: 'Grace' },
        properties: { count: 4 },
    });

    await mounted.reload({ preserveState: true, clearTemplate: false });
} finally {
    await mounted.unmount();
}
```

Mount options are:

| Option | Default | Contract |
| --- | --- | --- |
| `loader` | shared loader | Loader class used for definition and startup. |
| `tagName` | unique `acl-test-*` | Explicit custom-element name when a stable tag is required. |
| `template` | empty | Inline component markup. |
| `options` | `{}` | Component definition options. |
| `attributes` | `{}` | Initial HTML attribute values. |
| `properties` | `{}` | Initial direct property values. |
| `slots` | `{}` | Default string/node or named slot map. |
| `container` | `document.body` | Parent that owns the mounted host. |
| `state` | `ready` | Lifecycle state awaited after insertion. |
| `timeout` | `2000` | Wait deadline in milliseconds. |
| `signal` | none | Abort signal for the lifecycle wait. |

The returned mount handle contains the mounted `element` plus `update(values)`, `reload(options)`, and `unmount()` methods.

`attributes` follow HTML semantics: `true` creates a presence attribute, while `false`, `null`, and `undefined` omit or remove it. `properties` are assigned directly. Slots may be strings, nodes, arrays, or a record of default/named slot values:

```js
const mounted = await mountComponent({
    template: '<slot name="avatar"></slot><slot></slot>',
    options: { shadow: true },
    slots: {
        avatar: '<img src="/avatar.webp" alt="">',
        default: ['<p>Maintainer</p>', document.createTextNode('Active')],
    },
});
```

`unmount()` is idempotent and explicitly waits for component destruction. Always call it in `finally` or runner cleanup.

## Avoid custom-element collisions

The platform cannot unregister custom elements. Let `mountComponent()` generate a unique tag for repeated tests:

```js
const first = await mountComponent({ template: '<p>First</p>' });
const second = await mountComponent({ template: '<p>Second</p>' });

console.assert(first.element.localName !== second.element.localName);
```

Supply `tagName` only when the test needs a predictable name, and ensure the suite never tries to define that name with a different class or template.

A custom `container` can isolate mounts beneath one fixture:

```js
const fixture = document.querySelector('#test-fixture');
const mounted = await mountComponent({
    container: fixture,
    template: '<p>Scoped fixture</p>',
});
```

## Wait for lifecycle states

`waitForComponent()` waits for `ready`, `error`, or `destroyed` with timeout and abort support:

```js
const card = document.querySelector('profile-card');
await waitForComponent(card, { state: 'ready', timeout: 3000 });

card.remove();
await waitForComponent(card, { state: 'destroyed', timeout: 1000 });
```

Its options are requested `state`, positive `timeout`, and optional `signal`.
An already-matching component resolves immediately; timeout and abort paths
always release polling and event listeners.

Abort a pending wait when the owning test or route ends:

```js
const controller = new AbortController();
const waiting = waitForComponent(card, {
    state: 'ready',
    timeout: 5000,
    signal: controller.signal,
});

controller.abort('test-finished');
await waiting.catch(error => console.assert(error.name === 'AbortError'));
```

An error-state waiter resolves from `acl:error` or the component's terminal error state. A timeout rejects with the requested state in its message. Waiters remove their timers and listeners on every outcome.

## Record ACL events

Create the recorder before the action under test:

```js
const recorder = recordACLEvents(document, [
    'acl:loadstart',
    'acl:loadend',
    'acl:error',
]);

try {
    const mounted = await mountComponent({ template: '<p>Ready</p>' });
    const loadEnd = await recorder.waitFor('acl:loadend');

    console.assert(loadEnd.detail.tagName === mounted.element.localName);
    console.assert(recorder.records.map(event => event.type).includes('acl:loadstart'));

    recorder.clear();
    await mounted.unmount();
} finally {
    recorder.stop();
}
```

The recorder exposes the live `records` array, `waitFor(name)`, `clear()`, and `stop()`.

The default event list covers loading, errors, cache activity, revalidation, and hydration. `waitFor(name)` returns an event already recorded or waits for the next one. `stop()` is idempotent, removes listeners, and rejects pending event waiters so tests do not hang.

## Mock successful requests

`installFetchMock()` replaces the selected target's `fetch`, records requests, and matches exact URLs, regular expressions, or callbacks:

```js
const profileUrl = new URL('/api/profile', location.href).href;
const mock = installFetchMock([
    {
        match: profileUrl,
        method: 'GET',
        response: { id: 'user-1', name: 'Ada' },
        headers: { 'cache-control': 'max-age=60' },
    },
]);

const mounted = await mountComponent({
    template: '<p x-text="$data?.name"></p>',
    options: { data: { src: '/api/profile' } },
});

try {
    console.assert(mock.requests.length === 1);
    console.assert(mock.requests[0].method === 'GET');
    console.assert(mounted.element.textContent.includes('Ada'));
} finally {
    await mounted.unmount();
    mock.restore();
}
```

Object responses are serialized as JSON and receive a JSON content type. Return an explicit `Response` when a test needs streams, unusual status text, or complete header control.

Each mock route may use:

| Field | Contract |
| --- | --- |
| `match` | Exact URL, regular expression, or normalized-request predicate. |
| `url` | URL/regular-expression shorthand when `match` is omitted. |
| `method` | Optional case-insensitive HTTP method filter. |
| `response` | Value, `Response`, or sync/async response factory. |
| `body` | Fallback response body when `response` is absent. |
| `status` | Response status, defaulting to `200`. |
| `headers` | Additional response headers. |
| `delay` | Abort-aware response delay in milliseconds. |

## Mock errors, delays, and cancellation

Model a retryable server response:

```js
const mock = installFetchMock([
    {
        match: /\/api\/profile$/,
        status: 503,
        body: { error: 'temporarily unavailable' },
        headers: { 'retry-after': '0' },
    },
]);

const mounted = await mountComponent({
    template: '<p>Profile</p>',
    options: {
        data: { src: '/api/profile', retries: 1, retryDelay: 0 },
    },
});

console.assert(mock.requests.length === 2);
await mounted.unmount();
mock.restore();
```

Use `delay` to test cancellation. The mock observes the request's `AbortSignal` and rejects with `AbortError`:

```js
const mock = installFetchMock([
    { match: /\/api\/slow$/, delay: 1000, response: { ready: true } },
]);

const controller = new AbortController();
const request = fetch('/api/slow', { signal: controller.signal });
controller.abort('superseded');

await request.catch(error => console.assert(error.name === 'AbortError'));
mock.restore();
```

The returned fetch-mock controller exposes:

| Member | Result |
| --- | --- |
| `requests` | Live normalized request records containing `url`, `method`, `headers`, and the original `request`. |
| `reset(nextRoutes)` | Clear request history and optionally replace the route table. |
| `restore()` | Restore the target's original `fetch`; safe to call during cleanup. |

An unmatched request throws immediately with its method and URL, preventing accidental network access.

## Automatic test harness

`createACLTestHarness()` creates an isolated loader and owns every mount, event recorder, and fetch mock created through it. `cleanup()` unmounts components, restores fetch, stops recorders, and disposes the loader. `reset()` performs the same cleanup and creates a fresh isolated loader. Use `assertLifecycleSequence()` or `harness.assertLifecycle()` for ordered lifecycle assertions:

```js
const harness = createACLTestHarness();
const events = harness.record(document, ['acl:loadstart', 'acl:loadend']);
await harness.mount({ template: '<p>ready</p>' });

harness.assertLifecycle(events.records, ['acl:loadstart', 'acl:loadend']);
await harness.cleanup();
```

Harness construction accepts an existing `loader`, isolated `loaderOptions`, a
default `container`, and `disposeLoader`. When no loader is supplied,
`disposeLoader` defaults to `true`.

The harness exposes its current `loader` plus owned `mount()`, `record()`,
`mockFetch()`, and `assertLifecycle()` helpers. `reset()` releases owned
resources and refreshes loader state; `cleanup()` permanently releases the
harness and is idempotent.

## Playwright fixture

`createACLPlaywrightTest()` from `alpine-component-loader/testing/playwright` provides `acl` and optional worker-scoped `aclServer` fixtures:

```js
import { createACLPlaywrightTest, expect } from 'alpine-component-loader/testing/playwright';

const test = createACLPlaywrightTest({
    server: { root: 'test-app' },
    route: '/',
});

test('resets loader state', async ({ acl }) => {
    expect(await acl.metrics()).toBeDefined();
    await acl.reset();
});
```

Fixture factory options are:

| Option | Contract |
| --- | --- |
| `server` | `false` or options forwarded to `startACLTestServer()`. |
| `route` | Page route opened before installing the browser harness; defaults to `/`. |
| `moduleUrl` | Browser-resolvable testing entry when no packaged server is used. |

The `acl` fixture exposes the Playwright `page`, nullable worker `server`,
`reset()`, and `metrics()`. The optional `aclServer` result exposes `origin`,
`url`, resolved `root`, `indexPath`, and `close()`.

The server fixture uses `startACLTestServer()` from `alpine-component-loader/testing/server`, binds to an ephemeral loopback port, disables file watching, and always closes after the worker.

For direct server use, `watchFiles` defaults to `false`. When watching is
enabled, `watchDebounce` defaults to 75 ms and `watchPollInterval` defaults to
5000 ms; set `watchPollInterval: 0` to disable periodic safety scans:

```js
import { startACLTestServer } from 'alpine-component-loader/testing/server';

const server = await startACLTestServer({
    root: 'test-app',
    watchFiles: true,
    watchDebounce: 50,
    watchPollInterval: 0,
});
```

Direct server options include `root`, `index`, loopback `host`, ephemeral or
explicit `port`, `watchFiles`, `watchDebounce`, `watchPollInterval`, and
`injectAllHtml`. The result contains `origin`, alias `url`, resolved `root`,
`indexPath`, `indexUrl`, live `clients`, and async `close()`.

The repository keeps an executable reference at [`tests/testing-integrations.spec.js`](../tests/testing-integrations.spec.js). It verifies worker-scoped server setup, a browser-isolated loader, metrics, event-recorder cleanup, state reset, and final disposal.

## Vitest Browser Mode fixture

`createACLVitestFixture()` accepts Vitest's hooks rather than importing a specific Vitest release:

```js
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createACLVitestFixture } from 'alpine-component-loader/testing/vitest';

const acl = createACLVitestFixture({ beforeEach, afterEach });

it('mounts a component', async () => {
    const mounted = await acl.current.mount({ template: '<p>ready</p>' });
    expect(mounted.element._state).toBe('ready');
});
```

The supplied hooks object must provide `beforeEach` and `afterEach`. The
returned fixture exposes `current` only while a test is running; it is a fresh
harness for each test and is cleaned afterward.

This adapter is intended for Vitest Browser Mode, where DOM, Custom Elements, and Cache APIs are real browser implementations.

## Manual Playwright integration pattern

Expose a small browser module from the test application:

```js
// public/test-support/acl-testing.js
export * from 'alpine-component-loader/testing';
```

Then call it in the page:

```js
import { expect, test } from '@playwright/test';

test('profile-card renders declared props', async ({ page }) => {
    await page.goto('/test-fixture.html');

    const result = await page.evaluate(async () => {
        const { mountComponent } = await import('/test-support/acl-testing.js');
        const mounted = await mountComponent({
            template: '<h2 x-data="{ props: $el.$props }" x-text="props.name"></h2>',
            options: { attributes: { name: String } },
            attributes: { name: 'Ada' },
        });

        try {
            return mounted.element.textContent;
        } finally {
            await mounted.unmount();
        }
    });

    expect(result).toContain('Ada');
});
```

The application dev server or bundler must make the public package specifier browser-resolvable. Use the ready-made fixture when the packaged ephemeral server fits; retain the manual pattern for an existing application server.

## Cleanup checklist

- `await mounted.unmount()` for every mount.
- `recorder.stop()` for every event recorder.
- `mock.restore()` for every fetch mock.
- Abort pending waits owned by a canceled test.
- Avoid reusing explicit custom-element names with different definitions.
- Prefer `createLoader()` or `createACLTestHarness()` when tests change loader configuration.

For lifecycle event order see [Lifecycle, events, and dynamic components](lifecycle.md). For request behavior see [Data, caching, polling, and persistence](data.md).
