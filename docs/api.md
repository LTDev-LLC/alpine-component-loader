# API reference and troubleshooting

Public APIs, defaults, and troubleshooting. Feature guides provide complete workflows.

## Startup patterns

The root entry has no startup side effect. Configure and register definitions before calling `start()`:

```js
import AlpineComponentLoader from 'alpine-component-loader';

AlpineComponentLoader.config({
    basePath: '/components/',
    shadow: true,
    cacheNamespace: 'profile-app',
});

// start() drains this pending pre-start definition.
AlpineComponentLoader.define('profile-card', 'profile-card.html', {
    attributes: { name: { type: String, required: true } },
});

await AlpineComponentLoader.start();
```

Expose Alpine 3.14-3.x on `window.Alpine` and start it once before components initialize.

[Core](core.md) skips discovery; explicitly register templates and built-ins.

Await `/polyfills` before dynamically importing the application. `waitForWebComponents()` integrates external loaders.
See [polyfill options](polyfills.md). Startup completes registration; `loaded`/hydration events mark initialization.

`config()` merges current defaults and synchronously validates modes, bounds, and persistence versions.

Use `alpine-component-loader/auto` only when browser import-time startup is deliberate:

```js
import AlpineComponentLoader from 'alpine-component-loader/auto';
```

The auto entry waits for DOM parsing, applies `window.AlpineComponentLoaderConfig` when present, and starts unless
`autoStart` is false:

```html
<script>
    window.AlpineComponentLoaderConfig = {
        autoStart: true,
        observeTemplates: true,
        basePath: '/components/',
        cacheNamespace: 'profile-app',
    };
</script>
```

## Isolated loader instances

Use `createLoader()` for independent application/test state:

```js
import { createLoader } from 'alpine-component-loader';

const loader = createLoader({
    root: document.querySelector('#account-app'),
    cacheNamespace: 'account-app',
    config: { autoStart: false },
});

await loader.define('account-card', '/components/account-card.html');
await loader.start();
await loader.dispose();
```

`root` limits discovery to a document, element, or open Shadow Root; `ready` marks facade setup. Loaders share
implementation modules but own configuration, registries, requests, queues, metrics, and memory caches. Persistent
namespaces retain configured sharing. `dispose()` releases owned resources and rejects later mutation with
`ACL_LOADER_DISPOSED`. `clearPersistentCaches` defaults to `true`; set it to `false` to retain shared persistent caches.
Custom-element names remain global; duplicate loader ownership reports `ACL_TAG_OWNERSHIP_CONFLICT`.

`/auto` observes before scanning. `observeTemplates: false` retains only scanning; `autoStart: false` disables both.
`startAutoLoader()` repeats startup without duplicate observers.

Other entries import without browser globals; browser operations still need DOM/Service Worker APIs.

Capabilities load on activation. Concurrent callers share an import promise; successful implementations are reused.

Registration is asynchronous. `start()` drains pre-start definitions; await `define()` separately when you need its
constructor.

Failed imports reject with `ACL_RUNTIME_MODULE_LOAD_FAILED` and are evicted for later retry.

## Configuration reference

`config()` merges nested `attributes`, `data`, `hooks`, `events`, `errorCss`, `security`, `observability`, and
`adaptivePrefetch`; arrays/scalars replace previous values. Definitions merge global prop/data/hook/event/error records,
concatenate asset/shared-sheet arrays, and override other explicit defaults.

