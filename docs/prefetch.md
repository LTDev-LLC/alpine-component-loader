# Adaptive prefetch

Prefetch warms template caches before use. Manual calls follow your request; adaptive prefetch observes opt-in targets
and skips offline, data-saver, and constrained connections.

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

The generator infers dependencies, including nested templates, but not groups. Declare groups and explicit dependencies
in `<tag>.acl.json` sidecars, then run `manifest --update`. See [manifest tooling](manifests-and-cli.md).

Register the parsed manifest before prefetching:

```js
const response = await fetch('/acl-manifest.json');
if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);

const manifest = await response.json();
await AlpineComponentLoader.registerManifest(manifest);
await AlpineComponentLoader.start();
```

## Prefetch during registration

Prefetch known startup groups or tags during registration:

```js
const result = await AlpineComponentLoader.registerManifest(manifest, {
    prefetch: ['profile'],
    concurrency: 2,
});

for (const [tag, outcome] of Object.entries(result.prefetched)) {
    if (outcome.status === 'rejected') console.warn(`Could not prefetch <${tag}>`, outcome.reason);
}
```

`true` selects every registered component; arrays can mix groups and tags. Dependencies expand first, duplicates are
removed, and each template settles independently.

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
- `prefetchGraph(roots)` recursively loads manifest dependencies before the roots. Set `includeRoots: false` to warm
  dependencies only.

Manual calls bypass connection heuristics. Use them for committed navigation and avoid unnecessary requests.

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

A new `observePrefetch()` disconnects the previous loader-owned controller. `stopObservingPrefetch()` also releases it.

Adaptive observation options are:

| Option             | Default                | Contract                                                               |
| ------------------ | ---------------------- | ---------------------------------------------------------------------- |
| `root`             | `document`             | Discovery and delegated hover/focus scope.                             |
| `selector`         | `[data-acl-prefetch]`  | Candidate target selector.                                             |
| `triggers`         | hover, focus, viewport | Any combination of `hover`, `focus`, `viewport`/`visible`, and `idle`. |
| `hoverDelay`       | `75`                   | Non-negative pointer dwell time in milliseconds.                       |
| `rootMargin`       | `200px`                | IntersectionObserver margin used by viewport triggers.                 |
| `concurrency`      | `2`                    | Positive bound for each selected dependency graph.                     |
| `respectDataSaver` | `true`                 | Skip speculative work on save-data/constrained connections.            |
| `intersectionRoot` | `null`                 | Optional element/document root for viewport observation.               |

Default triggers are hover (75 ms delay), focus, and viewport (200 px margin). Add `idle` to process marked targets
during idle time:

```js
const controller = await AlpineComponentLoader.observePrefetch({
    triggers: ['focus', 'visible', 'idle'],
    respectDataSaver: true,
});
```

`viewport` and `visible` are aliases. Without `IntersectionObserver`, hover, focus, and idle still work.

## Dynamic content and scoped observation

A mutation observer discovers new targets. Scope observation and listeners when appropriate:

```js
const panel = document.querySelector('#account-panel');
const controller = await AlpineComponentLoader.observePrefetch({
    root: panel,
    selector: '[data-prefetch-component]',
    intersectionRoot: panel,
    rootMargin: '100px',
});
```

Custom selectors still require `data-acl-prefetch`, unless the target itself is a registered component. An empty value
on a component host selects its tag.

Targets are unobserved after intersection. Removing targets or ancestors releases observations and hover timers;
reinsertion allows another attempt. Repeated `disconnect()` is safe.

## Connection gates and events

Adaptive work is skipped when:

- `navigator.onLine === false` (`offline`).
- Data saver is enabled (`save-data`).
- Effective connection type is `slow-2g` or `2g` (`constrained-network`).
- A token names neither a registered component nor a manifest group (`unknown-target`).

`respectDataSaver: false` disables that heuristic; offline checks remain.

Listen for structured lifecycle events:

```js
addEventListener('acl:prefetchstart', event => console.log(event.detail.tags));
addEventListener('acl:prefetchend', event => console.log(event.detail.fulfilled));
addEventListener('acl:prefetchskip', event => console.log(event.detail.reason));
```

Adaptive prefetch loads templates and dependencies, never data endpoints. Failed tags can retry; successful tags are not
repeated by the same controller.

## Troubleshooting

### A group does nothing

Check manifest registration, group names, and members. Registration accepts `prefetch: ['group-name']`, not a bare
string.

### A nested component is missing

Declare the child in `dependencies`; prefetch follows the manifest graph.

### Observation keeps running after navigation

During teardown, call `disconnect()` or `stopObservingPrefetch()` to release timers, listeners, observers, and idle
work.

For template cache details see [Data, caching, polling, and persistence](data.md).
