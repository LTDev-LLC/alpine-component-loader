# AlpineComponentLoader

AlpineComponentLoader (ACL) loads reusable HTML components with Alpine.js from URLs, DOM templates, inline strings, or
`template[x-acl]` declarations. Optional capabilities add data fetching, persistence, hydration, forms, offline support,
and development tools.

These docs cover package `1.x`. ACL document schemas use version `1`; external standards retain their own versions. See
[format and schema versions](docs/manifests-and-cli.md#format-and-schema-versions).

## Recommended setup: jsDelivr CDN

Use jsDelivr with an
[import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap) for browser
projects that need no installation or application build.

Add this to the document `<head>`:

```html
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.17.4/dist/cdn.min.js"></script>
<script type="importmap">
    {
        "imports": {
            "alpine-component-loader": "https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader@latest/dist/index.min.js",
            "alpine-component-loader/core": "https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader@latest/dist/core.min.js",
            "alpine-component-loader/auto": "https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader@latest/dist/auto.min.js",
            "alpine-component-loader/dev": "https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader@latest/dist/dev.min.js",
            "alpine-component-loader/debugger": "https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader@latest/dist/debugger.min.js",
            "alpine-component-loader/a11y": "https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader@latest/dist/a11y.min.js",
            "alpine-component-loader/a11y-scanner": "https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader@latest/dist/a11y-scanner.min.js",
            "alpine-component-loader/offline": "https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader@latest/dist/offline.min.js",
            "alpine-component-loader/observability-exporters": "https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader@latest/dist/observability-exporters.min.js",
            "alpine-component-loader/polyfills": "https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader@latest/dist/polyfills.min.js",
            "alpine-component-loader/testing": "https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader@latest/dist/testing.min.js"
        }
    }
</script>
```

For production, replace `RELEASE_TAG` with a release tag or commit containing the entries you use. Older releases may
lack `/core` or `/polyfills`:

```html
<script type="importmap">
    {
        "imports": {
            "alpine-component-loader": "https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader@RELEASE_TAG/dist/index.min.js",
            "alpine-component-loader/core": "https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader@RELEASE_TAG/dist/core.min.js",
            "alpine-component-loader/polyfills": "https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader@RELEASE_TAG/dist/polyfills.min.js"
        }
    }
</script>
```

Import-map entries download only when imported.

Import ACL from your application module:

```html
<script type="module" src="/js/components.js"></script>
```

```js
// /js/components.js
import AlpineComponentLoader from 'alpine-component-loader';

AlpineComponentLoader.define('profile-card', '/components/profile-card.html');
await AlpineComponentLoader.start();
```

`npm run build` emits readable `.js` and prebuilt `.min.js` files for every `dist/` module. Publish the complete
directory to GitHub or a static host. Entries request dependencies in their own readable/minified family; keep that
family consistent.

The entry loads optional implementations only when markup, configuration, or an API call activates them.

`alpine-component-loader/core` exports the default loader and `ACLLoadError`. Its `start()` registers queued definitions
without document discovery:

```js
import Loader from 'alpine-component-loader/core';
await Loader.define('profile-card', { template: '<p>Profile</p>' });
await Loader.start();
```

For CDN delivery, map `/core` to `dist/core.js` or `dist/core.min.js`. Root and core share the default loader; a later
root `start()` enables discovery. Both offer explicit observation. Isolated-loader and persistence-adapter factories are
root-entry exports.

The optional [`/polyfills` entry](docs/polyfills.md) loads needed Web Components fallbacks and waits for registration
readiness. Native browsers skip upstream downloads; HTML Imports are excluded.

Choose root for discovery, `/core` for explicit registration, or `/auto` for import-time startup. Core applications must
register built-ins such as `<acl-boundary>` explicitly. See [core startup](docs/core.md).

Load polyfills in a separate bootstrap before dynamically importing the application. Use Alpine's ESM setup from the
[polyfill guide](docs/polyfills.md) for this ordering:

```js
// bootstrap.js; the import map includes /polyfills and /core.
import loadPolyfills from 'alpine-component-loader/polyfills';

await loadPolyfills();
await import('./app.js');
```

`app.js` starts Alpine once, registers ACL definitions, and awaits `start()`. The [polyfill guide](docs/polyfills.md)
covers CDN/Vite setup, `WebComponents.waitFor()`, CSP, and offline assets. ACL still requires native ESM/ES2022.

Inline eager components skip unused networking, caches, data, hydration, transformations, environment, and scheduling
modules. Loaders share implementation URLs while keeping runtime state isolated.

The development server serves physical `.min.js` files first and generates missing siblings from `.js` in memory. Source
changes invalidate generated responses. HMR mappings follow the application's base URL and suffix. See
[server setup](docs/manifests-and-cli.md#development-server-and-command-discovery).

## Package and CLI installation

Install the GitHub package for CLI tools, Node SSR, or package-manager integration:

```bash
npm install github:LouisT/alpine-component-loader alpinejs
```

Default installs include optional `parse5` and `@swc/core` tooling. To omit them:

```bash
npm install --omit=optional github:LouisT/alpine-component-loader alpinejs
```

Lean installs retain the runtime, basic CLI commands, and prebuilt JavaScript serving. Features needing an omitted tool
report `ACL_OPTIONAL_DEPENDENCY_MISSING` with an installation command.

Install `parse5` for inspection, manifest generation, inline-template HMR, or SSR; install `@swc/core` for on-demand
minification and distribution builds.

The installed CLI runs through `npx`:

```bash
npx alpine-component-loader --help
npx alpine-component-loader serve
npx alpine-component-loader create my-app
npx alpine-component-loader audit / --root my-app
npx alpine-component-loader routes --config acl.config.mjs
npx alpine-component-loader watch --config acl.config.mjs
```

For local development:

```bash
npm install --save-dev file:../alpine-component-loader
npx alpine-component-loader --help
```

To run a local checkout without installing it:

```bash
npx --package=. -- alpine-component-loader --help
```

For a one-off GitHub invocation:

```bash
npx --package=github:LouisT/alpine-component-loader -- alpine-component-loader --help
```

Pin GitHub installs to a tag or commit. Install the package before using bare `npx alpine-component-loader`, which
otherwise falls back to the npm registry.

Keep ACL external to application bundles and serve `dist/` unchanged. Runtime capability imports resolve relative to the
entry URL.

ACL supports Alpine.js 3.14-3.x and modern Chrome, Edge, Firefox, and Safari. Node tooling requires Node.js 22+;
`nvm use` selects the repository minimum.

## Quick start

Create a starter:

```bash
npx alpine-component-loader create my-app
npx alpine-component-loader create my-vite-app --template vite
```

After adding the import map, register components:

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

`define()` returns a promise. `start()` waits for pre-start definitions; await `define()` when you need its constructor
immediately.

```html
<profile-card name="Ada" count="3">
    <button slot="action">Follow</button>
</profile-card>
```

Inline definitions use the same Trusted Types and sanitizer pipeline as URL templates, without fetching or persistent
template caching:

```js
await AlpineComponentLoader.define('inline-greeting', {
    template: '<h3>Hello, world!</h3>',
    shadow: true,
});
```

An existing DOM template also works without a request:

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

`x-acl` names a declarative component. Put `acl-props` and data options on its definition; instances may override data
attributes:

```html
<template x-acl="profile-template" acl-props='{ "name": "String" }' data-src="/api/profile">
    <article x-data="{ open: false }">
        <h2 x-text="$props.$data?.name"></h2>
        <slot name="action"></slot>
    </article>
</template>

<profile-template>
    <button slot="action">Follow</button>
</profile-template>
```

`start()` scans existing `template[x-acl]` and `template[acl-component]` declarations. `observeTemplates()` handles
later additions. `/auto` enables observation by default; configure it before import to opt out:

```html
<script>
    window.AlpineComponentLoaderConfig = {
        observeTemplates: false,
    };
</script>
```

Custom elements need closing tags: `<profile-template></profile-template>`, not XML self-closing syntax.

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

`start()` discovers `<acl-component>`, `<acl-dynamic>`, and `<acl-boundary>` as they appear. For registration before
insertion, await `registerComponent()`, `registerDynamicLoader()`, or `registerErrorBoundary()`.

`/auto` starts on import. Other entries are safe to import without browser globals; browser operations require a DOM.

## Integrated project workflow

`acl.config.mjs` shares paths and policies between CLI and Vite. Paths resolve from that file; unknown keys fail
validation. Precedence is CLI flags → plugin options → project config → defaults:

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

Generate artifacts or watch for changes:

```bash
npx alpine-component-loader manifest --update
npx alpine-component-loader manifest --infer report --dry-run
npx alpine-component-loader routes --force
npx alpine-component-loader watch
npx alpine-component-loader watch --poll-interval 0
```

Watch mode uses native subscriptions with directory fallbacks and a periodic safety scan (`watch.pollInterval` or
`--poll-interval`; `0` disables it). Servers expose `watchPollInterval`. Safe inference updates certain dependencies,
slots, and static assets; sidecars remain authoritative. Browser-backed discovery, skeletons, and audits are opt-in.

In Vite, enable the plugin and register route keys through its virtual module:

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

Vite serves native modules and targeted HMR in development. Production copies ACL modules and route shards, then injects
a base-aware import map. See the [Vite starter](starters/vite/README.md).

## Features

- [Components](docs/components.md): templates, props, slots, styles, Shadow DOM, assets, and
  [skeletons](docs/skeletons.md).
- [Data](docs/data.md): fetching, polling, caches, and persistence.
- [Lifecycle](docs/lifecycle.md): hydration, events, forms, boundaries, reloads, and cleanup.
- [Project tooling](docs/manifests-and-cli.md): manifests, inference, routes, Vite, and generated contracts.
- [SSR](docs/ssr.md), [prefetch](docs/prefetch.md), and [offline support](docs/offline.md).
- [Testing](docs/testing.md), [observability](docs/observability.md), and
  [accessibility/debugging](docs/accessibility-and-debugging.md).
- [Security](docs/security.md), [core startup](docs/core.md), [polyfills](docs/polyfills.md), and the
  [API reference](docs/api.md).

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

URL/integrity requests share work per loader and retry after failure. Relative URLs resolve from the fetched manifest or
route index.

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

SSR hydration also supports `visible`, `idle`, and `media` with `hydrateMedia`. Client rendering uses `loading`.

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

Hosts expose validity methods and `$props.$form`, with hidden-input submission when `ElementInternals` is unavailable.

Observe opt-in prefetch targets:

```js
const prefetchController = await AlpineComponentLoader.observePrefetch();
// <a data-acl-prefetch="critical">Account</a>
```

Read local metrics:

```js
AlpineComponentLoader.config({ observability: { bufferSize: 200 } });
const unsubscribe = AlpineComponentLoader.subscribe((record) => console.debug(record));
const snapshot = AlpineComponentLoader.getMetrics();
unsubscribe();
```

Batch and deliver the same redacted records through a demand-loaded entry:

```js
import { connectExporter, createBeaconExporter } from 'alpine-component-loader/observability-exporters';

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
    dataResolver: async ({ tagName, props }) => (tagName === 'profile-card' ? loadProfile(props.name) : undefined),
});
const html = await renderer.render('profile-card', {
    props: { name: 'Ada', count: 3 },
    slots: { action: '<button>Follow</button>' },
    hydrate: 'visible',
});
```

`dataPolicy` follows JSON-safe component requests instead of using `dataResolver`. It requires `baseUrl` and origin
authorization, validates redirects, defaults to GET/HEAD, strips sensitive headers, and limits time and bytes:

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

See the [example catalog](examples/README.md) for runnable demonstrations.

## Documentation

- [Components, props, slots, and rendering](docs/components.md)
- [Data, caching, polling, and persistence](docs/data.md)
- [Lifecycle, events, and dynamic components](docs/lifecycle.md)
- [Security and Trusted Types](docs/security.md)
- [SSR and hydration](docs/ssr.md)
- [Testing utilities](docs/testing.md)
- [Skeleton loading UI](docs/skeletons.md)
- [Observability](docs/observability.md)
- [Adaptive prefetch](docs/prefetch.md)
- [Manifests, generated contracts, and CLI tooling](docs/manifests-and-cli.md)
- [Offline behavior](docs/offline.md)
- [Accessibility and debugging](docs/accessibility-and-debugging.md)
- [API reference and troubleshooting](docs/api.md)
- [Migration notes](MIGRATION.md)
- [Security disclosure policy](SECURITY.md)

## Verification

Repository builds use the exact `devDependencies.alpinejs-pinned` pin in `package.json`. Update it, run `npm install`,
then `npm run build` to refresh CDN URLs, examples, starters, and offline workers. Staging, capture, and benchmarks use
the same alias.

Prettier formats JavaScript, HTML/SSR templates, CSS, and Markdown. Markdown prose wraps at 120 columns. Format
everything or one language:

```bash
npm run format
npm run format:js
npm run format:html
npm run format:css
```

`npm run check:format` checks all four formats; `check:format:js`, `:html`, `:css`, and `:md` check them separately. CI
and `validate` enforce these rules. `.prettierignore` excludes generated files, dependencies, and staging output.

When formatting changes a template with a pinned `templateRevision`, refresh its manifest with the CLI's
[`manifest --update`](docs/manifests-and-cli.md#generated-fields-and-authored-fields) command.

```bash
npm ci
npm run playwright:install -- chromium firefox webkit
npm run validate
npm run test:cross-browser
npm run security:static
npm run check:reproducible
```

For a locally validated direct push to `main`, GitHub's `[skip actions]` commit marker skips push workflows:

```bash
git commit -m "chore: update repository metadata [skip actions]"
git push origin main
```

Avoid this marker on pull-request HEAD commits: skipped required checks may block merging. See
[GitHub's workflow-skipping reference](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs).

## License

MIT