| Option                   | Default                    | Contract                                                                              |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------------- |
| `attributes`             | `{}`                       | Typed prop constructor/descriptor map.                                                |
| `debug`                  | `false`                    | Loader debugger state after debugger injection.                                       |
| `autoStart`              | `true`                     | Global-only gate used by the `/auto` entry.                                           |
| `observeTemplates`       | `true`                     | Global-only `/auto` control for observing inline declarations inserted after startup. |
| `basePath`               | empty                      | Prefix for relative component sources.                                                |
| `sourceResolver`         | `null`                     | Synchronously rewrite a source before `basePath`.                                     |
| `errorCss`               | accessible built-in styles | Style record merged into the no-fallback error block.                                 |
| `loading`                | `eager`                    | `eager`, `lazy`, or `idle`.                                                           |
| `hydrate`                | `eager`                    | SSR-only hydration trigger: `eager`, `visible`, `idle`, `interaction`, or `media`.    |
| `hydrateMedia`           | `null`                     | Required media query for `hydrate: "media"`.                                          |
| `shadow`                 | `false`                    | Render into an open Shadow Root.                                                      |
| `useConstructibleStyles` | `true`                     | Adopt cached constructible sheets when supported.                                     |
| `sharedStyleSheets`      | `[]`                       | Application `CSSStyleSheet` objects adopted in Shadow DOM.                            |
| `executeScripts`         | `false`                    | Execute template scripts that survive the selected sanitizer.                         |
| `stripStyles`            | `false`                    | Remove template `<style>` elements.                                                   |
| `sanitize`               | `true`                     | Built-in sanitizer, `false`, or a custom sanitizer function.                          |
| `security`               | `{}`                       | Trusted Types policy and URL-policy settings.                                         |
| `observability`          | `false`                    | Global structured-record retention/logger settings.                                   |
| `adaptivePrefetch`       | `false`                    | Global adaptive-prefetch startup settings or `true` for defaults.                     |
| `strictProps`            | `false`                    | Throw instead of reporting and defaulting invalid props.                              |
| `runtimeCacheMax`        | `200`                      | Bound in-memory style, asset, and diagnostic maps.                                    |
| `cacheNamespace`         | `default`                  | Global Cache API namespace segment.                                                   |
| `keepAliveMax`           | `Infinity`                 | Default dynamic inactive-child capacity.                                              |
| `dynamicTransition`      | `auto`                     | Default dynamic transition preset.                                                    |
| `transitionDuration`     | `100`                      | Default dynamic transition duration in milliseconds.                                  |
| `events`                 | `{ forward: [] }`          | Event-forwarding configuration.                                                       |
| `externalCss`            | `[]`                       | External stylesheet strings/descriptors.                                              |
| `externalScripts`        | `[]`                       | External script strings/descriptors.                                                  |
| `loadingTemplate`        | `null`                     | Loading template URL, selector, or template element.                                  |
| `loadingHtml`            | `null`                     | Loading markup string.                                                                |
| `defaultComponentName`   | `acl-component`            | Default declarative-proxy tag used by on-demand discovery and explicit registration.  |
| `defaultDynamicName`     | `acl-dynamic`              | Default dynamic-loader tag used by on-demand discovery and explicit registration.     |
| `defaultBoundaryName`    | `acl-boundary`             | Default nearest-error-boundary tag used by discovery and explicit registration.       |
| `data`                   | grouped defaults           | Request, retry, polling, response, and data-cache settings.                           |
| `cacheTemplates`         | `true`                     | Enable Cache API storage for external templates.                                      |
| `templateCacheStrategy`  | `cache-first`              | Template cache strategy.                                                              |
| `templateCacheTtl`       | `900000`                   | Template freshness in milliseconds.                                                   |
| `templateCacheMax`       | `100`                      | Active template namespace capacity.                                                   |
| `templateRevision`       | `null`                     | Explicit source content revision.                                                     |
| `fallback`               | `null`                     | Initial-failure template source.                                                      |
| `hooks`                  | identity fetch hooks       | Lifecycle, fetch, and preservation hooks.                                             |
| `persist`                | `false`                    | `local`, `session`, `indexeddb`, or custom adapter mode.                              |
| `persistKey`             | `null`                     | Explicit storage key.                                                                 |
| `persistDebounce`        | `250`                      | Automatic snapshot debounce in milliseconds.                                          |
| `persistAdapter`         | `null`                     | Sync/async storage adapter.                                                           |
| `persistVersion`         | `1`                        | Positive stored-envelope version.                                                     |
| `persistMigrate`         | `null`                     | Sync/async migration for older valid envelopes.                                       |
| `bindStore`              | `null`                     | Existing Alpine store name used as `$props`.                                          |
| `form`                   | `false`                    | Opt into form association and map value, restored state, and disabled props.          |

Unknown option keys have no contract. See [components](components.md), [data](data.md), [lifecycle](lifecycle.md),
[security](security.md), [observability](observability.md), and [prefetch](prefetch.md).

## Loader class reference

`version` is read-only, stamped from package.json (`development` in raw source). Inspect `globalConfig`; change it
through `config()`.

