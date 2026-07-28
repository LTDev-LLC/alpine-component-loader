# Offline command example

This example uses a version-one manifest dependency group and `acl-offline.json` policy to generate a narrowly scoped service worker. The resulting app shell, component templates, Alpine.js runtime, loader modules, allowed navigation fallback, and one bounded runtime response continue working after the browser goes offline.

From the repository root, build and generate the offline artifacts:

```bash
npm run build
npm run example:offline:generate
```

The generation shortcut runs the public `offline` command with these inputs:

```bash
node ./bin/alpine-component-loader.mjs offline examples/offline/acl-manifest.json \
  --group offline-demo \
  --config examples/offline/acl-offline.json \
  --asset index.html \
  --asset app.js \
  --asset styles.css \
  --asset acl-manifest.json \
  --asset ../../dist/index.js \
  --asset ../../dist/acl-load-error.js \
  --asset ../../dist/offline.js \
  --asset ../../dist/runtime/loader.js \
  --asset ../../dist/runtime/config.js \
  --asset ../../dist/runtime/errors.js \
  --asset ../../dist/runtime/values.js \
  --asset ../../dist/runtime/props.js \
  --asset ../../dist/runtime/data-options.js \
  --asset ../../dist/runtime/registry.js \
  --asset ../../dist/runtime/contracts.js \
  --asset ../../dist/runtime/component/factory.js \
  --asset ../../dist/runtime/component/lifecycle-controller.js \
  --asset ../../dist/runtime/component/loading-controller.js \
  --asset ../../dist/runtime/component/data-gate-controller.js \
  --asset ../../dist/runtime/component/render-controller.js \
  --asset ../../dist/runtime/component/state-controller.js \
  --asset ../../dist/runtime/lifecycle.js \
  --asset ../../dist/runtime/caches.js \
  --asset ../../dist/runtime/template-cache.js \
  --asset ../../dist/runtime/rendering.js \
  --asset https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js \
  --minify-js \
  --base-url /examples/offline \
  --out-dir examples/offline \
  --namespace example \
  --force
```

`--minify-js` hashes the actual minified output and publishes each explicit
local JavaScript asset under its virtual `.min.js` URL. The explicit runtime
list is the graph this example exercises, so optional capabilities are not
downloaded during service-worker installation. The manifest group automatically
includes both component templates in dependency-first order.

Alpine is an optional remote precache entry. A first visit needs network access
to jsDelivr; after the service worker successfully caches the pinned response,
the same runtime is available to an offline reload.

The policy keeps immediate activation for a zero-click demo, limits navigation fallback to `/examples/offline/`, and defines a cache-first rule for `runtime-message.json` with `maxEntries: 4` and a one-day expiry. The JSON response is deliberately not a precache asset: the controlled page requests it once so the runtime route stores and reuses it. Change `activation` to `prompt` in an application that should ask before promoting an update, then call `activateOfflineWorker(registration)` after user approval.

Start the repository development server:

```bash
npm run example:offline
```

Open <http://127.0.0.1:4173/examples/offline/index.html>. Wait for “Ready for offline reload,” verify that registration details contain the runtime-route message and storage quota fields, switch the browser to offline mode in DevTools, and reload. The page, nested components, styles, Alpine counter, navigation fallback, and previously stored runtime response remain available.

The generated files are checked in so the example works immediately:

- `acl-precache-manifest.json` describes the exact URLs and revisions.
- `acl-offline.json` declares activation, navigation, expiry, and runtime-cache limits.
- `acl-sw.js` precaches selected URLs, applies only the declared routes, recovers from quota pressure, and removes older `acl-offline-example-*` caches.

Run `npm run example:offline:generate` whenever the manifest, policy, templates, page assets, Alpine version, or built loader changes.

To build the current runtime and create a deployable static copy without
changing the checked-in generated files, run:

```bash
npm run stage -- offline
```

The stager writes `_site/examples/offline/app.min.js`, regenerates the service
worker and precache manifest against the staged files, maps the application’s
bare ACL imports to `/dist/*.min.js`, captures responsive component skeletons,
links `./skeletons/acl-skeletons.css` from the staged page head, and creates the
root redirect. The final page and skeleton stylesheet are included in the
generated precache. When Offline is selected with other static examples, the
same route-scoped files are generated beneath `/examples/offline/` and the root
becomes the shared example catalog.

Unlike the other static examples’ authored development maps, this page also
uses `/dist/*.min.js` in the repository. Those are the stable URLs stored by its
checked-in service worker, so the development-server example can reload while
offline without depending on `/__acl_hmr/`.
