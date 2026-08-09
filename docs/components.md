# Components, props, slots, and rendering

AlpineComponentLoader turns an HTML template into a custom element. A definition supplies a tag, a template source, and optional rendering, prop, data, asset, lifecycle, and persistence settings.

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

The root package is side-effect free. Call `start()` after configuration and registration, or deliberately use the browser-only `alpine-component-loader/auto` entry when import-time startup is wanted. Definitions added after startup register immediately.

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

The required `template` is a non-empty HTML string. All other keys are ordinary
component options and a separate third argument is rejected. The inline source
does not fetch or enter the persistent URL template cache. Use a DOM selector
when multiple definitions should intentionally share one authored template;
use a URL when templates should deploy independently from JavaScript.

JavaScript inline objects, selector-backed templates, and `x-acl` declarations
are browser-runtime authoring paths. Static SSR and generated offline precache
graphs require URL-backed component sources in a manifest. A browser-only
inline component can still use data requests, persistence, props, slots,
assets, sanitization, and the ordinary component lifecycle.

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

Custom-element names must contain a hyphen. Use `has()`, `getDefinition()`, and `getRegisteredTags()` to inspect definitions without touching internal registries.

### Resolve application-specific sources

`sourceResolver` runs before `basePath`. It receives the original source and a
frozen context containing `tagName`, the local `config`, current
`globalConfig`, and the owning `loader` class:

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

A falsy resolver result keeps the original source. `basePath` prefixes only relative string sources after resolution; absolute URLs, protocol-relative URLs, root-relative paths, `#template` selectors, and `HTMLTemplateElement` objects are left unchanged. The resolver is synchronous and should return a string or template element, not fetch the template itself.

### Discover inline definitions

`start()` scans existing `template[x-acl]` and
`template[acl-component]` definitions:

```html
<template
    x-acl="inline-counter"
    acl-props='{ "count": { "type": "Number", "default": 0 } }'
>
    <button @click="$props.count++" x-text="$props.count"></button>
</template>

<inline-counter count="5"></inline-counter>
```

Scan a specific subtree with `registerTemplates(root)`. If an application inserts definitions later, use `observeTemplates({ root, subtree })`; it registers future matching templates and returns a cleanup function. Only one loader-owned template observer is active, so a later observation replaces the previous one.

Both marker spellings support `acl-props` and every serializable data control
listed in the data guide. The marker attributes are definition metadata and do
not render inside the custom element. Both markers may be present only when
they name the same component. Existing hosts upgrade when registration
completes; future hosts upgrade through the browser custom-element registry.

The ordinary entry keeps late discovery opt-in. The `/auto` entry observes late
templates by default. Set its global opt-out before importing the entry:

```html
<script>
    window.AlpineComponentLoaderConfig = { observeTemplates: false };
</script>
```

That opt-out still permits the initial startup scan. `autoStart: false` disables
both. Call `stopObservingTemplates()` to stop an active observer. Use paired
custom-element tags in HTML rather than self-closing syntax.

## Register components from a manifest

For applications with SSR, offline bundles, generated types, or dependency prefetch, generate and enrich a shared component manifest:

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

`registerManifest()` accepts an object, not a URL. The generator supplies sources, inferred dependencies, and template revisions; add Shadow DOM, prop contracts, groups, and metadata manually. See [Manifests, generated contracts, and CLI tooling](manifests-and-cli.md).

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

`src` is required. When `tag` is absent, the proxy derives it from the source filename; the result must still be a valid, hyphenated custom-element name. If the tag is not already registered, undeclared public attributes are inferred as String, Number, Boolean, Array, or Object props. If it is already registered, the existing definition wins.

