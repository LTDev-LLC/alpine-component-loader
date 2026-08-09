# API reference and troubleshooting

This page maps the public runtime surface and provides common remedies. Feature guides contain the full workflows and security details.

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

Load and expose a compatible Alpine 3.14-3.x build before components initialize. When Alpine is imported as a module, assign it to `window.Alpine` and start it once according to the application's bootstrap order.

`config(options)` merges nested data, hook, event, security, observability, and adaptive-prefetch settings with current global configuration. Invalid cache strategies, loading modes, bounds, and persistence versions fail early.

Use `alpine-component-loader/auto` only when browser import-time startup is deliberate:

```js
import AlpineComponentLoader from 'alpine-component-loader/auto';
```

The auto entry waits for DOM parsing, applies `window.AlpineComponentLoaderConfig` when present, and starts unless `autoStart` is false:

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

Use `createLoader()` when tests, micro-frontends, or multiple applications must not share configuration, registries, observers, metrics, or runtime caches:

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

The static `root` limits declarative discovery to the supplied document,
element, or open shadow root. The factory exposes a `ready` promise for
integrations that need to observe completion of the isolated module graph.
`dispose()` disconnects observers, destroys owned component instances, clears
registries and in-memory caches, and rejects later mutating calls with
`ACL_LOADER_DISPOSED`. Its `clearPersistentCaches` option defaults to `true`;
pass `{ clearPersistentCaches: false }` when another loader or application must
retain the same Cache API namespace. Browser custom-element names remain
global; another isolated loader attempting to own the same tag receives
`ACL_TAG_OWNERSHIP_CONFLICT`.

Before starting, the auto entry installs inline-template observation unless
`observeTemplates` is `false`. This closes the gap between its startup scan and
templates inserted while startup is pending. `autoStart: false` disables both
startup and automatic observation. Its named `startAutoLoader()` export repeats
the same guarded transaction without creating duplicate observers.

All other public entries are safe to import without browser globals, although their browser-only operations still require DOM or Service Worker APIs.

The root entry is a demand-loaded facade. Importing it does not request every runtime module. APIs, component configuration, and encountered markup activate only the component, rendering, remote-template, cache, data, persistence, asset, manifest, prefetch, observability, or built-in-element capabilities they need. Successful capability imports are shared for the page lifetime; concurrent callers await the same promise.

`define()` and the registration methods are asynchronous. A `define()` call made before `start()` can remain unawaited because `start()` drains all queued definitions before resolving. Await the individual call when its constructor or readiness is needed immediately.

If a capability import fails, the activating operation rejects with an `ACLLoadError` whose code is `ACL_RUNTIME_MODULE_LOAD_FAILED`. The failed promise is discarded so a later explicit action can retry.

## Configuration reference

`config()` supplies global defaults; `define()` supplies one definition. Successive `config()` calls merge nested `attributes`, `data`, `hooks`, `events`, `errorCss`, `security`, `observability`, and `adaptivePrefetch` records; supplied arrays and scalar values replace their previous global values. While normalizing a definition, `attributes`, `data`, `hooks`, `events`, and `errorCss` merge with the global records, asset and shared-sheet arrays are concatenated, and the remaining explicit definition values override their global defaults.

