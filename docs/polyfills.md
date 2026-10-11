# Optional Web Components polyfills

`alpine-component-loader/polyfills` provides optional Web Components fallbacks in a separate `polyfills.js` module. Call
`loadPolyfills()` to detect and repair missing APIs; importing it alone loads no scripts. It works with root and core,
and native browsers skip upstream downloads.

```js
import loadPolyfills from 'alpine-component-loader/polyfills';

await loadPolyfills();
const { default: Loader } = await import('alpine-component-loader');
await Loader.define('hello-card', { template: '<p>Hello</p>' });
await Loader.start();
```

This assumes Alpine is already started. For module-based applications, use the bootstrap below.

## Bootstrap before application imports

Await polyfills before dynamically importing modules that use repaired APIs. Static imports evaluate before the
bootstrap body, regardless of where they appear:

```js
// bootstrap.js
import loadPolyfills from 'alpine-component-loader/polyfills';

await loadPolyfills();
await import('./app.js');
```

```js
// app.js, with a package installation and the ACL Vite plugin
import Alpine from 'alpinejs';
import Loader from 'alpine-component-loader/core';

globalThis.Alpine = Alpine;
Alpine.start();
await Loader.registerManifestFrom('./acl-manifest.json');
await Loader.registerErrorBoundary(); // Required for this application's <acl-boundary>.
await Loader.start();
```

Bundled top-level await needs an ES2022 target. The Vite starter instead uses async bootstrap/start functions.

Root enables discovery; `/core` requires [explicit built-in registration](core.md). Load `/auto` only after the
bootstrap, since it starts on import. `start()` completes registration; `loaded` and hydration events mark component
readiness.

For a build-free page, put the map before the bootstrap module:

```html
<script type="importmap">
    {
        "imports": {
            "alpinejs": "https://cdn.jsdelivr.net/npm/alpinejs@3.17.4/dist/module.esm.min.js",
            "alpine-component-loader/core": "/dist/core.min.js",
            "alpine-component-loader/polyfills": "/dist/polyfills.min.js"
        }
    }
</script>
<script type="module" src="./bootstrap.js"></script>
```

This map supports the `app.js` above. Start Alpine once, without a second classic script. Use local `/dist/` files or
one pinned CDN release/base and module family. Import-map entries do not preload scripts.

See the runnable [vanilla variant](../starters/vanilla/README.md#startup-variants) and
[Vite bootstrap](../starters/vite/README.md#optional-web-components-polyfills).

## Included fallbacks

The pinned `@webcomponents/webcomponentsjs@2.8.0` loader selects Custom Elements v1, templates, ShadyDOM, and ShadyCSS
as needed. Its full bundle supplies Promise, URL, Symbol, constructible Event/CustomEvent/MouseEvent, Object.assign, and
Array.from. ACL selects that bundle when helpers need repair. HTML Imports are excluded. See the
[upstream suite](https://github.com/webcomponents/polyfills/tree/master/packages/webcomponentsjs) and
[ShadyCSS](https://github.com/webcomponents/polyfills/tree/master/packages/shadycss).

ACL prepares sanitized Shadow DOM templates with ShadyCSS and applies styles after insertion; Light DOM scoping remains
independent. It bridges URL.searchParams to native URLSearchParams and completes Array.from, Promise.finally, and
Promise.allSettled support. These API repairs do not transpile ACL or Alpine: native ESM/ES2022 requirements remain. ACL
needs no ES5 adapter; upstream roadmap proposals are not included.

## API and options

`loadPolyfills(options?)` resolves without a value. `waitForWebComponents(callback?)` returns the callback's resolved
value or rejection. Both return promises; invalid options or callbacks throw synchronously.

| `loadPolyfills()` option | Default                                             | Meaning                                                                                |
| ------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `url`                    | Pinned jsDelivr `webcomponents-loader.js` for 2.8.0 | Non-empty classic-script URL; use the standard filename to allow full-bundle selection |
| `timeout`                | `10000` ms                                          | Non-negative finite timeout; `0` disables it                                           |
| `nonce`                  | Unset                                               | Nonce on the injected top-level script                                                 |
| `trustedTypesPolicy`     | Unset                                               | Policy object with `createScriptURL()` for the script URL sink                         |

Types are exported from `alpine-component-loader/polyfills`:

```ts
import type { ACLPolyfillOptions } from 'alpine-component-loader/polyfills';
```

## Self-hosted delivery

Self-host the upstream loader, full bundle, and `bundles/` directory together. Vite serves these as classic static
assets; its ACL import map supplies only the wrapper entry.

Copy the package into Vite's public directory:

```sh
npm install @webcomponents/webcomponentsjs@2.8.0
mkdir -p public/vendor/webcomponents
cp node_modules/@webcomponents/webcomponentsjs/webcomponents-loader.js public/vendor/webcomponents/
cp node_modules/@webcomponents/webcomponentsjs/webcomponents-bundle.js public/vendor/webcomponents/
cp -R node_modules/@webcomponents/webcomponentsjs/bundles public/vendor/webcomponents/
```

In Vite, use `url: import.meta.env.BASE_URL + 'vendor/webcomponents/webcomponents-loader.js'`. Keep the standard
filename so ACL can select the neighboring full bundle. The plugin does not copy upstream assets.

```js
await loadPolyfills({
    url: '/vendor/webcomponents/webcomponents-loader.js',
    nonce: 'your-script-nonce',
    timeout: 10000,
});
```

`timeout` covers DOM parsing, downloads, and readiness; `0` disables it. The nonce applies to ACL's injected script. CSP
must also permit upstream bundle scripts and ShadyCSS styles. Under Trusted Types, provide
`trustedTypesPolicy.createScriptURL()` and allow the upstream `webcomponents-loader` policy. Injection waits for DOM
parsing to avoid `document.write`; injection/policy errors are retryable.

Calls share one document bootstrap and reuse completed installations. Failures release timers/listeners and reject with
retryable `ACL_POLYFILL_LOAD_FAILED` or `ACL_POLYFILL_TIMEOUT` (phase `polyfills`). Server use rejects with
`ACL_ENVIRONMENT_UNAVAILABLE`.

Show bootstrap failures before importing the application. Fix the URL or policy, then call `loadPolyfills()` again;
failed promises are evicted.

## Existing asynchronous loaders

For an existing upstream loader, return registration/import work through ACL's readiness helper:

```js
import { waitForWebComponents } from 'alpine-component-loader/polyfills';

await waitForWebComponents(async () => {
    const { default: Loader } = await import('alpine-component-loader');
    await Loader.define('hello-card', { template: '<p>Hello</p>' });
    await Loader.start();
});
```

The helper returns the full callback promise to `WebComponents.waitFor()` so definitions finish before batched upgrades.
Ready/native pages run immediately; bundle-only pages use `WebComponentsReady`. Return import/definition promises, but
await element readiness after the callback settles to avoid blocking upgrades.

ACL startup and registration also wait for an active bootstrap. Disposal prevents late definitions for that loader while
document-level installation continues for other owners.

Map CDN imports to `dist/polyfills.js` or `dist/polyfills.min.js`. `features: ['polyfills']` adds the wrapper to
preload/offline lists; it does not activate it or include upstream scripts.

For offline activation, self-host upstream files, pass their URL to `loadPolyfills()`, and precache the loader,
`webcomponents-bundle.js`, every selectable `bundles/` file, and application/bootstrap files. Preserve upstream
filenames. Graph generation neither fetches nor rewrites these assets; authored CDN URLs follow the project's
remote-asset policy.