| Proxy attribute | Purpose |
| --- | --- |
| `src` | Required template source. |
| `tag` | Target custom-element name. |
| `shadow` | Enable Shadow DOM; the literal value `false` disables it. |
| `loading` | `eager`, `lazy`, or `idle`. |
| `acl-props` | Strict-JSON prop definitions using serialized constructor names. |
| `data-fetch-options` | Strict-JSON base `RequestInit`; other request controls use the data attributes documented below. |
| `external-css` / `external-scripts` | Strict-JSON arrays of asset strings or descriptors. |
| `forward-events` | Strict-JSON event-name or mapping array. |
| `hooks` | Safe dotted path to an existing hook object on `window`. |
| `template-cache-strategy` | Template cache policy for this definition. |
| `loading-template` / `loading-html` | Temporary loading UI. |
| `sanitize` | Enable or disable sanitization for this definition. |
| `bind-store` | Existing Alpine store name. |
| `fallback` | Template source used after an initial failure. |
| Data and persistence attributes | The controls listed in [Data, caching, polling, and persistence](data.md). |

Declarative values never evaluate JavaScript. Object keys and strings require double quotes; `acl-props`, fetch settings, arrays, asset descriptors, and forwarding rules must be valid JSON. Functions such as a custom parser, validator, coercer, sanitizer, storage adapter, migration, or dynamic request builder belong in JavaScript configuration.

The `hooks` path accepts identifiers separated by dots and blocks prototype traversal. For example, `hooks="ACLHooks.profile"` resolves `window.ACLHooks.profile`. Loader-only definition attributes are consumed; public props, runtime control attributes, classes, styles, IDs, and child nodes move to the real component without cloning their state.

## Props, reactive state, and built-in helpers

Supported prop constructors are `String`, `Number`, `Boolean`, `Array`, and `Object`. A descriptor may add a default, required/nullability rules, reflection, an allowed-options list, nested object validation, a validator, or a coercer:

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

| Descriptor field | Purpose |
| --- | --- |
| `type` | `String`, `Number`, `Boolean`, `Array`, or `Object`. |
| `default` | Stable value or factory used when input is absent or invalid. |
| `required` | Report a missing input. |
| `nullable` | Permit `null`, including the literal `null` for an attribute. |
| `reflect` | Reflect host property assignments back to the corresponding attribute. |
| `options` | Restrict values to an allowed list. |
| `schema` | Recursively validate fields in an Object prop. |
| `validator` | Apply additional application validation. |
| `coerce` | Convert an attribute string with `{ el, props, name, definition }` context. |

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

Props are available as element properties, through the component host's `$props`, and as the
component-scoped Alpine value `$props`. The scoped value is the same reactive object, so templates
can read it directly without declaring `x-data`. Existing templates that capture it with
`x-data="{ props: $el.$props }"` remain supported. Mutable defaults are cloned for every element.
With `strictProps: false`, invalid values are reported and replaced with safe defaults;
`strictProps: true` turns them into load errors.

```js
const card = document.querySelector('profile-card');
card.count = 4;
console.log(card.$props.name);
```

The same object is exposed through `$el.$props`, the host's `$props`, lifecycle/fetch contexts, and the component-scoped Alpine `$props` magic. Declared names also receive host property accessors. When `reflect` is enabled, assigning the property updates its attribute; attribute changes update reactive state. Mutable defaults and shared fetched values are cloned at consumer boundaries.

Declared accessors are inherited from the generated custom-element prototype,
not installed as own properties on every instance. Their descriptors remain
enumerable and configurable, and reads, writes, coercion, validation, and
reflection are unchanged:

```js
const prototype = Object.getPrototypeOf(card);
const countDescriptor = Object.getOwnPropertyDescriptor(prototype, 'count');

console.log('count' in card); // true
console.log(Object.hasOwn(card, 'count')); // false
console.log(countDescriptor.enumerable, countDescriptor.configurable); // true true
```

Every component starts with these members:

| Member | Behavior |
| --- | --- |
| `$data` | Parsed fetch result when the request target is `$data`. |
| `$loading` | `true` while the component owns an active data request. |
| `$error` | Current data error message, otherwise `null`. |
| `$lastUpdated` | Timestamp refreshed after reactive prop changes. |
| `$emit(name, detail)` | Dispatch a bubbling, composed `CustomEvent` from the host. |
| `$reload(options?)` | Run the same pipeline as `element.reload(options)`. |
| `$retry()` | Refresh the current data endpoint without remounting the template. |
| `$cancel(reason)` | Cancel deferred loading and current component/data work. |
| `$cache` | Component-scoped template/data cache helpers. |
| `$persistence` | Async storage helpers, present only when persistence is enabled and initialized. |

See [Data, caching, polling, and persistence](data.md) for cache and storage helpers and [Lifecycle, events, and dynamic components](lifecycle.md) for control-method semantics.

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

Before binding, the loader seeds missing declared props and built-in helper fields into the store; existing store keys win. The component and all other store consumers then share one reactive object. Create the store before the component initializes. If the named store does not exist, the loader reports a `store` diagnostic and continues with local reactive state.

## Shadow and Light DOM

`shadow` defaults to `false`.

- Shadow components render into an open shadow root and use native slots.
- Light DOM components render in the host. Their original default and named children are captured and projected into matching `<slot>` elements.
- Light DOM slot input is observed for changes until the component is torn down.

```js
AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    shadow: true,
    attributes: { name: String },
});
```

```html
<profile-card name="Ada">
    <img slot="avatar" src="/avatars/ada.webp" alt="">
    <p>Maintainer and reviewer.</p>
    <button slot="actions" type="button">Follow</button>
</profile-card>
```