| Option | Default | Contract |
| --- | --- | --- |
| `attributes` | `{}` | Typed prop constructor/descriptor map. |
| `debug` | `false` | Loader debugger state after debugger injection. |
| `autoStart` | `true` | Global-only gate used by the `/auto` entry. |
| `observeTemplates` | `true` | Global-only `/auto` control for observing inline declarations inserted after startup. |
| `basePath` | empty | Prefix for relative component sources. |
| `sourceResolver` | `null` | Synchronously rewrite a source before `basePath`. |
| `errorCss` | accessible built-in styles | Style record merged into the no-fallback error block. |
| `loading` | `eager` | `eager`, `lazy`, or `idle`. |
| `hydrate` | `eager` | SSR-only hydration trigger: `eager`, `visible`, `idle`, `interaction`, or `media`. |
| `hydrateMedia` | `null` | Required media query for `hydrate: "media"`. |
| `shadow` | `false` | Render into an open Shadow Root. |
| `useConstructibleStyles` | `true` | Adopt cached constructible sheets when supported. |
| `sharedStyleSheets` | `[]` | Application `CSSStyleSheet` objects adopted in Shadow DOM. |
| `executeScripts` | `false` | Execute template scripts that survive the selected sanitizer. |
| `stripStyles` | `false` | Remove template `<style>` elements. |
| `sanitize` | `true` | Built-in sanitizer, `false`, or a custom sanitizer function. |
| `security` | `{}` | Trusted Types policy and URL-policy settings. |
| `observability` | `false` | Global structured-record retention/logger settings. |
| `adaptivePrefetch` | `false` | Global adaptive-prefetch startup settings or `true` for defaults. |
| `strictProps` | `false` | Throw instead of reporting and defaulting invalid props. |
| `runtimeCacheMax` | `200` | Bound in-memory style, asset, and diagnostic maps. |
| `cacheNamespace` | `default` | Global Cache API namespace segment. |
| `keepAliveMax` | `Infinity` | Default dynamic inactive-child capacity. |
| `dynamicTransition` | `auto` | Default dynamic transition preset. |
| `transitionDuration` | `100` | Default dynamic transition duration in milliseconds. |
| `events` | `{ forward: [] }` | Event-forwarding configuration. |
| `externalCss` | `[]` | External stylesheet strings/descriptors. |
| `externalScripts` | `[]` | External script strings/descriptors. |
| `loadingTemplate` | `null` | Loading template URL, selector, or template element. |
| `loadingHtml` | `null` | Loading markup string. |
| `defaultComponentName` | `acl-component` | Default declarative-proxy tag used by on-demand discovery and explicit registration. |
| `defaultDynamicName` | `acl-dynamic` | Default dynamic-loader tag used by on-demand discovery and explicit registration. |
| `defaultBoundaryName` | `acl-boundary` | Default nearest-error-boundary tag used by discovery and explicit registration. |
| `data` | grouped defaults | Request, retry, polling, response, and data-cache settings. |
| `cacheTemplates` | `true` | Enable Cache API storage for external templates. |
| `templateCacheStrategy` | `cache-first` | Template cache strategy. |
| `templateCacheTtl` | `900000` | Template freshness in milliseconds. |
| `templateCacheMax` | `100` | Active template namespace capacity. |
| `templateRevision` | `null` | Explicit source content revision. |
| `fallback` | `null` | Initial-failure template source. |
| `hooks` | identity fetch hooks | Lifecycle, fetch, and preservation hooks. |
| `persist` | `false` | `local`, `session`, `indexeddb`, or custom adapter mode. |
| `persistKey` | `null` | Explicit storage key. |
| `persistDebounce` | `250` | Automatic snapshot debounce in milliseconds. |
| `persistAdapter` | `null` | Sync/async storage adapter. |
| `persistVersion` | `1` | Positive stored-envelope version. |
| `persistMigrate` | `null` | Sync/async migration for older valid envelopes. |
| `bindStore` | `null` | Existing Alpine store name used as `$props`. |
| `form` | `false` | Opt into form association and map value, restored state, and disabled props. |

Unknown option keys have no defined behavior. See [Components](components.md) for rendering/props, [Data](data.md) for the complete `data.*` table, [Lifecycle](lifecycle.md) for hooks/events, [Security](security.md), [Observability](observability.md), and [Adaptive prefetch](prefetch.md).

## Loader class reference

`AlpineComponentLoader.version` is read-only and is injected from `package.json` in built artifacts; raw source modules use `development`. `AlpineComponentLoader.globalConfig` exposes normalized current defaults for inspection. Call `config(options)` instead of mutating the object directly.