| Static member                                          | Result                                                                                                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                                              | Runtime/build version used by diagnostics and default cache namespaces.                                                                                                                |
| `globalConfig`                                         | Current normalized global settings.                                                                                                                                                    |
| `config(options)`                                      | Merge and validate global settings.                                                                                                                                                    |
| `start()`                                              | Drain queued definitions and activate configured capabilities; root entry also discovers inline definitions and built-in tags, while `/core` skips discovery. Returns `Promise<void>`. |
| `define(tagName, source, options)`                     | Register/queue a definition; returns `Promise<CustomElementConstructor>`.                                                                                                              |
| `define(tagName, definition)`                          | Register an inline `{ template, ...options }` definition; returns `Promise<CustomElementConstructor>`.                                                                                 |
| `registerComponent(name)`                              | Load and register the declarative proxy; returns `Promise<CustomElementConstructor>`.                                                                                                  |
| `registerDynamicLoader(name)`                          | Load and register the dynamic switcher; returns `Promise<CustomElementConstructor>`.                                                                                                   |
| `registerErrorBoundary(name)`                          | Load and register the nearest-descendant error boundary; returns `Promise<CustomElementConstructor>`.                                                                                  |
| `registerTemplates(root)`                              | Discover inline template definitions in a subtree; returns `Promise<CustomElementConstructor[]>`.                                                                                      |
| `observeTemplates(options)`                            | Observe inserted inline definitions and return a stop function.                                                                                                                        |
| `stopObservingTemplates()`                             | Stop the active inline-template observer.                                                                                                                                              |
| `has(tagName)`                                         | Test whether a loader definition exists.                                                                                                                                               |
| `getDefinition(tagName)`                               | Return an isolated definition snapshot or `null`.                                                                                                                                      |
| `getRegisteredTags()`                                  | Return registered tag names.                                                                                                                                                           |
| `getDependencies(tagName, options)`                    | Return direct or dependency-first transitive manifest dependencies.                                                                                                                    |
| `registerManifest(manifest, options)`                  | Normalize/register a v1 manifest and optionally prefetch selected graphs.                                                                                                              |
| `registerManifestFrom(url, options)`                   | Fetch, bound, validate, and register a v1 manifest with URL-relative sources.                                                                                                          |
| `registerRouteManifest(routeKey, indexOrUrl, options)` | Resolve one exact route key and register its independent manifest shard.                                                                                                               |
| `registerSkeletonManifest(manifest)`                   | Register generated loading HTML by tag; returns `Promise<string[]>`.                                                                                                                   |
| `loadTemplate(source, settings)`                       | Resolve a template element/selector/URL using current template-cache policy.                                                                                                           |
| `prefetch(tagName)`                                    | Warm one registered component template.                                                                                                                                                |
| `prefetchAll(tagNames, options)`                       | Settle a bounded explicit component set.                                                                                                                                               |
| `prefetchGraph(tagNames, options)`                     | Settle roots and transitive manifest dependencies.                                                                                                                                     |
| `observePrefetch(options)`                             | Start adaptive observation; returns `Promise<ACLAdaptivePrefetchController>`.                                                                                                          |
| `stopObservingPrefetch()`                              | Disconnect the active adaptive controller.                                                                                                                                             |
| `subscribe(listener)`                                  | Subscribe to redacted structured records and return an unsubscribe function.                                                                                                           |
| `getMetrics()`                                         | Return current aggregate observability metrics.                                                                                                                                        |
| `clearMetrics()`                                       | Reset retained records and aggregates.                                                                                                                                                 |
| `pruneCaches(prefix, current)`                         | Remove old versioned template buckets while retaining the current bucket.                                                                                                              |
| `clearTemplateCaches(prefix)`                          | Remove all matching persistent template buckets.                                                                                                                                       |
| `clearTemplate(source, cacheKey)`                      | Remove matching cached revisions of one source.                                                                                                                                        |
| `getTemplateCacheInfo(source, settings)`               | Inspect persistent template metadata.                                                                                                                                                  |
| `getTemplateLoadInfo(source, settings)`                | Inspect the latest in-memory load metadata.                                                                                                                                            |
| `pruneTemplateCache(options)`                          | Apply template expiry/capacity immediately and return evictions.                                                                                                                       |
| `clearDataCache(finalUrlOrKey)`                        | Invalidate all data entries or matches for one final URL/key.                                                                                                                          |
| `getDataCacheSize()`                                   | Return the number of active/retained data entries.                                                                                                                                     |
| `getDataCacheInfo(finalUrlOrKey)`                      | Return redacted data-cache summary or entry metadata.                                                                                                                                  |
| `toggleDebug()`                                        | Toggle an injected debugger or report that the debugger entry is absent.                                                                                                               |

## Definitions and inline templates

`define(tagName, source, options)` queues or immediately registers a component and resolves with its constructor:

```js
const StatusBadge = await AlpineComponentLoader.define('status-badge', '#status-template', {
    attributes: {
        label: String,
        tone: { type: String, options: ['info', 'warning'] },
    },
});
```

The two-argument definition-object form keeps a non-empty inline HTML string beside its component options:

```js
const GreetingCard = await AlpineComponentLoader.define('greeting-card', {
    template: '<h3 x-text="$props.message"></h3>',
    shadow: true,
    attributes: { message: String },
});
```

`ACLInlineComponentDefinition<TProps>` accepts no third argument. HTML becomes an inert template with Trusted Types and
render-time sanitization, bypassing source resolution, fetching, and persistent template caching.

Register authored inline templates in a DOM subtree:

```html
<template x-acl="status-badge" acl-props='{ "label": "String", "tone": "String" }' data-src="/api/status">
    <span :data-tone="$props.tone" x-text="$props.$data?.label || $props.label"></span>
</template>

<status-badge></status-badge>
```

```js
const constructors = await AlpineComponentLoader.registerTemplates(document);
```

Both declaration markers share parsing and must have matching normalized names when combined. Definition attributes
remain inert. Invalid names reject; duplicate tags keep existing definitions.

When templates can be inserted later, observe additions and retain the returned cleanup:

```js
const stop = AlpineComponentLoader.observeTemplates({
    root: document.querySelector('#plugin-area'),
    subtree: true,
});

// Later:
stop();
```

The ordinary entry scans existing declarations in `start()` and leaves later observation opt-in. The auto entry differs
only for late declarations:

| Entry/configuration                | Existing declarations         | Later declarations           |
| ---------------------------------- | ----------------------------- | ---------------------------- |
| Ordinary `start()`                 | scanned                       | require `observeTemplates()` |
| `/core.start()`                    | require `registerTemplates()` | require `observeTemplates()` |
| `/auto` default                    | scanned                       | observed automatically       |
| `/auto`, `observeTemplates: false` | scanned                       | ignored                      |
| `/auto`, `autoStart: false`        | not scanned                   | not observed                 |

`registerTemplates(root)` scans documents, elements, templates, and open Shadow Roots, including a supplied matching
template. `observeTemplates({ root, subtree })` ignores unrelated mutations and returns an ownership-safe disposer.
Replacement cleanup cannot disconnect a newer observer. `stopObservingTemplates()` stops the active observer; enabled
auto observation can be reinstalled.

Root/auto discover built-ins on appearance; core or pre-insertion setup registers them explicitly:

```js
await AlpineComponentLoader.registerComponent();
await AlpineComponentLoader.registerDynamicLoader();
await AlpineComponentLoader.registerErrorBoundary();
```

Optional `name` sets a custom tag. `customElements.whenDefined()` can await discovery registration.

## Component manifests

Generate and validate a reusable component manifest:

```bash
npx alpine-component-loader manifest components --out acl-manifest.json
npx alpine-component-loader validate acl-manifest.json
```

Register a parsed object with `registerManifest()`, or use the bounded URL loader:

```js
const response = await fetch('/acl-manifest.json');
if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);

const manifest = await response.json();
const result = await AlpineComponentLoader.registerManifest(manifest, {
    prefetch: ['critical'],
    concurrency: 2,
});

await AlpineComponentLoader.start();
console.log(result.registered, result.prefetched);
```

```js
await AlpineComponentLoader.registerManifestFrom('/acl-manifest.json', {
    integrity: 'sha256-…',
    timeout: 10_000,
    maxBytes: 1024 * 1024,
});

await AlpineComponentLoader.registerRouteManifest('account/settings', '/acl-routes.json');
```

`registerManifestFrom()` shares URL/integrity work, accepts fetch/signal/cache/integrity options, and retries after
failure. Sources resolve from the fetched manifest. `registerRouteManifest()` selects exact keys and resolves shards
from the index URL or explicit base.

URL and route-manifest request options are:

| Option        | Default                | Contract                                            |
| ------------- | ---------------------- | --------------------------------------------------- |
| `basePath`    | manifest URL directory | Explicit component-source base override.            |
| `prefetch`    | `false`                | `true` for all components or a list of tags/groups. |
| `concurrency` | loader default         | Positive prefetch worker bound.                     |
| `fetch`       | `globalThis.fetch`     | Application-owned fetch implementation.             |
| `signal`      | none                   | Caller cancellation signal.                         |
| `timeout`     | `10000`                | Positive request deadline in milliseconds.          |
| `maxBytes`    | 1 MiB                  | Positive decoded manifest response limit.           |
| `cache`       | browser default        | Fetch `RequestCache` mode.                          |
| `integrity`   | none                   | Expected Subresource Integrity metadata.            |

`registerRouteManifest()` additionally accepts `baseUrl` when an in-memory route index needs an explicit shard base.

Manifest/route failures remain typed `ACLLoadError` values:

| Code                                                    | Failure                                                 |
| ------------------------------------------------------- | ------------------------------------------------------- |
| `ACL_MANIFEST_FETCH_FAILED` / `ACL_MANIFEST_HTTP_ERROR` | Network/integrity failure or unsuccessful HTTP response |
| `ACL_MANIFEST_TIMEOUT` / `ACL_LOAD_CANCELED`            | Internal timeout or caller abort                        |
| `ACL_MANIFEST_TOO_LARGE`                                | Declared or streamed body exceeds `maxBytes`            |
| `ACL_MANIFEST_INVALID_JSON` / `ACL_MANIFEST_INVALID`    | JSON decoding or version-one manifest validation        |
| `ACL_ROUTE_INDEX_INVALID` / `ACL_ROUTE_NOT_FOUND`       | Invalid v1 route index or missing exact route key       |

Manifests also drive SSR, routes, offline assets, prefetch, types, and metadata. See
[project tooling](manifests-and-cli.md).

## Registry inspection

Use the public registry methods:

```js
AlpineComponentLoader.has('profile-card');
AlpineComponentLoader.getRegisteredTags();
AlpineComponentLoader.getDefinition('profile-card');
AlpineComponentLoader.getDependencies('profile-card');
AlpineComponentLoader.getDependencies('profile-card', { transitive: true });
```

`getDefinition()` returns a cloned snapshot or `null`. Underscored registries are internal.

## Prefetch

Warm one template, an explicit set, or a manifest dependency graph:

```js
await AlpineComponentLoader.prefetch('profile-card');

const selected = await AlpineComponentLoader.prefetchAll(['profile-card', 'avatar-image'], {
    concurrency: 2,
});

const graph = await AlpineComponentLoader.prefetchGraph(['profile-card'], {
    concurrency: 2,
    includeRoots: true,
});
```

