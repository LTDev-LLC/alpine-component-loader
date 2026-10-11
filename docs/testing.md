# Testing utilities

`/testing` provides browser helpers for mounting components, waiting for states, recording events, and mocking fetch.
Importing is SSR-safe; DOM operations require a browser or browser-like environment.

## Running browser tests

Use Node.js 22+. Pinned Playwright packages keep installer and test-runner browser revisions aligned:

```bash
npm ci
npm run playwright:install -- chromium firefox webkit
```

The command installs Chromium, Firefox, and WebKit. Pass one engine to limit installation. Linux CI can use
`playwright:install:ci -- <browser>` to include system dependencies.

Repository test scripts perform the matching install preflight automatically:

```bash
npm run test:browser          # Chromium
npm run test:other-browsers   # Firefox and WebKit
npm run test:cross-browser    # Chromium, Firefox, and WebKit
```

For direct CLI use, install browsers first with `npx playwright install`:

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

Fixtures must expose Alpine 3.14-3.x as `window.Alpine` and start it once, rather than per test.

Representative runner commands are:

```bash
npx playwright test
npx playwright test tests/profile-card.spec.js --project=chromium
```

Playwright callbacks run in Node. Invoke DOM helpers in page code or `page.evaluate()` with a browser-resolvable support
module. Browser-mode runners can import directly.

## Mount, update, and unmount

`mountComponent()` generates a unique inline tag, starts/reuses the loader, mounts the element, and waits for the
requested state:

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

| Option       | Default             | Contract                                                    |
| ------------ | ------------------- | ----------------------------------------------------------- |
| `loader`     | shared loader       | Loader class used for definition and startup.               |
| `tagName`    | unique `acl-test-*` | Explicit custom-element name when a stable tag is required. |
| `template`   | empty               | Inline component markup.                                    |
| `options`    | `{}`                | Component definition options.                               |
| `attributes` | `{}`                | Initial HTML attribute values.                              |
| `properties` | `{}`                | Initial direct property values.                             |
| `slots`      | `{}`                | Default string/node or named slot map.                      |
| `container`  | `document.body`     | Parent that owns the mounted host.                          |
| `state`      | `ready`             | Lifecycle state awaited after insertion.                    |
| `timeout`    | `2000`              | Wait deadline in milliseconds.                              |
| `signal`     | none                | Abort signal for the lifecycle wait.                        |

Mount handles expose `element`, `update(values)`, `reload(options)`, and `unmount()`.

`attributes` use HTML semantics: `true` creates presence; `false`, `null`, and `undefined` omit/remove. `properties` are
assigned directly. Slots accept strings, nodes, arrays, or default/named records:

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

`unmount()` is idempotent and waits for destruction. Call it in `finally` or runner cleanup.

## Avoid custom-element collisions

Custom elements cannot be unregistered. Use generated tags for repeated tests:

```js
const first = await mountComponent({ template: '<p>First</p>' });
const second = await mountComponent({ template: '<p>Second</p>' });

console.assert(first.element.localName !== second.element.localName);
```

Use explicit `tagName` only when needed; never redefine it with another class or template.

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

Options are `state`, positive `timeout`, and optional `signal`. Matching states resolve immediately; all outcomes
release timers and listeners.

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

Error waiters resolve on `acl:error` or terminal error state. Timeouts reject with the requested state in the message.

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

Default events cover loads, errors, cache/revalidation, and hydration. `waitFor(name)` returns a recorded event or waits
for one. Idempotent `stop()` removes listeners and rejects pending waits.

## Mock successful requests

`installFetchMock()` replaces the target’s `fetch`, records requests, and matches exact URLs, regexes, or callbacks:

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

Objects become JSON responses with a content type. Return a `Response` for streams or custom status/headers.

Each mock route may use:

| Field      | Contract                                                        |
| ---------- | --------------------------------------------------------------- |
| `match`    | Exact URL, regular expression, or normalized-request predicate. |
| `url`      | URL/regular-expression shorthand when `match` is omitted.       |
| `method`   | Optional case-insensitive HTTP method filter.                   |
| `response` | Value, `Response`, or sync/async response factory.              |
| `body`     | Fallback response body when `response` is absent.               |
| `status`   | Response status, defaulting to `200`.                           |
| `headers`  | Additional response headers.                                    |
| `delay`    | Abort-aware response delay in milliseconds.                     |

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