| Static member | Result |
| --- | --- |
| `version` | Runtime/build version used by diagnostics and default cache namespaces. |
| `globalConfig` | Current normalized global settings. |
| `config(options)` | Merge and validate global settings. |
| `start()` | Drain queued definitions, discover inline definitions and built-in tags, and activate configured capabilities; returns `Promise<void>`. |
| `define(tagName, source, options)` | Register/queue a definition; returns `Promise<CustomElementConstructor>`. |
| `define(tagName, definition)` | Register an inline `{ template, ...options }` definition; returns `Promise<CustomElementConstructor>`. |
| `registerComponent(name)` | Load and register the declarative proxy; returns `Promise<CustomElementConstructor>`. |
| `registerDynamicLoader(name)` | Load and register the dynamic switcher; returns `Promise<CustomElementConstructor>`. |
| `registerErrorBoundary(name)` | Load and register the nearest-descendant error boundary; returns `Promise<CustomElementConstructor>`. |
| `registerTemplates(root)` | Discover inline template definitions in a subtree; returns `Promise<CustomElementConstructor[]>`. |
| `observeTemplates(options)` | Observe inserted inline definitions and return a stop function. |
| `stopObservingTemplates()` | Stop the active inline-template observer. |
| `has(tagName)` | Test whether a loader definition exists. |
| `getDefinition(tagName)` | Return an isolated definition snapshot or `null`. |
| `getRegisteredTags()` | Return registered tag names. |
| `getDependencies(tagName, options)` | Return direct or dependency-first transitive manifest dependencies. |
| `registerManifest(manifest, options)` | Normalize/register a v1 manifest and optionally prefetch selected graphs. |
| `registerManifestFrom(url, options)` | Fetch, bound, validate, and register a v1 manifest with URL-relative sources. |
| `registerRouteManifest(routeKey, indexOrUrl, options)` | Resolve one exact route key and register its independent manifest shard. |
| `registerSkeletonManifest(manifest)` | Register generated loading HTML by tag; returns `Promise<string[]>`. |
| `loadTemplate(source, settings)` | Resolve a template element/selector/URL using current template-cache policy. |
| `prefetch(tagName)` | Warm one registered component template. |
| `prefetchAll(tagNames, options)` | Settle a bounded explicit component set. |
| `prefetchGraph(tagNames, options)` | Settle roots and transitive manifest dependencies. |
| `observePrefetch(options)` | Start adaptive observation; returns `Promise<ACLAdaptivePrefetchController>`. |
| `stopObservingPrefetch()` | Disconnect the active adaptive controller. |
| `subscribe(listener)` | Subscribe to redacted structured records and return an unsubscribe function. |
| `getMetrics()` | Return current aggregate observability metrics. |
| `clearMetrics()` | Reset retained records and aggregates. |
| `pruneCaches(prefix, current)` | Remove old versioned template buckets while retaining the current bucket. |
| `clearTemplateCaches(prefix)` | Remove all matching persistent template buckets. |
| `clearTemplate(source, cacheKey)` | Remove matching cached revisions of one source. |
| `getTemplateCacheInfo(source, settings)` | Inspect persistent template metadata. |
| `getTemplateLoadInfo(source, settings)` | Inspect the latest in-memory load metadata. |
| `pruneTemplateCache(options)` | Apply template expiry/capacity immediately and return evictions. |
| `clearDataCache(finalUrlOrKey)` | Invalidate all data entries or matches for one final URL/key. |
| `getDataCacheSize()` | Return the number of active/retained data entries. |
| `getDataCacheInfo(finalUrlOrKey)` | Return redacted data-cache summary or entry metadata. |
| `toggleDebug()` | Toggle an injected debugger or report that the debugger entry is absent. |

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

The two-argument definition-object form keeps a non-empty inline HTML string
beside its component options:

```js
const GreetingCard = await AlpineComponentLoader.define('greeting-card', {
    template: '<h3 x-text="$props.message"></h3>',
    shadow: true,
    attributes: { message: String },
});
```

This form is typed as `ACLInlineComponentDefinition<TProps>`. It accepts no
separate third options argument. The string becomes an inert detached template,
uses the effective Trusted Types policy, and is sanitized during rendering. It
does not run the URL source resolver, issue a template request, or create a
persistent template-cache entry. Existing URL, selector, and
`HTMLTemplateElement` definitions retain their current behavior.

Register authored inline templates in a DOM subtree:

```html
<template
    x-acl="status-badge"
    acl-props='{ "label": "String", "tone": "String" }'
    data-src="/api/status"
>
    <span :data-tone="$props.tone" x-text="$props.$data?.label || $props.label"></span>
</template>

<status-badge></status-badge>
```

