# Migrating AlpineComponentLoader

## v1.0.0 runtime and tooling modernization

Version 1.0.0 preserves the browser module-loading graph, package exports, CLI
command names and defaults, and default npm installation behavior. Node.js 22
or later is required for CLI, build, test, and SSR workflows. Existing
applications do not need to change their component definitions.

Declared host properties remain readable, writable, enumerable, configurable,
and reflection-compatible, but their accessors now live on the generated custom
element prototype. Code using `Object.hasOwn(element, propName)` or inspecting
only own descriptors should instead walk the prototype or use
`propName in element`.

`parse5` and `@swc/core` are now `optionalDependencies`. npm installs them by
default, so existing installs retain parser, SSR, and minifier features. A
browser-only installation may opt into `npm install --omit=optional`; attempting
to use an omitted tool reports `ACL_OPTIONAL_DEPENDENCY_MISSING` with the
dependency, feature, and installation command.

Project watching now prefers one recursive native watcher with a safe
per-directory fallback. The periodic safety scan defaults to 5000 ms and is
configured with `watch.pollInterval`, CLI `--poll-interval`, or programmatic
`watchPollInterval`; set it to `0` to disable scans. CLI values override project
configuration.

Template parsing, Cache API reconciliation, lifecycle state, and adaptive
prefetch bookkeeping were optimized without changing their public results.
Custom Trusted Types policies still run per component instance, as do all
configured sanitizers.

## Demand-loaded ES2022 runtime

The browser package is now a small facade over demand-loaded capabilities. Importing a public entry no longer downloads the complete component runtime. Component construction, rendering, remote templates, caches, data, persistence, external assets, manifests, adaptive prefetch, observability, built-in elements, and tooling are imported only after configuration, markup, or an API call requires them. Successfully loaded capabilities are shared across components for the lifetime of the page.

This changes these synchronous return values to promises:

| API | New result |
| --- | --- |
| `define()` | `Promise<CustomElementConstructor>` |
| `registerComponent()` | `Promise<CustomElementConstructor>` |
| `registerDynamicLoader()` | `Promise<CustomElementConstructor>` |
| `registerTemplates()` | `Promise<CustomElementConstructor[]>` |
| `registerSkeletonManifest()` | `Promise<string[]>` |
| `observePrefetch()` | `Promise<ACLAdaptivePrefetchController>` |

Await a call when the returned constructor, tags, controller, or immediate readiness is required:

```javascript
const ProfileCard = await AlpineComponentLoader.define(
    'profile-card',
    '/components/profile-card.html',
);
const controller = await AlpineComponentLoader.observePrefetch();
```

Pre-start definitions may still be queued without handling each promise separately. `start()` drains every queued definition before its own promise resolves:

```javascript
AlpineComponentLoader.define('profile-card', '/components/profile-card.html');
AlpineComponentLoader.define('account-card', '/components/account-card.html');
await AlpineComponentLoader.start();
```

`start()` no longer defines `<acl-component>` and `<acl-dynamic>` when a project does not use them. It discovers existing and newly inserted built-in tags and loads only the implementation that appears. Code that needs a built-in to be registered before inserting it must opt in explicitly:

```javascript
await AlpineComponentLoader.registerComponent();
await AlpineComponentLoader.registerDynamicLoader();
```

`createIndexedDBPersistenceAdapter()` remains synchronous and returns a lightweight adapter facade. Its first storage operation loads and awaits the persistence implementation.

Browser modules now target ES2022. When a jsDelivr entry is requested as `.min.js`, package-owned dynamic imports request their corresponding `.min.js` paths; readable entries retain readable descendants. Missing minified descendants reject the activating operation without falling back to `.js`. Use one readable or minified URL family consistently to avoid duplicate module identities.

## Included v1.0.0 tooling and security capabilities

These capabilities are part of the `1.0.0` baseline. SSR, testing,
observability, generated-contract, and adaptive-prefetch features are opt-in,
while existing public APIs and default rendering behavior remain compatible.

