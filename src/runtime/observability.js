// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const SENSITIVE_KEY = /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|body|payload|props|persist)/i;

const redactUrl = (value) => {
    // Remove sensitive query values while preserving useful URL identity
    try {
        const url = new URL(value, 'https://acl.invalid');
        if (url.origin === 'https://acl.invalid') return `${url.pathname}${url.search ? '?[redacted]' : ''}${url.hash}`;
        return `${url.origin}${url.pathname}${url.search ? '?[redacted]' : ''}${url.hash}`;
    } catch {
        return value;
    }
};

export const redactRuntimeDetail = (value, key = '', seen = new WeakSet()) => {
    // Recursively redact sensitive structured runtime detail
    if (SENSITIVE_KEY.test(key)) return '[redacted]';
    if (typeof value === 'string') return /url|source/i.test(key) ? redactUrl(value) : value;
    if (value == null || typeof value !== 'object') return value;
    if (value instanceof Error)
        return {
            name: value.name,
            message: value.message,
            code: value.code,
            phase: value.phase,
            status: value.status,
            retryable: value.retryable,
        };
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    if (Array.isArray(value))
        return value.slice(0, 50).map(
            // Transform the current item
            (item) => redactRuntimeDetail(item, key, seen),
        );
    return Object.fromEntries(
        Object.entries(value).map(
            // Transform the current item
            ([childKey, child]) => [childKey, redactRuntimeDetail(child, childKey, seen)],
        ),
    );
};

const emptyMetrics = () => {
    // Run the empty metrics operation
    return {
        startedAt: Date.now(),
        totals: {},
        durations: {},
        recent: [],
    };
};

export const createObservability = () => {
    // Create an isolated bounded observability reporter and metrics store
    let options = false,
        sequence = 0,
        metrics = emptyMetrics();
    const listeners = new Set();

    const configure = (value) => {
        // Normalize observability options or disable record retention
        options =
            value && typeof value === 'object'
                ? {
                      bufferSize: 200,
                      performanceMarks: false,
                      logger: undefined,
                      ...value,
                  }
                : false;
    };

    const notifyPerformance = (record) => {
        // Mirror correlated start and end records to the Performance API
        if (!options?.performanceMarks || typeof performance === 'undefined' || !record.requestId) return;
        const prefix = `acl:${record.requestId}`;
        // Guard the notify performance operation against runtime failures
        try {
            if (record.type.endsWith('start')) performance.mark(`${prefix}:start`);
            else if (record.type.endsWith('end')) {
                performance.mark(`${prefix}:end`);
                performance.measure(prefix, `${prefix}:start`, `${prefix}:end`);
                performance.clearMarks(`${prefix}:start`);
                performance.clearMarks(`${prefix}:end`);
            }
        } catch {
            // Keep performance instrumentation best effort
        }
    };

    const emit = (type, detail = {}, defaults = {}) => {
        // Emit one redacted record to metrics listeners and performance marks
        const safeDetail = redactRuntimeDetail(detail),
            record = {
                sequence: ++sequence,
                timestamp: Date.now(),
                type,
                severity: defaults.severity || (type === 'error' ? 'error' : 'info'),
                tagName: detail.tagName || defaults.tagName || null,
                phase: detail.phase || defaults.phase || null,
                requestId: detail.requestId || defaults.requestId || null,
                duration: Number.isFinite(detail.duration) ? detail.duration : null,
                status: detail.status ?? null,
                detail: safeDetail,
            };
        if (options) {
            metrics.totals[type] = (metrics.totals[type] || 0) + 1;
            if (record.duration != null) {
                const current = metrics.durations[type] || {
                    count: 0,
                    total: 0,
                    min: Infinity,
                    max: 0,
                    average: 0,
                };
                current.count++;
                current.total += record.duration;
                current.min = Math.min(current.min, record.duration);
                current.max = Math.max(current.max, record.duration);
                current.average = current.total / current.count;
                metrics.durations[type] = current;
            }
            metrics.recent.push(record);
            const limit = Math.max(0, Math.floor(Number(options.bufferSize) || 0));
            if (metrics.recent.length > limit) metrics.recent.splice(0, metrics.recent.length - limit);
            notifyPerformance(record);
        }
        listeners.forEach((listener) => {
            // Process the current item
            try {
                listener(record);
            } catch {
                // Isolate consumer observer failures
            }
        });
        return record;
    };

    const report = (level, message, error = null, context = {}) => {
        // Report one diagnostic through structured records and configured logging
        const record = emit(
                'diagnostic',
                {
                    ...context,
                    message,
                    error,
                },
                { severity: level },
            ),
            logger = options && Object.prototype.hasOwnProperty.call(options, 'logger') ? options.logger : undefined;
        if (logger === false) return record;
        // Guard the report operation against runtime failures
        try {
            if (typeof logger === 'function') logger(record);
            else if (logger?.[level]) logger[level](record);
            else console?.[level]?.(message, ...(error == null ? [] : [error]));
        } catch {
            // Keep reporting failures from affecting component execution
        }
        return record;
    };

    return {
        configure,
        emit,
        report,
        subscribe(listener) {
            // Register an isolated listener for structured runtime records
            if (typeof listener !== 'function') throw new TypeError('[ACL] subscribe() expects a listener function.');
            listeners.add(listener);
            return () => {
                // Remove the listener from future record delivery
                listeners.delete(listener);
            };
        },
        getMetrics() {
            // Return a redacted clone of the current metrics snapshot
            return redactRuntimeDetail(metrics);
        },
        clearMetrics() {
            // Reset counters durations and retained records
            metrics = emptyMetrics();
        },
    };
};
