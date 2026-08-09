# Data, caching, polling, and persistence

Component data requests run as part of the component lifecycle. They support typed response handling, cancellation, bounded retries, polling, response sharing, cache strategies, and optional persisted component state.

## Quick start

Configure a request under `data`:

```js
AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    attributes: { userId: { type: String, required: true } },
    data: {
        src: '/api/profile',
        params: ({ props }) => ({ id: props.userId }),
        target: '$data',
        responseType: 'json',
        timeout: 5000,
        retries: 2,
        retryDelay: 250,
        cacheStrategy: 'network-first',
        cacheTtl: 60_000,
    },
});
```

Inside the template, the parsed response is available at the configured target:

```html
<article>
    <h2 x-text="$props.$data?.name"></h2>
    <p x-show="$props.$loading" role="status">Loading profile…</p>
    <p x-show="$props.$error" x-text="$props.$error"></p>
    <p x-text="$props.$data?.bio"></p>
</article>
```

`params` appends URL query parameters. `keys` selects values from the current props/context, and both may be objects or async functions. `options` supplies ordinary `RequestInit`; the dedicated `method` and `body` settings are convenient overrides.

## Declarative request settings

Serializable settings can be supplied on a component host or on an inline
definition template. Definition-level values become defaults for every
instance; host attributes override them for that instance:

```html
<template
    x-acl="profile-card"
    acl-props='{ "userId": "String" }'
    data-src="/api/profile"
    data-fetch-params='{ "expand": "teams" }'
    data-response-type="json"
    data-target="$data"
    data-fetch-timeout="5000"
    data-retries="2"
    data-retry-delay="250"
    data-cache-strategy="network-first"
    data-fetch-cache-ttl="60000"
    data-fetch-cache-max="100"
    pause-polling-when-hidden="true"
>
    <h2 x-text="$props.$data?.name"></h2>
</template>

<profile-card user-id="user-1"></profile-card>
<profile-card user-id="user-2" data-retries="0"></profile-card>
```

The same attributes work on `template[acl-component]`. Template declarations
also accept `data-fetch-keys`, `data-fetch-poll`, `data-fetch-options`,
`data-method`, `data-body`, `data-cache-key`, `data-retry-max-delay`,
`data-retry-jitter`, `data-retry-unsafe-methods`,
`pause-polling-when-offline`, and `pause-polling-when-offscreen` according to
the table below.

Most common settings can also be supplied on the component host:

```html
<profile-card
    user-id="user-1"
    data-src="/api/profile"
    data-fetch-params='{"expand":"teams"}'
    data-method="GET"
    data-response-type="json"
    data-target="$data"
    data-fetch-timeout="5000"
    data-retries="2"
    data-cache-strategy="network-first"
    data-fetch-cache-ttl="60000"
></profile-card>
```

JSON-valued attributes such as `data-fetch-params`, `data-fetch-keys`, and `data-fetch-options` must contain strict JSON, not JavaScript expressions. Invalid bounded numeric or enumerated settings fall back safely and are reported through diagnostics.

Changing request-related attributes cancels stale work and starts a request with the new identity. Application code can also call `element.cancel('route-changed')`, `element.retry()`, or `element.reload()`.

## Data option reference

Programmatic settings live under `data`. Serializable controls can also be
placed on an inline definition template or registered component host;
`data-fetch-options` is definition-only on `template[x-acl]`,
`template[acl-component]`, and the declarative `<acl-component>` proxy.