`prefetchAll()` and `prefetchGraph()` return a settled result for every selected tag. Adaptive observation is separately
opt-in:

```js
const controller = await AlpineComponentLoader.observePrefetch();
// <a href="/profile" data-acl-prefetch="profile">Profile</a>

controller.disconnect();
```

See [Adaptive prefetch](prefetch.md) for groups, triggers, connection gates, and cleanup.

## Skeleton manifests

Register generated responsive loading fragments separately from the component manifest:

```js
import skeletons from './skeletons/acl-skeletons.generated.js';

const tags = await AlpineComponentLoader.registerSkeletonManifest(skeletons);
console.log(tags);
```

Definitions with authored `loadingTemplate` or `loadingHtml` keep their authored UI. Generate skeleton artifacts with:

```bash
npx alpine-component-loader skeleton ./index.html --mode manifest --out-dir skeletons
```

See [skeleton generation and delivery](skeletons.md).

## Cache APIs

Template cache inspection is asynchronous because it may use the browser Cache API:

```js
const allTemplates = await AlpineComponentLoader.getTemplateCacheInfo();
const oneTemplate = await AlpineComponentLoader.getTemplateCacheInfo('/components/profile-card.html');
const lastLoad = AlpineComponentLoader.getTemplateLoadInfo('/components/profile-card.html');

await AlpineComponentLoader.clearTemplate('/components/profile-card.html');
await AlpineComponentLoader.pruneTemplateCache({ max: 50 });
await AlpineComponentLoader.clearTemplateCaches();
```

Data response inspection is synchronous:

```js
AlpineComponentLoader.getDataCacheSize();
AlpineComponentLoader.getDataCacheInfo();
AlpineComponentLoader.clearDataCache();
```

Template diagnostics include `request`, `source`, `revision`, `fetchedAt`, `lastAccess`, and `ttl`; load records add
`cacheKey`, `cacheHit`, and `loadedAt`. Data summaries expose `size`/`keys`, or `key`, `finalUrl`, `target`, `strategy`,
`expiresAt`, `lastAccess`, `pending`, and `subscribers`. Contents, headers, props, and stored values are excluded.

`pruneCaches()` removes older version buckets. Use targeted clears or `$props.$cache` during recovery. See
[caches](data.md).

## Observability

Configure retention, subscribe to redacted records, and read local metrics:

```js
AlpineComponentLoader.config({
    observability: { bufferSize: 200, performanceMarks: false, logger: false },
});

const unsubscribe = AlpineComponentLoader.subscribe((record) => console.debug(record));
const snapshot = AlpineComponentLoader.getMetrics();

AlpineComponentLoader.clearMetrics();
unsubscribe();
```

No transport is included. See [Observability](observability.md) for record shapes, logging, performance measures, and
redaction.

## Component host API

Every registered component host exposes:

- Declared typed element properties.
- `$props`, including `$data`, `$loading`, `$error`, `$lastUpdated`, and helper methods.
- `reload(options)`, `retry()`, and `cancel(reason)`.

```js
const card = document.querySelector('profile-card');

card.name = 'Ada';
card.$props.$emit('profile-select', { id: 'user-1' });
await card.$props.$reload({ preserveState: true });
await card.$props.$cache.clearData();
```

| Built-in member                           | Contract                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `$data`                                   | Default parsed response target.                                                    |
| `$loading`                                | Active data-request state.                                                         |
| `$error`                                  | Current data error message or `null`.                                              |
| `$lastUpdated`                            | Reactive-update timestamp.                                                         |
| `$emit(name, detail)`                     | Dispatch a bubbling, composed host event.                                          |
| `$reload(options)`                        | Delegate to `reload(options)`.                                                     |
| `$retry()`                                | Retry the configured data endpoint.                                                |
| `$cancel(reason)`                         | Cancel current component/data work.                                                |
| `$cache`                                  | Scoped cache helper object.                                                        |
| `clearTemplate()` on `$cache`             | Clear this definition's template revisions.                                        |
| `clearData()` on `$cache`                 | Clear this host's exact data entry.                                                |
| `clear()` on `$cache`                     | Clear both scoped layers and report joint success.                                 |
| `$persistence`                            | Persistence helper object available after enabled initialization.                  |
| `$form`                                   | Form value, validity, associated form, and labels helper for opted-in definitions. |
| `$key` on `$persistence`                  | Resolved storage key.                                                              |
| `$save(value)` on `$persistence`          | Queue a current snapshot or explicit value.                                        |
| `$get(field, fallback)` on `$persistence` | Read the full stored value or one field.                                           |
| `$clear()` on `$persistence`              | Remove this storage key.                                                           |
| `$flush()` on `$persistence`              | Commit/await queued writes.                                                        |

Wait for `loaded` or `acl:loadend` before assuming initialization-dependent helpers such as `$persistence` are
available.

Inspect `ACLLoadError` fields `code` and `phase`, not message text. Optional fields include `status`, `retryable`, and
`cause`.

