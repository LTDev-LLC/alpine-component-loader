# Example catalog

Build once before running repository-local examples:

```bash
npm run build
```

Shared controls are authored in `scripts/example-controls.css`. The build embeds them in each example stylesheet.

| Example                                      | Run                                        | What it demonstrates                                                                                                                      |
| -------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [Feature lab](feature-lab/README.md)         | `npm run example:feature-lab`              | Complete browser runtime, JavaScript inline definitions, `x-acl` discovery, manifests, persistence, observability, security, and tooling. |
| [SSR feature lab](feature-lab-ssr/README.md) | `npm run example:feature-lab:ssr`          | Ordered streaming, bounded batches, abort, parsed-tree reuse, hydration, and sanitizer parity.                                            |
| [HMR](hmr/README.md)                         | `npm run example:hmr`                      | Injected SSE client, state-preserving reloads, styles/slots/scripts, and cancellation during pending loads.                               |
| [Offline](offline/README.md)                 | `npm run example:offline`                  | Generated root/core workers, offline reload, late capability activation, and self-hosted polyfill assets.                                 |
| [Accessibility](a11y/README.md)              | `npm run example:a11y`                     | On-demand audits/scanner/debugger, focus and cleanup, headless baselines, and expiring suppressions.                                      |
| [Playground](playground/README.md)           | `npm run example:playground` or open Pages | Four-source editor with core, transformations, scheduled and isolated-loader projects, polyfill preview, and module diagnostics.          |

## Integrated starter workflows

`alpine-component-loader create` copies these starters:

| Starter                                  | Create                                                      | Integrated path                                                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Vanilla](../starters/vanilla/README.md) | `npx alpine-component-loader create my-app`                 | Shared `acl.config.mjs`, conservative manifest inference, URL-relative `registerManifestFrom()`, route generation, serialized watch tasks, and an authored error-boundary fallback.                         |
| [Vite](../starters/vite/README.md)       | `npx alpine-component-loader create my-app --template vite` | Generated component/route manifests, `virtual:alpine-component-loader/routes`, native dev delivery, targeted HMR, production module copying/import maps, `<acl-boundary>`, and a form-associated component. |

For focused source examples:

- [Shared project config](../starters/vite/acl.config.mjs) for CLI and Vite.
- [Route registration](../starters/vite/src/router.js) with base-aware navigation.
- [Form mapping](../starters/vite/public/components/quantity-field.acl.json) in a JSON sidecar.
- [SSR rendering](feature-lab-ssr/server.mjs) with typed props, slots, and revision fallback.
- [Audit baseline](a11y/acl-a11y-baseline.json) and [suppressions](a11y/acl-a11y-suppressions.json).

## Choose a startup entry

| Example or starter             | Entry                                  | Reason                                                                                  |
| ------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------- |
| Accessibility, SSR feature lab | `/core`                                | Explicit component/manifest registration; hydration and optional tools remain available |
| Feature lab, Playground        | Root                                   | Declarative discovery and root-only factories are part of the demos                     |
| HMR                            | `/auto`                                | Automatic late-template observation is the feature being demonstrated                   |
| Offline                        | Root or `/core`                        | Matching generated worker for each entry                                                |
| Vanilla starter                | Root by default; `?entry=core` variant | Same manifest, with explicit boundary registration in core mode                         |
| Vite starter                   | Root by default; `?entry=core` variant | Route registration and boundary ownership are already explicit                          |

Import maps include core and polyfills without activating them. See [core startup](../docs/core.md) for discovery and
readiness.

The [vanilla](../starters/vanilla/README.md#startup-variants) and
[Vite](../starters/vite/README.md#optional-web-components-polyfills) variants load optional polyfills before
Alpine/application imports. Native browsers skip upstream scripts; native ESM/ES2022 is still required. See
[polyfill setup](../docs/polyfills.md) for CSP, self-hosting, and offline assets.

## Static deployment artifacts

`npm run staging` (alias `stage`) builds all four static examples in `_site`: Accessibility, Feature Lab, Offline, and
Playground. It installs/checks Chromium for responsive skeleton capture. Select a subset with:

```bash
npm run stage -- feature-lab
npm run stage -- a11y
npm run stage -- offline
npm run stage -- playground feature-lab
npm run stage -- a11y offline playground
```

Staged pages keep `/examples/<name>/index.html`, a canonical document base, and shared `/dist/*.min.js` imports. One
selection creates a root redirect; multiple selections create an ordered catalog. Catalog CSS is embedded and also saved
as `_site/styles.css`.

Each page links its generated `skeletons/acl-skeletons.css` before scripts to reserve loading geometry. Staging leaves
source pages unchanged; catalogs and redirects need no skeleton.

Names are deduplicated in command-line order. Invalid selectors or capture failures preserve the previous `_site`.
HMR/SSR require backends and cannot be staged. There is no `all` selector.

Staged pages use the Alpine pin from `alpinejs-pinned` in `package.json`, served through jsDelivr. First visits need
network access. The Offline worker caches it after installation and precaches the final page and skeleton CSS.

The default artifact opens a catalog linking all four examples.

The [Playwright fixture example](../tests/testing-integrations.spec.js) demonstrates automatic cleanup; see
[testing utilities](../docs/testing.md) for runner contracts.

## Interactive capability experiments

Experiments open in fresh same-origin iframes and release loader resources when closed. The Feature Lab covers core
startup, polyfills, transformations, cancellation, limits, prefetch, scheduling, pooling, isolated loaders,
sanitization, and preload generation.

Other pages select relevant experiments. Polyfill variants use self-hosted scripts; Playground applies them only to
previews. SSR reports hydration and scheduling. Staging copies shared demos and upstream bundles; Offline precaches
matching root/core graphs for late capability activation.
