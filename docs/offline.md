# Offline behavior

Offline support is explicit and generated. The CLI expands a component manifest dependency graph, adds selected application assets, and writes a deterministic precache manifest plus service worker. The browser helper registers that generated worker and reports its state.

## End-to-end quick start

Generate the reusable component manifest first:

```bash
npx alpine-component-loader manifest components --out acl-manifest.json
npx alpine-component-loader validate acl-manifest.json
```

Add a group that represents the offline entry point. Its dependencies are included automatically:

```json
{
  "version": 1,
  "components": {
    "avatar-image": "components/avatar-image.html",
    "profile-card": {
      "source": "components/profile-card.html",
      "dependencies": ["avatar-image"]
    }
  },
  "groups": {
    "offline-profile": ["profile-card"]
  }
}
```

Generate the bundle:

```bash
npx alpine-component-loader offline acl-manifest.json \
  --group offline-profile \
  --asset index.html \
  --asset app.js \
  --asset styles.css \
  --asset acl-manifest.json \
  --config acl-offline.json \
  --base-url /profile-app \
  --out-dir public \
  --namespace profile-app \
  --force
```

Optional `--config acl-offline.json` enables declarative activation, navigation fallback, and bounded runtime routes:

```json
{
  "$schema": "./acl-offline.schema.json",
  "version": 1,
  "activation": "prompt",
  "navigation": {
    "fallback": "index.html",
    "allow": ["/profile-app/"],
    "strategy": "network-first"
  },
  "runtimeRoutes": [
    {
      "path": "/profile-app/api/",
      "strategy": "stale-while-revalidate",
      "cacheName": "api",
      "maxEntries": 50,
      "maxAgeSeconds": 3600
    }
  ]
}
```

The navigation fallback must also be selected by `--asset` or the component graph. Runtime routing is opt-in; omit `--config` when the generated worker should continue to intercept only exact precache URLs. Runtime caches enforce `maxEntries`, trim and retry on `QuotaExceededError`, and publish an `acl:offline-quota` browser event.

The output directory receives:

- `acl-precache-manifest.json`, a diagnostic description of the selected components, URLs, revisions, and generated cache name.
- `acl-sw.js`, the service worker the browser installs.

The precache manifest is not passed to `registerManifest()`. The browser runtime continues to use `acl-manifest.json`; the generated worker embeds its own URL lists.

## What is included

For every selected component, generation includes:

- Its template source.
- Every transitive manifest dependency, in dependency-first order.
- String-valued `loadingTemplate` and `fallback` sources that are not inline selectors.
- URLs from `externalCss` and `externalScripts`, including descriptor objects.

Repeatable `--asset` flags add application files and directories. A directory is walked recursively in stable path order. Include the HTML shell, manifest, styles, entry module, every statically imported browser module, Alpine, and other files needed for an offline reload.

Use `--minify-js` to publish explicit local JavaScript assets under virtual
`.min.js` URLs. The generator minifies and hashes the actual bytes that the
service worker will fetch; existing `.min.js` files and remote URLs are left
unchanged. Update HTML and module imports to request the resulting `.min.js`
names, and select only the runtime modules the offline workflow exercises so
optional capabilities are not downloaded during worker installation. The
generator does not write physical minified files, so the deployed server or CDN
must provide the virtual `.min.js` responses; the packaged development server
does this for local testing.

If no `--group` is supplied, all manifest components are included. Repeat `--group` to combine named graphs:

```bash
npx alpine-component-loader offline acl-manifest.json \
  --group profile \
  --group navigation \
  --asset public/runtime \
  --out-dir public/offline
```

An unknown group is an error. Missing local component or explicit assets are also errors, because a bundle that silently omitted required local files would be unsafe to install.

Remote component and asset URLs are optional during service-worker installation. They are revisioned by URL when no component revision is available, and an unavailable remote asset does not fail installation. Local assets are required and content-hashed.

## Paths: `basePath`, `--base-url`, and asset paths

The manifest and offline CLI resolve two different concerns:

- `manifest.basePath` locates component sources relative to the manifest and is also part of their browser URL.
- `--base-url` is the browser mount point for relative URLs, such as `/profile-app` when the application is hosted below that path.
- `--asset` paths are resolved on disk relative to the manifest directory; their browser URLs are joined to `--base-url` unless already absolute or remote.

For example:

```json
{
  "version": 1,
  "basePath": "components/",
  "components": {
    "profile-card": "profile-card.html"
  }
}
```

With `--base-url /profile-app`, the generated browser URL is `/profile-app/components/profile-card.html`, while the file is read from `components/profile-card.html` next to the manifest.

An absolute manifest `basePath` or component source remains absolute. Keep runtime fetch URLs, the deployed directory layout, and the generated URLs aligned.

## Register the worker

Register explicitly from the SSR-safe `alpine-component-loader/offline` entry after the component manifest has been registered:

```js
import AlpineComponentLoader from 'alpine-component-loader';
import { getOfflineStatus, registerOfflineWorker } from 'alpine-component-loader/offline';

const response = await fetch('/profile-app/acl-manifest.json');
if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);

const manifest = await response.json();
await AlpineComponentLoader.registerManifest(manifest);
await AlpineComponentLoader.start();

const registration = await registerOfflineWorker('/profile-app/acl-sw.js', {
    scope: '/profile-app/',
});

console.log(registration.scope);
console.log(await getOfflineStatus());
```

