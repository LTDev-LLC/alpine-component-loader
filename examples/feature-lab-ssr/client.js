import AlpineComponentLoader from '/dist/index.min.js';
import ACLDebugger from '/dist/debugger.min.js';
import ACLA11y from '/dist/a11y.min.js';
import ACLA11yScanner from '/dist/a11y-scanner.min.js';

Alpine.data('ssrLabHero', () => {
    // Create interactive state for the server-rendered hero
    return {
        title: 'Server-rendered Feature Lab',
        summary: '',
        mode: 'SSR',
        count: 0,

        init() {
            // Synchronize typed server props with the hydrated hero state
            const props = this.$props;
            this.title = props.title;
            this.summary = props.summary;
            this.mode = props.mode;
            this.count = Number(props.count);
        },

        increment() {
            // Update the public count prop through an Alpine interaction
            this.count++;
            this.$props.count = this.count;
        },
    };
});

Alpine.data('ssrLabData', () => {
    // Create state for the normal data request that follows hydration
    return {
        heading: 'Hydration data',
        message: 'Server fallback: the activity endpoint has not run yet',
        state: 'Available without JavaScript',

        init() {
            // Read component props and fetched data after the host hydrates
            const props = this.$props;
            this.heading = props.heading;
            this.message = props.$data?.message || this.message;
            this.state = props.$data?.state || this.state;
        },
    };
});

Alpine.data('ssrLabCounter', () => {
    // Create event-forwarding state for the hydrated counter
    return {
        label: 'Forwarded event',
        count: 0,

        init() {
            // Synchronize the typed label and count props
            const props = this.$props;
            this.label = props.label;
            this.count = Number(props.count);
        },

        increment() {
            // Advance the public prop and publish the internal event
            this.count++;
            const root = this.$el.getRootNode();
            this.$props.count = this.count;
            root.dispatchEvent(
                new CustomEvent('internal-increment', {
                    bubbles: true,
                    composed: false,
                    detail: {
                        count: this.count,
                    },
                }),
            );
        },
    };
});

Alpine.data('ssrShadowCard', () => {
    // Create typed Boolean prop state for the original Shadow DOM demo
    return {
        title: 'Shadow Component',
        active: false,

        init() {
            // Read the title and Boolean status from the hydrated host
            const props = this.$props;
            this.title = props.title;
            this.active = Boolean(props.active);
        },

        get status() {
            // Present the Boolean prop as readable component status
            return this.active ? 'Status: Active' : 'Status: Inactive';
        },
    };
});

Alpine.data('ssrStrictProgress', () => {
    // Create bounded presentation state for the numeric progress prop
    return {
        percent: 0,

        init() {
            // Read the required numeric prop after hydration
            this.percent = Number(this.$props.percent);
        },

        get progressStyle() {
            // Clamp the visual width while retaining the original prop value
            return `width: ${Math.max(0, Math.min(100, this.percent))}%`;
        },

        get progressLabel() {
            // Format the typed numeric value for the visible output
            return `${this.percent}%`;
        },
    };
});

Alpine.data('ssrLifecycleLog', () => {
    // Create a small lifecycle demonstration for a hydrated server host
    return {
        title: 'Lifecycle hydration',
        message: 'Server render complete · waiting for the browser lifecycle',

        init() {
            // Mark the point where Alpine initializes the adopted shadow tree
            this.title = this.$props.title;
            this.message = 'Hydrated in place · Alpine initTree complete';
        },

        updateTitle() {
            // Trigger a normal component prop update through its reflected attribute
            const host = this.$el.getRootNode().host;
            host.setAttribute('title', 'Lifecycle updated');
            this.title = this.$props.title;
            this.message = 'Updated hook path exercised after hydration';
        },
    };
});

