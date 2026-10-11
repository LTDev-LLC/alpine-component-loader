# Static SSR and hydration

The Node-only `/ssr` entry uses parse5 to render manifest components without executing Alpine or serializing application
stores. Shadow components use Declarative Shadow DOM for browser hydration. Light DOM rendering and bounded initial data
(`dataResolver` or `dataPolicy`) are opt-in.

SSR and generated precache graphs require URL-backed manifest definitions. Inline JavaScript templates, selector
sources, and browser template declarations are browser-only; move shared templates to files referenced by the manifest.

`parse5` is optional and installed by default. After `npm install --omit=optional`, install it before using SSR:

```bash
npm install parse5
```

## End-to-end quick start

Start with `components/profile-card.html`:

```html
<article x-data="{ count: Number($props.count) }">
    <slot name="avatar"></slot>
    <h2 x-text="$props.name"></h2>
    <p><slot>Profile details</slot></p>
    <button type="button" @click="count++">Visits: <span x-text="count"></span></button>
</article>
```

Generate the component manifest:

```bash
npx alpine-component-loader manifest components --out acl-manifest.json
npx alpine-component-loader validate acl-manifest.json
```

The generator adds the source and SHA-256 `templateRevision`. Declare Shadow DOM and props in the adjacent
`components/profile-card.acl.json` sidecar:

```json
{
    "$schema": "../acl-component.schema.json",
    "version": 1,
    "groups": ["profile"],
    "options": {
        "shadow": true,
        "attributes": {
            "name": { "type": "String", "required": true },
            "count": { "type": "Number", "default": 0 }
        }
    },
    "metadata": {
        "description": "A server-rendered profile summary.",
        "slots": {
            "default": { "description": "Profile details." },
            "avatar": { "description": "Profile avatar." }
        }
    }
}
```

Generate the component-sidecar schema once for editor validation, then safely refresh the manifest:

```bash
npx alpine-component-loader schema --kind component --out acl-component.schema.json
npx alpine-component-loader manifest components --out acl-manifest.json --update
```

The manifest combines generated source/revision fields with sidecar options, metadata, dependencies, and groups:

```json
{
    "version": 1,
    "components": {
        "profile-card": {
            "source": "components/profile-card.html",
            "dependencies": [],
            "options": {
                "shadow": true,
                "attributes": {
                    "name": { "type": "String", "required": true },
                    "count": { "type": "Number", "default": 0 }
                },
                "templateRevision": "sha256-..."
            },
            "metadata": {
                "description": "A server-rendered profile summary.",
                "slots": {
                    "default": { "description": "Profile details." },
                    "avatar": { "description": "Profile avatar." }
                }
            }
        }
    },
    "groups": {
        "profile": ["profile-card"]
    }
}
```

`manifest --update` refreshes templates and sidecars, preserves other authored fields, and warns about missing
components. Add `--prune` to delete missing entries. See [manifest ownership rules](manifests-and-cli.md).

## Create the server renderer

Load the parsed manifest and give local templates an explicit project root:

```js
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSSRRenderer } from 'alpine-component-loader/ssr';

const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'acl-manifest.json'), 'utf8'));
const renderer = createSSRRenderer({ manifest, root });

const html = await renderer.render('profile-card', {
    props: { name: 'Ada', count: 3 },
    attributes: { id: 'primary-profile', class: 'featured' },
    slots: {
        default: '<p>Maintainer and reviewer.</p>',
        avatar: '<img src="/avatars/ada.webp" alt="">',
    },
});
```

Renderer construction options are:

| Option             | Default                    | Contract                                                                                      |
| ------------------ | -------------------------- | --------------------------------------------------------------------------------------------- |
| `manifest`         | required                   | Parsed version-one component manifest.                                                        |
| `root`             | required for local sources | Project boundary used for local template resolution and traversal checks.                     |
| `fetch`            | `globalThis.fetch`         | Fetch implementation for remote templates.                                                    |
| `resolver`         | none                       | Application source resolver that runs before local/remote loading.                            |
| `timeout`          | `10000`                    | Positive remote-template request deadline in milliseconds.                                    |
| `maxTemplateBytes` | 1 MiB                      | Positive local or remote template byte limit.                                                 |
| `maxDataBytes`     | 256 KiB                    | Positive serialized initial-data byte limit.                                                  |
| `maxRedirects`     | `5`                        | Non-negative remote-template redirect bound.                                                  |
| `renderLightDom`   | `false`                    | Default opt-in for rendering non-shadow definitions on the server.                            |
| `dataResolver`     | none                       | Application callback for bounded JSON-safe initial data.                                      |
| `dataPolicy`       | none                       | Declarative, origin-bounded component request policy; mutually exclusive with `dataResolver`. |
| `security`         | `{}`                       | SSR URL-policy override applied with built-in sanitization.                                   |

The renderer exposes asynchronous `render()`, `renderMany()`, and `renderStream()`. Synchronous `clearCache()` clears
this renderer’s template and parsed-tree caches.

Per-render options are:

| Option         | Default               | Contract                                                |
| -------------- | --------------------- | ------------------------------------------------------- |
| `props`        | `{}`                  | Declared component props serialized to host attributes. |
| `attributes`   | `{}`                  | Additional safe host attributes.                        |
| `slots`        | `{}`                  | Default string or default/named slot values.            |
| `resolveData`  | `true`                | Run the configured resolver/policy for this render.     |
| `lightDom`     | renderer default      | Override Light DOM SSR for this request.                |
| `hydrate`      | definition or `eager` | `eager`, `visible`, `idle`, `interaction`, or `media`.  |
| `hydrateMedia` | definition value      | Required media query for `hydrate: "media"`.            |

The result contains the host, hydration markers, a serializable declarative shadow template, and sanitized slot content:

```html
<profile-card
    id="primary-profile"
    class="featured"
    name="Ada"
    count="3"
    data-acl-ssr="1"
    data-acl-revision="sha256-..."
>
    <template data-acl-ssr-shadow shadowrootmode="open" shadowrootserializable>…</template>
    <p>Maintainer and reviewer.</p>
    <span slot="avatar" data-acl-ssr-slot><img src="/avatars/ada.webp" alt="" /></span>
</profile-card>
```

Props must be declared in `options.attributes`. Booleans become presence attributes; arrays and objects become JSON.
Unknown props, inline handlers, and reserved ACL hydration attributes are rejected. Other host attributes are escaped.

## Batch rendering and cache control

`renderMany()` renders independent components concurrently and preserves request order:

```js
const [primary, secondary] = await renderer.renderMany([
    {
        tagName: 'profile-card',
        props: { name: 'Ada', count: 3 },
        slots: { default: '<p>Maintainer</p>' },
    },
    {
        tagName: 'profile-card',
        props: { name: 'Grace', count: 5 },
        slots: { default: '<p>Reviewer</p>' },
    },
]);
```

Templates are cached by resolved source and revision. Clear the cache after changing templates in a long-running
process:

```js
renderer.clearCache();
```

## Hydrate with the same manifest

Serve the same `acl-manifest.json` to the browser, register it before startup, and load Alpine normally:

```js
import Alpine from 'alpinejs';
import AlpineComponentLoader from 'alpine-component-loader/core';

window.Alpine = Alpine;

const response = await fetch('/acl-manifest.json');
if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);

const manifest = await response.json();
await AlpineComponentLoader.registerManifest(manifest);
const loaderStart = AlpineComponentLoader.start();
Alpine.start();
await loaderStart;
```

Explicit manifest registration lets `/core` skip discovery and load hydration support on demand. Register any boundary,
dynamic, or declarative built-ins before startup; the root entry can discover them. See [explicit startup](core.md). For
Web Components fallback, await [`loadPolyfills()` in a separate bootstrap](polyfills.md) before importing this client.
Polyfills still require ESM/ES2022 support and matching SSR markers and revisions.

Shadow hydration is selected only when all of these conditions hold:

- The registered definition uses `shadow: true`.
- The host has `data-acl-ssr` and a direct marked Declarative Shadow DOM template or an already-adopted shadow root.
- The shadow root contains rendered content.
- `data-acl-revision` exactly matches the client definition's `templateRevision`, including the empty-string case.

Matching markup skips the template request. Assets, data, persistence, event forwarding, Alpine, hooks, and polling
initialize once between `acl:hydrationstart` and `acl:hydrationend`.

Per-render `hydrate` (`eager`, `visible`, `idle`, `interaction`, or `media`) and `hydrateMedia` override manifest
defaults. Deferred modes require valid SSR markup. `data-acl-hydration-state` reports progress; hydration or teardown
releases trigger resources.

The [SSR Feature Lab](../examples/feature-lab-ssr/README.md) demonstrates in-place hydration and revision-mismatch
fallback.

Malformed markup or a revision mismatch stays visible until normal client rendering replaces it through the
template-loading and fallback path.

Light DOM hydration also requires matching revision and hydration markers. The client sanitizes existing content,
restores slots, and initializes Alpine without fetching the template. A mismatch stays visible until client rendering
succeeds.

## Roots, base paths, and local files

For a relative component source, the renderer resolves:

```text
root + manifest.basePath + component.source
```

For example, a root of `/srv/app`, a `basePath` of `public`, and a source of `components/profile-card.html` resolve to
`/srv/app/public/components/profile-card.html`.

Local Shadow sources require `root`. Resolved symlinks must remain beneath it; directories, missing files, unsupported
schemes, selectors, and escaping paths are rejected.

## Remote templates and application resolvers

Built-in remote loading allows HTTPS only, rejects credentials and private/reserved destinations, and enforces timeout,
byte, and redirect limits. Each redirect is validated:

```js
const renderer = createSSRRenderer({
    manifest,
    timeout: 5000,
    maxTemplateBytes: 256 * 1024,
    maxDataBytes: 64 * 1024,
    maxRedirects: 3,
});
```

Custom `fetch` or `resolver` enables application-controlled private or authenticated retrieval. The application owns
authorization, destination validation, and tenant isolation:

