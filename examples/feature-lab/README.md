# Feature lab

Exercises ACL's browser features: templates/discovery, lifecycle, caching, manifests, prefetch, persistence,
observability, security, testing, and optional tools.

Build the package, then serve the feature-lab directory as static files:

```bash
npm run build
npm run example:feature-lab
```

Open <http://127.0.0.1:4173/>. The page uses minified native modules, local `components/` templates, and intercepted
browser fetches; no API or SSR backend is needed. Optional capabilities load on activation.

Create a plain static-host artifact with:

```bash
npm run stage -- feature-lab
```

Staging copies the page to `_site/examples/feature-lab/` with direct minified imports and the repository's pinned CDN
Alpine. Additional static selections share one runtime and catalog.

The focused examples cover workflows that need their own server or service-worker behavior:

- [SSR Feature Lab](../feature-lab-ssr/): batch rendering, slots, sanitizer parity, and revision fallback.
- [Accessibility](../a11y/): audits, custom rules, debugger, and CI reports.
- [HMR](../hmr/): state-preserving reloads.
- [Offline](../offline/): worker generation and bounded caching.
- [Playground](../playground/): isolated loaders and disposal.

The lab keeps observability local. Production can send its redacted records through a demand-loaded exporter:

```js
import { connectExporter, createBeaconExporter } from 'alpine-component-loader/observability-exporters';

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

The [Playwright fixture example](../../tests/testing-integrations.spec.js) demonstrates runner-owned cleanup.

## Startup entry and fallback APIs

Root startup demonstrates discovery and exposes the persistence-adapter factory. Core/polyfill mappings alone download
nothing. Switching to core requires [explicit registration](../../docs/core.md).

For fallback APIs, load polyfills before dynamically importing the application or `/auto`. See
[polyfill usage](../../docs/polyfills.md).

## Runtime capability experiments

Section 39 isolates capability experiments in same-origin documents. Closing a demo releases its subscriptions. These
developer demos are not sandboxes for untrusted code.

`?polyfills=1` loads the self-hosted suite before Alpine and `app.js`; `&fallback=1` forces ShadyDOM in the demo. The
startup panel separates registration from readiness. Builds copy vendor scripts and generate preload JSON; no browser
parser is needed.
