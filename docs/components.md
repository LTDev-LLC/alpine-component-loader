# Components, props, slots, and rendering

ACL turns an HTML template into a custom element. Definitions specify a tag, source, and optional props, rendering,
data, assets, lifecycle, or persistence settings.

## Quick start

Create `components/profile-card.html`:

```html
<article>
    <h2 x-text="$props.name"></h2>
    <p><slot>Profile details</slot></p>
</article>
```

Define and start the component:

```js
import AlpineComponentLoader from 'alpine-component-loader';

AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    attributes: {
        name: { type: String, required: true, reflect: true },
    },
});

await AlpineComponentLoader.start();
```

```html
<profile-card name="Ada">Maintainer</profile-card>
```

Call root-entry `start()` after configuration/registration. `/auto` starts on import. Definitions added after startup
register immediately.

[Core](core.md) keeps the same component features with explicit registration. Await optional [polyfills](polyfills.md)
before importing applications that need fallback APIs.

## Template sources and registration

`define(tagName, source, options)` accepts:

- An HTTP-relative template URL such as `/components/profile-card.html`.
- An inline `<template>` selector such as `#profile-template`.
- An `HTMLTemplateElement`.
- An application-specific string alias rewritten by `sourceResolver`.

`define(tagName, definition)` additionally accepts an inline definition object:

```js
AlpineComponentLoader.define('inline-message', {
    template: `
        <article x-data="{ open: false }">
            <button @click="open = !open" x-text="$props.label"></button>
            <p x-show="open"><slot></slot></p>
        </article>
    `,
    shadow: true,
    attributes: { label: String },
});
```

`template` must be a non-empty HTML string; other fields are component options. Inline objects reject a third argument
and skip fetching/persistent URL caching. Use selectors to share authored templates or URLs for independent deployment.

Inline objects, selectors, and `x-acl` are browser authoring paths with normal component features. SSR and generated
offline graphs require manifest URL sources.

For an inline definition:

```html
<template id="status-badge-template">
    <span x-text="$props.label"></span>
</template>
```

```js
AlpineComponentLoader.define('status-badge', '#status-badge-template', {
    attributes: { label: String },
});
```

Custom-element names must contain a hyphen. Use `has()`, `getDefinition()`, and `getRegisteredTags()` to inspect
definitions without touching internal registries.

### Resolve application-specific sources

Synchronous `sourceResolver` runs before `basePath`, with the source and frozen `tagName`, `config`, `globalConfig`, and
`loader` context:

```js
AlpineComponentLoader.config({
    basePath: '/components/',
    sourceResolver(source, { tagName }) {
        if (source.startsWith('design:')) {
            console.debug(`Resolving ${source} for <${tagName}>`);
            return `design-system/${source.slice('design:'.length)}.html`;
        }
        return source;
    },
});

AlpineComponentLoader.define('notice-card', 'design:notice');
// Fetches /components/design-system/notice.html
```

Return a string/template element, or a falsy value to keep the source. `basePath` prefixes relative strings only;
absolute/root/protocol-relative URLs, selectors, and template elements remain unchanged.

### Discover inline definitions

The root entry's `start()` scans existing `template[x-acl]` and `template[acl-component]` definitions:

```html
<template x-acl="inline-counter" acl-props='{ "count": { "type": "Number", "default": 0 } }'>
    <button @click="$props.count++" x-text="$props.count"></button>
</template>

<inline-counter count="5"></inline-counter>
```

`registerTemplates(root)` scans a subtree. `observeTemplates({ root, subtree })` registers future declarations and
returns cleanup. Each loader has one observer; re-observing replaces it.

Both markers accept `acl-props` and serializable data controls. They are consumed definition metadata and may coexist
only with the same name. Registration upgrades existing and future hosts.

Late observation is opt-in on root and default on `/auto`. Configure before auto import:

```html
<script>
    window.AlpineComponentLoaderConfig = { observeTemplates: false };
</script>
```

`observeTemplates: false` retains the initial scan; `autoStart: false` disables both. `stopObservingTemplates()` stops
observation. HTML custom elements need paired tags.

## Register components from a manifest

Use a shared manifest for SSR, offline, generated types, or dependency prefetch:

```bash
npx alpine-component-loader manifest components --out acl-manifest.json
npx alpine-component-loader validate acl-manifest.json
```

Fetch and parse it before registration:

