# Migrating AlpineComponentLoader

## v1.0.0 runtime and tooling modernization

Version 1.0.0 preserves package exports, CLI defaults, and default npm installs. Node tooling requires Node.js 22+.
Existing component definitions remain valid.

Host property accessors now live on the custom-element prototype; writability, enumeration, configuration, and
reflection remain. Replace own-property checks with `propName in element` or inspect the prototype.

`parse5` and `@swc/core` are optional dependencies, installed by default. `--omit=optional` skips them; affected
features report `ACL_OPTIONAL_DEPENDENCY_MISSING` with installation guidance.

Watch mode uses a recursive native watcher with directory fallbacks. Its safety scan defaults to 5000 ms; configure
`watch.pollInterval`, `--poll-interval`, or server `watchPollInterval`. `0` disables scans; CLI values take precedence.

Template parsing, caching, lifecycle state, and prefetch bookkeeping are optimized with unchanged results. Custom
Trusted Types policies and sanitizers still run per instance.

## Demand-loaded ES2022 runtime

Public entries now load optional capabilities when markup, configuration, or an API requires them. Components reuse
loaded implementations.

This changes these synchronous return values to promises:

| API                          | New result                               |
| ---------------------------- | ---------------------------------------- |
| `define()`                   | `Promise<CustomElementConstructor>`      |
| `registerComponent()`        | `Promise<CustomElementConstructor>`      |
| `registerDynamicLoader()`    | `Promise<CustomElementConstructor>`      |
| `registerTemplates()`        | `Promise<CustomElementConstructor[]>`    |
| `registerSkeletonManifest()` | `Promise<string[]>`                      |
| `observePrefetch()`          | `Promise<ACLAdaptivePrefetchController>` |

Await a call when the returned constructor, tags, controller, or immediate readiness is required:

```javascript
const ProfileCard = await AlpineComponentLoader.define('profile-card', '/components/profile-card.html');
const controller = await AlpineComponentLoader.observePrefetch();
```

Pre-start definitions can remain pending; `start()` waits for them:

```javascript
AlpineComponentLoader.define('profile-card', '/components/profile-card.html');
AlpineComponentLoader.define('account-card', '/components/account-card.html');
await AlpineComponentLoader.start();
```

`start()` registers built-ins only when discovered. To guarantee registration before insertion:

```javascript
await AlpineComponentLoader.registerComponent();
await AlpineComponentLoader.registerDynamicLoader();
```

`createIndexedDBPersistenceAdapter()` remains synchronous. Storage operations load and await its implementation.

Modules target ES2022. `.min.js` entries request minified dependencies; `.js` entries request readable ones. Missing
minified modules reject without fallback. Keep one URL family.

## Included v1.0.0 tooling and security capabilities

SSR, testing, observability, generated contracts, and adaptive prefetch are opt-in v1 features with compatible rendering
defaults.

Sanitization remains enabled and covers nested templates/SVG, executable URLs, `srcset`, refresh, form actions,
`srcdoc`, and `<base>`. Custom sanitizer contracts and `sanitize: false` remain available. Configure
`security.trustedTypesPolicy` when enforced; custom URL policies cannot restore executable URLs.

New testing entries provide browser, Playwright, Vitest, and server harnesses; `/ssr` is Node-only. `createLoader()`
isolates configuration, registries, resources, metrics, caches, and disposal. See the [API reference](docs/api.md) for
entry names.

Version-one manifests accept descriptive event/slot metadata. `.acl.json` sidecars own authored settings; inference
supplies structural dependencies. `manifest --update` preserves authored contracts; `acl types` and `acl schema`
generate deterministic output.

SSR adds bounded initial data and Light DOM rendering. Offline policies add navigation, runtime routes, expiry, and
quota recovery. `acl audit` emits console, JSON, JUnit, or SARIF. See [API documentation](docs/api.md).

v1 changes startup, security defaults, and data configuration. Alpine.js 3.14-3.x remains supported; JavaScript data
options now use grouped `data` settings.

## Upgrade checklist

1. Upgrade Alpine to 3.14 or newer and install from GitHub with
   `npm install github:LouisT/alpine-component-loader alpinejs`.