```js
const constructors = await AlpineComponentLoader.registerTemplates(document);
```

`template[x-acl]` and the established `template[acl-component]` spelling are
aliases and use the same prop/data parser. If both attributes occur on one
template, their case-normalized names must match. Configuration attributes stay
on the inert definition template and are not copied into rendered component
markup. Invalid names reject through ordinary custom-element validation; a
duplicate tag retains the loader's already registered definition.

When templates can be inserted later, observe additions and retain the returned cleanup:

```js
const stop = AlpineComponentLoader.observeTemplates({
    root: document.querySelector('#plugin-area'),
    subtree: true,
});

// Later:
stop();
```

The ordinary entry scans existing declarations in `start()` and leaves later
observation opt-in. The auto entry differs only for late declarations:

| Entry/configuration | Existing declarations | Later declarations |
| --- | --- | --- |
| Ordinary `start()` | scanned | require `observeTemplates()` |
| `/auto` default | scanned | observed automatically |
| `/auto`, `observeTemplates: false` | scanned | ignored |
| `/auto`, `autoStart: false` | not scanned | not observed |

`registerTemplates(root)` accepts a document, element, template, or open Shadow
Root and includes a directly supplied matching template. `observeTemplates()`
accepts `root` and `subtree`, ignores unrelated mutations without loading the
component runtime, and returns an ownership-safe disposer. A later observer
replaces the prior loader-owned observer; an older disposer cannot disconnect
its replacement. `stopObservingTemplates()` stops the active manual or
auto-installed observer. Calling `startAutoLoader()` again reinstalls automatic
observation when it remains enabled.

`start()` discovers existing and newly inserted `<acl-component>`, `<acl-dynamic>`, and `<acl-boundary>` tags. It loads and registers only the implementation whose tag appears. Because discovery upgrades inserted tags asynchronously, explicitly register a built-in when it must be defined before insertion:

```js
await AlpineComponentLoader.registerComponent();
await AlpineComponentLoader.registerDynamicLoader();
await AlpineComponentLoader.registerErrorBoundary();
```

The optional `name` argument registers the corresponding built-in under a custom tag. `customElements.whenDefined(tagName)` remains available when code needs to coordinate with discovery-driven registration.

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

`registerManifestFrom()` deduplicates concurrent URL/integrity requests per loader, supports caller `fetch`, `AbortSignal`, `RequestCache`, and integrity options, and evicts failed operations so they can be retried. Relative component paths resolve against the fetched manifest. `registerRouteManifest()` uses exact route-key lookup and resolves a shard relative to its route-index URL or an explicit base URL.

URL and route-manifest request options are:

| Option | Default | Contract |
| --- | --- | --- |
| `basePath` | manifest URL directory | Explicit component-source base override. |
| `prefetch` | `false` | `true` for all components or a list of tags/groups. |
| `concurrency` | loader default | Positive prefetch worker bound. |
| `fetch` | `globalThis.fetch` | Application-owned fetch implementation. |
| `signal` | none | Caller cancellation signal. |
| `timeout` | `10000` | Positive request deadline in milliseconds. |
| `maxBytes` | 1 MiB | Positive decoded manifest response limit. |
| `cache` | browser default | Fetch `RequestCache` mode. |
| `integrity` | none | Expected Subresource Integrity metadata. |

`registerRouteManifest()` additionally accepts `baseUrl` when an in-memory route
index needs an explicit shard base.

Manifest/route failures remain typed `ACLLoadError` values:

| Code | Failure |
| --- | --- |
| `ACL_MANIFEST_FETCH_FAILED` / `ACL_MANIFEST_HTTP_ERROR` | Network/integrity failure or unsuccessful HTTP response |
| `ACL_MANIFEST_TIMEOUT` / `ACL_LOAD_CANCELED` | Internal timeout or caller abort |
| `ACL_MANIFEST_TOO_LARGE` | Declared or streamed body exceeds `maxBytes` |
| `ACL_MANIFEST_INVALID_JSON` / `ACL_MANIFEST_INVALID` | JSON decoding or version-one manifest validation |
| `ACL_ROUTE_INDEX_INVALID` / `ACL_ROUTE_NOT_FOUND` | Invalid v1 route index or missing exact route key |

