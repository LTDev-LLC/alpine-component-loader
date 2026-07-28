# Observability

ACL observability is local, bounded, and opt-in. It records structured lifecycle and diagnostic activity in memory, can expose correlated Performance API measures, and can forward diagnostics to an application logger. The core includes no transport, upload, analytics, or telemetry dependency. A separate dependency-free exporter entry is available when the application explicitly connects one.

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

Subscribers receive records even when retained metrics are disabled. Enabling `observability` controls counters, durations, recent-record retention, performance marks, and logger selection.

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

Runtime event records include loads, hydration, prefetch, cache/revalidation, and errors. Internal warnings and errors are emitted as `diagnostic` records.

## Inspect metrics

`getMetrics()` returns a redacted clone, so callers cannot mutate retained state:

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

The snapshot contains `startedAt`, event `totals`, aggregate `durations`, and
the bounded `recent` records. Only records with finite durations contribute to
duration aggregates. `bufferSize` bounds `recent`; counters and duration
aggregates remain available even when the recent buffer is small or zero.

Reset retained metrics without disconnecting subscribers:

```js
AlpineComponentLoader.clearMetrics();
```

The new snapshot receives a fresh `startedAt`, empty totals/durations, and an empty recent list. Sequence numbers remain monotonic so external consumers can still identify ordering.

## Logging

When no custom logger is configured, ACL diagnostics continue to use the matching console method. Set `logger: false` to suppress console diagnostics while retaining records:

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

Subscriber and logger exceptions are isolated. A monitoring integration cannot make a component load fail, and a failing listener does not prevent other listeners from receiving the record.

The observability `logger` may be `false`, one function, or an object with
optional `debug`, `info`, `warn`, and `error` methods. Object methods receive
only records matching their normalized severity.

## Optional batching and vendor adapters

Import exporters separately so no transport or vendor SDK enters the core browser graph:

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

`createBatchExporter()` accepts an application `send(records)` function and
these queue controls:

| Option | Default | Contract |
| --- | --- | --- |
| `batchSize` | `20` | Positive records per delivery attempt. |
| `flushInterval` | `5000` | Non-negative timer interval in milliseconds; `0` disables timed flushing. |
| `maxQueue` | `200` | Positive retained-record bound; oldest queued records are dropped first. |
| `retries` | `2` | Non-negative retries after a failed send. |
| `retryDelay` | `250` | Initial exponential retry delay in milliseconds. |
| `target` | `globalThis` | Optional `EventTarget` that owns the `pagehide` flush listener. |

`createBeaconExporter()` uses `sendBeacon` on page hide when possible and falls
back to fetch with `keepalive`. `flush()` drains queued batches; `dispose()`
removes listeners and performs a final best-effort delivery.

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

When the queue reaches `maxQueue`, it remains bounded rather than retaining unlimited runtime history. Failed sends follow only the configured retry policy; exporter errors never propagate into component lifecycle work.

Vendor adapters require caller-owned clients and add no SDK dependency:

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

The OpenTelemetry adapter uses duck-typed tracer, meter, and logger objects. The Sentry adapter maps errors to captured messages and other records to breadcrumbs. Every adapter call is isolated from component execution. Exporters receive the same already-redacted records delivered by `subscribe()`.

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

Measures use the runtime request ID so component work can be compared with application performance entries. Start/end marks are cleared after measurement. Performance instrumentation is best effort and does not interrupt loading if the platform rejects a mark or measure.

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

Fetched payloads, prop values, persistence data, raw headers, and request bodies are not retained. Application logger code should preserve that boundary and avoid joining records with sensitive state from elsewhere.

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

Use DOM events for UI behavior and subscriptions/metrics for local diagnostics. Component lifecycle events may also originate on the component and bubble through the document.

## Debugger integration

The optional debugger consumes loader state and structured activity to present a timeline and snapshots:

```js
import ACLDebugger from 'alpine-component-loader/debugger';

ACLDebugger.inject(AlpineComponentLoader);
await AlpineComponentLoader.toggleDebug();
```

Debugger exports apply an additional recursive redaction pass. They can include recent timeline and request activity, but never raw fetched or persisted application values.

Use the debugger for interactive diagnosis and `getMetrics()` for application-owned local summaries. Neither sends data anywhere automatically.

## Operational guidance

- Use a finite `bufferSize` appropriate to the expected session length.
- Prefer subscribers for temporary diagnostic tools and always unsubscribe.
- Enable performance marks only when profiling to reduce Performance Timeline noise.
- Treat custom loggers as application code: bound their own buffers and transports.
- Clear metrics between repeatable performance scenarios.
- Do not use local metrics as a source of billing, security audit, or guaranteed delivery data.

For interactive inspection see [Accessibility and debugging](accessibility-and-debugging.md). For errors and cache remedies see [API reference and troubleshooting](api.md).