```js
const response = await fetch('/acl-manifest.json');
if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);

const manifest = await response.json();
await AlpineComponentLoader.registerManifest(manifest, {
    prefetch: ['critical'],
    concurrency: 2,
});
await AlpineComponentLoader.start();
```

`registerManifest()` accepts objects. Generation supplies sources, dependencies, and revisions; authored
options/metadata remain yours. See [manifest tooling](manifests-and-cli.md).

## Declarative proxy

`<acl-component>` registers a definition and replaces itself with the resulting custom element:

```html
<acl-component
    src="/components/user-card.html"
    tag="declarative-user-card"
    shadow="true"
    loading="lazy"
    acl-props='{ "id": "Number", "name": { "type": "String", "required": true } }'
    data-src="/api/users/:id"
    data-fetch-keys='{ "id": 42 }'
    external-css='["/assets/cards.css"]'
    forward-events='["select"]'
    id="42"
    name="Ada"
>
    <button slot="actions">Open</button>
</acl-component>
```

`src` is required; omitted `tag` derives from its filename and must be a valid hyphenated name. New tags infer public
attributes as primitive/array/object props. Existing definitions win.

| Proxy attribute                     | Purpose                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src`                               | Required template source.                                                                        |
| `tag`                               | Target custom-element name.                                                                      |
| `shadow`                            | Enable Shadow DOM; the literal value `false` disables it.                                        |
| `loading`                           | `eager`, `lazy`, or `idle`.                                                                      |
| `acl-props`                         | Strict-JSON prop definitions using serialized constructor names.                                 |
| `data-fetch-options`                | Strict-JSON base `RequestInit`; other request controls use the data attributes documented below. |
| `external-css` / `external-scripts` | Strict-JSON arrays of asset strings or descriptors.                                              |
| `forward-events`                    | Strict-JSON event-name or mapping array.                                                         |
| `hooks`                             | Safe dotted path to an existing hook object on `window`.                                         |
| `template-cache-strategy`           | Template cache policy for this definition.                                                       |
| `loading-template` / `loading-html` | Temporary loading UI.                                                                            |
| `sanitize`                          | Enable or disable sanitization for this definition.                                              |
| `bind-store`                        | Existing Alpine store name.                                                                      |
| `fallback`                          | Template source used after an initial failure.                                                   |
| Data and persistence attributes     | The controls listed in [Data, caching, polling, and persistence](data.md).                       |

Declarative settings use strict JSON, with quoted keys/strings. Parsers, validators, coercers, sanitizers, adapters,
migrations, and dynamic request builders belong in JavaScript.

`hooks="ACLHooks.profile"` resolves a dotted identifier on `window`, blocking prototype traversal. Definition controls
are consumed; public/runtime attributes and child nodes move to the real host with their state.

## Props, reactive state, and built-in helpers

Props support `String`, `Number`, `Boolean`, `Array`, and `Object`, with defaults, required/nullability rules,
reflection, allowed values, nested validation, validators, and coercers:

```js
AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    strictProps: true,
    attributes: {
        name: { type: String, required: true, reflect: true },
        count: { type: Number, default: 0 },
        active: Boolean,
        roles: { type: Array, default: () => [] },
        status: { type: String, options: ['active', 'away'] },
        account: {
            type: Object,
            nullable: true,
            schema: {
                id: { type: String, required: true },
                verified: Boolean,
            },
        },
    },
});
```

| Descriptor field | Purpose                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| `type`           | `String`, `Number`, `Boolean`, `Array`, or `Object`.                        |
| `default`        | Stable value or factory used when input is absent or invalid.               |
| `required`       | Report a missing input.                                                     |
| `nullable`       | Permit `null`, including the literal `null` for an attribute.               |
| `reflect`        | Reflect host property assignments back to the corresponding attribute.      |
| `options`        | Restrict values to an allowed list.                                         |
| `schema`         | Recursively validate fields in an Object prop.                              |
| `validator`      | Apply additional application validation.                                    |
| `coerce`         | Convert an attribute string with `{ el, props, name, definition }` context. |

Declarative arrays and objects must be strict JSON:

```html
<profile-card
    name="Ada"
    count="3"
    active
    roles='["maintainer","reviewer"]'
    account='{"id":"user-1","verified":true}'
