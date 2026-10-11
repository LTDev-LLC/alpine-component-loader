# Observability

Observability is opt-in and local: bounded in-memory records, optional Performance API measures, and application
logging. Transport is available through a separate dependency-free exporter.

## Quick start

Enable bounded retention before registering components:

```js
AlpineComponentLoader.config({
    observability: {
        bufferSize: 200,
        performanceMarks: false,
        logger: false,
    },
});
```

Subscribe to live records and release the subscription during teardown:

```js
const unsubscribe = AlpineComponentLoader.subscribe(record => {
    if (record.severity === 'error') {
        console.error(record.type, record.phase, record.detail);
    }
});

// Later:
unsubscribe();
```

Subscriptions receive records even without retention. `observability` controls counters, durations, recent records,
performance marks, and logging.

## Record shape

Each record contains:

```js
{
    sequence: 17,
    timestamp: 1760000000000,
    type: 'loadend',
    severity: 'info',
    tagName: 'profile-card',
    phase: 'component',
    requestId: 'profile-card:component:1',
    duration: 23.4,
    status: null,
    detail: { /* redacted event-specific data */ },
}
```

- `sequence` is monotonic for the current loader process.
- `timestamp` is wall-clock milliseconds.
- `type`, `phase`, `severity`, and nullable `tagName` describe the operation.
- `requestId` correlates start/end work when available.
- `duration` and `status` are normalized top-level values when supplied.
- `detail` contains the remaining redacted context.

Records cover loading, hydration, prefetch, cache/revalidation, and errors. Internal warnings/errors use `diagnostic`
records.

## Inspect metrics

`getMetrics()` returns a redacted clone of retained state:

```js
const snapshot = AlpineComponentLoader.getMetrics();

console.table(snapshot.totals);
console.table(snapshot.durations);
console.table(snapshot.recent.slice(-10));
```

The shape is:

```js
{
    startedAt,
    totals: { loadstart: 4, loadend: 4 },
    durations: {
        loadend: { count: 4, total: 80, min: 12, max: 31, average: 20 },
    },
    recent: [],
}
```

Snapshots include `startedAt`, `totals`, `durations`, and `recent`. Only finite durations are aggregated. `bufferSize`
bounds recent records without limiting counters or aggregates.

Reset retained metrics without disconnecting subscribers:

```js
AlpineComponentLoader.clearMetrics();
```

Resetting clears totals, durations, and recent records and refreshes `startedAt`. Sequence numbers remain monotonic.

## Logging

Diagnostics default to matching console methods. `logger: false` suppresses console output while retaining records:

```js
AlpineComponentLoader.config({
    observability: {
        bufferSize: 100,
        logger: false,
    },
});
```

Supply a function to receive every diagnostic record:

```js
AlpineComponentLoader.config({
    observability: {
        logger(record) {
            applicationLog.write({
                level: record.severity,
                message: record.detail.message,
                component: record.tagName,
                error: record.detail.error,
            });
        },
    },
});
```

Or provide level methods:

```js
AlpineComponentLoader.config({
    observability: {
        logger: {
            debug: record => applicationLog.debug(record),
            info: record => applicationLog.info(record),
            warn: record => applicationLog.warn(record),
            error: record => applicationLog.error(record),
        },
    },
});
```

Subscriber and logger exceptions cannot fail component loads or block other listeners.

`logger` accepts `false`, a function, or an object with optional `debug`, `info`, `warn`, and `error` methods. Level
methods receive matching severities only.

## Optional batching and vendor adapters

Import exporters separately to add transport:

```js
import {
    connectExporter,
    createBeaconExporter,
} from 'alpine-component-loader/observability-exporters';

const exporter = createBeaconExporter({
    url: '/telemetry/acl',
    batchSize: 20,
    flushInterval: 5000,
    maxQueue: 200,
    retries: 2,
});

const connection = connectExporter(AlpineComponentLoader, exporter);

// Route/application teardown:
await connection.dispose();
```

`createBatchExporter()` accepts an application `send(records)` function and these queue controls:

