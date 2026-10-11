# SSR Feature Lab

The [Feature Lab](../feature-lab/) rendered on the server, with matching controls, debugger, and accessibility tools.

`server.mjs` renders placeholders from [index.html.tmpl](index.html.tmpl). Its v1 manifest defines 17 contracts across
22 instances covering:

- Verified local templates and `renderMany()`
- Typed primitive, nullable, array, and object props
- Shadow DOM and Declarative Shadow DOM fallback attachment
- Default and named slots
- Lifecycle-aware in-place hydration
- Data fetching, cache controls, JSON responses, and polling
- Forwarded and mapped events
- Alpine stores and component persistence
- SSR/client sanitizer parity and CSP-compatible Alpine state
- Structured observability and diagnostic snapshots
- The optional debugger, accessibility observer, and accessibility scanner entries
- Isolated revision-mismatch fallback

```bash
npm run build
npm run example:feature-lab:ssr
```

Open <http://127.0.0.1:4175/>. The page uses CSP Alpine. Disable JavaScript to inspect all 22 server-rendered instances,
slots, and fallbacks.

Matching revisions hydrate without template requests. JavaScript enables data/polling, stores, persistence, events, and
local diagnostics.

The server serves physical `/dist/*.min.js` files first, generating missing siblings in memory.

**Debug Mode**/**Open debugger** inspect hydrated hosts. **Open A11y Audit** scans active components; **Audit
intentional issues** targets the inaccessible fixture.

`?mismatch=1` corrupts one revision marker. Other hosts hydrate; the counter keeps SSR content until a single client
template request completes.

`lab-security-card.html` verifies sanitizer parity: executable URLs, inline handlers, and scripts are removed on both
sides.

See the [SSR guide](../../docs/ssr.md) for `dataResolver`, `dataPolicy`, progressive modes, and Light DOM. This lab uses
Shadow DOM for direct hydration/fallback comparisons.

## Template flow

Each render rereads the shell. Every `{{NAME}}` needs a result or controlled text value; missing values fail the
request. The raw template returns HTTP 404.

HMR invalidates SSR caches and updates matching hydrated hosts. Stable inline-template content receives bounded
revisions; markup or contract changes reload the page.

## Startup entry and fallback APIs

The core client explicitly registers its manifest and definitions, then starts without discovery. Hydration and tools
remain available in the same module family. See [core startup](../../docs/core.md).

Await polyfills before dynamically importing `client.js`. Hydration still needs valid revisions and native ESM/ES2022.
See [bootstrap and CSP](../../docs/polyfills.md).

## Ordered streaming and parsed-tree reuse

**Render ordered stream** uses `renderStream()` over NDJSON for twelve renders, including a slow first item. Choose
concurrency 1-8 and compare completion with delivery order. Socket backpressure bounds work; **Cancel stream** aborts
callbacks while retaining delivered output. **Render complete batch** runs the same requests through `renderMany()`.

**Verify parsed-tree isolation and cache clearing** changes slots, clears the cache, and renders again. Cached
unsanitized trees are cloned per render. `?scheduler=1` enables scheduling; `?polyfills=1&fallback=1` demonstrates
self-hosted ShadyDOM under the existing CSP.