></profile-card>
```

The same reactive `$props` object is available on the host, Alpine scope, and hook contexts. Templates need no `x-data`;
existing capture patterns still work. Mutable defaults are cloned. Invalid values use safe defaults unless
`strictProps: true` makes them load errors.

```js
const card = document.querySelector('profile-card');
card.count = 4;
console.log(card.$props.name);
```

Declared properties update reactive state. With `reflect`, property assignments update attributes and attribute changes
update props. Shared fetched values are cloned per consumer.

Property accessors are enumerable/configurable on the generated prototype. Reads, writes, coercion, validation, and
reflection remain unchanged:

```js
const prototype = Object.getPrototypeOf(card);
const countDescriptor = Object.getOwnPropertyDescriptor(prototype, 'count');

console.log('count' in card); // true
console.log(Object.hasOwn(card, 'count')); // false
console.log(countDescriptor.enumerable, countDescriptor.configurable); // true true
```

Every component starts with these members:

| Member                | Behavior                                                                         |
| --------------------- | -------------------------------------------------------------------------------- |
| `$data`               | Parsed fetch result when the request target is `$data`.                          |
| `$loading`            | `true` while the component owns an active data request.                          |
| `$error`              | Current data error message, otherwise `null`.                                    |
| `$lastUpdated`        | Timestamp refreshed after reactive prop changes.                                 |
| `$emit(name, detail)` | Dispatch a bubbling, composed `CustomEvent` from the host.                       |
| `$reload(options?)`   | Run the same pipeline as `element.reload(options)`.                              |
| `$retry()`            | Refresh the current data endpoint without remounting the template.               |
| `$cancel(reason)`     | Cancel deferred loading and current component/data work.                         |
| `$cache`              | Component-scoped template/data cache helpers.                                    |
| `$persistence`        | Async storage helpers, present only when persistence is enabled and initialized. |

See [Data, caching, polling, and persistence](data.md) for cache and storage helpers and
[Lifecycle, events, and dynamic components](lifecycle.md) for control-method semantics.

## Bind an Alpine store

`bindStore` or the `bind-store` host attribute replaces the component-local props object with an existing Alpine store:

```js
Alpine.store('theme', {
    mode: 'dark',
});

AlpineComponentLoader.define('theme-panel', '/components/theme-panel.html', {
    bindStore: 'theme',
    attributes: {
        contrast: { type: String, default: 'standard' },
    },
});
```

```html
<theme-panel bind-store="theme"></theme-panel>
```

Create stores before initialization. ACL seeds missing props/helpers; existing keys win, and consumers share the store.
Missing stores report a `store` diagnostic and retain local state.

## Shadow and Light DOM

`shadow` defaults to `false`.

- Shadow components render into an open shadow root and use native slots.
- Light DOM components render in the host. Their original default and named children are captured and projected into
  matching `<slot>` elements.
- Light DOM slot input is observed for changes until the component is torn down.

```js
AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    shadow: true,
    attributes: { name: String },
});
```

```html
<profile-card name="Ada">
    <img slot="avatar" src="/avatars/ada.webp" alt="" />
    <p>Maintainer and reviewer.</p>
    <button slot="actions" type="button">Follow</button>
</profile-card>
```

Use named/default `<slot>` elements to place consumer nodes. SSR supports Shadow DOM and opt-in Light DOM through
`renderLightDom`/`lightDom`; hydration needs matching revisions. See [Light DOM SSR](ssr.md#opt-in-light-dom-ssr).

| Rendering option         | Default | Behavior                                                             |
| ------------------------ | ------- | -------------------------------------------------------------------- |
| `shadow`                 | `false` | Render into an open Shadow Root instead of the host.                 |
| `useConstructibleStyles` | `true`  | Cache/adopt constructible stylesheets in Shadow DOM when supported.  |
| `sharedStyleSheets`      | `[]`    | Adopt application-owned `CSSStyleSheet` objects before local sheets. |
| `stripStyles`            | `false` | Remove component template `<style>` elements.                        |
| `runtimeCacheMax`        | `200`   | Bound stylesheet, asset, and diagnostic metadata maps.               |

Light DOM uses native `@scope` or selector rewriting. Slots become transparent containers with fallback content until
supplied nodes arrive. Node identity is preserved and additions are observed until reload/deactivation/teardown.

## Styles and external assets

Ordinary `<style>` elements in Light DOM templates are scoped to the component host. Shadow styles remain inside the
shadow root. `stripStyles`, `sharedStyleSheets`, and `useConstructibleStyles` control local style handling.

Load explicit dependencies with `externalCss` and `externalScripts`:

```js
AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    shadow: true,
    externalCss: ['/styles/profile-card.css', { url: '/styles/profile-card-print.css', media: 'print' }],
    externalScripts: [{ url: '/components/profile-card.js', type: 'module' }],
});
```

Descriptors support `url`, `integrity`, `crossOrigin`, `referrerPolicy`, `nonce`, `timeout`, CSS `media`, and script
`type`. Matching descriptors deduplicate; scripts keep declaration order. CSS is global with local links for Shadow DOM.

Assets participate in cancellation, teardown, and manifest offline graphs. External scripts are trusted dependencies;
`executeScripts` controls only template scripts, also subject to sanitization. See [security](security.md).

## Loading and fallback UI

Choose when resource work begins:

| `loading` mode | Behavior                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------- |
| `eager`        | Start as soon as the host connects.                                                           |
| `lazy`         | Wait for viewport intersection; use eager loading when `IntersectionObserver` is unavailable. |
| `idle`         | Schedule through `requestIdleCallback` with a timeout fallback.                               |

Deferred/loading hosts expose `aria-busy="true"`. Loading UI remains until templates, assets, Alpine, and initial data
settle.

Supply loading UI or generate responsive skeletons:

```bash
npx alpine-component-loader skeleton ./index.html \
  --mode manifest \
  --out-dir skeletons