`delay` supports cancellation tests: aborted requests reject with `AbortError`:

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

| Member              | Result                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `requests`          | Live normalized request records containing `url`, `method`, `headers`, and the original `request`. |
| `reset(nextRoutes)` | Clear request history and optionally replace the route table.                                      |
| `restore()`         | Restore the target's original `fetch`; safe to call during cleanup.                                |

Unmatched requests throw with method/URL, preventing accidental network access.

## Automatic test harness

`createACLTestHarness()` owns an isolated loader, mounts, recorders, and fetch mocks. `cleanup()` unmounts, restores
fetch, stops recorders, and disposes; `reset()` does the same and creates a fresh loader. Assert order with
`assertLifecycleSequence()` or `harness.assertLifecycle()`:

```js
const harness = createACLTestHarness();
const events = harness.record(document, ['acl:loadstart', 'acl:loadend']);
await harness.mount({ template: '<p>ready</p>' });

harness.assertLifecycle(events.records, ['acl:loadstart', 'acl:loadend']);
await harness.cleanup();
```

Options include an existing `loader`, isolated `loaderOptions`, `container`, and `disposeLoader` (default `true` when no
loader is supplied).

The harness exposes `loader`, `mount()`, `record()`, `mockFetch()`, and `assertLifecycle()`. `reset()` refreshes state;
idempotent `cleanup()` permanently releases it.

## Playwright fixture

`/testing/playwright` exports `createACLPlaywrightTest()` with `acl` and optional worker-scoped `aclServer` fixtures:

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

| Option      | Contract                                                                  |
| ----------- | ------------------------------------------------------------------------- |
| `server`    | `false` or options forwarded to `startACLTestServer()`.                   |
| `route`     | Page route opened before installing the browser harness; defaults to `/`. |
| `moduleUrl` | Browser-resolvable testing entry when no packaged server is used.         |

`acl` exposes `page`, nullable `server`, `reset()`, and `metrics()`. `aclServer` exposes `origin`, `url`, `root`,
`indexPath`, and `close()`.

The server fixture uses `/testing/server`’s `startACLTestServer()`, an ephemeral loopback port, no file watching, and
worker-end cleanup.

Direct servers default to `watchFiles: false`. When enabled, debounce is 75 ms and safety scans run every 5,000 ms.
`watchPollInterval: 0` disables scans:

```js
import { startACLTestServer } from 'alpine-component-loader/testing/server';

const server = await startACLTestServer({
    root: 'test-app',
    watchFiles: true,
    watchDebounce: 50,
    watchPollInterval: 0,
});
```

Server options are `root`, `index`, `host`, `port`, `watchFiles`, `watchDebounce`, `watchPollInterval`, and
`injectAllHtml`. Results include `origin`/`url`, resolved `root`, `indexPath`, `indexUrl`, live `clients`, and async
`close()`.

[`tests/testing-integrations.spec.js`](../tests/testing-integrations.spec.js) demonstrates server setup, isolated
loaders, metrics, recorder cleanup, reset, and disposal.

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

Hooks must include `beforeEach` and `afterEach`. `current` exposes a fresh harness during each test, cleaned afterward.

Use this adapter in Vitest Browser Mode for real DOM, Custom Elements, and Cache APIs.

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

The server/bundler must resolve package specifiers in the browser. Use the packaged fixture or this manual pattern for
an existing app server.

## Cleanup checklist

- `await mounted.unmount()` for every mount.
- `recorder.stop()` for every event recorder.
- `mock.restore()` for every fetch mock.
- Abort pending waits owned by a canceled test.
- Avoid reusing explicit custom-element names with different definitions.
- Prefer `createLoader()` or `createACLTestHarness()` when tests change loader configuration.

For lifecycle event order see [Lifecycle, events, and dynamic components](lifecycle.md). For request behavior see
[Data, caching, polling, and persistence](data.md).