| JavaScript option | Declarative attribute | Default | Validation and behavior |
| --- | --- | --- | --- |
| `data.src` | `data-src` | `null` | Request URL; no request runs when absent. |
| `data.keys` | `data-fetch-keys` | `null` | Object/async function replacing every matching `:name` segment; attribute is strict JSON. |
| `data.params` | `data-fetch-params` | `null` | Object/async function appended as query parameters; attribute is strict JSON. |
| `data.options` | `data-fetch-options` on definition templates and `<acl-component>` | `null` | Base `RequestInit`; it is definition-only and is not read from registered component hosts. Programmatic headers merge case-insensitively. |
| `data.method` | `data-method` | `null` | HTTP method; effective default is `GET`. |
| `data.body` | `data-body` | `null` | Body value; object/array bodies are JSON encoded. |
| `data.target` | `data-target` | `$data` | Direct `$props` key receiving the parsed response. |
| `data.poll` | `data-fetch-poll` | `null` | Non-negative polling interval in milliseconds. |
| `data.timeout` | `data-fetch-timeout` | `30000` | Non-negative setting; a non-positive runtime value uses the 30-second fallback. |
| `data.retries` | `data-retries` | `0` | Non-negative retry count after the first attempt. |
| `data.retryDelay` | `data-retry-delay` | `250` | Non-negative initial exponential-backoff delay. |
| `data.retryMaxDelay` | `data-retry-max-delay` | `30000` | Non-negative maximum backoff, never lower than the initial delay. |
| `data.retryJitter` | `data-retry-jitter` | `0.2` | Random delay variation constrained to 0 through 1. |
| `data.retryUnsafeMethods` | `data-retry-unsafe-methods` | `false` | Permit normally unsafe methods to retry. |
| `data.responseType` | `data-response-type` | `json` | `json`, `text`, `blob`, `arrayBuffer`, `stream`, or `auto`. |
| `data.parser` | JavaScript only | `null` | Custom sync/async `Response` parser. |
| `data.cacheStrategy` | `data-cache-strategy` | `cache-first` | `cache-first`, `network-first`, `stale-while-revalidate`, or `no-store`. |
| `data.cacheTtl` | `data-fetch-cache-ttl` | `300000` | Non-negative settled-entry lifetime; 0 retains only in-flight sharing. |
| `data.cacheMax` | `data-fetch-cache-max` | `100` | Non-negative bound for settled shared entries. |
| `data.cacheKey` | `data-cache-key` | `null` | Explicit string or async function used in request identity. |
| `data.pauseWhenHidden` | `pause-polling-when-hidden` | `true` | Pause polls while the document is hidden. |
| `data.pauseWhenOffline` | `pause-polling-when-offline` | `true` | Pause polls while `navigator.onLine` is false. |
| `data.pauseWhenOffscreen` | `pause-polling-when-offscreen` | `false` | Pause polls while the host is outside the viewport. |

Programmatic numeric violations throw during `config()` or `define()`. Invalid declarative numbers and enum values fall back to configured defaults and are reported. Boolean attributes accept `false` and `0` as explicit opt-outs.

## Request hooks and response targets

`beforeFetch` may adjust the final request. `afterFetch` may replace the parsed value, including with a primitive:

```js
AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    data: {
        src: '/api/profile',
        target: 'profile',
    },
    hooks: {
        beforeFetch(options, { props }) {
            const headers = new Headers(options.headers);
            headers.set('x-profile-id', String(props.userId));
            return { ...options, headers };
        },
        afterFetch(data) {
            return data.profile;
        },
    },
});
```

The default target is `$data`. Any other target is assigned as a direct key on `$props`, so `target: 'profile'` becomes `$props.profile`; target strings are not evaluated as JavaScript or expanded as dotted paths. A target changes where the response is assigned but does not change the underlying cache identity.

The same rule applies to authored templates: `data-target="$data"` exposes
`$props.$data`, while `data-target="profile"` exposes `$props.profile`. Object
responses are never spread across `$props`. Changing an instance's request
attribute cancels stale work without changing the definition inherited by
other instances.

Response modes are `json`, `text`, `blob`, `arrayBuffer`, `stream`, and `auto`. A custom parser receives the `Response` and component context:

```js
data: {
    src: '/api/profile.csv',
    parser: async response => (await response.text()).split('\n'),
    cacheKey: 'profile-csv-v1',
}
```

