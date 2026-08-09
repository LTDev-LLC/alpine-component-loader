# Feature lab

This page exercises the loader's complete browser-facing feature set, including
JavaScript inline definition objects, concise `template[x-acl]` discovery,
lifecycle cleanup, revision-aware template caching, manifest dependency graphs
and metadata, adaptive prefetch, localStorage, sessionStorage, IndexedDB and
custom persistence adapters, structured observability, Trusted Types and URL
policies, browser testing helpers, diagnostics, accessibility auditing, and
optional development/offline entry points.

Build the package, then serve the feature-lab directory as static files:

```bash
npm run build
npm run example:feature-lab
```

Open <http://127.0.0.1:4173/>. The page's import map selects
`/__acl_hmr/modules/index.min.js`, and the development server synthesizes that
minified package family in memory from the repository build. Optional public
entries and deferred runtime capabilities are fetched only when this page
imports or exercises them. File-backed component templates remain rooted in the
local `components/` directory. No application API, SSR renderer, or other
dynamic backend is required; the data examples use browser-side fetch
interception.

Create a plain static-host artifact with:

```bash
npm run stage -- feature-lab
```

The command builds the current package, copies this example beneath
`_site/examples/feature-lab/`, and replaces its development import-map entries
with direct `/dist/*.min.js` URLs. Alpine remains the exact pinned jsDelivr
3.15.12 script and is not copied into the artifact. Add other static names after
`feature-lab` to bundle them with one shared runtime and an ordered root catalog.

The focused examples cover workflows that need their own server or service-worker behavior:

- [`../ssr/`](../ssr/) demonstrates safe `dataResolver` output, Declarative Shadow DOM hydration, and skipped initial data/template requests.
- [`../feature-lab-ssr/`](../feature-lab-ssr/) is the larger SSR-first counterpart covering typed server output, batch rendering, slots, data, events, sanitizer parity, observability, and revision fallback.
- [`../a11y/`](../a11y/) demonstrates automatic/manual audits, custom rules, debugger integration, and headless console/JSON/JUnit/SARIF reporting.
- [`../hmr/`](../hmr/) demonstrates state-preserving template reloads.
- [`../offline/`](../offline/) demonstrates generated offline assets, navigation policy, bounded runtime caching, quota diagnostics, and explicit service-worker registration.
- [`../playground/`](../playground/) demonstrates `createLoader()`, per-instance metrics/configuration, and deterministic disposal.

The lab keeps observability local so the live record and metrics panels remain self-contained. Production applications can connect the same already-redacted subscription to a bounded, demand-loaded exporter without adding transport or a vendor SDK to the core graph:

```js
import {
    connectExporter,
    createBeaconExporter,
} from 'alpine-component-loader/observability-exporters';

const connection = connectExporter(
    AlpineComponentLoader,
    createBeaconExporter({
        url: '/telemetry/acl',
        batchSize: 20,
        flushInterval: 5000,
        maxQueue: 200,
        retries: 2,
    }),
);

window.addEventListener('pagehide', () => connection.flush(), { once: true });
```

OpenTelemetry and Sentry adapters accept caller-owned clients; ACL does not install or import either SDK.

For runner-owned cleanup, the repository's [`tests/testing-integrations.spec.js`](../../tests/testing-integrations.spec.js) executes the packaged Playwright fixture. The [runtime efficiency guide](../../docs/performance.md) describes parsed-template caching and distribution-size gates.