The same manifest can drive SSR, route shards, offline generation, dependency prefetch, TypeScript declarations, and Custom Elements metadata. See [Manifests, generated contracts, and CLI tooling](manifests-and-cli.md).

## Registry inspection

Use the public registry methods:

```js
AlpineComponentLoader.has('profile-card');
AlpineComponentLoader.getRegisteredTags();
AlpineComponentLoader.getDefinition('profile-card');
AlpineComponentLoader.getDependencies('profile-card');
AlpineComponentLoader.getDependencies('profile-card', { transitive: true });
```

`getDefinition()` returns a safe definition snapshot with tag, source, cloned settings, and dependencies, or `null`. Do not modify underscored loader fields; they are internal implementation details.

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

`prefetchAll()` and `prefetchGraph()` return a settled result for every selected tag. Adaptive observation is separately opt-in:

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

See [Skeleton loading UI](skeletons.md) for generation, the CSS and manifest delivery choices, import order, and troubleshooting.

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

Template cache entries expose `request`, `source`, `revision`, `fetchedAt`, `lastAccess`, and `ttl`. The latest load record adds `cacheKey`, `cacheHit`, and `loadedAt`. Data diagnostics expose a summary `size`/`keys` pair or entry fields including `key`, `finalUrl`, `target`, `strategy`, `expiresAt`, `lastAccess`, `pending`, and `subscribers`. None of these APIs returns template, response, header, body, prop, or persistence contents.

`pruneCaches()` removes older versioned template namespaces. Prefer targeted clear methods during normal development. Component hosts also expose `$props.$cache` helpers. See [Data, caching, polling, and persistence](data.md).

## Observability

Configure retention, subscribe to redacted records, and read local metrics:

```js
AlpineComponentLoader.config({
    observability: { bufferSize: 200, performanceMarks: false, logger: false },
});

const unsubscribe = AlpineComponentLoader.subscribe(record => console.debug(record));
const snapshot = AlpineComponentLoader.getMetrics();

AlpineComponentLoader.clearMetrics();
unsubscribe();
```

No transport is included. See [Observability](observability.md) for record shapes, logging, performance measures, and redaction.

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

| Built-in member | Contract |
| --- | --- |
| `$data` | Default parsed response target. |
| `$loading` | Active data-request state. |
| `$error` | Current data error message or `null`. |
| `$lastUpdated` | Reactive-update timestamp. |
| `$emit(name, detail)` | Dispatch a bubbling, composed host event. |
| `$reload(options)` | Delegate to `reload(options)`. |
| `$retry()` | Retry the configured data endpoint. |
| `$cancel(reason)` | Cancel current component/data work. |
| `$cache` | Scoped cache helper object. |
| `clearTemplate()` on `$cache` | Clear this definition's template revisions. |
| `clearData()` on `$cache` | Clear this host's exact data entry. |
| `clear()` on `$cache` | Clear both scoped layers and report joint success. |
| `$persistence` | Persistence helper object available after enabled initialization. |
| `$form` | Form value, validity, associated form, and labels helper for opted-in definitions. |
| `$key` on `$persistence` | Resolved storage key. |
| `$save(value)` on `$persistence` | Queue a current snapshot or explicit value. |
| `$get(field, fallback)` on `$persistence` | Read the full stored value or one field. |
| `$clear()` on `$persistence` | Remove this storage key. |
| `$flush()` on `$persistence` | Commit/await queued writes. |

Wait for `loaded` or `acl:loadend` before assuming initialization-dependent helpers such as `$persistence` are available.

`ACLLoadError` instances may include `code`, `phase`, HTTP `status`, `retryable`, and `cause`. Treat `code` and `phase` as stable diagnostic categories instead of parsing message text.

## Element attribute reference

The declarative proxy consumes definition settings and forwards runtime/public controls to the real component:

