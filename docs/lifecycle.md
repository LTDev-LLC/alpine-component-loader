# Lifecycle, events, and dynamic components

Components own requests, assets, Alpine trees, timers, subscriptions, persistence, events, and hook cleanup. New
generations supersede old work; teardown releases ownership once.

## Lifecycle states

A host moves through these internal states:

```text
idle → deferred/loading → ready → deactivated → destroyed
```

`loading="lazy"` defers work until intersection, while `loading="idle"` schedules it for idle time. Loading and deferred
hosts expose `aria-busy="true"`; ready, deactivated, and destroyed hosts do not.

## Inline-template discovery lifecycle

Root `start()` scans existing declarative templates. `observeTemplates()` handles later definitions.

[Core](core.md) needs explicit template/built-in registration. Startup completes registration; `loaded` and hydration
events mark initialization. Optional [polyfills](polyfills.md) gate registration without changing events.

`/auto` observes before scanning to catch startup-time insertions. Set
`window.AlpineComponentLoaderConfig.observeTemplates = false` to retain only scanning; `autoStart: false` disables both.

One template observer is active per loader. Replacement cleanup releases only its own observer;
`stopObservingTemplates()` releases the current one. Failures emit phase `template-observer` without unhandled
rejections.

## Progressive SSR hydration

Progressive hydration needs valid SSR markup and an exact `data-acl-revision` match. Client-only or stale hosts use
normal `loading`.

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

| `hydrate` mode | Trigger                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| `eager`        | Hydrate immediately.                                                         |
| `visible`      | First intersection with a `100px` root margin.                               |
| `idle`         | `requestIdleCallback` with a bounded timeout fallback.                       |
| `interaction`  | First pointer hover, touch start, or focus entry; the event is not replayed. |
| `media`        | First match of `hydrateMedia` or the host `hydrate-media` attribute.         |

`data-acl-hydration-state` is `deferred`, `hydrating`, `hydrated`, or `error`. Hydration triggers release resources on
completion, disconnect, reload, or disposal.

Listen for public events rather than depending on private state:

```js
const card = document.querySelector('profile-card');

card.addEventListener('acl:loadstart', (event) => {
    console.log('Started', event.detail.requestId);
});

card.addEventListener('acl:loadend', (event) => {
    console.log('Finished', event.detail.duration);
});

card.addEventListener('acl:error', (event) => {
    console.error(event.detail.phase, event.detail.error);
});
```

Component events bubble and are composed. Loader-wide events, such as prefetch, dispatch on `document` with
feature-specific detail.

## Hooks and owned cleanup

Component hooks are `beforeMount`, `mounted`, `loaded`, `updated`, `activated`, `deactivated`, and `unmounted`. Data
hooks are `beforeFetch` and `afterFetch`. Development state preservation uses `captureState` and `restoreState`.

| Hook           | Runs when                                                               |
| -------------- | ----------------------------------------------------------------------- |
| `beforeMount`  | A load generation begins, before loading UI and resource work.          |
| `mounted`      | Template rendering and Alpine initialization have completed.            |
| `loaded`       | `mounted` has completed and the component is fully ready.               |
| `updated`      | An observed prop or data-control attribute changes after readiness.     |
| `deactivated`  | A retained component is detached and its pausable resources stop.       |
| `activated`    | A retained initialized component is reattached.                         |
| `unmounted`    | Final destruction begins.                                               |
| `beforeFetch`  | The final `RequestInit` is ready and may be replaced.                   |
| `afterFetch`   | A parsed shared response is ready for per-component transformation.     |
| `captureState` | A preserving reload is about to replace the rendered template.          |
| `restoreState` | The replacement has mounted and built-in state restoration is complete. |

Async lifecycle hooks may return cleanup, owned until reload/destruction:

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

`updated` follows ready-state attribute changes. Keep-alive reconnects emit `activated`/`deactivated`. `unmounted`
precedes persistence/Alpine release and final cleanup.

Hook failures emit `acl:error` with `ACL_HOOK_FAILED`, phase `hook`. Notification hooks such as `updated` do not
interrupt attribute handling.

Lifecycle contexts include `el`, `root`, and `props`; `updated` adds `name`, `oldVal`, and `newVal`. Fetch contexts add
`$el`, `$root`, and `$props` aliases. Preservation hooks receive `reason`; `restoreState` takes the snapshot first.

## Compatibility and ACL events

Successful loads emit compatibility `mount` and `loaded` events in addition to namespaced lifecycle events:

```js
card.addEventListener('loaded', (event) => {
    console.log('Props are ready', event.detail.props);
});
```

Common namespaced events include:

| Event                                                              | Dispatch target           | Meaning                                                                                   |
| ------------------------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------- |
| `mount`                                                            | Component host            | Compatibility event after Alpine initialization.                                          |
| `loaded`                                                           | Component host            | Compatibility event after the loaded hook.                                                |
| `acl:loadstart`                                                    | Component host            | A component generation started.                                                           |
| `acl:loadend`                                                      | Component host            | A load completed, fell back, failed, or was canceled.                                     |
| `acl:error`                                                        | Component or dynamic host | Typed template, fetch, hook, persistence, sanitizer, asset, hydration, or switch failure. |
| `acl:cachehit`                                                     | Component host            | A shared data response was used.                                                          |
| `acl:cacheevict`                                                   | `document`                | A template entry expired, exceeded capacity, was superseded, or was reclaimed for quota.  |
| `acl:revalidated`                                                  | Component host            | A stale-while-revalidate data refresh arrived.                                            |
| `acl:hydrationstart` / `acl:hydrationend` / `acl:hydrationerror`   | Component host            | Declarative Shadow DOM adoption lifecycle.                                                |
| `acl:boundary-error` / `acl:boundary-retry` / `acl:boundary-reset` | `<acl-boundary>`          | Nearest-boundary failure ownership and recovery.                                          |
| `acl:dev-reload-start` / `acl:dev-reload-end`                      | Component host            | A targeted preserving reload began or ended.                                              |
| `acl:dev-reload`                                                   | `window`                  | Aggregate development-client reload result.                                               |
| `acl:prefetchstart` / `acl:prefetchend` / `acl:prefetchskip`       | `document`                | Adaptive prefetch activity or a connection-policy skip.                                   |
| `acl:a11y`                                                         | Audited component         | Optional accessibility result.                                                            |
| `acl:offline-registered` / `acl:offline-updatefound`               | `window`                  | Offline worker registration or update discovery.                                          |

Component detail contains `component`, `tagName`, `props`, `timestamp`, and phase fields. Observability delivers
corresponding unprefixed record types through `subscribe()`.

Use `{ once: true }` for one-time readiness work and remove long-lived application listeners during route teardown.

## Emit and forward events

Use `$emit` for the public component event:

```html
<button type="button" @click="$props.$emit('profile-follow', { id: $props.userId })">Follow</button>
```

`$emit(name, detail)` dispatches from the component host with `bubbles: true` and `composed: true`, so no forwarding
rule is needed.

Native composed events already cross a shadow boundary. For an application event that does not, configure `events` with
a `forward` name or source/target mapping:

```js
AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    shadow: true,
    attributes: { userId: String },
    events: {
        forward: ['profile-follow', { from: 'internal-select', as: 'profile-select', bubbles: true, composed: true }],
    },
});
```

Inside the shadow template:

```html
<button x-data="{ props: $el.$props }" type="button" @click="$dispatch('profile-follow', { id: props.userId })">
    Follow
</button>
```

The host redispatches original detail as a `CustomEvent`. Reload replaces forwarding listeners; teardown removes them.

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

Strings preserve names and default `bubbles`/`composed` to true. Mappings require `from` and may change `as`, `bubbles`,
or `composed`. Avoid forwarding already-composed events under the same name, which duplicates delivery.

`events.forward` accepts event names or mapping rules.

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

| Reload option   | Default  | Purpose                                                                        |
| --------------- | -------- | ------------------------------------------------------------------------------ |
| `preserveState` | `false`  | Restore public props, controls, focus, selection, and scroll after remounting. |
| `clearTemplate` | `true`   | Remove matching template revisions before loading.                             |
| `clearData`     | `true`   | Invalidate the exact data entry and reset its target.                          |
| `reason`        | `manual` | Label reload events and preservation-hook context.                             |

- `cancel(reason)` aborts deferred, template, asset, Alpine-wait, and data work owned by the current generation.
- `retry()` retries the current component data request when one is configured.
- `reload()` cancels stale work, optionally clears caches, tears down the current Alpine tree and cleanups, and loads a
  new generation.

Preserving reloads capture props, form values, selection, focus, and scroll. Capture application-specific state with
hooks:

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

DOM controls are matched across replacement markup by `data-acl-preserve-key`, then a unique `id`, a unique `name`, and
finally their DOM path:

```html
<textarea data-acl-preserve-key="draft"></textarea>
```

Use stable preservation keys. Hooks run only for `preserveState: true`; failed restoration reports
`ACL_HMR_RESTORE_FAILED` and retries without preservation.

## Error boundaries

`<acl-boundary>` is discovered lazily or can be registered explicitly with `registerErrorBoundary()`:

```html
<acl-boundary>
    <account-card></account-card>
    <section slot="fallback" role="alert">Account details are temporarily unavailable.</section>
</acl-boundary>
```

The nearest boundary catches descendant `acl:error` and swaps its default slot for `slot="fallback"`. It exposes
`error`, `errors`, `reset()`, and async `retry()`. Retry reloads failed connected hosts and restores content when all
are ready. Missing authored fallbacks use an accessible retry UI.

Application controls can use the same recovery surface:

```js
const boundary = document.querySelector('acl-boundary');

boundary.addEventListener('acl:boundary-error', (event) => {
    console.error('Boundary caught', event.detail.error);
});
boundary.addEventListener('acl:boundary-retry', (event) => {
    console.info('Retry result', event.detail);
});

await boundary.retry();
boundary.reset();
```

