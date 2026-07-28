# Lifecycle, events, and dynamic components

Each component owns its template, data, assets, Alpine tree, timers, observers, persistence effects, event forwarding, and hook cleanups. New work supersedes stale work, and teardown releases resources once.

## Lifecycle states

A host moves through these internal states:

```text
idle → deferred/loading → ready → deactivated → destroyed
```

`loading="lazy"` defers work until intersection, while `loading="idle"` schedules it for idle time. Loading and deferred hosts expose `aria-busy="true"`; ready, deactivated, and destroyed hosts do not.

## Progressive SSR hydration

Progressive hydration applies only when the host contains valid server-rendered markup and its `data-acl-revision` exactly matches the registered definition. Client-only components and stale SSR hosts continue through the ordinary `loading` pipeline.

```js
await AlpineComponentLoader.define('account-card', '/components/account-card.html', {
    shadow: true,
    templateRevision: 'sha256-…',
    hydrate: 'interaction',
});
```

The server may override a manifest default for one render:

```js
const html = await renderer.render('account-card', {
    props: { accountId: 'acct-7' },
    hydrate: 'media',
    hydrateMedia: '(min-width: 64rem)',
});
```

| `hydrate` mode | Trigger |
| --- | --- |
| `eager` | Hydrate immediately. |
| `visible` | First intersection with a `100px` root margin. |
| `idle` | `requestIdleCallback` with a bounded timeout fallback. |
| `interaction` | First pointer hover, touch start, or focus entry; the event is not replayed. |
| `media` | First match of `hydrateMedia` or the host `hydrate-media` attribute. |

The host exposes `data-acl-hydration-state="deferred|hydrating|hydrated|error"`. Observers, media listeners, interaction listeners, and idle callbacks are released after hydration, disconnect, reload, or disposal.

Listen for public events rather than depending on private state:

```js
const card = document.querySelector('profile-card');

card.addEventListener('acl:loadstart', event => {
    console.log('Started', event.detail.requestId);
});

card.addEventListener('acl:loadend', event => {
    console.log('Finished', event.detail.duration);
});

card.addEventListener('acl:error', event => {
    console.error(event.detail.phase, event.detail.error);
});
```

Component-emitted ACL events bubble and are composed, so an application can observe them at a stable ancestor. Their shared detail includes the component, tag name, current props, and timestamp, plus event-specific fields. Loader-wide events such as adaptive prefetch are dispatched directly on `document` with feature-specific detail.

## Hooks and owned cleanup

Component hooks are `beforeMount`, `mounted`, `loaded`, `updated`, `activated`, `deactivated`, and `unmounted`. Data hooks are `beforeFetch` and `afterFetch`. Development state preservation uses `captureState` and `restoreState`.

| Hook | Runs when |
| --- | --- |
| `beforeMount` | A load generation begins, before loading UI and resource work. |
| `mounted` | Template rendering and Alpine initialization have completed. |
| `loaded` | `mounted` has completed and the component is fully ready. |
| `updated` | An observed prop or data-control attribute changes after readiness. |
| `deactivated` | A retained component is detached and its pausable resources stop. |
| `activated` | A retained initialized component is reattached. |
| `unmounted` | Final destruction begins. |
| `beforeFetch` | The final `RequestInit` is ready and may be replaced. |
| `afterFetch` | A parsed shared response is ready for per-component transformation. |
| `captureState` | A preserving reload is about to replace the rendered template. |
| `restoreState` | The replacement has mounted and built-in state restoration is complete. |

Hooks may be asynchronous. A lifecycle hook may return a cleanup function; the component owns it and runs it once on reload or destruction:

```js
AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    hooks: {
        async beforeMount({ el, props }) {
            props.startedAt = Date.now();
            await prepareProfile(el);
        },
        mounted({ el }) {
            const onResize = () => el.toggleAttribute('compact', el.clientWidth < 320);
            const observer = new ResizeObserver(onResize);
            observer.observe(el);
            onResize();

            return () => observer.disconnect();
        },
        updated({ name, oldVal, newVal }) {
            console.log(`${name}: ${oldVal} → ${newVal}`);
        },
        unmounted({ el }) {
            console.log('Unmounting', el.localName);
        },
    },
});
```

`updated` runs for observed attribute changes after the component is ready. `activated` and `deactivated` describe keep-alive reconnection. `unmounted` runs before final destruction, persistence release, Alpine destruction, and cleanup execution.

Hook failures are normalized as `ACLLoadError` values with code `ACL_HOOK_FAILED` and reported through `acl:error` with `phase: "hook"`. Detached notification hooks such as `updated` do not interrupt attribute processing.