| `<acl-component>` attribute | Contract |
| --- | --- |
| `src` | Required source. |
| `tag` | Target component tag; otherwise derive it from the filename. |
| `shadow` | Shadow toggle. |
| `loading` | `eager`, `lazy`, or `idle`. |
| `acl-props` | Strict-JSON prop descriptors. |
| `data-fetch-options` | Strict-JSON base `RequestInit`. |
| `external-css` / `external-scripts` | Strict-JSON asset arrays. |
| `forward-events` | Strict-JSON forwarding rules. |
| `hooks` | Safe dotted path to a hook object on `window`. |
| `template-cache-strategy` | Per-definition template strategy. |
| `loading-template` / `loading-html` | Loading source/markup. |
| `sanitize` | Sanitization toggle. |
| `bind-store` | Alpine store name. |
| `fallback` | Initial-error template source. |

Registered component hosts accept declared prop attributes plus these runtime controls:

| Registered-host attribute | Contract |
| --- | --- |
| `data-src` | Request URL. |
| `data-fetch-keys` | Strict-JSON URL-key substitutions. |
| `data-fetch-params` | Strict-JSON query parameters. |
| `data-method` | HTTP method override. |
| `data-body` | Raw or strict-JSON request body. |
| `data-target` | Response destination in `$props`. |
| `data-fetch-poll` | Polling interval in milliseconds. |
| `data-fetch-timeout` | Per-attempt timeout in milliseconds. |
| `data-retries` | Retry count after the initial attempt. |
| `data-retry-delay` | Initial retry delay. |
| `data-retry-max-delay` | Maximum retry delay. |
| `data-retry-jitter` | Retry jitter from 0 through 1. |
| `data-retry-unsafe-methods` | Boolean opt-in for retrying unsafe methods. |
| `data-response-type` | `json`, `text`, `blob`, `arrayBuffer`, `stream`, or `auto`. |
| `data-cache-strategy` | Data-cache strategy. |
| `data-fetch-cache-ttl` | Settled-entry lifetime in milliseconds. |
| `data-fetch-cache-max` | Settled shared-entry bound. |
| `data-cache-key` | Explicit request/cache identity. |
| `pause-polling-when-hidden` | Boolean document-visibility polling gate. |
| `pause-polling-when-offline` | Boolean network-status polling gate. |
| `pause-polling-when-offscreen` | Boolean viewport polling gate. |
| `persist` | `local`, `session`, `indexeddb`, or a configured custom mode. |
| `persist-key` | Explicit storage key. |
| `persist-debounce` | Automatic snapshot delay in milliseconds. |
| `persist-version` | Positive stored-envelope version. |
| `keep-alive` | Preserve an ordinary component across temporary removal, subject to `keepAliveMax`. |

The complete parsing, defaults, and validation rules are in [Data](data.md).

| `<acl-dynamic>` attribute | Contract |
| --- | --- |
| `is` | Registered target tag. |
| `keep-alive` | Cache inactive children. |
| `keep-alive-max` | Inactive-child capacity. |
| `transition` | Transition preset. |
| `transition-duration` | Duration in milliseconds. |

Other dynamic-host attributes are copied to active and cached children.

## Public entry points