```

CSS mode emits `acl-skeletons.css`. Link it early to reserve geometry before registration:

```html
<link rel="stylesheet" href="/skeletons/acl-skeletons.css" />
```

Selectors remain active while busy and stop when ready; no JavaScript registration is needed.

The `manifest` mode writes a JavaScript skeleton manifest and reservation stylesheet. Register both before startup:

```js
import AlpineComponentLoader from 'alpine-component-loader';
import skeletons from './skeletons/acl-skeletons.generated.js';
import './skeletons/acl-skeletons.generated.css';

await AlpineComponentLoader.registerSkeletonManifest(skeletons);
await AlpineComponentLoader.start();
```

Generated UI applies only without authored loading UI. `--mode css` emits standalone CSS; `--mode both` adds the
registered manifest.

| Mode       | Files                                   | Integration                                                                        |
| ---------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| `css`      | `acl-skeletons.css`                     | Link one stylesheet before loader JavaScript.                                      |
| `manifest` | `acl-skeletons.generated.js` and `.css` | Import the reservation CSS and register the generated module.                      |
| `both`     | All three files                         | Produce both choices; integrate one workflow rather than loading both stylesheets. |

Capture selects the first ready visible instance per tag at configured viewports/routes. Failures prevent output unless
`--allow-partial` is set. See [capture options](skeletons.md) for filtering, limits, and regeneration.

Output contains anonymous rectangles, never text, values, URLs, IDs, events, or DOM structure. Fixture data still
affects dimensions. Only recognized generated files are replaced unless `--force` is set. Late manifest registration
affects future eligible loads.

Customize the standalone colors with:

```css
:root {
    --acl-skeleton-base: #dbe3ec;
    --acl-skeleton-highlight: rgba(255, 255, 255, 0.7);
}
```

Provide a recoverable fallback for an initial template or data failure:

```js
AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    loadingHtml: '<p role="status">Loading profile…</p>',
    fallback: '/components/profile-card-fallback.html',
    errorCss: {
        border: '1px solid #dc2626',
        padding: '1rem',
    },
});
```

`fallback` accepts URLs, selectors, or template elements. Initial template/data failures render it with Alpine and
normal completion events. Later data failures keep the mounted UI and update `$error`.

Without a fallback, the component emits `acl:error` and renders an accessible `role="alert"` block. `errorCss` merges
with the built-in error styles. External loading templates apply source resolution and template caching before
parsing/sanitization; inline loading HTML is parsed and sanitized directly. Fallback content uses template caching and
the normal sanitizer, Trusted Types, script, style, and rendering pipeline. All of this work remains owned by the
component's cancellation boundary.

## Reloading and state retention

Component hosts expose `reload()`, `retry()`, and `cancel()`:

```js
const card = document.querySelector('profile-card');

await card.reload({
    preserveState: true,
    clearTemplate: true,
    clearData: false,
    reason: 'manual-refresh',
});
```

Reload cancels stale template, asset, and data work. Development reloads can preserve public props, form controls,
selection, focus, and scroll state. A disconnected host with `keep-alive` may retain state within the configured
`keepAliveMax`; ordinary teardown releases observers, timers, listeners, persistence effects, assets, and Alpine trees.

For request and cache behavior see [Data, caching, polling, and persistence](data.md). For hooks and events see
[Lifecycle, events, and dynamic components](lifecycle.md).
