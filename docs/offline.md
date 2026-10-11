# Offline behavior

The offline CLI generates a deterministic precache manifest and service worker from component dependencies and explicit
assets. The `/offline` helper registers the worker and reports its state.

Set `runtime.entryUrl` or `--runtime-entry` to the `index` or `core` URL your app imports. Include capabilities used by
imperative code through `features`; declarative boundary and dynamic dependencies are inferred.

Selecting the polyfill wrapper does not include upstream vendor files. Self-host them, pass their URLs to
`loadPolyfills()`, and list them as assets. See [polyfills](polyfills.md).

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

A navigation fallback must be a selected asset. Without one, the worker serves exact precache matches only. Runtime
caches enforce entry limits and retry quota failures after trimming.

The output directory receives:

- `acl-precache-manifest.json`, a diagnostic description of the selected components, URLs, revisions, and generated
  cache name.
- `acl-sw.js`, the service worker the browser installs.

The precache manifest is separate from the component manifest passed to `registerManifest()`. The worker embeds its
precache URLs.

## What is included

For every selected component, generation includes:

- Its template source.
- Every transitive manifest dependency, in dependency-first order.
- String-valued `loadingTemplate` and `fallback` sources that are not inline selectors.
- URLs from `externalCss` and `externalScripts`, including descriptor objects.

Repeat `--asset` for files or recursively included directories. Include the HTML shell, component manifest, styles, app
modules and their imports, and Alpine.

`--minify-js` gives project modules virtual `.min.js` URLs and hashes the minified bytes. Your build or development
server must serve those URLs; offline generation does not write the files. Existing minified and remote assets are
unchanged. ACL uses its prebuilt minified files and hashes the selected delivery family.

Without selectors, all groups are included. Repeat `--group` to select groups.

```bash
npx alpine-component-loader offline acl-manifest.json \
  --group profile \
  --group navigation \
  --asset public/runtime \
  --out-dir public/offline
```

Unknown groups and missing required local assets fail generation.

Remote assets are optional during installation. Their revision uses the URL unless explicitly supplied; local required
assets use content hashes.

## Paths: `basePath`, `--base-url`, and asset paths

The manifest and offline CLI resolve two different concerns:

- `manifest.basePath` locates component sources relative to the manifest and is also part of their browser URL.
- `--base-url` is the browser mount point for relative URLs, such as `/profile-app` when the application is hosted below
  that path.
- `--asset` paths are resolved on disk relative to the manifest directory; their browser URLs are joined to `--base-url`
  unless already absolute or remote.

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

With `--base-url /profile-app`, the generated browser URL is `/profile-app/components/profile-card.html`, while the file
is read from `components/profile-card.html` next to the manifest.

Absolute URLs remain unchanged. Match generated URLs to the deployment mount.

## Register the worker

Register explicitly from the SSR-safe `alpine-component-loader/offline` entry after the component manifest has been
registered:

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

Activate an update after user approval. Storage usage and quota are reported when available.

Service workers require HTTPS or localhost. Unsupported environments report an error.

Listen for ACL registration events or native controller changes when the UI needs progress:

```js
addEventListener('acl:offline-registered', (event) => {
    console.log('Registered for scope', event.detail.scope);
});

addEventListener('acl:offline-updatefound', (event) => {
    console.log('Installing an update for', event.detail.scope);
});

addEventListener('acl:offline-quota', (event) => {
    console.warn('Runtime cache was trimmed after quota pressure', event.detail.cacheName);
});

navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('The generated worker now controls this page.');
});
```

`getOfflineStatus()` is safe to use for diagnostics without exposing cache contents:

| Field           | Result                                                                                  |
| --------------- | --------------------------------------------------------------------------------------- |
| `supported`     | Whether the current environment exposes Service Worker APIs.                            |
| `controlled`    | Whether a service worker currently controls the page.                                   |
| `storage`       | Optional `usage`, `quota`, and estimated `remaining` bytes, or `null` when unavailable. |
| `registrations` | Scope plus `active`, `waiting`, and `installing` states for each registration.          |

## Installation, activation, and cache lifecycle

The generated service worker:

1. Opens a content-addressed cache and adds every required local URL.
2. Attempts optional remote URLs without failing the installation when they are unavailable.
3. Calls `skipWaiting()` after successful installation only for `"activation": "immediate"`; prompt activation waits for
   `activateOfflineWorker()`.
4. Deletes older caches with the same namespace during activation.
5. Claims clients and intercepts exact selected GET URLs.
6. Optionally applies the configured navigation fallback and allowlist.
7. Optionally applies bounded runtime-route strategies, timestamps stored responses, expires old entries, and trims each
   route cache to `maxEntries`.
8. On `QuotaExceededError`, trims the affected runtime cache, retries once, and publishes an `acl:offline-quota` browser
   event.

Sorted assets and content hashes produce deterministic cache names. Asset or revision changes create a new cache;
namespaces isolate cleanup.

Worker activation may finish after page loading. Wait for `controllerchange` or reload before testing offline readiness.

## Runtime routes and data requests while offline

Precache covers static assets. API data requires opt-in GET runtime caching with limits; component caches remain a
separate layer.

This example uses network-first API caching, at most 25 entries, and a 300-second age limit. Add an origin restriction
when needed:

Component data behavior still follows each component's cache strategy:

- `cache-first` can reuse a stored response while it remains available.
- `network-first` attempts the network and may fall back to a cached response.
- `stale-while-revalidate` serves cached data and refreshes when possible.
- `no-store` requires the network.

Polling pauses offline, and adaptive prefetch skips work when `navigator.onLine` is false. See [data](data.md) and
[prefetch](prefetch.md).

## Safe generation and reproducibility

Use `--dry-run` to compute the planned bundle without writing it, and combine it with `--json` to inspect
machine-readable generated output:

```bash
npx alpine-component-loader offline acl-manifest.json \
  --group offline-profile \
  --asset index.html \
  --dry-run \
  --json
```

`--force` permits replacing existing outputs. Deterministic generated files can be checked in.

Regenerate after changing templates, revisions, groups, assets, or app modules so the worker receives the new dependency
set.

## Troubleshooting

### The worker installs but offline reload fails

Check selected HTML, component manifest, entry and transitive modules, styles, and Alpine. Generated URLs must match
deployed URLs exactly.

### Installation fails

Compare the failing required URL with `basePath` and worker scope. Optional remote asset failures do not block
installation.

### The page is not controlled

Check worker scope, registration, and whether the page has a controller.

### A new deployment serves old files

Regenerate and deploy the worker under the same namespace. Avoid indefinitely caching the worker script.

For the manifest source-of-truth workflow see [Manifests, generated contracts, and CLI tooling](manifests-and-cli.md).