## Element attribute reference

The declarative proxy consumes definition settings and forwards runtime/public controls to the real component:

| `<acl-component>` attribute         | Contract                                                     |
| ----------------------------------- | ------------------------------------------------------------ |
| `src`                               | Required source.                                             |
| `tag`                               | Target component tag; otherwise derive it from the filename. |
| `shadow`                            | Shadow toggle.                                               |
| `loading`                           | `eager`, `lazy`, or `idle`.                                  |
| `acl-props`                         | Strict-JSON prop descriptors.                                |
| `data-fetch-options`                | Strict-JSON base `RequestInit`.                              |
| `external-css` / `external-scripts` | Strict-JSON asset arrays.                                    |
| `forward-events`                    | Strict-JSON forwarding rules.                                |
| `hooks`                             | Safe dotted path to a hook object on `window`.               |
| `template-cache-strategy`           | Per-definition template strategy.                            |
| `loading-template` / `loading-html` | Loading source/markup.                                       |
| `sanitize`                          | Sanitization toggle.                                         |
| `bind-store`                        | Alpine store name.                                           |
| `fallback`                          | Initial-error template source.                               |

Registered component hosts accept declared prop attributes plus these runtime controls:

| Registered-host attribute      | Contract                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `data-src`                     | Request URL.                                                                        |
| `data-fetch-keys`              | Strict-JSON URL-key substitutions.                                                  |
| `data-fetch-params`            | Strict-JSON query parameters.                                                       |
| `data-method`                  | HTTP method override.                                                               |
| `data-body`                    | Raw or strict-JSON request body.                                                    |
| `data-target`                  | Response destination in `$props`.                                                   |
| `data-fetch-poll`              | Polling interval in milliseconds.                                                   |
| `data-fetch-timeout`           | Per-attempt timeout in milliseconds.                                                |
| `data-retries`                 | Retry count after the initial attempt.                                              |
| `data-retry-delay`             | Initial retry delay.                                                                |
| `data-retry-max-delay`         | Maximum retry delay.                                                                |
| `data-retry-jitter`            | Retry jitter from 0 through 1.                                                      |
| `data-retry-unsafe-methods`    | Boolean opt-in for retrying unsafe methods.                                         |
| `data-response-type`           | `json`, `text`, `blob`, `arrayBuffer`, `stream`, or `auto`.                         |
| `data-cache-strategy`          | Data-cache strategy.                                                                |
| `data-fetch-cache-ttl`         | Settled-entry lifetime in milliseconds.                                             |
| `data-fetch-cache-max`         | Settled shared-entry bound.                                                         |
| `data-cache-key`               | Explicit request/cache identity.                                                    |
| `pause-polling-when-hidden`    | Boolean document-visibility polling gate.                                           |
| `pause-polling-when-offline`   | Boolean network-status polling gate.                                                |
| `pause-polling-when-offscreen` | Boolean viewport polling gate.                                                      |
| `persist`                      | `local`, `session`, `indexeddb`, or a configured custom mode.                       |
| `persist-key`                  | Explicit storage key.                                                               |
| `persist-debounce`             | Automatic snapshot delay in milliseconds.                                           |
| `persist-version`              | Positive stored-envelope version.                                                   |
| `keep-alive`                   | Preserve an ordinary component across temporary removal, subject to `keepAliveMax`. |

The complete parsing, defaults, and validation rules are in [Data](data.md).

| `<acl-dynamic>` attribute | Contract                  |
| ------------------------- | ------------------------- |
| `is`                      | Registered target tag.    |
| `keep-alive`              | Cache inactive children.  |
| `keep-alive-max`          | Inactive-child capacity.  |
| `transition`              | Transition preset.        |
| `transition-duration`     | Duration in milliseconds. |

Other dynamic-host attributes are copied to active and cached children.

## Public entry points

