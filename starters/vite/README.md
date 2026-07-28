# ACL Vite starter

This starter is a route-aware reference application for `alpine-component-loader/vite`. It keeps component HTML independently fetchable, generates version-one component and route manifests, registers only the active route shard, and leaves ACL outside the application bundle.

## Run it

```bash
npm install
npm run dev
```

Open the printed Vite URL and move between **Home** and **Account**. The Home route demonstrates a form-associated quantity control; Account demonstrates a group-rooted shard with an inferred Shadow DOM dependency. The diagnostics panel shows the most recent redacted ACL records.

Edit any file under `public/components/` while the development server is running. The plugin regenerates affected artifacts and sends a targeted HMR event; ACL reloads matching component hosts while preserving public props, form values, focus, and selection.

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

The lookup is exact. `home` registers the dependency-expanded Home shard and `account` registers the Account shard. Relative component sources resolve from the fetched shard/index URL.

The route configuration intentionally uses two root styles:

```js
routes: {
    entries: [
        { key: 'home', path: '/', components: ['home-dashboard'] },
        { key: 'account', path: '/account', groups: ['account'] },
    ],
}
```

Safe template inference discovers `<quantity-field>` inside `home-dashboard` and `<profile-avatar>` inside `account-dashboard`. Sidecars remain authoritative for props, groups, form configuration, events, descriptions, and other authored fields. Run `npm run acl:infer` to see likely prop/event diagnostics without writing them.

## Runtime examples

The application registers `<acl-boundary>` explicitly before starting its small router. The nearest boundary owns descendant `acl:error` events and exposes `retry()` through the fallback button.

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

Its reactive `quantity` prop contributes to `FormData`, participates in reset/state restoration, and uses ACL's hidden-input submission fallback when `ElementInternals` is unavailable.

`src/main.js` enables a 100-record observability buffer and a six-record UI projection. To deliver those already-redacted records, import `createBeaconExporter()` or a caller-owned OpenTelemetry/Sentry adapter from `alpine-component-loader/observability-exporters`; the plugin includes that demand-loaded entry in its import map.

## CLI workflows

The CLI and Vite plugin read the same project configuration:

```bash
npm run acl:manifest   # safely update generated manifest fields
npm run acl:routes     # regenerate independent route shards and index
npm run acl:contracts  # generate TypeScript and Custom Elements metadata
npm run acl:generate   # run all three in dependency order
npm run acl:infer      # report conservative inference diagnostics
npm run acl:validate   # validate the generated component manifest
npm run acl:watch      # serialized filesystem-backed generation outside Vite
```

CLI flags have highest precedence, followed by plugin options, project configuration, and defaults. Browser-backed crawling, skeleton generation, and audits remain explicit rather than joining the default watch loop.

The checked-in audit policy starts empty:

```bash
npm run acl:audit
npm run acl:audit:update
```

`acl:audit:update` atomically replaces the baseline with current unsuppressed findings. Subsequent audits fail for new findings, expired suppressions, or page errors.

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

The router uses `import.meta.env.BASE_URL`, so its navigation URLs match the plugin's import map and copied route paths. Configure the production server to return `index.html` for direct client-route requests such as `/component-demo/account`.

The default `vite.moduleDelivery: 'copy'` makes the build self-contained. For application-managed delivery:

```js
alpineComponentLoader({
    moduleDelivery: 'external',
    moduleBase: 'https://cdn.example.com/alpine-component-loader/1.2.0/',
});
```

Pin the external module directory to the same ACL release used to generate the application.

For isolated application registries or tests, use `createLoader()` and the Playwright/Vitest fixtures documented in [Testing utilities](../../docs/testing.md).
