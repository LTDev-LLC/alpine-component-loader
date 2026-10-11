# Explicit startup with `/core`

Use `alpine-component-loader/core` for application-owned registration. It exports the default loader and `ACLLoadError`,
retaining root-entry options and asynchronous APIs. Named `createLoader()` and persistence-adapter factories stay on the
root entry.

| Entry                          | Startup                     | Declarative templates                                                  | Built-in elements                          |
| ------------------------------ | --------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| `alpine-component-loader`      | Call `start()`              | Scans existing declarations; later templates need `observeTemplates()` | Discovers existing and later built-in tags |
| `alpine-component-loader/core` | Call `start()`              | Register or observe explicitly                                         | Register explicitly                        |
| `alpine-component-loader/auto` | Starts on import by default | Scans and observes by default                                          | Discovers existing and later built-in tags |

`/core.start()` registers queued definitions without discovery observers or document scanning. Connected components
still render and activate needed capabilities.

## Register from application code

With a package installation and the ACL Vite plugin:

These snippets use top-level await. Bundled applications need `build.target: 'es2022'` or the starter's async bootstrap
pattern.

```js
import Alpine from 'alpinejs';
import Loader, { ACLLoadError } from 'alpine-component-loader/core';

globalThis.Alpine = Alpine;
Alpine.start(); // Start Alpine once per document.

Loader.config({ basePath: '/components/' });
Loader.define('hello-card', {
    template: '<p>Hello, <span x-text="$props.name"></span></p>',
    attributes: { name: { type: String, default: 'World' } },
});

try {
    await Loader.start();
} catch (error) {
    if (error instanceof ACLLoadError) console.error(error.code, error.phase);
    throw error;
}
```

```html
<hello-card name="Ada"></hello-card>
```

`define()` returns a promise; `start()` drains pending definitions. Startup completes registration, not component
rendering or hydration. Await `define()` for its constructor, and attach `loaded` before insertion to await content:

```js
const host = document.createElement('hello-card');
const ready = new Promise((resolve, reject) => {
    host.addEventListener('loaded', resolve, { once: true });
    host.addEventListener('acl:error', (event) => reject(event.detail.error), { once: true });
});
document.querySelector('#cards').append(host);
await ready;
```

`registerManifestFrom()` resolves component URLs from the manifest's final response URL:

```js
await Loader.registerManifestFrom('./acl-manifest.json');
await Loader.start();
```

## Register markup and built-ins explicitly

Register required built-ins before startup or insertion:

```js
await Loader.registerErrorBoundary(); // <acl-boundary>
await Loader.registerComponent(); // <acl-component>
await Loader.registerDynamicLoader(); // <acl-dynamic>
await Loader.start();
```

For declarative `template[x-acl]` or `template[acl-component]` definitions:

```js
await Loader.registerTemplates(document);
const stop = Loader.observeTemplates({ root: document.querySelector('#plugin-area') });
await Loader.start();

// When the application no longer accepts new definitions:
stop();
```

`observeTemplates()` owns an opt-in subscription. Selector sources such as `define('hello-card', '#hello-template')`
also work without discovery.

## CDN and development-server delivery

Put import maps before application modules. Use one pinned release, base URL, and readable/minified family:

```html
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.17.4/dist/cdn.min.js"></script>
<script type="importmap">
    {
        "imports": {
            "alpine-component-loader": "/dist/index.min.js",
            "alpine-component-loader/core": "/dist/core.min.js",
            "alpine-component-loader/polyfills": "/dist/polyfills.min.js"
        }
    }
</script>
<script type="module" src="./app.js"></script>
```

This classic script starts Alpine globally, so omit the first snippet's Alpine import/start. For polyfills before Alpine
evaluation, use the [ESM bootstrap](polyfills.md).

`npm run build` emits both module families; publish the complete `dist/` directory. CLI and Vite map `/core` and
`/polyfills` automatically. Import-map entries download only when imported.

The [vanilla](../starters/vanilla/README.md#startup-variants) and
[Vite](../starters/vite/README.md#startup-variants-and-preload-hints) starters demonstrate these variants.

## Shared default loader and optional polyfills

Root and core share configuration and registrations. A root `start()` after core startup enables discovery; importing
root alone does not. `/auto` starts and observes on import. Root-entry `createLoader()` gives independent ownership and
disposal.

Load optional polyfills before importing the application or registering elements:

```js
import loadPolyfills from 'alpine-component-loader/polyfills';

await loadPolyfills();
const { default: Loader } = await import('alpine-component-loader/core');
await Loader.registerManifestFrom('./acl-manifest.json');
await Loader.registerErrorBoundary();
await Loader.start();
```

Start Alpine before component initialization. The [polyfill guide](polyfills.md) covers import ordering,
`WebComponents.waitFor()`, and self-hosting.

## Preloads and offline assets

`preload.entry` selects the hinted entry; application imports and startup remain unchanged:

```js
alpineComponentLoader({
    preload: { entry: 'core', tags: ['hello-card'] },
});
```

The CLI accepts `--entry-url …/core.min.js` for preloads and `--runtime-entry …/core.min.js` for offline assets.
Explicit features include `boundary`, `declarative`, `dynamic`, `hydration`, and `polyfills`. Upstream polyfill scripts
remain separate assets. See
[runtime expansion](manifests-and-cli.md#explicit-module-preloads-and-offline-runtime-expansion).