Alpine.data('ssrCacheControl', () => {
    // Create controls for the request-aware component data cache
    return {
        busy: false,

        get count() {
            // Expose the current cache-backed request count
            return this.$props.payload?.count || 0;
        },

        get fetchedAt() {
            // Expose the latest request timestamp or its server fallback
            return this.$props.payload?.at || 'available after hydration';
        },

        async reload() {
            // Reload the component through its public helper
            this.busy = true;
            // Restore the control state whether the network request succeeds or fails
            try {
                await this.$props.$reload();
            } finally {
                this.busy = false;
            }
        },

        async clearCache() {
            // Clear only this component request key before reloading it
            this.busy = true;
            // Restore the control state whether cache clearing succeeds or fails
            try {
                await this.$props.$cache.clearData();
                await this.$props.$reload();
            } finally {
                this.busy = false;
            }
        },
    };
});

Alpine.data('ssrPolling', () => {
    // Create controls for polling that begins after hydration
    return {
        paused: false,

        get count() {
            // Read the latest polling request count
            return this.$props.payload?.count || 0;
        },

        get message() {
            // Format the manual state and most recent poll result
            if (this.paused) return `Paused manually · ${this.$props.payload?.at || 'waiting'}`;
            if (!this.$props.payload) return 'Starting poll after hydration';
            return `${this.$props.payload.state} · ${this.$props.payload.at}`;
        },

        get resumed() {
            // Disable resume while polling is already active
            return !this.paused;
        },

        pause() {
            // Pause future polling through the declarative host control
            this.paused = true;
            this.$el.getRootNode().host.setAttribute('data-fetch-poll', '0');
        },

        resume() {
            // Restore the manifest polling interval
            this.paused = false;
            this.$el.getRootNode().host.setAttribute('data-fetch-poll', '2000');
        },
    };
});

Alpine.data('ssrResponseMode', () => {
    // Create state for the JSON response decoding demo
    return {
        label: 'JSON response',

        init() {
            // Read the typed label from the component-scoped props
            this.label = this.$props.label;
        },

        get value() {
            // Show loading failure fallback and decoded response states
            if (this.$props.$loading) return 'decoding…';
            return this.$props.payload?.value || this.$props.$error?.message || 'waiting';
        },
    };
});

Alpine.data('ssrMappedEvent', () => {
    // Create the internal source event for the mapped forwarding demo
    return {
        dispatchSave() {
            // Dispatch a non-composed internal event for the loader to rename
            this.$el.getRootNode().dispatchEvent(
                new CustomEvent('internal-save', {
                    bubbles: true,
                    composed: false,
                    detail: {
                        message: 'Received public-save from mapped event',
                    },
                }),
            );
        },
    };
});

Alpine.data('ssrStoreDisplay', () => {
    // Create controls around the loader-bound Alpine store props
    return {
        get mode() {
            // Read the shared store mode for both component instances
            return this.$props.mode || 'Light';
        },

        toggle() {
            // Update the shared mode through the component store binding
            this.$props.mode = this.$props.mode === 'Light' ? 'Dark' : 'Light';
        },
    };
});

Alpine.data('ssrPersistentNote', () => {
    // Create controls for restored and persisted component props
    return {
        status: 'Changes save automatically after hydration',

        increment() {
            // Update a persisted numeric prop
            this.$props.count = Number(this.$props.count || 0) + 1;
        },

        async flush() {
            // Flush the component persistence queue immediately
            const pending = this.$props.$persistence.$save();
            await this.$props.$persistence.$flush();
            await pending;
            this.status = `Flushed ${this.$props.storage}`;
        },

        async clear() {
            // Remove only this component persistence record
            await this.$props.$persistence.$clear();
            this.status = `Cleared ${this.$props.storage} record`;
        },
    };
});

