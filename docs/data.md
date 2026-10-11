# Data, caching, polling, and persistence

Lifecycle-owned data requests support parsing, cancellation, retries, polling, sharing, caches, and persisted state.

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

`params` adds queries; `keys` reads props/context. Both accept objects or async functions. `options` supplies
`RequestInit`, overridden by dedicated `method`/`body` settings.

## Declarative request settings

Definition attributes set defaults; host attributes override individual instances:

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

Both declaration markers accept the serializable controls below.

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

JSON attributes require strict JSON. Invalid numeric/enum attributes fall back and emit diagnostics.

Request-attribute changes cancel stale work. Explicit controls are `cancel()`, `retry()`, and `reload()`.

## Data option reference

Programmatic options live under `data`. Attributes apply to templates/hosts, except `data-fetch-options`, which is
definition-only on either template marker or `<acl-component>`.

| JavaScript option         | Declarative attribute                                              | Default       | Validation and behavior                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `data.src`                | `data-src`                                                         | `null`        | Request URL; no request runs when absent.                                                                                                 |
| `data.keys`               | `data-fetch-keys`                                                  | `null`        | Object/async function replacing every matching `:name` segment; attribute is strict JSON.                                                 |
| `data.params`             | `data-fetch-params`                                                | `null`        | Object/async function appended as query parameters; attribute is strict JSON.                                                             |
| `data.options`            | `data-fetch-options` on definition templates and `<acl-component>` | `null`        | Base `RequestInit`; it is definition-only and is not read from registered component hosts. Programmatic headers merge case-insensitively. |
| `data.method`             | `data-method`                                                      | `null`        | HTTP method; effective default is `GET`.                                                                                                  |
| `data.body`               | `data-body`                                                        | `null`        | Body value; object/array bodies are JSON encoded.                                                                                         |
| `data.target`             | `data-target`                                                      | `$data`       | Direct `$props` key receiving the parsed response.                                                                                        |
| `data.poll`               | `data-fetch-poll`                                                  | `null`        | Non-negative polling interval in milliseconds.                                                                                            |
| `data.timeout`            | `data-fetch-timeout`                                               | `30000`       | Non-negative setting; a non-positive runtime value uses the 30-second fallback.                                                           |
| `data.retries`            | `data-retries`                                                     | `0`           | Non-negative retry count after the first attempt.                                                                                         |
| `data.retryDelay`         | `data-retry-delay`                                                 | `250`         | Non-negative initial exponential-backoff delay.                                                                                           |
| `data.retryMaxDelay`      | `data-retry-max-delay`                                             | `30000`       | Non-negative maximum backoff, never lower than the initial delay.                                                                         |
| `data.retryJitter`        | `data-retry-jitter`                                                | `0.2`         | Random delay variation constrained to 0 through 1.                                                                                        |
| `data.retryUnsafeMethods` | `data-retry-unsafe-methods`                                        | `false`       | Permit normally unsafe methods to retry.                                                                                                  |
| `data.responseType`       | `data-response-type`                                               | `json`        | `json`, `text`, `blob`, `arrayBuffer`, `stream`, or `auto`.                                                                               |
| `data.parser`             | JavaScript only                                                    | `null`        | Custom sync/async `Response` parser.                                                                                                      |
| `data.cacheStrategy`      | `data-cache-strategy`                                              | `cache-first` | `cache-first`, `network-first`, `stale-while-revalidate`, or `no-store`.                                                                  |
| `data.cacheTtl`           | `data-fetch-cache-ttl`                                             | `300000`      | Non-negative settled-entry lifetime; 0 retains only in-flight sharing.                                                                    |
| `data.cacheMax`           | `data-fetch-cache-max`                                             | `100`         | Non-negative bound for settled shared entries.                                                                                            |
| `data.cacheKey`           | `data-cache-key`                                                   | `null`        | Explicit string or async function used in request identity.                                                                               |
| `data.pauseWhenHidden`    | `pause-polling-when-hidden`                                        | `true`        | Pause polls while the document is hidden.                                                                                                 |
| `data.pauseWhenOffline`   | `pause-polling-when-offline`                                       | `true`        | Pause polls while `navigator.onLine` is false.                                                                                            |
| `data.pauseWhenOffscreen` | `pause-polling-when-offscreen`                                     | `false`       | Pause polls while the host is outside the viewport.                                                                                       |

Invalid programmatic numbers throw during `config()`/`define()`. Invalid declarative numbers/enums use configured
defaults with diagnostics. Boolean `false`/`0` opts out.

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

`target` defaults to `$data` and assigns one direct `$props` key. Dotted paths are not expanded; targets do not affect
cache identity.

`data-target="profile"` writes `$props.profile`; responses are never spread into props. Instance changes leave other
definitions/hosts unchanged.

Response modes are `json`, `text`, `blob`, `arrayBuffer`, `stream`, and `auto`. A custom parser receives the `Response`
and component context:

```js
data: {
    src: '/api/profile.csv',
    parser: async response => (await response.text()).split('\n'),
    cacheKey: 'profile-csv-v1',
}
```

Binary and streaming request bodies bypass shared response caching unless an explicit `cacheKey` is supplied.

## URL, request body, and response handling

`keys` replaces every matching `:key` segment and URL-encodes the value. `params` preserves an existing query, repeats
array keys, and uses bracketed names for nested objects:

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

Objects/arrays become JSON with a default JSON content type. Strings, URLSearchParams, FormData, Blob, and ArrayBuffer
pass through. GET/HEAD omit bodies.