| Entry | Default export | Named runtime exports | Environment note |
| --- | --- | --- | --- |
| `alpine-component-loader` | `AlpineComponentLoader` | `ACLLoadError`, `createLoader()`, `createIndexedDBPersistenceAdapter()` | SSR-safe import; operations may require DOM |
| `alpine-component-loader/auto` | `AlpineComponentLoader` | `startAutoLoader()` plus core named exports | Browser startup side effect |
| `alpine-component-loader/dev` | `connectACLDevServer()` | `connectACLDevServer()`, `reloadChangedTemplates()` | Browser/EventSource operations |
| `alpine-component-loader/debugger` | `ACLDebugger` | `redactDiagnostics()`, `createDiagnosticSnapshot()`, `createComponentSnapshot()`, `diffDiagnosticSnapshots()` | Overlay operations require DOM |
| `alpine-component-loader/a11y` | `ACLA11y` | `runBasicAccessibilityAudit()`, `auditAccessibility()`, `observeAccessibility()` | Audits require DOM |
| `alpine-component-loader/a11y-scanner` | `ACLA11yScanner` | `mountAccessibilityScanner()` | Requires DOM |
| `alpine-component-loader/offline` | `ACLOffline` | `registerOfflineWorker()`, `activateOfflineWorker()`, `getOfflineStatus()` | SSR-safe import; registration requires browser support |
| `alpine-component-loader/testing` | `ACLTesting` | `waitForComponent()`, `mountComponent()`, `recordACLEvents()`, `installFetchMock()`, `createACLTestHarness()`, `assertLifecycleSequence()` | SSR-safe import; mounting requires DOM |
| `alpine-component-loader/testing/playwright` | `ACLPlaywright` | `createACLPlaywrightTest()`, `expect` | Playwright test-runner process |
| `alpine-component-loader/testing/vitest` | `ACLVitest` | `createACLVitestFixture()` | Vitest Browser Mode |
| `alpine-component-loader/testing/server` | `ACLTestingServer` | `startACLTestServer()` | Node-only optional local server |
| `alpine-component-loader/ssr` | `ACLSSR` | `createSSRRenderer()` | Node-only; optional bounded data resolution and Light DOM rendering |
| `alpine-component-loader/project` | `defineConfig()` | `defineConfig()`, `loadProjectConfig()` | Node-only shared project configuration |
| `alpine-component-loader/vite` | `alpineComponentLoader()` | `alpineComponentLoader()` | Node/Vite plugin; Vite remains an optional peer |
| `alpine-component-loader/observability-exporters` | exporter collection | `createBatchExporter()`, `createBeaconExporter()`, `createOpenTelemetryExporter()`, `createSentryExporter()`, `connectExporter()` | Dependency-free optional browser transport/adapters |

`parse5` and `@swc/core` are npm optional dependencies and are installed by
default. Installations created with `--omit=optional` can still import the
browser package and use lightweight CLI commands. Parser-, SSR-, and
minifier-backed operations throw an `ACL_OPTIONAL_DEPENDENCY_MISSING` error
with `dependency`, `feature`, and `install` fields plus the original resolution
error as `cause`. Development and testing server options include
`watchPollInterval`; it defaults to `5000`, and `0` disables safety scans.

The observability entry's default `exporters` object maps directly to its named functions.

Default object aliases map directly to the named functions: `ACLA11y.audit()`/`ACLA11y.observe()`/`ACLA11y.runBasicAudit()`, `ACLA11yScanner.mount()`, the offline registration/activation/status helpers, the core and runner-specific testing helpers, and `ACLSSR.createSSRRenderer()`. The debugger default is a class exposing injection/snapshot behavior documented in [Accessibility and debugging](accessibility-and-debugging.md).

Internal `dist/runtime/*` modules are intentionally absent from the package export map.

Browser entries and their demand-loaded descendants are ES2022 modules. A CDN entry requested as `.min.js` propagates that suffix to package-owned dynamic imports; readable `.js` entries retain readable descendants. There is no automatic fallback from a missing `.min.js` descendant to `.js`.

`createIndexedDBPersistenceAdapter()` remains synchronous: it returns a lightweight adapter facade, and the adapter's first storage operation loads and awaits the persistence capability.

## TypeScript

Core declarations support typed props, options, hook contexts, errors, cache diagnostics, manifests, and every optional entry:

```ts
import AlpineComponentLoader, {
    type ACLComponentOptions,
    type ACLProps,
} from 'alpine-component-loader';

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

await AlpineComponentLoader.define<ProfileProps>(
    'profile-card',
    '/components/profile-card.html',
    options,
);
```

These package declarations type the generic loader API. The CLI-generated `acl-components.d.ts` is application-specific: it augments `HTMLElementTagNameMap`, typed component properties/`$props`, and declared event listener overloads from an enriched manifest. See [Manifests, generated contracts, and CLI tooling](manifests-and-cli.md).

## CLI discovery

Use the installed binary for current syntax:

```bash
npx alpine-component-loader --help
npx alpine-component-loader validate .
```

Commands include `create`, `serve`, `skeleton`, `audit`, `init`, `validate`, `manifest`, `routes`, `watch`, `offline`, `types`, and `schema`. Project commands read `acl.config.mjs` by default and accept `--config`; the offline command uses `--project-config` because `--config` remains its offline-policy flag. Tooling commands protect existing files unless their documented `--force` option is supplied.