Alpine.data('ssrAdvancedProps', () => {
    // Create readable state for complex serialized prop values
    return {
        get mode() {
            // Read the current mode prop
            return this.$props.mode || 'comfortable';
        },

        get scoreLabel() {
            // Format the numeric score and its reflected attribute
            const host = this.$el.getRootNode().host;
            return `${this.$props.score}% (attribute: ${host.getAttribute('score')})`;
        },

        get captionLabel() {
            // Distinguish an allowed null from ordinary text
            return this.$props.caption == null ? 'null (allowed)' : this.$props.caption;
        },

        get tagsLabel() {
            // Serialize the array prop for inspection
            return JSON.stringify(this.$props.tags || []);
        },

        get profileLabel() {
            // Serialize the object prop for inspection
            return JSON.stringify(this.$props.profile || {});
        },
    };
});

Alpine.store('theme', {
    mode: 'Light',
    color: '#2563eb',
});

const runtimeRecords = [],
    stopSubscription = AlpineComponentLoader.subscribe(
        // Retain a bounded page-local view of structured records
        (record) => {
            runtimeRecords.push(record);
            runtimeRecords.splice(100);
        },
    );

AlpineComponentLoader.config({
    observability: {
        bufferSize: 100,
        performanceMarks: true,
        logger: false,
    },
});

ACLDebugger.inject(AlpineComponentLoader);
const accessibilityObserver = ACLA11y.observe(AlpineComponentLoader),
    accessibilityScanner = ACLA11yScanner.mount({
        button: {
            companionSelector: '.debug-toggle',
        },
    });

window.AlpineComponentLoader = AlpineComponentLoader;
window.ACLDebugger = ACLDebugger;
window.ACLA11y = ACLA11y;
window.__aclAccessibilityObserver = accessibilityObserver;
window.__aclAccessibilityScanner = accessibilityScanner;

const eventOutput = document.getElementById('event-output'),
    counter = document.getElementById('event-counter'),
    mappedEvent = document.getElementById('mapped-event-card'),
    advancedProps = document.getElementById('advanced-props');

counter.addEventListener('lab-increment', (event) => {
    // Present the forwarded counter event detail
    eventOutput.value = `lab-increment detail: ${JSON.stringify(event.detail)}`;
    eventOutput.textContent = eventOutput.value;
});

mappedEvent.addEventListener('public-save', (event) => {
    // Present the renamed event detail from the mapped event component
    eventOutput.value = event.detail.message;
    eventOutput.textContent = eventOutput.value;
});

document.querySelectorAll('.debug-toggle').forEach((button) => {
    // Connect every lab debugger control to the injected entry
    button.addEventListener('click', () => {
        // Toggle the floating debugger panel
        AlpineComponentLoader.toggleDebug();
    });
});

// Bind both page-level accessibility scanner buttons
for (const id of ['overview-a11y-toggle', 'section-a11y-toggle']) {
    // Connect explicit scanner controls in addition to its floating toggle
    document.getElementById(id).addEventListener('click', () => {
        // Open and run the lazy accessibility scanner interface
        accessibilityScanner.open();
    });
}

document.getElementById('focused-a11y-audit').addEventListener('click', async () => {
    // Audit only the intentional accessibility fixture and print its findings
    const element = document.querySelector('a11y-issues-demo'),
        result = await accessibilityObserver.audit(element);
    document.getElementById('accessibility-output').textContent = JSON.stringify(
        {
            component: element.localName,
            duration: Number(result.duration.toFixed(2)),
            violations: result.violations,
        },
        null,
        2,
    );
});

document.getElementById('advanced-score-update').addEventListener('click', () => {
    // Update and reflect the advanced numeric prop
    advancedProps.score = 88;
});

document.getElementById('advanced-mode-toggle').addEventListener('click', () => {
    // Toggle the reflected advanced mode property
    advancedProps.mode = advancedProps.mode === 'compact' ? 'comfortable' : 'compact';
});

document.getElementById('feature-jump').addEventListener('change', (event) => {
    // Navigate to the selected feature section
    if (event.target.value) location.hash = event.target.value;
});

document.getElementById('expand-usage').addEventListener('click', () => {
    // Expand every usage panel in the lab
    document.querySelectorAll('main section details').forEach((details) => {
        // Open the current details element
        details.open = true;
    });
});