Binary and streaming request bodies bypass shared response caching unless an explicit `cacheKey` is supplied.

## URL, request body, and response handling

`keys` replaces every matching `:key` segment and URL-encodes the value. `params` preserves an existing query, repeats array keys, and uses bracketed names for nested objects:

```js
data: {
    src: '/api/accounts/:accountId/audit?view=summary',
    keys: ({ props }) => ({ accountId: props.accountId }),
    params: {
        locale: 'en',
        include: ['changes', 'actors'],
        filters: { active: true },
    },
}
```

Object and array bodies are serialized with `JSON.stringify()` and receive `content-type: application/json` unless the request already sets it. Strings, `URLSearchParams`, `FormData`, `Blob`, and `ArrayBuffer` values are passed through. GET and HEAD requests omit the body.

| Response mode | Result |
| --- | --- |
| `json` | Requires `application/json` or a `+json` content type, then calls `response.json()`. |
| `text` | Calls `response.text()`. |
| `blob` | Calls `response.blob()`. |
| `arrayBuffer` | Calls `response.arrayBuffer()`. |
| `stream` | Returns `response.body` and disables retained sharing. |
| `auto` | Chooses JSON, text/XML/JavaScript, or Blob from the content type. |

A custom parser receives `(response, context)`. Dynamic `keys`, `params`, `cacheKey`, `beforeFetch`, `afterFetch`, and parser functions receive aliases for the same values: `el`/`$el`, `props`/`$props`, and `root`/`$root`. `beforeFetch` may replace the final `RequestInit`; `afterFetch` runs per consuming component, so shared raw responses can be transformed differently.

## Cancellation, retries, and timeouts

Cancellation propagates through template, external-asset, and data work. Reload, disconnect, superseding attribute changes, and `cancel()` abort owned requests and prevent stale responses from updating the component.

Retries apply to transient failures and honor `Retry-After` when present:

```js
data: {
    src: '/api/profile',
    timeout: 8000,
    retries: 3,
    retryDelay: 250,
    retryMaxDelay: 5000,
    retryJitter: 0.2,
}
```

Unsafe methods are not retried by default. Enable them only when the endpoint is idempotent:

```js
data: {
    src: '/api/profile/refresh',
    method: 'POST',
    body: { force: true },
    retries: 1,
    retryUnsafeMethods: true,
}
```

GET, HEAD, OPTIONS, PUT, and DELETE may retry by default. POST, PATCH, and other methods require `retryUnsafeMethods: true` and should use an idempotency key or an otherwise idempotent endpoint. Retryable HTTP statuses are 408, 425, 429, 500, 502, 503, and 504. Delays use exponential backoff, bounded jitter, and `Retry-After` when supplied.

Each component owns a subscriber abort signal. When several components share a request, canceling or disconnecting one consumer does not abort the network request while another subscriber still needs it. Endpoint changes, reloads, timeouts, teardown, and explicit cancellation prevent stale results from replacing current state.

## Template and data cache strategies

Template and data fetches support:

- `cache-first`: use a valid cached response before the network.
- `network-first`: try the network, then use cached data when possible.
- `stale-while-revalidate`: return cached data immediately and refresh it in the background.
- `no-store`: bypass persistent/shared caching.

Configure template caching separately from component data:

```js
AlpineComponentLoader.config({
    cacheNamespace: 'profile-app',
    cacheTemplates: true,
    templateCacheStrategy: 'stale-while-revalidate',
    templateCacheTtl: 15 * 60_000,
    templateCacheMax: 100,
});
```

Data request identity includes the final URL, method, headers, body, response/parser mode, and optional explicit key. Response targets are deliberately excluded so consumers can share the same parsed response.

Strings and `URLSearchParams` are replayable. `FormData` is shared only when every value is a string. File-containing `FormData`, `Blob`, `ArrayBuffer`, typed-array, and streaming bodies use `no-store` unless an explicit `data.cacheKey` supplies application-owned identity. Cached values are cloned for each consumer.