Lifecycle contexts contain `el`, `root`, and `props`; `updated` also receives `name`, `oldVal`, and `newVal`. Fetch contexts contain the aliases `el`/`$el`, `root`/`$root`, and `props`/`$props`. Preservation hooks receive `reason`; `restoreState` takes the captured snapshot as its first argument.

## Compatibility and ACL events

Successful loads emit compatibility `mount` and `loaded` events in addition to namespaced lifecycle events:

```js
card.addEventListener('loaded', event => {
    console.log('Props are ready', event.detail.props);
});
```

Common namespaced events include:

| Event | Dispatch target | Meaning |
| --- | --- | --- |
| `mount` | Component host | Compatibility event after Alpine initialization. |
| `loaded` | Component host | Compatibility event after the loaded hook. |
| `acl:loadstart` | Component host | A component generation started. |
| `acl:loadend` | Component host | A load completed, fell back, failed, or was canceled. |
| `acl:error` | Component or dynamic host | Typed template, fetch, hook, persistence, sanitizer, asset, hydration, or switch failure. |
| `acl:cachehit` | Component host | A shared data response was used. |
| `acl:cacheevict` | `document` | A template entry expired, exceeded capacity, was superseded, or was reclaimed for quota. |
| `acl:revalidated` | Component host | A stale-while-revalidate data refresh arrived. |
| `acl:hydrationstart` / `acl:hydrationend` / `acl:hydrationerror` | Component host | Declarative Shadow DOM adoption lifecycle. |
| `acl:boundary-error` / `acl:boundary-retry` / `acl:boundary-reset` | `<acl-boundary>` | Nearest-boundary failure ownership and recovery. |
| `acl:dev-reload-start` / `acl:dev-reload-end` | Component host | A targeted preserving reload began or ended. |
| `acl:dev-reload` | `window` | Aggregate development-client reload result. |
| `acl:prefetchstart` / `acl:prefetchend` / `acl:prefetchskip` | `document` | Adaptive prefetch activity or a connection-policy skip. |
| `acl:a11y` | Audited component | Optional accessibility result. |
| `acl:offline-registered` / `acl:offline-updatefound` | `window` | Offline worker registration or update discovery. |

Component ACL event detail includes `component`, `tagName`, `props`, and `timestamp` plus phase-specific fields. Component events bubble and are composed. Loader-wide events are emitted directly on their documented global target. Structured observability records use the corresponding unprefixed type names but are delivered through `subscribe()`, not DOM propagation.

Use `{ once: true }` for one-time readiness work and remove long-lived application listeners during route teardown.

## Emit and forward events

Use `$emit` for the public component event:

```html
<button
    type="button"
    @click="$props.$emit('profile-follow', { id: $props.userId })"
>
    Follow
</button>
```

`$emit(name, detail)` dispatches from the component host with `bubbles: true` and `composed: true`, so no forwarding rule is needed.

Native composed events already cross a shadow boundary. For an application event that does not, configure `events.forward` with a name or source/target mapping:

```js
AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    shadow: true,
    attributes: { userId: String },
    events: {
        forward: [
            'profile-follow',
            { from: 'internal-select', as: 'profile-select', bubbles: true, composed: true },
        ],
    },
});
```

Inside the shadow template:

```html
<button
    x-data="{ props: $el.$props }"
    type="button"
    @click="$dispatch('profile-follow', { id: props.userId })"
>
    Follow
</button>
```

The host redispatches a `CustomEvent` with the original detail. Forwarding listeners are replaced cleanly during reload and removed during teardown, so an event is not duplicated after repeated reloads.

The declarative proxy accepts the same rules as strict JSON:

```html
<acl-component
    src="/components/profile-card.html"
    tag="profile-card"
    shadow="true"
    forward-events='[
        "profile-follow",
        { "from": "internal-select", "as": "profile-select" }
    ]'
></acl-component>
```

A string preserves the name and defaults both `bubbles` and `composed` to true. A mapping requires `from` and may override `as`, `bubbles`, or `composed`. Do not forward a native or application event that is already composed under the same name, or consumers may receive both the original and the redispatched event.

The `events` option contains one `forward` array. Each entry is either a source
event name or a rule with `from`, optional `as`, and optional `bubbles` and
`composed` overrides.

## Cancel, retry, and reload

Component hosts expose explicit lifecycle controls:

```js
const card = document.querySelector('profile-card');

card.cancel('route-changed');
await card.retry();
await card.reload({
    preserveState: true,
    clearTemplate: true,
    clearData: false,
    reason: 'template-update',
});
```