The [CLI guide](manifests-and-cli.md#cli-option-reference) lists safe manifest update/prune behavior, sidecar and offline schema kinds, starter templates, offline policy input, and audit report formats. Repository maintainers can inspect runtime caching and distribution-size guidance in [Runtime efficiency and distribution size](performance.md).

## Additional entry points and exports

The testing integrations are published as `alpine-component-loader/testing/playwright`, `alpine-component-loader/testing/vitest`, and `alpine-component-loader/testing/server`, alongside the core `alpine-component-loader/testing` entry.

Their runtime exports are `createACLPlaywrightTest()` and Playwright's `expect` through the `ACLPlaywright` default object, `createACLVitestFixture()` through `ACLVitest`, and `startACLTestServer()` through `ACLTestingServer`. Core testing also exports `createACLTestHarness()` and `assertLifecycleSequence()`. Offline prompt activation uses `activateOfflineWorker()`.

## Troubleshooting

### Nothing registers

The root import does not auto-start. Confirm the tag contains a hyphen, register it before use, and call `start()`:

```js
console.log(AlpineComponentLoader.has('profile-card'));
console.log(AlpineComponentLoader.getRegisteredTags());
await AlpineComponentLoader.start();
```

If Alpine is loaded as a module, expose and start it according to the application's integration order. Use the browser-only `auto` entry only when its startup side effect is desired.

If code needs `<acl-component>` or `<acl-dynamic>` defined before inserting it, await `registerComponent()` or `registerDynamicLoader()`. Otherwise, `start()` loads each built-in implementation after its tag is discovered.

### Manifest registration throws

Pass a parsed object rather than the manifest URL, check `version: 1`, and validate it:

```bash
npx alpine-component-loader validate acl-manifest.json
```

Missing dependencies, duplicate normalized names, cycles, invalid custom-element names, and missing local sources are reported explicitly.

### Props are empty or invalid

Declare each prop in `options.attributes`. Arrays and objects in HTML must be strict JSON:

```html
<profile-card roles='["maintainer"]' account='{"id":"user-1"}'></profile-card>
```

Listen for `acl:error`, enable `strictProps` while testing, and confirm the serialized manifest uses supported type names.

### A script does not run

Default sanitization removes scripts, and `executeScripts` also defaults to false. Put behavior in application modules or Alpine registrations. Only opt into trusted template scripts after reviewing both settings and CSP; see [Security and Trusted Types](security.md).

### Requests repeat or remain stale

Inspect request identity, strategy, TTL, revision, and namespace:

```js
console.log(AlpineComponentLoader.getDataCacheInfo());
console.log(await AlpineComponentLoader.getTemplateCacheInfo());
```

Request identity includes method, headers, body, parser mode, and explicit cache key. Clear only the affected cache and reload the component when an in-flight request must also be replaced.

### Hydration fetches the template

Shadow definitions and opt-in Light DOM output hydrate when `data-acl-revision` matches the client manifest. Mismatch intentionally falls back to client rendering; see [Static SSR and hydration](ssr.md).

### Persistence does not restore

Use a positive `persistVersion`, a stable `persistKey`, and a `persistMigrate` function for older envelopes. Await storage helpers and inspect `acl:error` for phase `persistence` without logging stored data.

### Forwarded events are missing or duplicated

Configure `events.forward`, dispatch a bubbling event inside the shadow root, and verify source/target names. Native composed events do not need forwarding. Reload replaces owned forwarders, so duplicates usually indicate an application listener registered more than once.

### Offline assets are missing

Inspect `acl-precache-manifest.json`. Component dependencies are automatic, but the HTML shell and every statically imported browser module require `--asset`. Compare `basePath`, `--base-url`, service-worker scope, and deployed URLs; see [Offline behavior](offline.md).

### A dynamic component does not appear

The `is` target must be a valid, already registered tag. Listen for `acl:error` on `<acl-dynamic>` and inspect `detail.targetTag` and `detail.error`.

For upgrade-specific behavior see [MIGRATION.md](../MIGRATION.md).