Template caching uses the browser Cache API when `cacheTemplates` is true.
`cacheNamespace` and the loader `version` form the bucket name;
`templateRevision` gives one source an explicit content identity.
`templateCacheTtl` controls freshness and `templateCacheMax` applies
expiry-first, least-recently-used pruning. A successfully stored new revision
removes older revisions of the same source.

The loader hydrates a private metadata index in batches of eight and thereafter
reads response metadata only for cache keys it has not seen. Revision, expiry,
and capacity eviction share one reconciliation pass; selected victims are
deleted concurrently. Explicit cache clears and quota recovery invalidate the
index, so later inspection or pruning rebuilds it from the Cache API rather than
retaining stale metadata.

Inspect and clear caches during development or targeted recovery:

```js
console.log(AlpineComponentLoader.getDataCacheSize());
console.log(AlpineComponentLoader.getDataCacheInfo());

const templateInfo = await AlpineComponentLoader.getTemplateCacheInfo();
console.log(templateInfo);

AlpineComponentLoader.clearDataCache();
await AlpineComponentLoader.clearTemplate('/components/profile-card.html');
await AlpineComponentLoader.pruneTemplateCache({ max: 50 });
```

Each component also exposes scoped helpers through `$props.$cache`:

```js
await card.$props.$cache.clearData();
await card.$props.$cache.clearTemplate();
await card.$props.$cache.clear();
```

Clearing a cache does not cancel an already-owned request. Use `cancel()` or reload when in-flight work must also stop.

`getDataCacheInfo()` exposes redacted request metadata such as final URL, target, strategy, expiry, pending state, and subscriber count, never the response body. `getTemplateCacheInfo()` exposes source, revision, timestamps, TTL, and request identity, never template content. `getTemplateLoadInfo()` reports the most recent in-memory load outcome.

`clearDataCache()` invalidates matching future consumption and may abort an unshared pending request. `clearTemplate()` removes all matching revisions of a source. `pruneTemplateCache()` applies expiry/capacity immediately, `clearTemplateCaches()` removes matching namespaces, and `pruneCaches()` removes older version buckets while preserving the active one.

## Polling

Set a polling interval in milliseconds:

```js
data: {
    src: '/api/profile/status',
    poll: 30_000,
    pauseWhenHidden: true,
    pauseWhenOffline: true,
    pauseWhenOffscreen: true,
}
```

Or configure it declaratively:

```html
<profile-card
    data-src="/api/profile/status"
    data-fetch-poll="30000"
    pause-polling-when-hidden
    pause-polling-when-offline
    pause-polling-when-offscreen
></profile-card>
```

Hidden-page and offline pauses default to enabled; offscreen pausing is opt-in. Set a Boolean attribute to `"false"` or `"0"` to disable it explicitly. Poll timers, visibility listeners, network listeners, and intersection observers are released on reload, disconnect, and teardown.

## Persist component state

Set `persist` to `local`, `session`, or `indexeddb`:

```js
AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    persist: 'local',
    persistKey: 'profile:user-1',
    persistVersion: 2,
    persistDebounce: 250,
    persistMigrate(data, { fromVersion, toVersion }) {
        if (fromVersion === 1 && toVersion === 2) {
            return { ...data, preferences: data.preferences ?? {} };
        }
        return data;
    },
});
```

| `persist` value | Adapter |
| --- | --- |
| `local` | `window.localStorage`. |
| `session` | `window.sessionStorage`. |
| `indexeddb` | Shared IndexedDB database `alpine-component-loader`, store `persistence`. |
| `custom` or another truthy name | The configured `persistAdapter`, otherwise session storage. |

The host equivalents are `persist`, `persist-key`, `persist-debounce`, and `persist-version`. Without an explicit key, the loader uses `acl:<tag-name>:<id>` and substitutes `default` when the host has no ID. Repeated component instances therefore need unique IDs or explicit keys.