| Response mode | Result                                                                               |
| ------------- | ------------------------------------------------------------------------------------ |
| `json`        | Requires `application/json` or a `+json` content type, then calls `response.json()`. |
| `text`        | Calls `response.text()`.                                                             |
| `blob`        | Calls `response.blob()`.                                                             |
| `arrayBuffer` | Calls `response.arrayBuffer()`.                                                      |
| `stream`      | Returns `response.body` and disables retained sharing.                               |
| `auto`        | Chooses JSON, text/XML/JavaScript, or Blob from the content type.                    |

Parser, dynamic builders, and fetch hooks receive `el`/`$el`, `props`/`$props`, and `root`/`$root`. Parsers take
`(response, context)`; `beforeFetch` may replace RequestInit. `afterFetch` runs per consumer, allowing distinct
transformations of shared responses.

## Cancellation, retries, and timeouts

Reload, disconnect, superseding attributes, and `cancel()` abort owned work and block stale updates.

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

GET, HEAD, OPTIONS, PUT, and DELETE retry by default; other methods need `retryUnsafeMethods: true` and an idempotent
endpoint/key. Retryable statuses are 408, 425, 429, 500, 502, 503, and 504. Delays use backoff, bounded jitter, and
`Retry-After`.

Each subscriber owns cancellation; the network request continues while another needs it. Changes, timeouts, teardown,
and cancellation prevent stale assignment.

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

Request identity includes URL, method, headers, body, parser/response mode, and explicit key, but excludes target.

Strings, URLSearchParams, and string-only FormData can share responses. Files, binary values, typed arrays, and streams
bypass sharing unless `data.cacheKey` defines identity. Consumers receive cloned cached values.

`cacheTemplates` uses browser Cache API buckets by namespace/version. `templateRevision` identifies content; TTL
controls freshness and max bounds expiry-first/LRU pruning. Stored new revisions replace older ones.

Cache clears and quota recovery invalidate metadata; later inspection/pruning rebuilds it from Cache API.

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

Use `cancel()` or reload when cache invalidation must also stop component-owned work.

Inspection exposes redacted request/source/revision, freshness, strategy, pending/subscriber metadata, and recent load
outcomes—not response or template bodies.

`clearDataCache()` invalidates future consumption and may abort unshared pending work. `clearTemplate()` removes source
revisions; `pruneTemplateCache()` enforces limits. `clearTemplateCaches()` clears namespaces; `pruneCaches()` removes
obsolete version buckets.

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

Polling pauses when hidden/offline by default; offscreen pausing is opt-in. Boolean `false`/`0` disables a pause.
Reload/disconnect/teardown releases timers and subscriptions.

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

| `persist` value                 | Adapter                                                                   |
| ------------------------------- | ------------------------------------------------------------------------- |
| `local`                         | `window.localStorage`.                                                    |
| `session`                       | `window.sessionStorage`.                                                  |
| `indexeddb`                     | Shared IndexedDB database `alpine-component-loader`, store `persistence`. |
| `custom` or another truthy name | The configured `persistAdapter`, otherwise session storage.               |

Host controls are `persist`, `persist-key`, `persist-debounce`, and `persist-version`. Default keys use
`acl:<tag-name>:<id-or-default>`; repeated instances need unique IDs/keys.

Snapshots include serializable public props, excluding `$` names and functions. Restore precedes Alpine initialization;
effects queue debounced saves.

Records require positive-version `{ version, data }` envelopes. Older versions need `persistMigrate`; invalid/future
records are rejected.

Migration receives `fromVersion`, `toVersion`, `key`, and `component`, returning a value or promise. Failure emits
`ACL_PERSISTENCE_FAILED` without partial restoration.

Persistence helpers are asynchronous:

```js
await card.$props.$persistence.$save({ expanded: true });
const expanded = await card.$props.$persistence.$get('expanded', false);
await card.$props.$persistence.$flush();
await card.$props.$persistence.$clear();
```

| Helper                  | Behavior                                                                     |
| ----------------------- | ---------------------------------------------------------------------------- |
| `$key`                  | Resolved storage key.                                                        |
| `$save()`               | Queue a flush-time snapshot of current public props.                         |
| `$save(value)`          | Queue an explicit serializable value.                                        |
| `$get()`                | Read, validate, migrate, and return the complete stored data value.          |
| `$get(field, fallback)` | Read one own field and preserve falsy values such as `false`, `0`, and `""`. |
| `$flush()`              | Commit pending debounced work immediately and await serialized prior writes. |
| `$clear()`              | Remove only this storage key; current in-memory props are unchanged.         |

Alpine effects save changes; `pagehide` attempts a flush. For same-handler mutations before navigation, call `$save()`,
then await `$flush()` and the save promise.

## IndexedDB and custom adapters

Create an application-owned IndexedDB adapter for custom databases or explicit closing:

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

Defaults: `databaseName` is `'alpine-component-loader'`; `storeName` is `'persistence'`. `indexedDBImpl` injects an
IDBFactory for apps/tests. Storage methods remain asynchronous.

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

| Adapter member        | Contract                                                                       |
| --------------------- | ------------------------------------------------------------------------------ |
| `getItem(key)`        | Return a JSON envelope string, decoded envelope, `null`, or a promise of one.  |
| `setItem(key, value)` | Store the JSON envelope string synchronously or asynchronously.                |
| `removeItem(key)`     | Remove one key synchronously or asynchronously.                                |
| `close()`             | Available on loader-created IndexedDB adapters for application-owned teardown. |

The built-in IndexedDB adapter stays open for loader reuse. Close application-owned adapters only after components flush
and release them.

Storage failures emit `ACL_PERSISTENCE_FAILED` through `acl:error`. Stored contents stay out of errors, observability,
debugger exports, and SSR.

See [lifecycle](lifecycle.md) and [offline assets](offline.md).