| Entry                                             | Default export                  | Named runtime exports                                                                                                                      | Environment note                                                          |
| ------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `alpine-component-loader`                         | `AlpineComponentLoader`         | `ACLLoadError`, `createLoader()`, `createIndexedDBPersistenceAdapter()`                                                                    | SSR-safe import; operations may require DOM                               |
| `alpine-component-loader/auto`                    | `AlpineComponentLoader`         | `startAutoLoader()` plus root named exports                                                                                                | Browser startup side effect                                               |
| `alpine-component-loader/core`                    | Explicit-startup default loader | `ACLLoadError`                                                                                                                             | Registers queued definitions without document discovery                   |
| `alpine-component-loader/polyfills`               | `loadPolyfills()`               | `loadPolyfills()`, `waitForWebComponents()`                                                                                                | Optional Web Components bootstrap and asynchronous registration readiness |
| `alpine-component-loader/dev`                     | `connectACLDevServer()`         | `connectACLDevServer()`, `reloadChangedTemplates()`                                                                                        | Browser/EventSource operations                                            |
| `alpine-component-loader/debugger`                | `ACLDebugger`                   | `redactDiagnostics()`, `createDiagnosticSnapshot()`, `createComponentSnapshot()`, `diffDiagnosticSnapshots()`                              | Overlay operations require DOM                                            |
| `alpine-component-loader/a11y`                    | `ACLA11y`                       | `runBasicAccessibilityAudit()`, `auditAccessibility()`, `observeAccessibility()`                                                           | Audits require DOM                                                        |
| `alpine-component-loader/a11y-scanner`            | `ACLA11yScanner`                | `mountAccessibilityScanner()`                                                                                                              | Requires DOM                                                              |
| `alpine-component-loader/offline`                 | `ACLOffline`                    | `registerOfflineWorker()`, `activateOfflineWorker()`, `getOfflineStatus()`                                                                 | SSR-safe import; registration requires browser support                    |
| `alpine-component-loader/testing`                 | `ACLTesting`                    | `waitForComponent()`, `mountComponent()`, `recordACLEvents()`, `installFetchMock()`, `createACLTestHarness()`, `assertLifecycleSequence()` | SSR-safe import; mounting requires DOM                                    |
| `alpine-component-loader/testing/playwright`      | `ACLPlaywright`                 | `createACLPlaywrightTest()`, `expect`                                                                                                      | Playwright test-runner process                                            |
| `alpine-component-loader/testing/vitest`          | `ACLVitest`                     | `createACLVitestFixture()`                                                                                                                 | Vitest Browser Mode                                                       |
| `alpine-component-loader/testing/server`          | `ACLTestingServer`              | `startACLTestServer()`                                                                                                                     | Node-only optional local server                                           |
| `alpine-component-loader/ssr`                     | `ACLSSR`                        | `createSSRRenderer()`                                                                                                                      | Node-only; optional bounded data resolution and Light DOM rendering       |
| `alpine-component-loader/project`                 | `defineConfig()`                | `defineConfig()`, `loadProjectConfig()`                                                                                                    | Node-only shared project configuration                                    |
| `alpine-component-loader/vite`                    | `alpineComponentLoader()`       | `alpineComponentLoader()`                                                                                                                  | Node/Vite plugin; Vite remains an optional peer                           |
| `alpine-component-loader/observability-exporters` | exporter collection             | `createBatchExporter()`, `createBeaconExporter()`, `createOpenTelemetryExporter()`, `createSentryExporter()`, `connectExporter()`          | Dependency-free optional browser transport/adapters                       |

`parse5`/`@swc/core` install by default; `--omit=optional` keeps runtime/basic CLI use. Affected features report
`ACL_OPTIONAL_DEPENDENCY_MISSING` with `dependency`, `feature`, `install`, and `cause`. Server `watchPollInterval`
defaults to 5000 ms; `0` disables scans.

The observability entry's default `exporters` object maps directly to its named functions.

Defaults alias named helpers: `ACLA11y.audit()`/`observe()`/`runBasicAudit()`, `ACLA11yScanner.mount()`, offline/testing
helpers, and `ACLSSR.createSSRRenderer()`. The debugger default is a class; see
[debugging](accessibility-and-debugging.md).

Internal `dist/runtime/*` modules are intentionally absent from the package export map.

Native ES2022 entries retain their `.js`/`.min.js` family through dynamic imports. Missing minified dependencies reject
without readable fallback.

Builds emit both families; publish all of `dist/`, including nested modules.

`createIndexedDBPersistenceAdapter()` is synchronous; storage methods load its implementation asynchronously.

## TypeScript

Core declarations support typed props, options, hook contexts, errors, cache diagnostics, manifests, and every optional
entry:

```ts
import AlpineComponentLoader, { type ACLComponentOptions, type ACLProps } from 'alpine-component-loader';

interface ProfileProps extends ACLProps {
    userId: string;
    name: string;
}

const options: ACLComponentOptions<ProfileProps> = {
    attributes: {
        userId: { type: String, required: true },
        name: { type: String, default: '' },
    },
    hooks: {
        mounted({ props }) {
            props.name = props.name.trim();
        },
    },
};

await AlpineComponentLoader.define<ProfileProps>('profile-card', '/components/profile-card.html', options);
```

Package types cover generic APIs. Generated `acl-components.d.ts` adds manifest-specific tag, prop, and event types. See
[contract generation](manifests-and-cli.md).

## CLI discovery

Use the installed binary for current syntax:

```bash
npx alpine-component-loader --help
npx alpine-component-loader validate .
```

Commands include `create`, `serve`, `skeleton`, `audit`, `init`, `validate`, `manifest`, `routes`, `watch`, `preload`,
`offline`, `types`, and `schema`. Project config defaults to `acl.config.mjs`; offline uses `--project-config` because
`--config` selects worker policy. Existing files are protected unless documented `--force` is supplied.