The template can place those nodes with `<slot name="avatar">`, `<slot>`, and `<slot name="actions">`. Static SSR always supports Shadow definitions and can opt Light DOM definitions into structural server rendering with `renderLightDom` or per-render `lightDom`. Both modes require matching revisions for in-place hydration; see [Static SSR and hydration](ssr.md#opt-in-light-dom-ssr).

| Rendering option | Default | Behavior |
| --- | --- | --- |
| `shadow` | `false` | Render into an open Shadow Root instead of the host. |
| `useConstructibleStyles` | `true` | Cache/adopt constructible stylesheets in Shadow DOM when supported. |
| `sharedStyleSheets` | `[]` | Adopt application-owned `CSSStyleSheet` objects before local sheets. |
| `stripStyles` | `false` | Remove component template `<style>` elements. |
| `runtimeCacheMax` | `200` | Bound stylesheet, asset, and diagnostic metadata maps. |

Light DOM styles use native CSS `@scope` when available and selector rewriting otherwise. Light DOM `<slot>` elements become transparent containers; their fallback content remains until consumer content is available. The loader preserves consumer node identity and observes additions until reload, deactivation, or teardown.

## Styles and external assets

Ordinary `<style>` elements in Light DOM templates are scoped to the component host. Shadow styles remain inside the shadow root. `stripStyles`, `sharedStyleSheets`, and `useConstructibleStyles` control local style handling.

Load explicit dependencies with `externalCss` and `externalScripts`:

```js
AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    shadow: true,
    externalCss: [
        '/styles/profile-card.css',
        { url: '/styles/profile-card-print.css', media: 'print' },
    ],
    externalScripts: [{ url: '/components/profile-card.js', type: 'module' }],
});
```

Asset descriptors support `url`, `integrity`, `crossOrigin`, `referrerPolicy`, `nonce`, `timeout`, CSS `media`, and script `type`. Matching descriptors are structurally deduplicated across components, and scripts load in declaration order. CSS is inserted globally; Shadow components also receive local links so component selectors work inside the shadow tree.

External assets participate in cancellation and teardown. If the component is included in an offline bundle, manifest-declared assets are added to its precache graph. External scripts are trusted executable dependencies and are not controlled by `executeScripts`, which applies only to scripts inside component templates. Template scripts remain separately controlled by `sanitize` and `executeScripts`; see [Security and Trusted Types](security.md).

## Loading and fallback UI

Choose when resource work begins:

| `loading` mode | Behavior |
| --- | --- |
| `eager` | Start as soon as the host connects. |
| `lazy` | Wait for viewport intersection; use eager loading when `IntersectionObserver` is unavailable. |
| `idle` | Schedule through `requestIdleCallback` with a timeout fallback. |

Deferred and loading hosts expose `aria-busy="true"`. Once work begins, `loadingTemplate` or `loadingHtml` remains until template, external assets, Alpine initialization, and initial data work settle.

Provide loading UI directly with `loadingTemplate` or `loadingHtml`, or capture responsive skeletons from a rendered page:

```bash
npx alpine-component-loader skeleton ./index.html \
  --mode manifest \
  --out-dir skeletons
```

The default `css` mode writes `acl-skeletons.css`. Link it early in the document head so responsive SVG masks can reserve and paint component geometry before the loader starts:

```html
<link rel="stylesheet" href="/skeletons/acl-skeletons.css">
```

CSS selectors continue matching while the loader exposes its busy state and stop when the component is ready. No JavaScript registration is required.

The `manifest` mode writes a JavaScript skeleton manifest and reservation stylesheet. Register both before startup:

```js
import AlpineComponentLoader from 'alpine-component-loader';
import skeletons from './skeletons/acl-skeletons.generated.js';
import './skeletons/acl-skeletons.generated.css';

await AlpineComponentLoader.registerSkeletonManifest(skeletons);
await AlpineComponentLoader.start();
```

Generated loading UI applies only when a definition has no authored loading UI. Use `--mode css` for a standalone pre-definition stylesheet or `--mode both` for both delivery strategies.

| Mode | Files | Integration |
| --- | --- | --- |
| `css` | `acl-skeletons.css` | Link one stylesheet before loader JavaScript. |
| `manifest` | `acl-skeletons.generated.js` and `.css` | Import the reservation CSS and register the generated module. |
| `both` | All three files | Produce both choices; integrate one workflow rather than loading both stylesheets. |

The generator visits every selected route at configurable mobile and desktop viewports, activates lazy components, and captures the first visible ready instance of each selected tag. By default any route/viewport failure prevents output; `--allow-partial` writes successful captures and reports the failures. `--include`, `--exclude`, `--timeout`, `--mobile`, `--desktop`, and `--breakpoint` control discovery.

Generated masks/fragments contain anonymous rectangles only; they do not copy text, form values, URLs, IDs, event attributes, or application DOM structure. Dimensions still reflect the fixture data, so capture representative states. Generated files replace only other recognized generated files unless `--force` is supplied. Registering a manifest after a definition affects eligible future loads but does not interrupt a generation already in progress.

See [Skeleton loading UI](skeletons.md) for setup, route and component selection, responsive capture, output modes, regeneration, and troubleshooting.

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

`fallback` accepts the same URL, selector, or `HTMLTemplateElement` forms as a component source. It handles an initial template or data failure, initializes Alpine, and emits the normal completion events. A later data refresh keeps the mounted component and exposes the problem through `$error` instead of replacing the UI.

Without a fallback, the component emits `acl:error` and renders an accessible `role="alert"` block. `errorCss` merges with the built-in error styles. External loading templates apply source resolution and template caching before parsing/sanitization; inline loading HTML is parsed and sanitized directly. Fallback content uses template caching and the normal sanitizer, Trusted Types, script, style, and rendering pipeline. All of this work remains owned by the component's cancellation boundary.

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

Reload cancels stale template, asset, and data work. Development reloads can preserve public props, form controls, selection, focus, and scroll state. A disconnected host with `keep-alive` may retain state within the configured `keepAliveMax`; ordinary teardown releases observers, timers, listeners, persistence effects, assets, and Alpine trees.

For request and cache behavior see [Data, caching, polling, and persistence](data.md). For hooks and events see [Lifecycle, events, and dynamic components](lifecycle.md).
