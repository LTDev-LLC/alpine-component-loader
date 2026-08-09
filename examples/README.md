# Example catalog

Build once before running repository-local examples:

```bash
npm run build
```

| Example                                      | Run                                        | What it demonstrates                                                                                                              |
| -------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| [Feature lab](feature-lab/README.md)         | `npm run example:feature-lab`              | Complete browser runtime, JavaScript inline definitions, `x-acl` discovery, manifests, persistence, observability, security, and tooling. |
| [SSR example](ssr/README.md)                 | `npm run example:ssr`                      | Declarative Shadow DOM, `dataResolver`/`dataPolicy`, progressive hydration modes, slots, and revision fallback.                   |
| [SSR feature lab](feature-lab-ssr/README.md) | `npm run example:feature-lab:ssr`          | Larger SSR gallery, batch rendering, events, sanitizer parity, debugging, and accessibility.                                      |
| [HMR](hmr/README.md)                         | `npm run example:hmr`                      | Injected SSE development client, `/auto` late-template observation, and state-preserving targeted reloads.                        |
| [Offline](offline/README.md)                 | `npm run example:offline`                  | Generated precache graph, navigation policy, bounded runtime caching, storage diagnostics, and offline reload.                    |
| [Accessibility](a11y/README.md)              | `npm run example:a11y`                     | In-page audits, scanner UI, debugger integration, headless audit baselines, and expiring suppressions.                            |
| [Playground](playground/README.md)           | `npm run example:playground` or open Pages | ACL-powered four-source editor, themed dashboard, incremental HMR, unified accessibility auditing, diagnostics, and local drafts. |

## Integrated starter workflows

The starters copied by `alpine-component-loader create` are the smallest end-to-end examples of the new project/runtime integration:

| Starter                                  | Create                                                      | Integrated path                                                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Vanilla](../starters/vanilla/README.md) | `npx alpine-component-loader create my-app`                 | Shared `acl.config.mjs`, conservative manifest inference, URL-relative `registerManifestFrom()`, route generation, serialized watch tasks, and an authored error-boundary fallback.                         |
| [Vite](../starters/vite/README.md)       | `npx alpine-component-loader create my-app --template vite` | Generated component/route manifests, `virtual:alpine-component-loader/routes`, native dev delivery, targeted HMR, production module copying/import maps, `<acl-boundary>`, and a form-associated component. |

For focused source examples:

- [`starters/vite/acl.config.mjs`](../starters/vite/acl.config.mjs) shows one configuration shared by the CLI and Vite plugin.
- [`starters/vite/src/router.js`](../starters/vite/src/router.js) registers exact route keys from the virtual route module with base-aware client navigation.
- [`starters/vite/public/components/quantity-field.acl.json`](../starters/vite/public/components/quantity-field.acl.json) shows the JSON-safe form mapping.
- [`ssr/server.mjs`](ssr/server.mjs) keeps separate, mutually exclusive `dataResolver` and `dataPolicy` renderers.
- [`a11y/acl-a11y-baseline.json`](a11y/acl-a11y-baseline.json) and [`a11y/acl-a11y-suppressions.json`](a11y/acl-a11y-suppressions.json) are ready-to-run audit policy artifacts.

## Static deployment artifacts

`npm run stage` builds ACL and replaces `_site` with a standalone Playground
artifact. `npm run staging` is an equivalent alias. Both commands check/install
the Playwright Chromium browser used for responsive skeleton capture. Pass one
or more backend-free example names to select them:

```bash
npm run stage -- feature-lab
npm run stage -- a11y
npm run stage -- offline
npm run stage -- playground feature-lab
npm run stage -- a11y offline playground
```

Selected pages remain at `/examples/<name>/index.html`, share one generated
`/dist/*.min.js` runtime family, and receive static import maps without
development-server routes. One distinct selection retains the root redirect.
Two or more distinct selections generate a dependency-free root catalog styled
like the Feature Lab, with application and README links for every bundled
example. The small catalog stylesheet is embedded in the root document so a
stale generic `/styles.css` cache or static-host rewrite cannot leave the entry
page unstyled; the same generated CSS remains available as `_site/styles.css`
for inspection. Each staged example page also receives a canonical
`/examples/<name>/index.html` document base, keeping relative styles, scripts,
and component templates inside the selected example even when a static host
serves a clean URL without a trailing slash.

Each selected example receives a responsive standalone stylesheet at
`_site/examples/<name>/skeletons/acl-skeletons.css`. The staged copy of its
`index.html` links that generated stylesheet after the authored page styles and
before executable scripts, so component geometry is reserved and painted while
the runtime starts. Source example files are not changed, and the generated
catalog or single-example redirect does not receive an application skeleton.

Selectors are validated as a complete list before staging starts. Repeated
names are silently deduplicated in their first command-line order, which also
controls catalog card order. Unknown, unsafe, HMR, or SSR selectors abort the
whole command and leave the previous `_site` artifact in place. Skeleton
capture failures use the same atomic behavior. There is no special `all`
selector; request all four static examples explicitly.

Every staged example loads Alpine 3.15.12 from the pinned jsDelivr URL instead
of copying an Alpine package. A first visit therefore needs network access. The
Offline example caches that remote response after a successful install and
regenerates its route-scoped service worker whenever it is included. Its final
page and generated skeleton stylesheet are both included in the staged
precache.

The HMR and two SSR examples are intentionally rejected by `stage` because
their defining behavior requires a development or rendering backend. Playground
remains the no-argument default used by the GitHub Pages workflow, so the
published default artifact still opens directly through the single-example
redirect.

The maintained [vanilla](../starters/vanilla/README.md) and [Vite](../starters/vite/README.md) starters are copied by `alpine-component-loader create`. Automated Playwright fixture usage is executable in [`tests/testing-integrations.spec.js`](../tests/testing-integrations.spec.js), while the complete test-runner contracts are documented in [Testing utilities](../docs/testing.md).