document.getElementById('collapse-usage').addEventListener('click', () => {
    // Collapse every usage panel in the lab
    document.querySelectorAll('main section details').forEach((details) => {
        // Close the current details element
        details.open = false;
    });
});

// Wait until one component reaches a terminal initial lifecycle state
const waitForSettlement = (element) => {
    if (element._state === 'ready' || element._state === 'error') return Promise.resolve();
    return new Promise((resolve) => {
        // Remove both terminal listeners after the first one fires
        const finish = () => {
            element.removeEventListener('loaded', finish);
            element.removeEventListener('acl:error', finish);
            resolve();
        };
        element.addEventListener('loaded', finish, {
            once: true,
        });
        element.addEventListener('acl:error', finish, {
            once: true,
        });
    });
};

const manifest = await fetch('/acl-manifest.json').then(
        // Decode the version-one component manifest
        (response) => response.json(),
    ),
    serverComponents = [...document.querySelectorAll('[data-acl-ssr]')];

await AlpineComponentLoader.registerManifest(manifest);
await AlpineComponentLoader.start();
await Promise.all(serverComponents.map(waitForSettlement));
await new Promise(
    // Allow nested Alpine effects and hydration records to settle
    (resolve) =>
        requestAnimationFrame(
            // Wait through a second rendering frame
            () => requestAnimationFrame(resolve),
        ),
);

// Refresh the redacted observability and debugger snapshot output
const renderDiagnostics = () => {
    const hydrated = document.querySelectorAll('[data-acl-hydrated]').length,
        templateRequests = performance.getEntriesByType('resource').filter(
            // Select component template resource requests
            (entry) => entry.name.includes('/components/'),
        ),
        metrics = AlpineComponentLoader.getMetrics(),
        snapshot = ACLDebugger.getSnapshot(AlpineComponentLoader),
        fallback = counter.hasAttribute('data-acl-hydrated') ? 'off' : 'revision mismatch recovered';

    document.getElementById('hydrated-count').textContent = String(hydrated);
    document.getElementById('template-request-count').textContent = String(templateRequests.length);
    document.getElementById('overview-template-count').textContent = String(templateRequests.length);
    document.getElementById('record-count').textContent = String(metrics.recent.length);
    document.getElementById('fallback-mode').textContent = fallback;
    document.getElementById('observability-output').textContent = JSON.stringify(
        {
            totals: metrics.totals,
            registeredTags: snapshot.registeredTags.length,
            renderedComponents: snapshot.components.length,
            timelineEntries: snapshot.timeline?.length || 0,
            recentHydration: metrics.recent
                .filter(
                    // Select hydration records for the compact page output
                    (record) => record.type.startsWith('hydration'),
                )
                .map(
                    // Retain only nonsensitive hydration record fields
                    (record) => ({
                        sequence: record.sequence,
                        type: record.type,
                        tagName: record.tagName,
                        duration: record.duration,
                    }),
                ),
        },
        null,
        2,
    );
    document.getElementById('hydration-status').textContent =
        fallback === 'off'
            ? `Hydrated ${hydrated} components in place · no template fetches`
            : `Hydrated ${hydrated} components · recovered one revision mismatch`;
};

document.getElementById('refresh-diagnostics').addEventListener('click', () => {
    // Refresh the current diagnostic output
    renderDiagnostics();
});

document.getElementById('clear-observability').addEventListener('click', () => {
    // Clear local metrics before rendering their empty snapshot
    AlpineComponentLoader.clearMetrics();
    runtimeRecords.length = 0;
    renderDiagnostics();
});

renderDiagnostics();
document.getElementById('loader-version').textContent = AlpineComponentLoader.version;
document.getElementById('feature-count').textContent = String(
    document.querySelectorAll('main > section:not(.lab-overview)').length,
);
document.getElementById('registered-count').textContent = String(AlpineComponentLoader.getRegisteredTags().length);
document.documentElement.dataset.aclReady = 'true';
window.addEventListener('pagehide', stopSubscription, {
    once: true,
});