See the [CLI option reference](manifests-and-cli.md#cli-option-reference).

## Additional entry points and exports

Testing entries are `/testing`, `/testing/playwright`, `/testing/vitest`, and `/testing/server`.

Exports include `createACLPlaywrightTest()`/`expect` (`ACLPlaywright`), `createACLVitestFixture()` (`ACLVitest`),
`startACLTestServer()` (`ACLTestingServer`), `createACLTestHarness()`, and `assertLifecycleSequence()`. Offline prompt
activation uses `activateOfflineWorker()`.

## Troubleshooting

### Nothing registers

The root import does not auto-start. Confirm the tag contains a hyphen, register it before use, and call `start()`:

```js
console.log(AlpineComponentLoader.has('profile-card'));
console.log(AlpineComponentLoader.getRegisteredTags());
await AlpineComponentLoader.start();
```

Expose/start module-based Alpine once. `/auto` starts ACL on import.

Await built-in registration before insertion when needed. Root/auto discover tags; core needs explicit calls.

### Manifest registration throws

Pass a parsed object rather than the manifest URL, check `version: 1`, and validate it:

```bash
npx alpine-component-loader validate acl-manifest.json
```

Missing dependencies, duplicate normalized names, cycles, invalid custom-element names, and missing local sources are
reported explicitly.

### Props are empty or invalid

Declare each prop in `options.attributes`. Arrays and objects in HTML must be strict JSON:

```html
<profile-card roles='["maintainer"]' account='{"id":"user-1"}'></profile-card>
```

Listen for `acl:error`, enable `strictProps` while testing, and confirm the serialized manifest uses supported type
names.

### A script does not run

Sanitization removes scripts and `executeScripts` defaults off. Prefer application modules; trusted template scripts
require reviewing both settings and CSP. See [security](security.md).

### Requests repeat or remain stale

Inspect request identity, strategy, TTL, revision, and namespace:

```js
console.log(AlpineComponentLoader.getDataCacheInfo());
console.log(await AlpineComponentLoader.getTemplateCacheInfo());
```

Identity includes method, headers, body, parser, and explicit key. Clear the affected cache; reload to replace in-flight
work.

### Hydration fetches the template

Shadow and opt-in Light DOM SSR hydrate with matching revisions; mismatches use client rendering. See [SSR](ssr.md).

### Persistence does not restore

Use positive `persistVersion`, stable keys, and migrations for older envelopes. Await storage helpers and inspect
persistence errors without logging stored data.

### Forwarded events are missing or duplicated

Check `events.forward` names and bubbling. Composed events need no forwarding. Duplicate application listeners can cause
repeated delivery.

### Offline assets are missing

Check `acl-precache-manifest.json`, shell/application `--asset` inputs, runtime graph expansion, and deployed base
URLs/scope. See [offline support](offline.md).

### A dynamic component does not appear

The `is` target must be a valid, already registered tag. Listen for `acl:error` on `<acl-dynamic>` and inspect
`detail.targetTag` and `detail.error`.

For upgrade-specific behavior see [MIGRATION.md](../MIGRATION.md).

### Bounded templates and initialization

`templateTimeout` defaults to `10000` ms and covers fetch/body consumption (`0` disables). `templateMaxBytes` defaults
to `1048576` and checks declared, streamed, and cached bytes (`Infinity` disables). Errors are `ACL_TEMPLATE_TIMEOUT`,
`ACL_TEMPLATE_TOO_LARGE`, `ACL_TEMPLATE_HTTP_ERROR`, `ACL_TEMPLATE_FETCH_FAILED`, or cancellation `ACL_LOAD_CANCELED`.

`loadTemplate(source, settings, { signal })`, prefetch APIs, and adaptive `prefetch` accept signals. Cancellation
releases one subscriber; final-owner release aborts shared work. Disposal releases revalidation. `prefetchConcurrency`
defaults to four speculative downloads; calls can lower it, and foreground work promotes queued requests.

`hydrationScheduler` defaults off, using direct rendering/Alpine paths. Enable `{ budgetMs: 8, maxTasksPerTurn: 4 }` for
cooperative turns. Priority is eager/interaction/reload, then visible/media, then idle. Individual operations/hooks can
exceed the budget; readiness follows completion.

[Generated defaults](generated-option-defaults.md), validation, and declarations share descriptors. Builds embed
defaults/checks in existing modules with no extra option request.

`generateModulePreloads()` from `/project` resolves `{ urls, html }` from a manifest, `entryUrl`, explicit
`tags`/`groups`, and optional `ACLRuntimeCapability` features. Graph expansion preserves version/base and
readable/minified family for index/core entries. Legacy `acl-instance` stays on public entries only. Manifest lazy
loading, visible hydration, and polling pauses infer `environment`; select it explicitly for imperative use.
Environmental activation retries failed imports and invalidates late setup on teardown.

Selectors include `hydration`, `triggers`, `styles`, `slots`, and `scripts`. Manifests infer triggers from
loading/hydration, styles from shadow/shared sheets, and scripts from `executeScripts`. Select content-dependent
transformations and imperative/SSR behavior explicitly.

Core shares root's default context and synchronous validation. Its asynchronous startup skips discovery; explicit
registration/observation loads on demand. Later root startup enables discovery. Core exports the default loader and
`ACLLoadError`; root retains factory exports.
