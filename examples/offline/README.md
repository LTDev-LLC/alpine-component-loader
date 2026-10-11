# Offline command example

Generates a scoped service worker from a v1 manifest group and `acl-offline.json`. It keeps the app shell, templates,
runtimes, navigation fallback, and a bounded runtime response available offline.

Build and generate from the repository root:

```bash
npm run build
npm run example:offline:generate
```

The shortcut generates root/core workers using the `alpinejs-pinned` pin in `package.json`. These are equivalent inputs
for the root worker through the public CLI:

```bash
node ./bin/alpine-component-loader.mjs offline examples/offline/acl-manifest.json \
  --group offline-demo \
  --config examples/offline/acl-offline.json \
  --asset index.html \
  --asset app.min.js \
  --asset demo.html \
  --asset ../feature-lab/demos \
  --asset styles.css \
  --asset acl-manifest.json \
  --asset https://cdn.jsdelivr.net/npm/alpinejs@3.17.4/dist/cdn.min.js \
  --runtime-entry /dist/index.min.js \
  --runtime-feature offline --runtime-feature polyfills --runtime-feature data \
  --runtime-feature hydration --runtime-feature triggers --runtime-feature styles \
  --runtime-feature slots --runtime-feature scripts --runtime-feature environment \
  --runtime-feature scheduler \
  --base-url /examples/offline \
  --out-dir examples/offline \
  --namespace example \
  --force
```

`--runtime-entry` expands ACL modules from the graph; local main/loading/fallback templates infer styles and slots. The
build minifies `app.js`, preserves vendor filenames, and orders component dependencies.

First installation needs the pinned Alpine jsDelivr response; successful caching makes it available offline.

The demo activates immediately, limits navigation fallback to `/examples/offline/`, and caches `runtime-message.json` on
first use with `maxEntries: 4` and one-day expiry. For approved updates, set `activation: 'prompt'` and call
`activateOfflineWorker(registration)` after confirmation.

Start the repository development server:

```bash
npm run example:offline
```

Open <http://127.0.0.1:4173/examples/offline/index.html>, wait for **Ready for offline reload**, check runtime/quota
details, then disable networking and reload.

Checked-in artifacts:

- `acl-precache-manifest.json`: URLs and revisions.
- `acl-offline.json`: activation, navigation, expiry, and cache limits.
- `acl-sw.js`: precaching, declared routes, quota recovery, and old-cache cleanup.

Regenerate after changing manifests, policy, templates, assets, Alpine, or ACL.

Create a static copy without changing checked-in artifacts:

```bash
npm run stage -- offline
```

Staging regenerates worker assets, direct minified imports, and responsive skeletons under `_site/examples/offline/`.
The final page and skeleton CSS are precached. Multiple selections create a shared catalog.

Repository imports also use `/dist/*.min.js`, matching worker URLs without depending on dev-only `/__acl_hmr/` paths.

## Startup entry and fallback APIs

Default startup uses `index.min.js`; `?entry=core` uses core and the matching `acl-sw-core.js`. Both register the
manifest explicitly. Generation produces both workers. See [core startup](../../docs/core.md).

`?polyfills=1` gates Alpine/application imports with precached self-hosted scripts. The default CDN URL is not
redirected. See [offline polyfill delivery](../../docs/polyfills.md).

## Late capability activation and core worker

After installation, disable networking and open capability, pooling, scheduling, or polyfill experiments. Fresh
documents activate modules absent from the initial shell using explicit precache dependencies.

Combine core and polyfills with `?entry=core&polyfills=1`; add `&fallback=1` for forced ShadyDOM. Vendor filenames
remain intact and ACL stays in one minified family.

`demo.html` is inside the worker scope. Its precached shared assets may live outside that scope because requests
originate from a controlled document.
