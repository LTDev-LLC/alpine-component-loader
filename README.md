# AlpineComponentLoader

A dependency-free browser runtime for loading reusable HTML components with Alpine.js. The package also includes isolated loader instances, progressive SSR hydration, form-associated components, nearest error boundaries, opt-in development and accessibility tools, route shards, Vite integration, ready-made test fixtures, bounded offline policies, and static Node SSR.

This documentation targets package version `1.x`. ACL-owned public document
formats and diagnostic snapshots use schema version `1`; externally governed
Custom Elements Manifest, SARIF, and JSON Schema dialect identifiers retain
their standards-defined versions. See
[Format and schema versions](docs/manifests-and-cli.md#format-and-schema-versions)
for the complete compatibility table.

## Recommended setup: jsDelivr CDN

For browser projects, the recommended way to use AlpineComponentLoader is
directly from jsDelivr with an
[import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap).
This requires no package installation or application build step and preserves
the loader's on-demand module graph.

Add this to the document `<head>`:

```html
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js"></script>
<script type="importmap">
    {
        "imports": {
            "alpine-component-loader": "https://cdn.jsdelivr.net/gh/LTDev-LLC/alpine-component-loader@latest/dist/index.min.js",
            "alpine-component-loader/auto": "https://cdn.jsdelivr.net/gh/LTDev-LLC/alpine-component-loader@latest/dist/auto.min.js",
            "alpine-component-loader/dev": "https://cdn.jsdelivr.net/gh/LTDev-LLC/alpine-component-loader@latest/dist/dev.min.js",
            "alpine-component-loader/debugger": "https://cdn.jsdelivr.net/gh/LTDev-LLC/alpine-component-loader@latest/dist/debugger.min.js",
            "alpine-component-loader/a11y": "https://cdn.jsdelivr.net/gh/LTDev-LLC/alpine-component-loader@latest/dist/a11y.min.js",
            "alpine-component-loader/a11y-scanner": "https://cdn.jsdelivr.net/gh/LTDev-LLC/alpine-component-loader@latest/dist/a11y-scanner.min.js",
            "alpine-component-loader/offline": "https://cdn.jsdelivr.net/gh/LTDev-LLC/alpine-component-loader@latest/dist/offline.min.js",
            "alpine-component-loader/observability-exporters": "https://cdn.jsdelivr.net/gh/LTDev-LLC/alpine-component-loader@latest/dist/observability-exporters.min.js",
            "alpine-component-loader/testing": "https://cdn.jsdelivr.net/gh/LTDev-LLC/alpine-component-loader@latest/dist/testing.min.js"
        }
    }
</script>
```
Optionally, you may pin a tagged version such as `v1.0.2`:
```html
<script type="importmap">
    {
        "imports": {
            "alpine-component-loader": "https://cdn.jsdelivr.net/gh/LTDev-LLC/alpine-component-loader@1.0.2/dist/index.min.js",
            <!-- Other import paths... -->
        }
    }
</script>
```


Declaring these browser entries in the import map does not download them. The
browser fetches an entry only when application code imports its specifier.

Application modules can then use the documented bare package specifiers:

```html
<script type="module" src="/js/components.js"></script>
```

```js
// /js/components.js
import AlpineComponentLoader from 'alpine-component-loader';

AlpineComponentLoader.define('profile-card', '/components/profile-card.html');
await AlpineComponentLoader.start();
```

The repository ships readable ES2022 modules. Adding `.min` before `.js` asks
jsDelivr to generate and cache a minified response, so generated `.min.js` files
are not committed to the repository. A public entry loaded as `.min.js`
propagates that suffix to every package-owned module it later requests; a
readable `.js` entry requests readable descendants. Use one family consistently
instead of mixing readable and minified entries.

The root entry is a small facade. Component construction, rendering, remote
templates, caches, data, persistence, external assets, manifests, adaptive
prefetch, observability, built-in elements, and tooling are loaded dynamically
only when configuration, markup, or an API call activates them. Importing the
facade does not fetch every runtime module.

For production, replace `@latest` with a release tag or commit so deployments
remain reproducible. Because jsDelivr generates minified responses dynamically,
do not attach an SRI hash to a generated `.min.js` URL.

The included development server mirrors that URL contract locally. When a requested `.min.js` file does not exist but its contained `.js` sibling does, the server minifies the readable source in memory and serves it without writing a generated file. Physical `.min.js` files take precedence, source changes invalidate the in-memory result, and the same behavior applies to project assets and the server's package-module URLs. If an existing import map points `alpine-component-loader` at `index.min.js`, the injected HMR mappings are derived from the same base and suffix so the application and development client share one module family.

## Package and CLI installation

Install the GitHub package when the project needs the command-line tools, Node
SSR entry, or package-manager integration:

```bash
npm install github:LTDev-LLC/alpine-component-loader alpinejs
```

Default npm installs include the optional `parse5` parser and `@swc/core`
minifier used by manifest inspection, SSR, and generated `.min.js` responses.
Browser-only consumers can opt into a lean install:

```bash
npm install --omit=optional github:LTDev-LLC/alpine-component-loader alpinejs
```

The package root, CLI help, project creation, configuration, and other
dependency-free commands remain available. Parser-, SSR-, or minifier-backed
features report `ACL_OPTIONAL_DEPENDENCY_MISSING` with the required package and
installation command.

In a lean install, readable JavaScript serving remains available. Install
`parse5` before using component inspection, manifest generation, inline-template
HMR, or SSR. Install `@swc/core` before requesting generated `.min.js` responses
or explicitly minified generated assets. Installing without `--omit=optional`
continues to provide both tools automatically.

Installing the package creates the `alpine-component-loader` binary in the
project's `node_modules/.bin`, so it can be run by name with `npx`:

```bash
npx alpine-component-loader --help
npx alpine-component-loader serve
npx alpine-component-loader create my-app
npx alpine-component-loader audit / --root my-app
npx alpine-component-loader routes --config acl.config.mjs
npx alpine-component-loader watch --config acl.config.mjs
```

For local package development, install the checkout from a relative or absolute
path first:

```bash
npm install --save-dev file:../alpine-component-loader
npx alpine-component-loader --help
```

To run the local checkout once without adding it to another project's
dependencies:

```bash
npx --package=. -- alpine-component-loader --help
```

A one-off GitHub invocation is also supported:

```bash
npx --package=github:LTDev-LLC/alpine-component-loader -- alpine-component-loader --help
```

Pin the GitHub dependency to a tag or commit for reproducible installs. A bare
`npx alpine-component-loader` only searches installed binaries before falling
back to the npm registry, so install from GitHub or a local path first.

The suffix-aware graph is a native ESM delivery contract. When an application
uses a bundler, keep `alpine-component-loader` external and serve its `dist`
tree unchanged so runtime module URLs remain relative to the package entry;
computed capability imports are intentionally not a bundler chunk-discovery
API.

The browser runtime supports Alpine.js 3.14-3.x and modern Chrome, Edge,
Firefox, and Safari. The CLI, build tooling, testing integrations, and Node-only
SSR entry require Node.js 22 or later. Use the repository `.nvmrc` with
`nvm use` to select the minimum supported release locally.

## Quick start

To begin from a maintained build-free or Vite starter:

```bash
npx alpine-component-loader create my-app
npx alpine-component-loader create my-vite-app --template vite
```

After adding the recommended CDN import map, define components from an
application module:

```js
import AlpineComponentLoader from 'alpine-component-loader';

AlpineComponentLoader.config({ basePath: '/components/' });
// start() drains this pending pre-start definition.
AlpineComponentLoader.define('profile-card', 'profile-card.html', {
    shadow: true,
    attributes: {
        name: { type: String, required: true },
        count: { type: Number, default: 0 },
    },
});
await AlpineComponentLoader.start();
```

`define()` returns a promise. Calls made before `start()` may be left pending as above because `start()` waits for the queued definitions; use `await AlpineComponentLoader.define(...)` when the constructor or immediate definition readiness is needed.

```html
<profile-card name="Ada" count="3">
    <button slot="action">Follow</button>
</profile-card>
```

An inline template works without a request:

```html
<template id="profile-template">
    <article x-data="{ open: false }">
        <h2 x-text="$props.name"></h2>
        <slot name="action"></slot>
    </article>
</template>
```

```js
await AlpineComponentLoader.define('profile-card', '#profile-template', { shadow: true });
```

The declarative proxy provides the same registration path from HTML:

```html
<acl-component
    src="/components/profile-card.html"
    tag="profile-card"
    shadow="true"
    loading="lazy"
    acl-props='{ "name": { "type": "String", "required": true } }'
    name="Ada"
>
    <button slot="action">Follow</button>
</acl-component>
```

`start()` discovers existing and newly inserted `<acl-component>`, `<acl-dynamic>`, and `<acl-boundary>` tags, then loads only the implementation that appeared. To guarantee registration before inserting a tag, explicitly await `registerComponent()`, `registerDynamicLoader()`, or `registerErrorBoundary()`.

Use `alpine-component-loader/auto` only when import-side-effect startup is desired. All other public entries are safe to import without browser globals; browser-only operations still require a DOM.

## Integrated project workflow

Put shared paths and policies in `acl.config.mjs`. Paths resolve from this file, unknown keys fail validation, and CLI flags override Vite plugin options, which override project configuration, which overrides defaults:

```js
import { defineConfig } from 'alpine-component-loader/project';

export default defineConfig({
    components: {
        directory: './public/components',
        manifest: './public/acl-manifest.json',
        inference: 'safe',
    },
    routes: {
        manifest: './public/acl-manifest.json',
        outDir: './public/acl-routes',
        entries: [
            { key: 'home', path: '/', components: ['home-page'] },
            { key: 'account', path: '/account', groups: ['account'], discover: true },
        ],
    },
    contracts: {
        types: './generated/acl-components.d.ts',
        customElements: './generated/custom-elements.json',
    },
    watch: { tasks: ['manifest', 'types', 'routes'], debounce: 100, pollInterval: 5000 },
});
```

Generate deterministic artifacts or keep filesystem-backed tasks current:

```bash
npx alpine-component-loader manifest --update
npx alpine-component-loader manifest --infer report --dry-run
npx alpine-component-loader routes --force
npx alpine-component-loader watch
npx alpine-component-loader watch --poll-interval 0
```

The watcher prefers one recursive native subscription and falls back to
per-directory subscriptions where Node or the platform does not support it.
`watch.pollInterval` and `--poll-interval` control the periodic safety scan;
zero disables it. Programmatic development and testing servers expose the same
control as `watchPollInterval`. Safe inference writes only certain
dependencies, slots, and static external assets; sidecars remain authoritative.
Browser-backed route discovery, skeletons, and audits are opt-in in watch mode.

For Vite, enable the package plugin and register an exact route key from its virtual module:

```js
// vite.config.js
import { defineConfig } from 'vite';
import { alpineComponentLoader } from 'alpine-component-loader/vite';

export default defineConfig({
    base: '/my-app/',
    plugins: [alpineComponentLoader()],
});
```

```js
import AlpineComponentLoader from 'alpine-component-loader';
import { registerRoute } from 'virtual:alpine-component-loader/routes';

const start = async () => {
    await registerRoute('account');
    await AlpineComponentLoader.start();
};

start();
```

Development uses native ACL modules, targeted template HMR, and a generated route index. Production externalizes ACL from Rollup, copies readable modules and route shards, and injects a base-aware import map. See the runnable [Vite starter](starters/vite/README.md).

## Features

- [Template sources, inline discovery, declarative registration, props, helpers, Alpine stores, slots, Shadow/Light DOM, styles, assets, loading, and fallback UI](docs/components.md), including [generated responsive skeletons](docs/skeletons.md).
- [Data fetching, URL/body handling, response parsing, cancellation, retries, polling, template/data caches, persistence adapters, migrations, and storage helpers](docs/data.md).
- [Lifecycle hooks, progressive hydration, error boundaries, form association, cleanup, events, state-preserving reloads, targeted HMR, dynamic components, transitions, and keep-alive](docs/lifecycle.md).
- [Recursive sanitization, custom URL policy, Trusted Types, CSP operation, and browser/server rendering parity](docs/security.md).
- [Version-one manifests, conservative inference, route shards, shared configuration, watch mode, Vite delivery, component sidecars, generated TypeScript declarations, JSON Schema, and Custom Elements metadata](docs/manifests-and-cli.md).
- [Adaptive prefetch](docs/prefetch.md), [bounded offline navigation/runtime policies](docs/offline.md), and [static Node SSR with initial data plus Shadow or opt-in Light DOM hydration](docs/ssr.md).
- [Structured local observability](docs/observability.md), [isolated loaders and Playwright/Vitest fixtures](docs/testing.md), optional [debugger and accessibility tools](docs/accessibility-and-debugging.md), and [runtime efficiency and distribution-size gates](docs/performance.md).
- [Runtime security boundaries](docs/security.md), [the vulnerability disclosure policy](SECURITY.md), and automated static, dependency, CodeQL, and sanitizer-parity checks.
- [Complete public API, option, helper, attribute, entry-point, and TypeScript references](docs/api.md).

## Common examples

Fetch component data and emit a composed application event:

```js
await AlpineComponentLoader.define('account-card', '/components/account-card.html', {
    attributes: { accountId: { type: String, required: true } },
    data: {
        src: '/api/accounts/:accountId',
        keys: ({ props }) => ({ accountId: props.accountId }),
        target: 'account',
        cacheStrategy: 'network-first',
        retries: 2,
    },
});
```

```html
<article>
    <p x-show="$props.$loading" role="status">Loading…</p>
    <h2 x-text="$props.account?.name"></h2>
    <button @click="$props.$emit('account-select', { id: $props.accountId })">Select</button>
</article>
```

Register a manifest:

```js
const manifest = await fetch('/acl-manifest.json').then((response) => response.json());
await AlpineComponentLoader.registerManifest(manifest, {
    prefetch: ['critical'],
    concurrency: 2,
});
await AlpineComponentLoader.start();
```

Or use the bounded URL and exact route-shard loaders:

```js
await AlpineComponentLoader.registerManifestFrom('/acl-manifest.json', {
    cache: 'no-cache',
    signal: abortController.signal,
    integrity: 'sha256-…',
});
await AlpineComponentLoader.registerRouteManifest('account', '/routes/acl-routes.json');
```

Concurrent URL/integrity requests are deduplicated per loader, failed operations can be retried, and relative component/shard URLs resolve from the fetched manifest or route index.

Defer valid SSR hydration until interaction, and contain descendant failures at the nearest boundary:

```js
await AlpineComponentLoader.define('account-card', '/components/account-card.html', {
    shadow: true,
    templateRevision: 'sha256-…',
    hydrate: 'interaction',
});
```

```html
<acl-boundary>
    <account-card></account-card>
    <p slot="fallback" role="alert">Account details are temporarily unavailable.</p>
</acl-boundary>
```

Other SSR-only progressive modes are `visible`, `idle`, and `media` with `hydrateMedia`; client-only rendering continues to use `loading`.

Opt a definition into the native form lifecycle with JSON-safe prop mappings:

```js
await AlpineComponentLoader.define('quantity-field', '/components/quantity-field.html', {
    attributes: {
        quantity: { type: Number, default: 1 },
        restoredState: String,
        disabledState: Boolean,
    },
    form: {
        value: 'quantity',
        state: 'restoredState',
        disabled: 'disabledState',
    },
});
```

The host exposes form/internals validity methods and `$props.$form`; environments without `ElementInternals` receive a maintained hidden-input submission fallback.

Observe opt-in prefetch targets:

```js
const prefetchController = await AlpineComponentLoader.observePrefetch();
// <a data-acl-prefetch="critical">Account</a>
```

Read local metrics:

```js
AlpineComponentLoader.config({ observability: { bufferSize: 200 } });
const unsubscribe = AlpineComponentLoader.subscribe(record => console.debug(record));
const snapshot = AlpineComponentLoader.getMetrics();
unsubscribe();
```

Batch and deliver the same redacted records through a demand-loaded entry:

```js
import {
    connectExporter,
    createBeaconExporter,
} from 'alpine-component-loader/observability-exporters';

const exporterConnection = connectExporter(
    AlpineComponentLoader,
    createBeaconExporter({
        url: '/telemetry/acl',
        batchSize: 20,
        flushInterval: 5000,
        maxQueue: 200,
    }),
);
```

OpenTelemetry and Sentry adapters accept caller-owned clients and do not add vendor SDKs to ACL.

Mount a component in a browser test:

```js
import { createACLTestHarness } from 'alpine-component-loader/testing';

const harness = createACLTestHarness();
const mounted = await harness.mount({ template: '<p>Ready</p>' });
await harness.cleanup();
```

Render with server side Node:

```js
import { createSSRRenderer } from 'alpine-component-loader/ssr';

const renderer = createSSRRenderer({
    manifest,
    root: process.cwd(),
    dataResolver: async ({ tagName, props }) =>
        tagName === 'profile-card' ? loadProfile(props.name) : undefined,
});
const html = await renderer.render('profile-card', {
    props: { name: 'Ada', count: 3 },
    slots: { action: '<button>Follow</button>' },
    hydrate: 'visible',
});
```

Use `dataPolicy` instead of `dataResolver` when SSR should follow JSON-safe component data requests. It requires `baseUrl` and exact allowed origins or an authorization callback, validates every redirect, permits only GET/HEAD by default, strips sensitive headers, and enforces timeout/byte limits:

```js
const policyRenderer = createSSRRenderer({
    manifest,
    root: process.cwd(),
    dataPolicy: {
        baseUrl: 'https://api.example.com/',
        allowedOrigins: ['https://api.example.com'],
        resolve: ({ props }) => ({ keys: { id: props.id } }),
    },
});
```

Create an accessibility baseline after review, then enforce it with expiring suppressions:

```bash
npx alpine-component-loader audit / --root public \
  --baseline .acl/a11y-baseline.json --update-baseline
npx alpine-component-loader audit / --root public \
  --baseline .acl/a11y-baseline.json \
  --suppressions .acl/a11y-suppressions.json \
  --format sarif --out reports/a11y.sarif
```

See the [complete example catalog](examples/README.md), including the runnable feature lab, SSR examples, HMR, bounded offline worker, accessibility audit, and static isolated-loader playground.

## Documentation

- [Components, props, slots, and rendering](docs/components.md)
- [Data, caching, polling, and persistence](docs/data.md)
- [Lifecycle, events, and dynamic components](docs/lifecycle.md)
- [Security and Trusted Types](docs/security.md)
- [SSR and hydration](docs/ssr.md)
- [Testing utilities](docs/testing.md)
- [Skeleton loading UI](docs/skeletons.md)
- [Runtime efficiency and distribution size](docs/performance.md)
- [Observability](docs/observability.md)
- [Adaptive prefetch](docs/prefetch.md)
- [Manifests, generated contracts, and CLI tooling](docs/manifests-and-cli.md)
- [Offline behavior](docs/offline.md)
- [Accessibility and debugging](docs/accessibility-and-debugging.md)
- [API reference and troubleshooting](docs/api.md)
- [Migration notes](MIGRATION.md)
- [Security disclosure policy](SECURITY.md)

## Verification

```bash
npm ci
npm run playwright:install -- chromium firefox webkit
npm run validate
npm run test:cross-browser
npm run security:static
npm run check:reproducible
```

For an exceptional direct push to `main` that has already been validated locally, include GitHub's native `[skip actions]` marker in the commit message:

```bash
git commit -m "chore: update repository metadata [skip actions]"
git push origin main
```

The marker prevents workflows triggered by that push from starting. Do not use it on the HEAD commit of a pull request: skipped required checks can remain pending and block the pull request. See [GitHub's workflow-skipping reference](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs).

## License

MIT