| Option          | Default      | Contract                                                                  |
| --------------- | ------------ | ------------------------------------------------------------------------- |
| `batchSize`     | `20`         | Positive records per delivery attempt.                                    |
| `flushInterval` | `5000`       | Non-negative timer interval in milliseconds; `0` disables timed flushing. |
| `maxQueue`      | `200`        | Positive retained-record bound; oldest queued records are dropped first.  |
| `retries`       | `2`          | Non-negative retries after a failed send.                                 |
| `retryDelay`    | `250`        | Initial exponential retry delay in milliseconds.                          |
| `target`        | `globalThis` | Optional `EventTarget` that owns the `pagehide` flush listener.           |

`createBeaconExporter()` uses `sendBeacon` on page hide, falling back to keepalive fetch. `flush()` drains batches;
`dispose()` removes listeners and attempts final delivery.

Use the generic queue when the application already owns a transport:

```js
import {
    connectExporter,
    createBatchExporter,
} from 'alpine-component-loader/observability-exporters';

const exporter = createBatchExporter({
    batchSize: 50,
    flushInterval: 10_000,
    maxQueue: 500,
    retries: 3,
    retryDelay: 250,
    async send(records) {
        await applicationTelemetry.writeBatch(records);
    },
});

const connection = connectExporter(AlpineComponentLoader, exporter);
await connection.flush();
```

`maxQueue` bounds retained records. Failed sends follow the configured retry policy; exporter errors stay isolated from
component work.

Vendor adapters use caller-owned clients without adding SDK dependencies:

```js
import {
    createOpenTelemetryExporter,
    createSentryExporter,
} from 'alpine-component-loader/observability-exporters';

const otel = createOpenTelemetryExporter({ tracer, meter, logger });
const sentry = createSentryExporter({ client: Sentry });

const otelConnection = connectExporter(AlpineComponentLoader, otel);
const sentryConnection = connectExporter(AlpineComponentLoader, sentry);
```

OpenTelemetry accepts tracer, meter, and logger objects. Sentry captures errors as messages and other records as
breadcrumbs. Calls are isolated from component work and receive the same redacted records as `subscribe()`.

## Performance measures

Enable `performanceMarks` to mirror correlated start/end records into the Performance API:

```js
AlpineComponentLoader.config({
    observability: {
        bufferSize: 200,
        performanceMarks: true,
    },
});

const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntriesByType('measure')) {
        if (entry.name.startsWith('acl:')) console.log(entry.name, entry.duration);
    }
});

observer.observe({ type: 'measure', buffered: true });
```

Request IDs correlate measures with application entries. Marks are cleared after measurement. Unsupported or rejected
instrumentation does not interrupt loading.

Disconnect application observers when no longer needed:

```js
observer.disconnect();
```

## Redaction guarantees

Structured detail is recursively redacted before storage, subscription, or logging:

- Credential-like keys such as authorization, cookie, password, secret, token, and API key are replaced.
- Request bodies, payloads, props, and persistence fields are replaced.
- URL and source query values are removed while retaining useful origin/path identity.
- Errors are reduced to name, message, code, phase, status, and retryability.
- Arrays are bounded and circular references are replaced.

Payloads, props, persistence, raw headers, and request bodies are excluded. Application loggers should avoid attaching
sensitive state.

## DOM events versus observability records

Many runtime operations emit both a document event and an observability record:

```js
document.addEventListener('acl:prefetchskip', event => {
    updateNetworkHint(event.detail.reason);
});

const unsubscribe = AlpineComponentLoader.subscribe(record => {
    if (record.type === 'prefetchskip') aggregatePrefetchSkip(record.detail.reason);
});
```

Use DOM events for UI behavior and subscriptions/metrics for diagnostics. Component events may bubble through the
document.

## Debugger integration

The optional debugger displays loader state, activity, and snapshots:

```js
import ACLDebugger from 'alpine-component-loader/debugger';

ACLDebugger.inject(AlpineComponentLoader);
await AlpineComponentLoader.toggleDebug();
```

Debugger exports apply additional redaction to timeline and request activity; raw fetched or persisted values are
excluded.

Use the debugger for interactive inspection and `getMetrics()` for local summaries. Neither sends data automatically.

## Operational guidance

- Bound `bufferSize` and application logger buffers.
- Unsubscribe temporary tools after use.
- Enable performance marks when profiling.
- Clear metrics between repeatable scenarios.
- Local metrics do not guarantee delivery or serve as billing/security audit data.

For interactive inspection see [Accessibility and debugging](accessibility-and-debugging.md). For errors and cache
remedies see [API reference and troubleshooting](api.md).
