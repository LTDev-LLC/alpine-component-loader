# Adaptive prefetch

Prefetch warms the component template cache before a component is needed. Manual prefetch always follows the caller's request. Adaptive prefetch observes opt-in elements and skips speculative work when the connection is offline, data saver is enabled, or the effective connection is constrained.

## Prepare a dependency graph

Generate the component manifest, then add meaningful groups and review inferred dependencies:

```bash
npx alpine-component-loader manifest components --out acl-manifest.json
npx alpine-component-loader validate acl-manifest.json
```

```json
{
  "version": 1,
  "components": {
    "avatar-image": "components/avatar-image.html",
    "profile-card": {
      "source": "components/profile-card.html",
      "dependencies": ["avatar-image"]
    }
  },
  "groups": {
    "profile": ["profile-card"]
  }
}
```

The generator detects dependencies structurally with parse5, including nested templates and multiline markup. It does not infer route or feature groups. Put those groups and any explicit dependencies in adjacent `<tag>.acl.json` sidecars, then refresh safely with `manifest --update`; see [Manifests, generated contracts, and CLI tooling](manifests-and-cli.md).

Register the parsed manifest before prefetching:

```js
const response = await fetch('/acl-manifest.json');
if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);

const manifest = await response.json();
await AlpineComponentLoader.registerManifest(manifest);
await AlpineComponentLoader.start();
```

## Prefetch during registration

Pass group or tag names to `registerManifest()` when an application knows its critical graph at startup:

```js
const result = await AlpineComponentLoader.registerManifest(manifest, {
    prefetch: ['profile'],
    concurrency: 2,
});

for (const [tag, outcome] of Object.entries(result.prefetched)) {
    if (outcome.status === 'rejected') console.warn(`Could not prefetch <${tag}>`, outcome.reason);
}
```

`prefetch: true` selects every registered component. An array may mix group names and component tags. Dependencies are expanded before work begins, duplicate tags are removed, and every selected template produces an independent fulfilled or rejected result.

## Manual prefetch

Use the narrowest method that represents the intended work:

```js
await AlpineComponentLoader.prefetch('profile-card');

const selected = await AlpineComponentLoader.prefetchAll(['avatar-image', 'profile-card'], {
    concurrency: 2,
});

const graph = await AlpineComponentLoader.prefetchGraph(['profile-card'], {
    concurrency: 2,
    includeRoots: true,
});
```

- `prefetch(tag)` loads one registered template and rejects when that load fails.
- `prefetchAll(tags)` bounds concurrency and settles every requested tag.
- `prefetchGraph(roots)` recursively loads manifest dependencies before the roots. Set `includeRoots: false` to warm dependencies only.

Manual methods do not apply adaptive connection heuristics. This is useful for navigation the application has already committed to, but callers should avoid unnecessary work themselves.

## Observe opt-in targets

Mark links, buttons, or other targets with a component tag or manifest group:

```html
<a href="/profile" data-acl-prefetch="profile">Open profile</a>
<button type="button" data-acl-prefetch="avatar-image, profile-card">Preview</button>
```

Start observation after registration:

```js
const controller = await AlpineComponentLoader.observePrefetch({
    triggers: ['hover', 'focus', 'viewport'],
    hoverDelay: 75,
    rootMargin: '200px',
    concurrency: 2,
});

// A direct adaptive request uses the same group/tag resolution and connection gates.
const results = await controller.prefetch('profile');

// During application teardown:
controller.disconnect();
```

The controller exposes `prefetch(target)` for a direct adaptive request and `disconnect()` for complete cleanup.

Calling `observePrefetch()` again disconnects the previous loader-owned controller. `AlpineComponentLoader.stopObservingPrefetch()` is an equivalent global cleanup when the controller handle is unavailable.

Adaptive observation options are:

| Option | Default | Contract |
| --- | --- | --- |
| `root` | `document` | Discovery and delegated hover/focus scope. |
| `selector` | `[data-acl-prefetch]` | Candidate target selector. |
| `triggers` | hover, focus, viewport | Any combination of `hover`, `focus`, `viewport`/`visible`, and `idle`. |
| `hoverDelay` | `75` | Non-negative pointer dwell time in milliseconds. |
| `rootMargin` | `200px` | IntersectionObserver margin used by viewport triggers. |
| `concurrency` | `2` | Positive bound for each selected dependency graph. |
| `respectDataSaver` | `true` | Skip speculative work on save-data/constrained connections. |
| `intersectionRoot` | `null` | Optional element/document root for viewport observation. |

The default triggers are hover, focus, and viewport visibility. Hover waits 75 ms so passing pointer movement does not immediately fetch. Viewport observation uses a 200 px root margin. Add `idle` explicitly to process every marked target during idle time:

```js
const controller = await AlpineComponentLoader.observePrefetch({
    triggers: ['focus', 'visible', 'idle'],
    respectDataSaver: true,
});
```

`viewport` and `visible` are equivalent trigger names. If `IntersectionObserver` is unavailable, hover/focus/idle behavior can still run.

## Dynamic content and scoped observation

New matching elements are discovered with a mutation observer. Scope discovery and event listeners to part of the page when appropriate:

```js
const panel = document.querySelector('#account-panel');
const controller = await AlpineComponentLoader.observePrefetch({
    root: panel,
    selector: '[data-prefetch-component]',
    intersectionRoot: panel,
    rootMargin: '100px',
});
```

With a custom selector, targets still need a `data-acl-prefetch` value unless their own custom-element tag names a registered component. An empty `data-acl-prefetch` on a registered component host resolves to that host's tag.

Only active targets remain registered with the viewport observer. A target is
unobserved after it intersects, and removing a target or an ancestor subtree
releases its observation and any pending hover timer. Reinserted matching
elements are discovered again and can trigger a new adaptive attempt. Calling
`disconnect()` repeatedly is safe.

## Connection gates and events

Adaptive work is skipped when:

- `navigator.onLine === false` (`offline`).
- Data saver is enabled (`save-data`).
- Effective connection type is `slow-2g` or `2g` (`constrained-network`).
- A token names neither a registered component nor a manifest group (`unknown-target`).

Set `respectDataSaver: false` only when the application has another appropriate policy. Offline checks still apply.

Listen for structured lifecycle events:

```js
addEventListener('acl:prefetchstart', event => console.log(event.detail.tags));
addEventListener('acl:prefetchend', event => console.log(event.detail.fulfilled));
addEventListener('acl:prefetchskip', event => console.log(event.detail.reason));
```

Adaptive prefetch loads component templates and their manifest dependencies. It never requests component data endpoints. Failed tags are eligible for a later adaptive retry; successfully completed tags are not fetched repeatedly by the same controller.

## Troubleshooting

### A group does nothing

Confirm the parsed manifest was registered, the group exists in `groups`, and its members name registered components. `registerManifest()` requires `prefetch: ['group-name']`; a bare string is not a supported prefetch option.

### A nested component is missing

Add it to the parent's `dependencies` array. Prefetch uses the manifest graph, not arbitrary runtime DOM discovery.

### Observation keeps running after navigation

Call `controller.disconnect()` or `stopObservingPrefetch()` during route/application teardown. Cleanup releases timers, listeners, intersection and mutation observers, and idle work.

For template cache details see [Data, caching, polling, and persistence](data.md).