2. Replace reliance on root-entry auto-start with an explicit `await AlpineComponentLoader.start()` call, or import
   `alpine-component-loader/auto` in browser-only applications.
3. Review templates that contain `<script>`, inline `on*` handlers, `javascript:` URLs, or function-like declarative
   data attributes. Declarative expressions were removed; template scripts require an explicit `executeScripts: true`.
4. Confirm every custom-element name is valid and contains a hyphen. Invalid and reserved names now fail early.
5. Await persistence helpers (`$save`, `$get`, `$clear`, `$flush`) and lifecycle hooks that perform asynchronous work.
6. Update code that expects `prefetchAll()` to reject as a batch; it now returns a settled result for every tag.
7. If cache continuity matters, set an explicit `cacheNamespace`. Version 1.0 uses versioned namespaced template buckets
   and prunes stale buckets during startup.
8. Move every flat JavaScript data option into the grouped `data` object. Declarative `data-*` attributes are unchanged.
9. Run your application with the optional debugger and export diagnostics for any remaining failures.

## Entry-point changes

### Before

```javascript
import AlpineComponentLoader from 'alpine-component-loader';
// Registration happened as an import side effect.
```

### After: explicit and SSR-safe

```javascript
import AlpineComponentLoader from 'alpine-component-loader';

AlpineComponentLoader.config({ basePath: '/components/' });
// The following promise is drained by start().
AlpineComponentLoader.define('site-card', 'card.html');
await AlpineComponentLoader.start();
```

### After: browser auto entry

```javascript
import AlpineComponentLoader from 'alpine-component-loader/auto';
```

Root, debugger, and dev entries import without browser globals. `start()` requires a DOM and otherwise rejects with
`ACL_ENVIRONMENT_UNAVAILABLE`.

`start()` registers queued definitions. Later `define()` calls register immediately; await their promises when readiness
matters.

### Canonical distribution filenames

`npm run build` emits ES2022 `.js` and `.min.js` families for every module. Publish the complete `dist/` directory.
Package imports use canonical readable files; CDN imports can select prebuilt minified files. Rename old imports as
follows:

| Removed filename                    | Replacement        |
| ----------------------------------- | ------------------ |
| `dist/AlpineComponentLoader.js`     | `dist/index.js`    |
| `dist/AlpineComponentLoader.min.js` | `dist/index.js`    |
| `dist/ACLDebugger.js`               | `dist/debugger.js` |
| `dist/ACLDebugger.min.js`           | `dist/debugger.js` |

Prefer package specifiers over direct `dist/` imports.

## Security contract

`safeMode` and `allowUnsafeExpressions` are removed. Declarative attributes accept strict JSON, never executable
expressions. Sanitization defaults on; template scripts default off.

Use module code and JSON attributes. Enable trusted template scripts explicitly:

```javascript
await AlpineComponentLoader.define('trusted-report', 'report.html', {
    executeScripts: true,
});
```

Move dynamic expressions into programmatic `data.keys` or `data.params` functions.

## Fetching, retries, and cache identity

- Data responses support `json`, `text`, `blob`, `arrayBuffer`, `stream`, `auto`, and custom parsers.
- Retries use exponential backoff, jitter, `Retry-After`, transient status detection, and abortable delays.
- `POST`, `PATCH`, and other unsafe methods are not retried unless `retryUnsafeMethods` is enabled.
- Polling pauses while the page is hidden or offline by default.
- Request cache keys are opaque fingerprints of URL, method, headers, body, parser mode, and explicit cache key. The
  prop target is not part of raw response identity.
- Binary, streaming, and file-containing bodies bypass shared caching unless `data.cacheKey` is supplied.
- Cached values and component defaults are cloned at consumer boundaries.

Move flat options into `data`, for example:

```javascript
await AlpineComponentLoader.define('user-card', 'user.html', {
    data: {
        src: '/api/user',
        responseType: 'json',
        retries: 2,
        retryDelay: 250,
        cacheStrategy: 'stale-while-revalidate',
    },
});
```

## Persistence

Persistence now requires `{ version, data }` envelopes with positive integer versions. Convert unversioned records
before startup; use migrations for later shape changes:

```javascript
await AlpineComponentLoader.define('settings-card', 'settings.html', {
    persist: 'local',
    persistVersion: 2,
    async persistMigrate(data, { fromVersion }) {
        if (fromVersion < 2) return { ...data, theme: data.theme || 'system' };
        return data;
    },
});
```

Adapters implement `getItem`, `setItem`, and `removeItem` synchronously or asynchronously. Storage errors emit
`acl:error` without blocking initialization.

## Hooks and cleanup

Hooks may be async and return teardown callbacks. Fetch hooks also receive component, props, and root context.

```javascript
hooks: {
    async mounted({ el }) {
        const controller = new AbortController();
        el.addEventListener('refresh', () => el.reload(), { signal: controller.signal });
        return () => controller.abort();
    }
}
```

## Events and recovery

Runtime events are `acl:loadstart`, `acl:loadend`, `acl:error`, `acl:cachehit`, and `acl:revalidated`. `ACLLoadError`
adds `code`, `phase`, `status`, and `retryable`; components add `$retry()` and `$cancel()`.

## Manifests and development reloads

`registerManifest()` supports registries, group prefetch, and optional dependency arrays. Existing v1 manifests remain
valid. `observeTemplates()` handles later declarations.

`/dev` enables SSE template invalidation and state-preserving reloads. `element.reload()` remains a hard reload.
`alpine-component-loader serve` injects the dev connection automatically.

## Debugging upgrade problems

```javascript
import ACLDebugger from 'alpine-component-loader/debugger';

ACLDebugger.inject(AlpineComponentLoader);
AlpineComponentLoader.toggleDebug();
```

The debugger provides bounded timelines, virtualized lists, and diagnostics with credentials and sensitive URL values
redacted.

## Template limits and optional scheduling

URL templates default to a 10-second timeout through body consumption and a 1 MiB limit. `templateTimeout: 0` and
`templateMaxBytes: Infinity` disable these guards. Each template/prefetch consumer owns its cancellation.

`hydrationScheduler: { budgetMs: 8, maxTasksPerTurn: 4 }` remains opt-in. Lazy loading, visible hydration, and polling
share on-demand environmental subscriptions; imperative tooling can select `environment`. Default rendering bypasses
scheduling, and generated options need no extra request. SSR defaults to eight concurrent renders; `renderStream()`
preserves order and backpressure.

Vite supports `>=5 <9`. Enable explicit preload hints through plugin `preload` or the CLI. Offline `runtime.entryUrl`
plus feature selectors replaces manual module lists.

## Explicit startup and shared implementations

`/core` exports the default loader and `ACLLoadError`. Its `start()` registers queued definitions without discovery.
Root and core share configuration/registrations; a later root `start()` enables discovery. Both retain explicit
observation.

Loaders share implementation modules but isolate runtime contexts, memory caches, and disposal. Internal URLs omit
`acl-instance`; legacy entry queries still work. Persistent namespace sharing is unchanged. Internal controller paths
are not public contracts.

Styles, slots, enabled scripts, hydration, and triggers are separate capabilities; security remains in the required
renderer. Select imperative features in preloads/offline assets; local offline templates infer styles/slots. Vite
`preload.entry: 'core'` selects hints, not application imports.

When switching to `/core`, replace discovery dependencies explicitly:

```js
import Loader from 'alpine-component-loader/core';

await Loader.registerManifestFrom('./acl-manifest.json');
await Loader.registerErrorBoundary(); // If the page uses <acl-boundary>.
await Loader.start();
```

Core applications use `registerTemplates()` for existing declarations and `observeTemplates()` for later ones. See
[core startup](docs/core.md).

## Optional Web Components fallback support

The opt-in `/polyfills` entry loads needed Web Components fallbacks and gates registration until ready. Native browsers
skip upstream scripts; HTML Imports are excluded.

```js
import loadPolyfills from 'alpine-component-loader/polyfills';

await loadPolyfills();
await import('./app.js');
```

Dynamically import Alpine/application code after the bootstrap. With an existing upstream loader, return
definition/import work from `waitForWebComponents()` and await element readiness afterward. See
[polyfill usage](docs/polyfills.md). Native ESM/ES2022 requirements remain.