The built-in sanitizer recursively covers nested template and SVG content,
executable URL-bearing attributes, `srcset`, refresh navigation, form actions,
`srcdoc`, and `<base>`. These are baseline v1 security protections, not a
separate sanitizer mode. `sanitize` remains enabled by default,
`sanitize: false` remains available, and custom sanitizer return values keep
their documented contract. Applications enforcing Trusted Types should
configure `security.trustedTypesPolicy`; executable URLs cannot be restored by
a custom URL policy.

New public entries are `alpine-component-loader/testing`, `alpine-component-loader/testing/playwright`, `alpine-component-loader/testing/vitest`, and `alpine-component-loader/testing/server` for isolated browser-test workflows, plus Node-only `alpine-component-loader/ssr`. `createLoader()` provides independent configuration, registries, observers, metrics, caches, and deterministic disposal for tests, micro-frontends, and multiple applications.

Version-one manifests may add descriptive event/slot metadata without changing runtime behavior. Adjacent `.acl.json` sidecars own authored component settings, parse5 discovers structural dependencies, and `manifest --update` refreshes generated fields without discarding authored contracts. The `acl types` and kind-specific `acl schema` commands emit deterministic contracts.

SSR may opt into bounded `dataResolver` output and Light DOM rendering. Offline
generation may opt into activation, navigation, bounded runtime routes, expiry,
and quota recovery. `acl audit` produces console, JSON, JUnit, or SARIF
accessibility reports. All capabilities retain compatible defaults; see the
[v1.0.0 API documentation](docs/api.md) for details.

Version 1.0 intentionally changes startup, security defaults, and programmatic data configuration. The runtime remains compatible with Alpine.js 3.14-3.x, but flat JavaScript data options have been removed in favor of the grouped `data` API.

## Upgrade checklist

1. Upgrade Alpine to 3.14 or newer and install from GitHub with `npm install github:LTDev-LLC/alpine-component-loader alpinejs`.
2. Replace reliance on root-entry auto-start with an explicit `await AlpineComponentLoader.start()` call, or import `alpine-component-loader/auto` in browser-only applications.
3. Review templates that contain `<script>`, inline `on*` handlers, `javascript:` URLs, or function-like declarative data attributes. Declarative expressions were removed; template scripts require an explicit `executeScripts: true`.
4. Confirm every custom-element name is valid and contains a hyphen. Invalid and reserved names now fail early.
5. Await persistence helpers (`$save`, `$get`, `$clear`, `$flush`) and lifecycle hooks that perform asynchronous work.
6. Update code that expects `prefetchAll()` to reject as a batch; it now returns a settled result for every tag.
7. If cache continuity matters, set an explicit `cacheNamespace`. Version 1.0 uses versioned namespaced template buckets and prunes stale buckets during startup.
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

The root, debugger, and development entries can be imported without `window`, `document`, `HTMLElement`, or `customElements`. Calling `start()` without browser DOM APIs rejects with `ACL_ENVIRONMENT_UNAVAILABLE`.

Component definitions created before startup remain queued until `start()` drains them into the browser custom-element registry. Definitions created after startup begin registration immediately; await the promise returned by `define()` when subsequent code depends on readiness.

### Canonical distribution filenames

Distributed JavaScript now uses readable ES2022 modules with canonical entry names. For CDN delivery, request jsDelivr's generated `.min.js` variant; package and local imports continue to use the canonical `.js` files. Update direct browser imports as follows:

| Removed filename | Replacement |
| --- | --- |
| `dist/AlpineComponentLoader.js` | `dist/index.js` |
| `dist/AlpineComponentLoader.min.js` | `dist/index.js` |
| `dist/ACLDebugger.js` | `dist/debugger.js` |
| `dist/ACLDebugger.min.js` | `dist/debugger.js` |

Package consumers should prefer `alpine-component-loader` and `alpine-component-loader/debugger` instead of importing from `dist` directly.

