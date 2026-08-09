# Playground

The playground is itself an AlpineComponentLoader application. Its header, workbench controls, editor, preview pane, accessibility summary, diagnostics, and footer are inline declarative ACL components backed by an Alpine store. The default Northstar operations dashboard inside the preview is a second, isolated ACL application.

The dashboard demonstrates a root component, nested declarative components, typed props, Alpine-generated collections, named and default slots, a selector-based Shadow DOM profile, store binding, local state, composed events, theme tokens, and loader observability.

## Editable sources

- **Page HTML** is a minimal `<demo-dashboard>` consumer with typed attributes and supplied slots.
- **Components** contains the root dashboard and every nested ACL template.
- **CSS** defines the responsive dashboard and its light/dark semantic tokens.
- **JavaScript** creates stable Alpine stores, patches their actions during HMR, configures ACL, registers the Shadow DOM component, and starts the loader.

Edits run automatically after a short delay. Select **Run preview** or press `Ctrl+Enter`/`Command+Enter` to execute the active editor immediately.

- Page HTML creates a fresh iframe document, custom-element registry, Alpine stores, and scanner.
- Component content patches its existing template and state-preservingly reloads only affected ACL instances.
- CSS replaces the preview's stable stylesheet.
- JavaScript disposes the previous authored module and updates the existing Alpine application.

Page HTML takes precedence when several sources are pending. Component
identities and contracts remain fixed during HMR. Adding or removing templates,
changing `x-acl`, `acl-component`, `id`, `acl-props`, or another template
attribute, or adding non-template markup keeps the last good preview and
requests a Page HTML run.

Authored JavaScript receives `Alpine`, `AlpineComponentLoader`, `createLoader`, and the playground-only `playgroundHot` context. Use `playgroundHot.signal` for signal-bound listeners or `playgroundHot.dispose(callback)` for synchronous or asynchronous cleanup. Cleanup runs in reverse registration order before the next JavaScript execution.

The theme control is an editable `demo-theme-toggle` component bound to the Alpine `theme` store through `bind-store="theme"`. Light mode is restored on every full preview boot; theme choice, dashboard store values, local component state, focus, selection, and scroll survive incremental updates.

## Accessibility auditing

**Audit accessibility** runs the packaged dependency-free ACL scanner against both documents. The summary reports component, finding, error, and stale state separately for the workbench and preview. Each document retains the scanner's keyboard-accessible launcher and modal for detailed results.

Audits run manually. A successful preview or workbench HMR update marks the corresponding result stale until it is scanned again. One scanner failure does not discard a valid result from the other document.

The scanner assists development but does not replace keyboard and screen-reader testing, contrast review, zoom and reflow testing, reduced-motion review, localization, or testing with disabled people.

## Drafts and execution

Use **Show diagnostics** to inspect the bounded 50-entry console stream, update mode, and redacted ACL metrics. Drafts and auto-run preference are stored under `acl-playground:v5`; incompatible v4 drafts are left untouched and are not loaded. **Reset sample** confirms before restoring all sources and creating a light-mode preview.

Editable JavaScript is trusted, same-origin developer code. The iframe provides DOM and CSS isolation, not a hostile-code security boundary.

From the repository root:

```bash
npm run build
npm run example:playground
```

Open <http://127.0.0.1:4173/>. The redirect retains
`/examples/playground/`, matching the GitHub Pages artifact.

## Static staging

Run `npm run stage` to build ACL and replace `_site` with the default
single-Playground GitHub Pages artifact; `npm run staging` is an equivalent
alias. Include additional static examples, such as
`npm run stage -- playground feature-lab`, to generate an ordered root catalog
instead. The command captures the Playground’s responsive component geometry,
writes `skeletons/acl-skeletons.css`, and links it from the staged page head.
The staged import map points every ACL browser export at `/dist/*.min.js`; no
development-server module route is retained. Both the workbench and each fresh
preview iframe load Alpine from the exact pinned CDN script:

```html
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js"></script>
```

The artifact does not contain a local Alpine package, so a fresh visit requires
network access to jsDelivr.
