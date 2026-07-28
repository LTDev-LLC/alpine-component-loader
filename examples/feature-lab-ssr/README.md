# SSR Feature Lab

This is the server-rendered counterpart to [`../feature-lab/`](../feature-lab/). It uses the same white feature cards, blue overview panel, status metrics, jump control, expandable usage panels, floating debugger, and accessibility tooling as the original lab.

The dependency-free Node server reads the page shell from [`index.html.tmpl`](index.html.tmpl), renders all named component placeholders, and never embeds the document HTML in `server.mjs`. The version-one manifest now includes 17 component contracts and the page contains 22 server-rendered component instances covering:

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

Open <http://127.0.0.1:4175/>. The page uses the CSP Alpine build. Disable JavaScript to confirm that the overview, explanations, metrics, slots, all 22 component instances, and their server fallbacks remain visible.

With JavaScript enabled, matching revisions hydrate without requesting any component template. Data and polling begin, store instances synchronize, persisted props become editable, event mapping activates, and the diagnostics section summarizes bounded local observability records.

The browser entries use `/dist/*.min.js`. The custom Node server synthesizes a
missing minified sibling in memory after checking for a physical file, matching
the local development-server contract while preserving on-demand runtime
imports.

Use **Debug Mode** or **Open debugger** to inspect hydrated SSR hosts. Use **Open A11y Audit** to scan every active component, or **Audit intentional issues** to run a focused audit against the deliberately inaccessible fixture inherited from the original feature lab.

Open <http://127.0.0.1:4175/?mismatch=1> to corrupt one server revision marker. The other components still hydrate in place while the counter keeps its server content visible until ordinary client rendering completes from one template request.

The intentionally unsafe markup in `lab-security-card.html` demonstrates SSR/client sanitizer parity. Neither side executes it, and the final component contains no executable URL, inline event handler, or script.

For focused `dataResolver` and explicit `dataPolicy` flows, including proof that hydration skips the initial API request, run the smaller [`../ssr/`](../ssr/) example. Its query controls also demonstrate `visible`, `idle`, `interaction`, and `media` hydration while leaving ordinary client-only loading unchanged. Light DOM definitions can be structurally rendered with `renderLightDom: true` or per-render `lightDom: true`; this larger lab keeps Shadow DOM as its baseline so its Declarative Shadow DOM and revision-fallback comparisons remain direct.

## Template flow

`server.mjs` reads the current `index.html.tmpl` for every full render. Each `{{NAME}}` token must have an explicit render result or controlled text value; missing values fail the request instead of producing an incomplete document. The raw template returns `404` over HTTP.

The server shares the repository development HMR channel. Component-template edits invalidate the SSR renderer cache and update matching hydrated instances in place. Content-only edits inside stable inline ACL templates are pulled as bounded template revisions; page markup and template-contract changes fall back to a full page reload.