## Security contract

The `safeMode` and `allowUnsafeExpressions` options were removed. Version 1.0 accepts strict JSON in declarative attributes, never dynamically evaluates attribute text, disables template scripts by default, and enables sanitization by default.

Prefer module code, JSON declarative attributes, and a custom sanitizer when the built-in sanitizer is too restrictive. Trusted template scripts can be enabled explicitly:

```javascript
await AlpineComponentLoader.define('trusted-report', 'report.html', {
    executeScripts: true
});
```

There is no runtime-expression compatibility switch. Move dynamic values into programmatic `data.keys` or `data.params` functions.

## Fetching, retries, and cache identity

- Data responses support `json`, `text`, `blob`, `arrayBuffer`, `stream`, `auto`, and custom parsers.
- Retries use exponential backoff, jitter, `Retry-After`, transient status detection, and abortable delays.
- `POST`, `PATCH`, and other unsafe methods are not retried unless `retryUnsafeMethods` is enabled.
- Polling pauses while the page is hidden or offline by default.
- Request cache keys are opaque fingerprints of URL, method, headers, body, parser mode, and explicit cache key. The prop target is not part of raw response identity.
- Binary, streaming, and file-containing bodies bypass shared caching unless `data.cacheKey` is supplied.
- Cached values and component defaults are cloned at consumer boundaries.

Grouped configuration is required. For example, replace `dataSrc`, `dataResponseType`, and `dataRetryDelay` with `data.src`, `data.responseType`, and `data.retryDelay`:

```javascript
await AlpineComponentLoader.define('user-card', 'user.html', {
    data: {
        src: '/api/user',
        responseType: 'json',
        retries: 2,
        retryDelay: 250,
        cacheStrategy: 'stale-while-revalidate'
    }
});
```

## Persistence

Persisted values must use `{ version, data }` envelopes with a positive integer version. Version 1.0 rejects unversioned records instead of interpreting or rewriting them. Convert old records before starting the v1 runtime, then supply a migration when a versioned shape changes:

```javascript
await AlpineComponentLoader.define('settings-card', 'settings.html', {
    persist: 'local',
    persistVersion: 2,
    async persistMigrate(data, { fromVersion }) {
        if (fromVersion < 2)
            return { ...data, theme: data.theme || 'system' };
        return data;
    }
});
```

Custom adapters may be synchronous or asynchronous and must implement `getItem`, `setItem`, and `removeItem`. Storage failures emit `acl:error` instead of aborting component initialization.

## Hooks and cleanup

All hooks can be async. A hook may return a cleanup function; the loader runs it during teardown. `beforeFetch` and `afterFetch` receive a second context argument containing the component, props, and root.

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

Listen for namespaced runtime events: `acl:loadstart`, `acl:loadend`, `acl:error`, `acl:cachehit`, and `acl:revalidated`. `ACLLoadError` exposes `code`, `phase`, `status`, and `retryable`. Components expose `$retry()` and `$cancel()` alongside `$reload()`.

## Manifests and development reloads

Use `registerManifest()` for versioned registries and bounded group prefetch. Version-one manifests may now add optional `dependencies` arrays; existing manifests require no version or content change. Use `observeTemplates()` when templates can be inserted after startup.

Import `alpine-component-loader/dev` only in development; its SSE client invalidates changed template caches and reloads matching live instances while preserving public and DOM state. Calling `element.reload()` directly retains the previous hard-reload behavior. The packaged `alpine-component-loader serve` command provides the matching static server and injects the connection automatically.

## Debugging upgrade problems

```javascript
import ACLDebugger from 'alpine-component-loader/debugger';

ACLDebugger.inject(AlpineComponentLoader);
AlpineComponentLoader.toggleDebug();
```

The debugger records a bounded lifecycle timeline, virtualizes large component lists, and exports redacted diagnostics. Credential-like object fields and sensitive URL parameters are replaced with `[REDACTED]`.