| Reload option | Default | Purpose |
| --- | --- | --- |
| `preserveState` | `false` | Restore public props, controls, focus, selection, and scroll after remounting. |
| `clearTemplate` | `true` | Remove matching template revisions before loading. |
| `clearData` | `true` | Invalidate the exact data entry and reset its target. |
| `reason` | `manual` | Label reload events and preservation-hook context. |

- `cancel(reason)` aborts deferred, template, asset, Alpine-wait, and data work owned by the current generation.
- `retry()` retries the current component data request when one is configured.
- `reload()` cancels stale work, optionally clears caches, tears down the current Alpine tree and cleanups, and loads a new generation.

For a state-preserving development reload, the loader captures public props, form values, selection, focus, and scroll. Add custom state when the application has non-DOM state:

```js
hooks: {
    captureState({ el, reason }) {
        return { selectedTab: el.$props.selectedTab, reason };
    },
    restoreState(snapshot, { props }) {
        props.selectedTab = snapshot?.selectedTab ?? 'overview';
    },
}
```

DOM controls are matched across replacement markup by `data-acl-preserve-key`, then a unique `id`, a unique `name`, and finally their DOM path:

```html
<textarea data-acl-preserve-key="draft"></textarea>
```

Use a stable preservation key when surrounding structure, IDs, or names may change. Preservation hooks run only when `preserveState` is true. If custom restoration fails, the loader reports `ACL_HMR_RESTORE_FAILED` and performs a clean non-preserving reload.

## Error boundaries

`<acl-boundary>` is discovered lazily or can be registered explicitly with `registerErrorBoundary()`:

```html
<acl-boundary>
    <account-card></account-card>
    <section slot="fallback" role="alert">
        Account details are temporarily unavailable.
    </section>
</acl-boundary>
```

The default slot renders normal descendants; `slot="fallback"` is shown after the nearest boundary catches a descendant `acl:error`. Nested boundaries own only their nearest descendants. The boundary exposes `error`, `errors`, `reset()`, and async `retry()`. Retry calls `reload()` on failed connected hosts and restores normal content only when every host becomes ready. Without an authored fallback, the boundary supplies a small accessible retry UI.

Application controls can use the same recovery surface:

```js
const boundary = document.querySelector('acl-boundary');

boundary.addEventListener('acl:boundary-error', event => {
    console.error('Boundary caught', event.detail.error);
});
boundary.addEventListener('acl:boundary-retry', event => {
    console.info('Retry result', event.detail);
});

await boundary.retry();
boundary.reset();
```

`reset()` clears boundary state and restores normal content without reloading failed hosts. Use `retry()` when those hosts should run their normal `reload()` path first.

## Form-associated components

Opt in per definition so only selected custom-element constructors declare `static formAssociated`:

```js
await AlpineComponentLoader.define('quantity-field', '/components/quantity-field.html', {
    shadow: true,
    attributes: {
        quantity: { type: Number, default: 1 },
        restored: String,
        disabledState: Boolean,
    },
    form: {
        value: 'quantity',
        state: 'restored',
        disabled: 'disabledState',
    },
});
```

The mapped props drive native form value, restoration state, and disabled state. Hosts support reset, disabled, and state-restoration callbacks plus `form`, `labels`, `validity`, `validationMessage`, `willValidate`, `checkValidity()`, `reportValidity()`, `setFormValue()`, and `setValidity()`. Templates receive the same controls at `$props.$form`.

Within a template, `setValue()` at
`$props.$form.setValue(value, state)` is the helper equivalent of the host's
`setFormValue(value, state)`. `$props.$form` also exposes `form`, `labels`,
`setValidity()`, `checkValidity()`, and `reportValidity()`.

Use it like an ordinary successful form control:

```html
<form id="order">
    <quantity-field name="quantity" quantity="2"></quantity-field>
    <button type="reset">Reset</button>
    <button type="submit">Add to order</button>
</form>
```

```html
<!-- quantity-field.html -->
<button type="button" @click="$props.quantity = Math.max(0, $props.quantity - 1)">−</button>
<output x-text="$props.quantity"></output>
<button type="button" @click="$props.quantity += 1">+</button>
```

For custom validation, call `setValidity(flags, message, anchor)` through the host or `$props.$form`, then let the form invoke `checkValidity()`/`reportValidity()` normally.

When `ElementInternals` is unavailable, ACL maintains a hidden input for form submission. It reports a diagnostic because native validation, labels, and lifecycle callbacks cannot be fully emulated by that fallback.

## Dynamic components