```js
const renderer = createSSRRenderer({
    manifest,
    fetch: authenticatedFetch,
    resolver: async (source, definition) => resolveTenantTemplate(source, definition),
});
```

Resolvers return a local path or HTTPS URL. Loading, size, and revision checks still apply.

## Opt-in initial data resolution

`dataResolver` fills the configured target (default `$props.$data`) without executing Alpine or following `data.src`:

```js
const renderer = createSSRRenderer({
    manifest,
    root,
    dataResolver: async ({ tagName, props }) => {
        if (tagName !== 'profile-card') return undefined;
        return database.profiles.findById(props.id);
    },
});
```

Values must be JSON-serializable and fit `maxDataBytes`. ACL escapes them into an inert JSON script, parses them before
client loading, and skips the first configured data request. Resolver errors reject rendering. Per-render
`resolveData: false` keeps data loading on the client.

## Explicit SSR data-request policy

`dataPolicy` and `dataResolver` are mutually exclusive. To follow JSON-safe manifest `options.data`, provide a base URL
and exact allowed origins or an authorization callback:

```js
const renderer = createSSRRenderer({
    manifest,
    root,
    dataPolicy: {
        baseUrl: 'https://api.example.com/',
        allowedOrigins: ['https://api.example.com'],
        timeout: 5000,
        maxResponseBytes: 256 * 1024,
        maxRedirects: 3,
        resolve({ tagName, props, data }) {
            if (tagName !== 'profile-card') return {};
            return {
                keys: { id: props.id },
                params: { locale: 'en' },
                options: { headers: { 'x-view': 'profile' } },
            };
        },
    },
});
```

Methods default to GET/HEAD; others require `allowUnsafeMethods: true`. Credential URLs, private/reserved destinations,
and unauthorized origins or redirects are rejected. Each redirect is checked. Sensitive authorization/cookie headers
require `allowSensitiveHeaders`. Timeout, redirect, and byte limits also apply with custom fetch.

Only JSON responses become initial data. Browser hooks, DOM callbacks, polling, streaming/blob responses, and browser
cache behavior are excluded. `resolveData: false` skips resolver and policy work.

## Opt-in Light DOM SSR

Set `renderLightDom: true` on the renderer or `lightDom: true` for one render to emit the sanitized component template
for a Light DOM definition:

```js
const renderer = createSSRRenderer({
    manifest,
    root,
    renderLightDom: true,
});

const html = await renderer.render('account-summary', {
    props: { accountId: 'acct-7' },
    slots: {
        actions: '<button type="button">Open</button>',
    },
});
```

Default and named consumer nodes are projected into transparent slot anchors without executing the template. Output
includes revision and hydration markers; the browser sanitizes it before Alpine starts. Light DOM defaults to a
client-fallback host, so server rendering requires opt-in.

## Revision and security guarantees

`sha256-` revisions are checked against template bytes; mismatches reject rendering. Regenerate revisions after template
changes. They also partition browser caches and prevent hydration of stale markup.

SSR sanitization removes scripts, inline handlers, executable URLs, `<base>`, refresh metadata, and `srcdoc` from
templates and slots. Applications can supply a stricter URL policy:

```js
const renderer = createSSRRenderer({
    manifest,
    root,
    security: {
        urlPolicy(url) {
            return url.startsWith('/') || url.startsWith('https://cdn.example.com/');
        },
    },
});
```

The browser sanitizes again before Alpine starts. Custom policies cannot restore rejected content or override ACL-owned
host attributes.

## Troubleshooting

### The browser requests the component template

Confirm `shadow: true`, the same parsed manifest on server and client, a direct `data-acl-ssr-shadow` template, and an
exact `data-acl-revision` match. Check that HTML middleware has not removed declarative shadow attributes.

### SSR returns an empty custom-element host

The definition is probably Light DOM and `renderLightDom` was not enabled. This client-fallback behavior remains the
default.

### Rendering reports an unknown prop

Add the prop to `options.attributes` using a JSON-safe serialized type such as `"String"`, then regenerate contracts if
needed.

### The revision fails after a template edit

Generate a fresh manifest to a temporary path, copy the new `templateRevision` into the enriched manifest, and restart
or clear the renderer cache.

See the [SSR Feature Lab](../examples/feature-lab-ssr/README.md) and [Security and Trusted Types](security.md).

## Ordered batches and streaming

`concurrency` defaults to eight. `renderMany(requests, { concurrency, signal })` and
`renderStream(requests, { concurrency, signal })` share a bounded engine. The stream yields HTML in input order and
starts at most one concurrency window ahead of consumption, even when an early render is slow. Abort, iterator closure,
or the first failure stops new work and releases batch-owned template subscriptions; yielded HTML remains delivered.
Individual render options also accept `signal`; resolver/data callbacks receive it for cooperative cancellation.

```js
for await (const html of renderer.renderStream(requests, { concurrency: 8, signal })) {
    response.write(html);
}
```

Source and unsanitized parsed trees are cached, then cloned and secured per render. Props, slots, and mutations stay
isolated. `clearCache()` invalidates both caches and pending writes.
