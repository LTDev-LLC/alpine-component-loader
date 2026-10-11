# ACL Vite starter

A route-aware starter using native ACL modules outside the application bundle. Root is default; bootstrap query options
select core and polyfills.

The plugin generates component/route manifests, maps optional entries, and registers the active shard while leaving
templates fetchable.

## Run it

```bash
npm install
npm run dev
```

Open the Vite URL. **Home** demonstrates form association; **Account** uses a group shard and inferred Shadow DOM
dependency. Diagnostics show redacted records.

Template edits regenerate artifacts and trigger state-preserving HMR for affected hosts.

## Project layout

```text
.
├── .acl/
│   ├── a11y-baseline.json
│   └── a11y-suppressions.json
├── public/
│   └── components/
│       ├── account-dashboard.{html,acl.json}
│       ├── home-dashboard.{html,acl.json}
│       ├── profile-avatar.{html,acl.json}
│       └── quantity-field.{html,acl.json}
├── src/
│   ├── bootstrap.js
│   ├── bootstrap-polyfills.js
│   ├── main.js
│   ├── router.js
│   └── styles.css
├── acl.config.mjs
├── index.html
└── vite.config.js
```

Generated files appear after `npm run dev`, `npm run build`, or `npm run acl:generate`:

```text
generated/
├── acl-components.d.ts
└── custom-elements.json
public/
├── acl-manifest.json
└── acl-routes/
    ├── acl-route-account-<hash>.json
    ├── acl-route-home-<hash>.json
    └── acl-routes.json
```

## What the plugin does

`vite.config.js` enables the package plugin explicitly:

```js
import { defineConfig } from 'vite';
import { alpineComponentLoader } from 'alpine-component-loader/vite';

export default defineConfig({
    base: process.env.ACL_BASE || '/',
    plugins: [
        alpineComponentLoader({
            configFile: './acl.config.mjs',
        }),
    ],
});
```

During development the plugin:

- loads and validates `acl.config.mjs`;
- generates the component manifest, typed contracts, route shards, and route index;
- excludes ACL from Vite dependency optimization;
- serves ACL's readable native module tree;
- injects the matching import map and virtual HMR client;
- converts changed component-template files into targeted ACL reloads; and
- serves route artifacts through the development-only `/@acl-routes/` path.

During production builds it:

- keeps every `alpine-component-loader` entry external to Rollup;
- copies readable package modules to `assets/alpine-component-loader/<version>/`;
- copies the route index and shards to `acl-routes/`;
- injects import-map URLs using Vite's configured `base`; and
- preserves component templates from `public/components/` at stable public URLs.

## Exact route-shard registration

`src/router.js` imports the virtual route module:

```js
import { registerRoute } from 'virtual:alpine-component-loader/routes';

await registerRoute('account');
```

`home` and `account` select exact, dependency-expanded shards. Component URLs resolve from the fetched shard/index.

Routes can use component or group roots:

```js
routes: {
    entries: [
        { key: 'home', path: '/', components: ['home-dashboard'] },
        { key: 'account', path: '/account', groups: ['account'] },
    ],
}
```

Safe inference finds nested `<quantity-field>` and `<profile-avatar>`. Sidecars own props, groups, forms, events, and
descriptions. `acl:infer` reports tentative contracts without writing them.

## Runtime examples

An explicitly registered `<acl-boundary>` catches descendant errors and exposes `retry()` through its fallback.

`quantity-field.acl.json` opts into the native form lifecycle:

```json
{
    "options": {
        "form": {
            "value": "quantity",
            "state": "quantity",
            "disabled": "disabledState"
        }
    }
}
```

Reactive `quantity` joins `FormData` and reset/restoration, with hidden-input fallback when `ElementInternals` is
unavailable.

`main.js` keeps 100 observability records and displays six. `/observability-exporters` can send redacted records through
Beacon or caller-owned OpenTelemetry/Sentry clients.

## CLI workflows

CLI and Vite share project configuration:

```bash
npm run acl:manifest   # safely update generated manifest fields
npm run acl:routes     # regenerate independent route shards and index
npm run acl:contracts  # generate TypeScript and Custom Elements metadata
npm run acl:generate   # run all three in dependency order
npm run acl:infer      # report conservative inference diagnostics
npm run acl:validate   # validate the generated component manifest
npm run acl:watch      # serialized filesystem-backed generation outside Vite
```

Precedence: CLI → plugin → project → defaults. Browser crawling, skeletons, and audits are opt-in watch tasks.

The checked-in audit policy starts empty:

```bash
npm run acl:audit
npm run acl:audit:update
```

`acl:audit:update` atomically refreshes reviewed unsuppressed findings. Later audits fail on new findings, expired
suppressions, or page errors.

## Production delivery and non-root bases

Build and preview the default root deployment:

```bash
npm run build
npm run preview
```

Test a non-root deployment:

```bash
ACL_BASE=/component-demo/ npm run build
```

Navigation follows `import.meta.env.BASE_URL`. Production must serve `index.html` for client routes such as
`/component-demo/account`.

`vite.moduleDelivery: 'copy'` provides packaged modules. For application-managed delivery:

```js
alpineComponentLoader({
    moduleDelivery: 'external',
    moduleBase: 'https://cdn.example.com/alpine-component-loader/1.2.0/',
});
```

Pin the external module directory to the same ACL release used to generate the application.

## Startup variants and preload hints

Page links select root/core and optional polyfills through `bootstrap.js`, before Alpine/application imports. Startup
failures expose retry; status separates registration from readiness.

Boundary and route registration are explicit, so core needs no discovery. Register later declarative/dynamic built-ins
explicitly. The virtual route helper shares the default context without starting root discovery. See
[core startup](../../docs/core.md).

To generate hints for the initial Home route, boundary, styles, and slots:

```bash
ACL_PRELOAD=core npm run build
# Or select the default entry:
ACL_PRELOAD=default npm run build
```

`preload.entry`, `tags`, and `features` select hints, not application imports. Other routes prefetch on hover/focus;
navigation cancels obsolete subscriptions. Select content-dependent features when the manifest cannot infer them.

## Optional Web Components polyfills

`?entry=core&polyfills=1` or `bootstrap-polyfills.js` loads fallbacks before Alpine/application evaluation. Native
browsers skip upstream scripts; ESM/ES2022 requirements remain.

Self-host webcomponentsjs 2.8.0's loader, full bundle, and `bundles/` under `public/vendor/webcomponents/`, then set:

```js
await loadPolyfills({
    url: import.meta.env.BASE_URL + 'vendor/webcomponents/webcomponents-loader.js',
});
```

Preserve vendor filenames; the plugin copies only ACL. See [self-hosting](../../docs/polyfills.md#self-hosted-delivery)
for CSP and readiness options. `features: ['polyfills']` hints the wrapper without activating it.

For independent registries and test cleanup, use `createLoader()` and [testing fixtures](../../docs/testing.md).

Vite 5-8 is supported. Manifest options infer environmental dependencies; imperative behavior can add
`features: ['environment']`. `hydrationScheduler` remains opt-in.

The compatibility matrix tests pinned Vite 5.0-8.0 and the development version with routing, non-root bases, and
copied/external production modules.
