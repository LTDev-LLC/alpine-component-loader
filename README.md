# AlpineComponentLoader

**AlpineComponentLoader** is a robust, zero-dependency generic web component loader designed specifically for [Alpine.js](https://alpinejs.dev/). It transforms standard HTML templates into reactive, encapsulated **Custom Elements**, bridging the gap between simple DOM sprinkling and full Single Page Application (SPA) architecture.

It supports **Shadow DOM**, **Declarative Fetching**, **Global Store Binding**, **Lifecycle Hooks**, **Error Boundaries**, and more without any build steps.

---

## Why AlpineComponentLoader?

* **Zero Build Step**: No Webpack, No Vite, No Node.js. Just import and run.
* **True Encapsulation**: Optional **Shadow DOM** support keeps CSS/JS isolated.
* **Dynamic Switching**: Swap components programmatically with **`<keep-alive>`** caching support.
* **Declarative Data**: Auto-fetch APIs (`data-src`) and bind Global Stores (`bind-store`) via attributes.
* **Resilience**: Built-in **Error Boundaries** (`fallback`) and **Strict Prop Validation**.
* **Performance**: Strategies for **Lazy** (Viewport) and **Idle** (CPU Idle) loading.
* **Type Safety**: Attributes are automatically coerced into real JavaScript `Numbers`, `Booleans`, `Arrays`, and `Objects`.

---

## Installation

Import the module directly. No installation required.

```html
<script type="module">
    import AlpineComponentLoader from '/dist/AlpineComponentLoader.js';

    // Optional: Global Configuration
    AlpineComponentLoader.config({
        basePath: '/components/',
        errorCss: { color: 'red', fontWeight: 'bold' }
    });
</script>
```

---

## Usage Guide

### 1. The Inline Method (Rapid Prototyping)

Define components directly in your HTML using `<template>`.

Use the **`acl-props`** attribute to define prop types and defaults via JSON. This ensures attributes passed to your component (like `count="5"`) are treated as Numbers, not Strings.

```html
<template acl-component="inline-counter" acl-props='{ "count": "Number", "label": { "type": "String", "default": "Default Counter" } }'>
    <div x-data="{ props: $el.$props }" style="border:1px solid #ccc; padding:10px;">
        <h3 x-text="props.label || 'Default Counter'"></h3>
        <button @click="props.count++">Count: <span x-text="props.count"></span></button>
    </div>
</template>

<inline-counter></inline-counter>
<inline-counter label="My Widget" count="5"></inline-counter>
```

### 2. The External Method (Scalable)

Move components to separate HTML files and register them via JavaScript. This is ideal for production applications.

**`components/navbar.html`**

```html
<style> :host { display: block; background: #333; color: white; } </style>
<nav x-data>
    <a href="/">Home</a>
    <a href="/about">About</a>
</nav>
```

**`index.html`**

```javascript
AlpineComponentLoader.define('site-nav', 'navbar.html', {
    shadow: true // Enable Shadow DOM style isolation
});
```

```html
<site-nav></site-nav>
```

### 3. The Declarative Loader (No JS)

Use the `<acl-component>` element to load components entirely from HTML without writing any JavaScript registration code.

```html
<acl-component
    src="/components/card.html"
    tag="my-card"
    shadow="true"
    loading="lazy"
    title="Hello World"
></acl-component>
```

---

## Data & State Management

### 1. Typed Props (Attributes → `$el.$props`)

The core feature of this library is transforming HTML attributes into typed JavaScript data. To use them efficiently, map them to your component scope using **`x-data`**.

#### Configuration (External Files)

When using `AlpineComponentLoader.define`, pass an `attributes` object:

```javascript
AlpineComponentLoader.define('user-card', 'card.html', {
    attributes: {
        'age': Number,
        'tags': Array,
        'config': Object,
        'active': Boolean
    }
});
```

#### Configuration (Inline Templates)

When using inline templates, use the `acl-props` JSON attribute:

```html
<template acl-component="user-card" acl-props='{ "age": "Number", "active": "Boolean" }'>
...
</template>
```

#### Usage

Regardless of how it is defined, usage is the same:

```html
<user-card
    active="true"
    age="25"
    tags="['admin', 'editor']"
    config="{ 'theme': 'dark' }"
></user-card>
```

### 2. Declarative Fetching (`data-src`)

Automatically fetch JSON data and inject it into `$el.$props.$data`.

```html
<user-profile data-src="/api/users/1"></user-profile>
```

**Template:**

```html
<div x-data="{ props: $el.$props }">
    <template x-if="props.$loading">Loading...</template>

    <template x-if="props.$error">
        <div style="color: red" x-text="props.$error"></div>
    </template>

    <template x-if="props.$data">
        <div>
            <h1 x-text="props.$data.name"></h1>
            <p x-text="props.$data.bio"></p>
        </div>
    </template>
</div>
```

### 3. Global Store Binding (`bind-store`)

Sync an Alpine Global Store to the component's props. Updates to the store automatically update the component.

```javascript
// Define store
Alpine.store('theme', { mode: 'dark', color: 'blue' });
```

```html
<theme-widget bind-store="theme"></theme-widget>
```

### 4. Emitting Events (`$emit`)

Dispatch custom events from your component using the **`$emit`** helper available on `props`. It automatically configures the event with `bubbles: true` and `composed: true` so it can be caught by parent components, even outside the Shadow DOM.

```html
<div x-data="{ props: $el.$props }">
    <button @click="props.$emit('save', { status: 'complete' })">
        Save Progress
    </button>
</div>

<my-component @save="console.log('Saved:', $event.detail.status)"></my-component>
```

### 5. Dynamic Components (`<acl-dynamic>`)

Dynamically switch between components using the `<acl-dynamic>` element. This is similar to Vue's `<component :is="...">`. Attributes placed on the loader are automatically forwarded to the rendered component.

```html
<div x-data="{ currentView: 'user-profile' }">
    <button @click="currentView = 'user-settings'">Edit Settings</button>
    <acl-dynamic :is="currentView" theme="dark"></acl-dynamic>
</div>
```

#### Keep-Alive (Caching)

By default, switching components destroys the old instance (losing state). Add the **`keep-alive`** attribute to cache inactive components in memory. When you switch back, they retain their state (input values, scroll position, etc.).

```html
<acl-dynamic :is="currentView" keep-alive></acl-dynamic>
```

### 6. Component keep-alive

You can also use **`keep-alive`** on standard components to prevent them from being destroyed when removed from the DOM manually. This allows you to detach a component (e.g., `el.remove()`) and re-attach it later without losing its state or triggering a re-fetch.

```html
<user-profile keep-alive id="my-profile"></user-profile>

<script>
  const el = document.getElementById('my-profile');

  // Remove from DOM
  // The component is "Deactivated" but its state/Alpine scope is preserved in memory
  el.remove();

  // ... Later ...

  // Re-append to DOM
  // The component is "Activated". It resumes immediately without re-initializing.
  document.body.appendChild(el);
</script>
```

### 7. State Persistence (`persist`)

Automatically save and restore component props to `localStorage` or `sessionStorage`. This is useful for preserving form inputs, user preferences, or active tabs across page reloads.

* **`persist`**: Set to `"local"` (for localStorage) or `"session"` (for sessionStorage).
* **`persist-key`**: (Optional) The unique key used in storage. Defaults to `acl:tagName`. If you have multiple instances of the same component, you **must** provide unique keys (or unique IDs on the elements).
* **`persist-debounce`**: (Optional) Number of milliseconds to delay writing to storage. Useful for high-frequency updates like typing. Includes safety checks to flush data before the page unloads.

```html
<user-settings
    persist="local"
    persist-key="app-settings_v1"
    persist-debounce="500"
    theme="dark"
    notifications="true"
></user-settings>
```

#### Persistence API (`$persistence`)

The loader injects a helper object into `props.$persistence` to allow manual control over storage:

* **`$save()`**: Forces a save immediately (respects debounce if set).
* **`$flush()`**: Immediately writes any pending debounced changes to storage.
* **`$clear()`**: Removes the key from storage.
* **`$get()`**: Returns the current raw value from storage.

```html
<button @click="props.$persistence.$clear(); location.reload()">
    Reset to Defaults
</button>
```

---

## Performance & Resilience

### Loading Strategies

* **`loading="eager"`** (Default): Loads immediately.
* **`loading="lazy"`**: Loads when the element enters the viewport (IntersectionObserver). Use this for "below the fold" content.
* **`loading="idle"`**: Loads when the browser network/CPU is idle (requestIdleCallback). Great for analytics or non-critical UI.

```html
<heavy-footer loading="idle"></heavy-footer>
```

### Error Boundaries (`fallback`)

If a component fails to load (404, Network Error) or fails to fetch its `data-src`, the loader renders a fallback template instead of breaking the page.

```html
<acl-component
    src="dashboard.html"
    tag="my-dashboard"
    fallback="#tpl-error-skeleton"
></acl-component>

<template id="tpl-error-skeleton">
    <div class="error-box">⚠️ Widget unavailable</div>
</template>
```

### External Dependencies

Load CSS (Bootstrap/Icons) or JS (Chart.js) automatically.

* **CSS:** Injected into Global Head (for caching/fonts) AND Shadow Root (for scoping).
* **JS:** Deduplicated globally.

```javascript
AlpineComponentLoader.define('chart-widget', 'chart.html', {
    shadow: true,
    externalCss: ['https://cdn.jsdelivr.net/npm/bootstrap-icons/font/bootstrap-icons.css'],
    externalScripts: ['https://cdn.jsdelivr.net/npm/chart.js']
});
```

---

## Lifecycle Hooks

Execute logic during specific phases of the component definition.

| Hook | Trigger | Context (`this`) |
| --- | --- | --- |
| `beforeMount` | DOM created, props initialized, but not rendered. | Component Instance |
| `mounted` | DOM rendered, Alpine initialized. | Component Instance |
| `updated` | Observed attribute changed. | `{ name, oldVal, newVal }` |
| `activated` | Component restored from `` cache. | Component Instance |
| `deactivated` | Component removed but cached by ``. | Component Instance |
| `unmounted` | Component removed from DOM. | Component Instance |
| `loaded` | Component has finished the loading step. | Component Instance |

```javascript
AlpineComponentLoader.define('timer-comp', 'timer.html', {
    hooks: {
        mounted() {
            console.log('Component mounted!');
            this.timer = setInterval(() => console.log('Tick'), 1000);
        },
        unmounted() {
            clearInterval(this.timer);
        }
    }
});
```
---

## API Reference

### `define(tagName, source, options)`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `attributes` | `Object` | `{}` | Prop definitions (`type`, `default`, `required`). |
| `shadow` | `Boolean` | `false` | Enable Shadow DOM encapsulation. |
| `dataSrc` | `String` | `null` | Default API URL for fetching. |
| `bindStore` | `String` | `null` | Name of Alpine Store to bind to props. |
| `loading` | `String` | `'eager'` | `'eager'`, `'lazy'`, or `'idle'`. |
| `fallback` | `String` | `null` | URL/ID of template to show on error. |
| `hooks` | `Object` | `{}` | Lifecycle (`mounted`...) and Data (`beforeFetch`...) hooks. |
| `externalCss` | `Array` | `[]` | List of CSS URLs to inject. |
| `externalScripts` | `Array` | `[]` | List of JS URLs to inject. |
| `forwardEvents` | `Array` | `[]` | Events to bubble out of Shadow DOM. |
| `fetchTimeout` | `Number` | `10000` | Timeout for `data-src` requests (ms). |
| `cacheTemplates` | `Boolean` | `true` | Enable template cache for external (HTTP(s)) templates for 15 minutes. |

### `config(options)`

Set global defaults for all components (e.g., `basePath`, `errorCss`).

### `start()`

Manually trigger the loader (runs automatically on `DOMContentLoaded`).

### `clearCache()`

Manually clears all template caches (Current and Old versions) from the browser's Cache Storage. Useful for forcing a refresh of templates without changing the version number.

```javascript
await AlpineComponentLoader.clearCache();
```

---

## Troubleshooting

**Q: My fonts aren't loading in Shadow DOM.**

A: The library handles this automatically via "Dual Injection". It injects the CSS into the Shadow Root (for classes) and the Global Head (for `@font-face` definitions). Ensure your `externalCss` URL is correct.

**Q: `beforeMount` crashes saying `props` is undefined.**

A: Ensure you define your attribute in the config: `attributes: { 'myProp': Array }`. The library auto-initializes Types (Arrays become `[]`, Objects `{}`) so they are ready for use in hooks.

**Q: Fetching data flickers when I change the attribute fast.**

A: The library uses `AbortController` internally. Rapid changes to `data-src` automatically cancel the previous pending request, ensuring your UI always shows the data for the *current* attribute value.

