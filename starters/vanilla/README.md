# ACL vanilla starter

Defaults to root discovery, with core/polyfill mappings in the same minified family. Optional implementations load on
use.

Serve over HTTP and edit `hello-card.html` plus its `.acl.json` sidecar:

```bash
npx alpine-component-loader serve .
```

`registerManifestFrom()` resolves sources from the final manifest URL with request guards. A discovered `<acl-boundary>`
supplies the authored fallback.

## Startup variants

`app.js` selects the entry before registering the manifest:

| URL                        | Behavior                                                                |
| -------------------------- | ----------------------------------------------------------------------- |
| `/`                        | Root entry; startup discovers the authored `<acl-boundary>`             |
| `/?entry=core`             | `/core`; the application explicitly registers `<acl-boundary>`          |
| `/?polyfills=1`            | Await optional Web Components polyfills, then import the root entry     |
| `/?entry=core&polyfills=1` | Await optional polyfills, then import `/core` and register the boundary |

Alpine ESM loads after any requested polyfills and starts once. Native browsers skip upstream downloads; plain variants
skip the wrapper.

A fixed core application can use:

```js
import Alpine from 'alpinejs';
import Loader from 'alpine-component-loader/core';

globalThis.Alpine = Alpine;
Alpine.start();
await Loader.registerManifestFrom('./acl-manifest.json');
await Loader.registerErrorBoundary();
await Loader.start();
```

For fallbacks, await polyfills before dynamically importing the app. Core requires explicit built-in registration.
Startup means registration; `loaded` means component readiness.

Pin all map URLs to one release. Preload selection does not change imports. See [core startup](../../docs/core.md) and
[polyfill setup](../../docs/polyfills.md).

For an unpublished checkout, map ACL to `/__acl_hmr/modules/` and use its CLI server. Keep `index.min.js`,
`core.min.js`, and `polyfills.min.js` together. Production needs static/CDN URLs, not this dev prefix.

## Project generation

`acl.config.mjs` shares component, route, contract, and watch paths. Regenerate from the project root:

```bash
npx alpine-component-loader validate acl-manifest.json
npx alpine-component-loader manifest --update
npx alpine-component-loader routes --force
npx alpine-component-loader types acl-manifest.json --force
```

Sidecars own authored metadata; safe inference updates certain dependencies, slots, assets, source, and SHA-256
revision. Inspect tentative diagnostics without writing them:

```bash
npx alpine-component-loader manifest --infer report --dry-run
```

Watch filesystem-backed artifacts:

```bash
npx alpine-component-loader watch
```

Default watch tasks are `manifest`, `types`, and `routes`. Browser tasks need explicit selection or
`--include-expensive`.

Generate editor schemas when desired:

```bash
npx alpine-component-loader schema --kind component --out acl-component.schema.json
npx alpine-component-loader schema --kind manifest --out acl-manifest.schema.json
```

Run `npx alpine-component-loader audit / --root .` for a headless accessibility and console-error check.

Generate initial hints with `preload --entry-url` and tag/group selectors; generate offline modules with runtime
expansion. Manifest-declared environment needs are inferred; imperative use adds `--feature environment` or
`--runtime-feature environment`.

## Startup feedback and reproducible preload hints

The status separates registration from `loaded`, and failures reveal **Reload to retry startup**. Hint the greeting and
core boundary with:

```bash
npx alpine-component-loader preload acl-manifest.json \
  --entry-url /dist/core.min.js --tag hello-card --feature boundary \
  --out acl-preloads.html --force
```

Use the deployed runtime URL family, replacing local URLs with pinned CDN URLs when needed. Hints do not select the
application entry.
