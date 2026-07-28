# Static SSR and hydration

The Node-only `alpine-component-loader/ssr` entry renders manifest-defined components with parse5. It does not execute Alpine, launch a browser, or serialize application stores. Shadow components are emitted as Declarative Shadow DOM and can hydrate in place in the browser. An application may opt into bounded initial data with either `dataResolver` or an explicit `dataPolicy`, and may opt Light DOM definitions into structural server rendering.

`parse5` is an optional dependency that npm installs by default. A lean
`npm install --omit=optional` must install it before using SSR:

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
    <button type="button" @click="count++">
        Visits: <span x-text="count"></span>
    </button>
</article>
```

Generate the component manifest:

```bash
npx alpine-component-loader manifest components --out acl-manifest.json
npx alpine-component-loader validate acl-manifest.json
```

The generator adds the source and a SHA-256 `templateRevision`, but it cannot infer Shadow DOM or props. Put those authored fields in the adjacent `components/profile-card.acl.json` sidecar:

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

The generated manifest combines the content-owned source/revision with the sidecar-owned options, metadata, dependencies, and groups:

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

Use `manifest --update` whenever templates or sidecars change. It refreshes generated source/revision fields, preserves fields not owned by a sidecar, and retains missing components with a warning. Add `--prune` only when missing components should be deleted. See [Manifests, generated contracts, and CLI tooling](manifests-and-cli.md) for ownership rules.

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

| Option | Default | Contract |
| --- | --- | --- |
| `manifest` | required | Parsed version-one component manifest. |
| `root` | required for local sources | Project boundary used for local template resolution and traversal checks. |
| `fetch` | `globalThis.fetch` | Fetch implementation for remote templates. |
| `resolver` | none | Application source resolver that runs before local/remote loading. |
| `timeout` | `10000` | Positive remote-template request deadline in milliseconds. |
| `maxTemplateBytes` | 1 MiB | Positive local or remote template byte limit. |
| `maxDataBytes` | 256 KiB | Positive serialized initial-data byte limit. |
| `maxRedirects` | `5` | Non-negative remote-template redirect bound. |
| `renderLightDom` | `false` | Default opt-in for rendering non-shadow definitions on the server. |
| `dataResolver` | none | Application callback for bounded JSON-safe initial data. |
| `dataPolicy` | none | Declarative, origin-bounded component request policy; mutually exclusive with `dataResolver`. |
| `security` | `{}` | SSR URL-policy override applied with built-in sanitization. |

The renderer exposes `render(tagName, options)`, `renderMany(requests)`, and `clearCache()`. Rendering is asynchronous; cache clearing synchronously removes only this renderer's in-memory template cache.

Per-render options are:

| Option | Default | Contract |
| --- | --- | --- |
| `props` | `{}` | Declared component props serialized to host attributes. |
| `attributes` | `{}` | Additional safe host attributes. |
| `slots` | `{}` | Default string or default/named slot values. |
| `resolveData` | `true` | Run the configured resolver/policy for this render. |
| `lightDom` | renderer default | Override Light DOM SSR for this request. |
| `hydrate` | definition or `eager` | `eager`, `visible`, `idle`, `interaction`, or `media`. |
| `hydrateMedia` | definition value | Required media query for `hydrate: "media"`. |

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
    <span slot="avatar" data-acl-ssr-slot><img src="/avatars/ada.webp" alt=""></span>
</profile-card>
```

Prop keys must exist in `options.attributes`. Booleans become presence attributes, arrays and objects are serialized as JSON, and unknown props throw. Ordinary host attributes are escaped; inline handlers and reserved ACL hydration attributes are rejected.

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

Template loads are cached by resolved source and revision for the renderer lifetime. Clear the cache after templates change in a long-running development process:

```js
renderer.clearCache();
```

## Hydrate with the same manifest

Serve the same `acl-manifest.json` to the browser, register it before startup, and load Alpine normally:

```js
import Alpine from 'alpinejs';
import AlpineComponentLoader from 'alpine-component-loader';

window.Alpine = Alpine;

const response = await fetch('/acl-manifest.json');
if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);

const manifest = await response.json();
await AlpineComponentLoader.registerManifest(manifest);
const loaderStart = AlpineComponentLoader.start();
Alpine.start();
await loaderStart;
```

Shadow hydration is selected only when all of these conditions hold:

- The registered definition uses `shadow: true`.
- The host has `data-acl-ssr` and a direct marked Declarative Shadow DOM template or an already-adopted shadow root.
- The shadow root contains rendered content.
- `data-acl-revision` exactly matches the client definition's `templateRevision`, including the empty-string case.

On a match, the client skips the component-template request but still initializes external assets, component data, persistence, event forwarding, Alpine, hooks, and polling once. It emits `acl:hydrationstart` and `acl:hydrationend` around that work.

The renderer accepts `hydrate: "eager" | "visible" | "idle" | "interaction" | "media"` and `hydrateMedia` per render; these override manifest defaults. Progressive modes apply only to valid SSR markup. The host exposes `data-acl-hydration-state`, and all trigger resources are released after hydration or teardown.

The runnable [SSR example](../examples/ssr/README.md) exposes `?hydrate=interaction`, `?hydrate=visible`, `?hydrate=idle`, and `?hydrate=media` variations while retaining the default eager path for direct comparison.