For a worker generated with `"activation": "prompt"`, call `activateOfflineWorker(registration)` after the user accepts the update. `getOfflineStatus()` also reports the browser storage usage, quota, and estimated remaining bytes when the Storage API exposes them.

The helper throws a clear error when Service Worker APIs are unavailable. Service workers require HTTPS in production; localhost is allowed for development.

Listen for ACL registration events or native controller changes when the UI needs progress:

```js
addEventListener('acl:offline-registered', event => {
    console.log('Registered for scope', event.detail.scope);
});

addEventListener('acl:offline-updatefound', event => {
    console.log('Installing an update for', event.detail.scope);
});

addEventListener('acl:offline-quota', event => {
    console.warn('Runtime cache was trimmed after quota pressure', event.detail.cacheName);
});

navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('The generated worker now controls this page.');
});
```

`getOfflineStatus()` is safe to use for diagnostics without exposing cache
contents:

| Field | Result |
| --- | --- |
| `supported` | Whether the current environment exposes Service Worker APIs. |
| `controlled` | Whether a service worker currently controls the page. |
| `storage` | Optional `usage`, `quota`, and estimated `remaining` bytes, or `null` when unavailable. |
| `registrations` | Scope plus `active`, `waiting`, and `installing` states for each registration. |

## Installation, activation, and cache lifecycle

The generated service worker:

1. Opens a content-addressed cache and adds every required local URL.
2. Attempts optional remote URLs without failing the installation when they are unavailable.
3. Calls `skipWaiting()` after successful installation only for `"activation": "immediate"`; prompt activation waits for `activateOfflineWorker()`.
4. Deletes older caches with the same namespace during activation.
5. Claims clients and intercepts exact selected GET URLs.
6. Optionally applies the configured navigation fallback and allowlist.
7. Optionally applies bounded runtime-route strategies, timestamps stored responses, expires old entries, and trims each route cache to `maxEntries`.
8. On `QuotaExceededError`, trims the affected runtime cache, retries once, and publishes an `acl:offline-quota` browser event.

The cache name is derived from sorted entry content. Identical inputs produce identical output; a changed revision or asset hash produces a new cache name. `--namespace` isolates unrelated applications or environments and defines which older generated caches activation may delete.

After immediate activation—or after a prompt-activation message—`clients.claim()` may still occur after the first page load finishes. Check `navigator.serviceWorker.controller`, wait for `controllerchange`, or reload before claiming that offline reload is ready.

## Runtime routes and data requests while offline

Without `--config`, the generator precaches component and application assets but does not intercept arbitrary component API responses. With a runtime route, the service worker may additionally cache matching GET responses according to its route strategy and limits. Component-level request sharing and the Service Worker cache remain separate layers.

For example, a route with `"path": "/api/public/"`, `"strategy": "network-first"`, `"maxEntries": 25`, and `"maxAgeSeconds": 300` attempts the network, retains at most 25 successful responses, and falls back only to unexpired stored responses. Use `"origin"` when the rule should match one explicit cross-origin host.

Component data behavior still follows each component's cache strategy:

- `cache-first` can reuse a stored response while it remains available.
- `network-first` attempts the network and may fall back to a cached response.
- `stale-while-revalidate` serves cached data and refreshes when possible.
- `no-store` requires the network.

Polling pauses while offline by default. Adaptive prefetch also skips speculative work when `navigator.onLine` is false. See [Data, caching, polling, and persistence](data.md) and [Adaptive prefetch](prefetch.md).

## Safe generation and reproducibility

Use `--dry-run` to compute the planned bundle without writing it, and combine it with `--json` to inspect machine-readable generated output:

```bash
npx alpine-component-loader offline acl-manifest.json \
  --group offline-profile \
  --asset index.html \
  --dry-run \
  --json
```

Existing outputs are protected unless `--force` is supplied. Generated artifacts are deterministic and can be checked into source control or reproduced in CI.

Regenerate after changing component templates, revisions, dependency groups, external assets, or shell/module files. The offline command hashes local files at generation time; a stale worker cannot know about an asset that was never selected.

## Troubleshooting

### The worker installs but offline reload fails

Inspect `acl-precache-manifest.json` and verify that the HTML entry, component manifest, entry module, transitive JavaScript imports, styles, Alpine runtime, and component templates are all present under the exact deployed URLs.

### Installation fails

A required local URL probably returns an error at the worker scope. Compare `--base-url`, `manifest.basePath`, server mount paths, and the worker's `REQUIRED` list. Remote optional failures do not reject installation.

### The page is not controlled

Confirm HTTPS/localhost eligibility, that the worker URL is inside the intended scope, and that registration completed. Navigate or reload after activation and inspect `getOfflineStatus()`.

### A new deployment serves old files

Regenerate the artifacts, deploy the new `acl-sw.js`, and use a stable namespace for successive versions of the same application. Ensure the server does not indefinitely cache the worker script itself.

For the manifest source-of-truth workflow see [Manifests, generated contracts, and CLI tooling](manifests-and-cli.md).