Automatic snapshots contain serializable public props. Names beginning with `$` and function values are excluded. Matching stored fields restore before Alpine initializes the rendered tree; an Alpine effect then queues debounced saves when reactive state changes.

Records use `{ version, data }` envelopes, and versions must be positive integers. A mismatched older version needs `persistMigrate`; invalid or future envelopes are not silently applied.

The migration context contains `fromVersion`, configured `toVersion`, resolved
storage `key`, and the owning `component`. Migration runs before stored fields
are applied and may return a value or promise. Throwing rejects the stored
record and reports `ACL_PERSISTENCE_FAILED` without partially applying it.

Persistence helpers are asynchronous:

```js
await card.$props.$persistence.$save({ expanded: true });
const expanded = await card.$props.$persistence.$get('expanded', false);
await card.$props.$persistence.$flush();
await card.$props.$persistence.$clear();
```

| Helper | Behavior |
| --- | --- |
| `$key` | Resolved storage key. |
| `$save()` | Queue a flush-time snapshot of current public props. |
| `$save(value)` | Queue an explicit serializable value. |
| `$get()` | Read, validate, migrate, and return the complete stored data value. |
| `$get(field, fallback)` | Read one own field and preserve falsy values such as `false`, `0`, and `""`. |
| `$flush()` | Commit pending debounced work immediately and await serialized prior writes. |
| `$clear()` | Remove only this storage key; current in-memory props are unchanged. |

State changes are saved through the component's Alpine effect. `pagehide` flushes debounced work when possible. Await explicit helpers when application flow depends on storage completion. To include mutations made in the same event handler before navigation, call `$save()`, then await `$flush()` and the save promise.

## IndexedDB and custom adapters

Use the built-in IndexedDB adapter directly when the application needs custom database names or an explicit close lifecycle:

```js
import AlpineComponentLoader, { createIndexedDBPersistenceAdapter } from 'alpine-component-loader';

const adapter = createIndexedDBPersistenceAdapter({
    databaseName: 'profile-app',
    storeName: 'component-state',
});

AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    persist: 'custom',
    persistAdapter: adapter,
    persistKey: 'profile:user-1',
});

// During application teardown, after mounted components have flushed:
const card = document.querySelector('profile-card');
await card.$props.$persistence.$flush();
adapter.close();
```

`databaseName` defaults to `alpine-component-loader`, `storeName` defaults to
`persistence`, and `indexedDBImpl` can supply an application/test-owned
`IDBFactory`. Supplying a factory is useful in controlled browser tests; the
adapter still uses the same asynchronous `getItem`/`setItem`/`removeItem`
contract.

A custom adapter may be synchronous or asynchronous and must implement `getItem`, `setItem`, and `removeItem`:

```js
const adapter = {
    async getItem(key) {
        return remoteStore.read(key);
    },
    async setItem(key, value) {
        await remoteStore.write(key, value);
    },
    async removeItem(key) {
        await remoteStore.remove(key);
    },
};
```

| Adapter member | Contract |
| --- | --- |
| `getItem(key)` | Return a JSON envelope string, decoded envelope, `null`, or a promise of one. |
| `setItem(key, value)` | Store the JSON envelope string synchronously or asynchronously. |
| `removeItem(key)` | Remove one key synchronously or asynchronously. |
| `close()` | Available on loader-created IndexedDB adapters for application-owned teardown. |

The shared adapter used by `persist: "indexeddb"` is loader-owned and remains open for reuse. Call `close()` only on an adapter created and owned by the application, after mounted components have flushed and released it.

Storage failures emit `acl:error` with code `ACL_PERSISTENCE_FAILED` and persistence context without exposing stored contents. Persistence values are never included in observability records, debugger exports, or SSR output.

For component lifecycle behavior see [Lifecycle, events, and dynamic components](lifecycle.md). For offline asset behavior see [Offline behavior](offline.md).