Malformed markup or a revision mismatch remains visible until ordinary client rendering replaces it. The client then fetches the template and follows the normal loading/fallback path. This is intentional protection against hydrating stale or incompatible content.

For an opted-in Light DOM render, the host must also carry the matching revision and Light DOM hydration marker. The client sanitizes the existing structure, restores slot ownership, and initializes Alpine without requesting the template. A mismatch retains the server content until normal client rendering succeeds.

## Roots, base paths, and local files

For a relative component source, the renderer resolves:

```text
root + manifest.basePath + component.source
```

For example, a root of `/srv/app`, a `basePath` of `public`, and a source of `components/profile-card.html` resolve to `/srv/app/public/components/profile-card.html`.

The renderer resolves symlinks and requires the final file to remain beneath `root`. It rejects the root itself, directories, missing files, unsupported schemes, inline selectors, and paths that escape the project. `root` is required when a rendered Shadow component has a local source.

## Remote templates and application resolvers

Built-in remote loading accepts HTTPS only. It rejects credentials and private/reserved destinations, applies the configured timeout, response-size limit, and redirect limit, and validates every redirect target:

```js
const renderer = createSSRRenderer({
    manifest,
    timeout: 5000,
    maxTemplateBytes: 256 * 1024,
    maxDataBytes: 64 * 1024,
    maxRedirects: 3,
});
```

Supplying `fetch` or `resolver` opts into application-controlled private or authenticated retrieval. The application is then responsible for authorization, destination validation, and tenant isolation:

```js
const renderer = createSSRRenderer({
    manifest,
    fetch: authenticatedFetch,
    resolver: async (source, definition) => resolveTenantTemplate(source, definition),
});
```

A resolver returns a local path or HTTPS URL; the normal loading, size, and revision checks still apply to the resolved source.

## Opt-in initial data resolution

Provide `dataResolver` to populate the configured data target (by default `$props.$data`) without executing Alpine or allowing the renderer to follow a component `data.src`:

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

Resolved values must be JSON-serializable and fit `maxDataBytes`. They are escaped into a non-executable JSON script, parsed before client loading, and suppress the component's first configured data request. Resolver errors reject rendering. Set per-render `resolveData: false` when a route should retain client-only data loading.

## Explicit SSR data-request policy

`dataPolicy` is mutually exclusive with `dataResolver`. It follows JSON-safe manifest `options.data` only after the application supplies a base URL and either exact allowed origins or an authorization callback:

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

GET and HEAD are the only default methods; unsafe methods require `allowUnsafeMethods: true`. Credential-bearing URLs, private/reserved destinations, unauthorized origins, and unauthorized redirects are rejected. Redirects are validated one at a time. Sensitive authorization/cookie headers are removed unless `allowSensitiveHeaders` is explicit. Time, redirect, and byte limits remain enforced even with a caller-supplied fetch.

Only JSON responses become initial data. The policy does not run browser hooks, DOM callbacks, polling, streaming/blob behavior, or browser cache semantics. Per-render `resolveData: false` suppresses both resolver and policy data work.

The runnable [SSR example](../examples/ssr/README.md) keeps separate resolver and policy renderers and selects the policy path with `?data=policy`, making the construction-time mutual exclusion explicit.

## Opt-in Light DOM SSR

Set `renderLightDom: true` on the renderer or `lightDom: true` for one render to emit the sanitized component template for a Light DOM definition:

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

The renderer structurally projects default and named consumer nodes into transparent slot anchors without executing the template. The output carries revision and hydration markers, and the browser re-sanitizes it before Alpine starts. The default remains the client-fallback host for backward compatibility, so applications choose which Light DOM contracts are safe and useful to render on the server.

## Revision and security guarantees

When `templateRevision` starts with `sha256-`, the renderer hashes the loaded template and rejects a mismatch. Regenerate the revision whenever template bytes change. Revisions also partition browser template cache keys and make stale server markup fall back safely on the client.

The SSR sanitizer removes scripts, inline event handlers, executable URLs, `<base>`, refresh metadata, and `srcdoc` from component and slot markup. Supply a stricter URL policy when the application has an allowlist:

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

The browser sanitizes hydrated content again before Alpine initialization. The server cannot restore content already rejected by built-in policy, and callers cannot override ACL-owned host attributes.

## Troubleshooting

### The browser requests the component template

Confirm `shadow: true`, the same parsed manifest on server and client, a direct `data-acl-ssr-shadow` template, and an exact `data-acl-revision` match. Check that HTML middleware has not removed declarative shadow attributes.

### SSR returns an empty custom-element host

The definition is probably Light DOM and `renderLightDom` was not enabled. This client-fallback behavior remains the default.

### Rendering reports an unknown prop

Add the prop to `options.attributes` using a JSON-safe serialized type such as `"String"`, then regenerate contracts if needed.

### The revision fails after a template edit

Generate a fresh manifest to a temporary path, copy the new `templateRevision` into the enriched manifest, and restart or clear the renderer cache.

See the [focused SSR example](../examples/ssr/README.md), the broader [SSR feature lab](../examples/feature-lab-ssr/README.md), and [Security and Trusted Types](security.md).