`reset()` clears boundary state only; `retry()` reloads failed hosts first.

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

Mapped props control form value, restoration, and disabled state. Hosts expose reset/disabled/restoration callbacks,
`form`, `labels`, `validity`, `validationMessage`, `willValidate`, `checkValidity()`, `reportValidity()`,
`setFormValue()`, and `setValidity()`.

`$props.$form` provides `form`, `labels`, `setValue(value, state)`, `setValidity()`, `checkValidity()`, and
`reportValidity()`. `setValue()` corresponds to host `setFormValue()`.

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

For custom validation, call `setValidity(flags, message, anchor)` through the host or `$props.$form`, then let the form
invoke `checkValidity()`/`reportValidity()` normally.

Without `ElementInternals`, a hidden input provides submission. A diagnostic notes that native validation, labels, and
callbacks cannot be fully emulated.

## Dynamic components

`<acl-dynamic>` renders a registered component named by `is`:

```html
<acl-dynamic is="profile-card" user-id="user-1" transition="fade" transition-duration="180"></acl-dynamic>
```

Changing `is` switches the active registered component.

Supported transition values are `auto`, `none`, `fade`, `view`, `scale`, `slide-left`, `slide-right`, and `blur`:

```js
const outlet = document.querySelector('acl-dynamic');
outlet.setAttribute('is', 'account-settings');
```

| Attribute             | Default                     | Purpose                                                                          |
| --------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| `is`                  | none                        | Registered target tag; removing it destroys active and cached children.          |
| `keep-alive`          | absent                      | Retain inactive children.                                                        |
| `keep-alive-max`      | global `keepAliveMax`       | Maximum inactive entries with least-recently-used eviction.                      |
| `transition`          | global `dynamicTransition`  | `auto`, `view`, `fade`, `scale`, `slide-left`, `slide-right`, `blur`, or `none`. |
| `transition-duration` | global `transitionDuration` | Bounded transition duration in milliseconds.                                     |

Public attributes mirror to active/cached children. Controls `is`, `keep-alive`, `keep-alive-max`, `transition`,
`transition-duration`, and internal markers are not forwarded.

`auto` uses View Transitions or bounded CSS fallback; reduced motion disables animation. Superseded switches cancel
frames/timers and restore authored styles. Focus moves from the outgoing host to incoming autofocus or the first
focusable control.

The target must already be registered. Invalid or missing targets emit `acl:error` from the dynamic host with
`phase: "dynamic"`.

## Keep-alive behavior

Add `keep-alive` to cache inactive dynamic children:

```html
<acl-dynamic is="profile-card" keep-alive keep-alive-max="3"></acl-dynamic>
```

Inactive children pause polling/slot observation and emit `deactivated`; reconnection resumes resources and emits
`activated`. The bounded LRU cache destroys evictions and all children on host disconnect.

Set finite `keep-alive-max` or global `keepAliveMax` for bounded retention. `Infinity` is supported.

An ordinary registered component can also retain its initialized Alpine state across removal:

```js
const panel = document.querySelector('account-panel');
panel.setAttribute('keep-alive', '');
panel.remove();

// Later:
document.body.appendChild(panel);
```

Detachment pauses polling and Light DOM slot observation and calls `deactivated`; reattachment resumes owned resources
and calls `activated`.

## Development server and targeted HMR

The dev server injects EventSource, invalidates changed templates once, and preserves matching live hosts, including
open Shadow Roots:

```bash
npx alpine-component-loader serve ./public --host 127.0.0.1 --port 4173
```

Integrate those operations with another server through the public development entry:

```js
import { connectACLDevServer, reloadChangedTemplates } from 'alpine-component-loader/dev';

const result = await reloadChangedTemplates(['/components/profile-card.html', '/components/account-settings.html']);

console.log(result.sources, result.tags, result.reloaded, result.failed);

const connection = connectACLDevServer({
    url: '/__acl_hmr/events',
});

console.log(connection.eventSource);

// Stop native EventSource reconnects during application teardown:
connection.close();
```

`reloadChangedTemplates()` uses `{ preserveState: true, clearTemplate: false, clearData: false, reason: "hmr" }`.
Per-host events precede aggregate `acl:dev-reload`. `connectACLDevServer()` handles template/page messages and optional
page fallback when no hosts match. `eventSource` becomes `null` after `close()`.

## Teardown guarantees

Disconnect delays destruction briefly to permit DOM moves. Final teardown:

- Cancels deferred, template, asset, Alpine-wait, and data work.
- Stops polling and detaches visibility/network/intersection signals.
- Disconnects slot observers and releases forwarded-event listeners.
- Flushes and releases persistence.
- Destroys the Alpine tree and runs owned cleanups once.
- Clears rendered content and marks the host destroyed.

See [requests and persistence](data.md) or [lifecycle test helpers](testing.md).