`<acl-dynamic>` renders a registered component named by `is`:

```html
<acl-dynamic
    is="profile-card"
    user-id="user-1"
    transition="fade"
    transition-duration="180"
></acl-dynamic>
```

Changing `is` switches to another registered custom element. Public attributes on the dynamic host are copied to the active child and mirrored to cached children. Loader controls such as `is`, `transition`, and `keep-alive` are not forwarded.

Supported transition values are `auto`, `none`, `fade`, `view`, `scale`, `slide-left`, `slide-right`, and `blur`:

```js
const outlet = document.querySelector('acl-dynamic');
outlet.setAttribute('is', 'account-settings');
```

| Attribute | Default | Purpose |
| --- | --- | --- |
| `is` | none | Registered target tag; removing it destroys active and cached children. |
| `keep-alive` | absent | Retain inactive children. |
| `keep-alive-max` | global `keepAliveMax` | Maximum inactive entries with least-recently-used eviction. |
| `transition` | global `dynamicTransition` | `auto`, `view`, `fade`, `scale`, `slide-left`, `slide-right`, `blur`, or `none`. |
| `transition-duration` | global `transitionDuration` | Bounded transition duration in milliseconds. |

All other host attributes are copied to the active child and mirrored to cached children. The loader controls `is`, `keep-alive`, `keep-alive-max`, `transition`, `transition-duration`, and its internal component marker, so those are not forwarded.

`auto` uses the View Transitions API when available and falls back to a bounded CSS transition. Reduced-motion preference disables animation. Superseded switches cancel their frames and timers, and temporary effects restore authored inline styles. When focus was inside the outgoing component, the switcher prefers `[autofocus]` or `[data-acl-autofocus]` in the incoming component, then its first ordinary focusable element.

The target must already be registered. Invalid or missing targets emit `acl:error` from the dynamic host with `phase: "dynamic"`.

## Keep-alive behavior

Add `keep-alive` to cache inactive dynamic children:

```html
<acl-dynamic
    is="profile-card"
    keep-alive
    keep-alive-max="3"
></acl-dynamic>
```

Inactive children stop polling and slot observation and receive `deactivated`; reconnected children resume owned resources and receive `activated`. The cache uses bounded least-recently-used order. Evicted children and all cached children on dynamic-host disconnect are destroyed.

Use a finite `keep-alive-max` for long-running applications. `keepAliveMax` can also be configured globally; `Infinity` is supported but should be deliberate.

An ordinary registered component can also retain its initialized Alpine state across removal:

```js
const panel = document.querySelector('account-panel');
panel.setAttribute('keep-alive', '');
panel.remove();

// Later:
document.body.appendChild(panel);
```

Detachment pauses polling and Light DOM slot observation and calls `deactivated`; reattachment resumes owned resources and calls `activated`.

## Development server and targeted HMR

The packaged development server injects an EventSource client, reports changed component sources, clears each matching template once, and reloads live instances—including instances in open Shadow Roots—with preserving defaults:

```bash
npx alpine-component-loader serve ./public --host 127.0.0.1 --port 4173
```

Integrate those operations with another server through the public development entry:

```js
import {
    connectACLDevServer,
    reloadChangedTemplates,
} from 'alpine-component-loader/dev';

const result = await reloadChangedTemplates([
    '/components/profile-card.html',
    '/components/account-settings.html',
]);

console.log(result.sources, result.tags, result.reloaded, result.failed);

const connection = connectACLDevServer({
    url: '/__acl_hmr/events',
});

console.log(connection.eventSource);

// Stop native EventSource reconnects during application teardown:
connection.close();
```

`reloadChangedTemplates()` uses `{ preserveState: true, clearTemplate: false, clearData: false, reason: "hmr" }` after clearing affected template revisions once. It emits per-component reload events followed by aggregate `acl:dev-reload` detail. `connectACLDevServer()` accepts template-change and page-reload messages; a template message may request a full-page fallback when no live component matches. The returned read-only `eventSource` becomes `null` after `close()`.

## Teardown guarantees

An ordinary component disconnect waits briefly before destruction so DOM moves can reconnect without losing state. Final teardown:

- Cancels deferred, template, asset, Alpine-wait, and data work.
- Stops polling and detaches visibility/network/intersection signals.
- Disconnects slot observers and releases forwarded-event listeners.
- Flushes and releases persistence.
- Destroys the Alpine tree and runs owned cleanups once.
- Clears rendered content and marks the host destroyed.

For request behavior see [Data, caching, polling, and persistence](data.md). For test helpers that wait on lifecycle states see [Testing utilities](testing.md).
