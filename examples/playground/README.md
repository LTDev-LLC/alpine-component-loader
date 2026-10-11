# Playground

An ACL workbench with inline declarative controls and an isolated Northstar dashboard preview.

The dashboard demonstrates nested components, typed props, collections, slots, Shadow DOM, stores, events, theming, and
observability.

## Editable sources

- **Page HTML**: dashboard host, attributes, and supplied slots.
- **Components**: root and nested templates.
- **CSS**: responsive layout and theme tokens.
- **JavaScript**: stores, HMR actions, configuration, and registration.

Edits auto-run after a short delay. **Run preview** or `Ctrl+Enter`/`Command+Enter` runs immediately.

- Page HTML creates a fresh iframe document, custom-element registry, Alpine stores, and scanner.
- Component content patches its existing template and state-preservingly reloads only affected ACL instances.
- CSS replaces the preview's stable stylesheet.
- JavaScript disposes the previous authored module and updates the existing Alpine application.

Page HTML takes priority. HMR requires stable component identities/contracts; adding/removing templates or changing
their attributes keeps the last good preview and requests a full Page HTML run.

JavaScript receives `Alpine`, `AlpineComponentLoader`, `createLoader`, and `playgroundHot`. Use its `signal` for
listeners and `dispose(callback)` for sync/async cleanup, which runs in reverse order before the next execution.

`demo-theme-toggle` binds to the `theme` store. Full boots reset to light mode; incremental updates preserve stores,
local state, focus, selection, and scroll.

## Accessibility auditing

**Audit accessibility** scans both documents with ACL rules. Separate summaries track findings, errors, and stale
results; each document has a keyboard-accessible scanner modal.

Audits are manual. Successful updates mark results stale; one scanner failure leaves the other document's result intact.

Also test keyboard/screen-reader use, contrast, zoom/reflow, reduced motion, localization, and usability with disabled
people.

## Drafts and execution

**Show diagnostics** displays 50 console entries, update mode, and redacted metrics. Drafts use `acl-playground:v5`; v4
drafts remain untouched. **Reset sample** confirms before restoring a fresh light-mode preview.

Editable JavaScript is trusted, same-origin developer code. The iframe provides DOM and CSS isolation, not a
hostile-code security boundary.

From the repository root:

```bash
npm run build
npm run example:playground
```

Open <http://127.0.0.1:4173/>. The redirect retains `/examples/playground/`, matching the GitHub Pages artifact.

## Static staging

`npm run staging` includes all four static examples and a catalog. Use `npm run staging -- playground` for Playground
alone. Staging links responsive skeletons and direct minified ACL imports. Workbench and previews use pinned CDN Alpine:

```html
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.17.4/dist/cdn.min.js"></script>
```

The artifact does not contain a local Alpine package, so a fresh visit requires network access to jsDelivr.

## Startup entry and fallback APIs

Root discovers workbench templates; `createLoader()` isolates previews. Core shares the default context and is not a
substitute for isolation. See [entry selection](../../docs/core.md).

Each iframe needs its own polyfill bootstrap before Alpine/application imports. The workbench bootstrap does not
initialize previews. See [polyfill usage](../../docs/polyfills.md).

## Capability samples and preview bootstrap

**Load selected sample** replaces all four sources after confirmation. Samples cover core, transformations, scheduling,
and isolated loaders. **Reset sample** restores Northstar.

**Await polyfills inside preview** gates each iframe and is saved with its entry choice. Diagnostics show shared
implementation URLs and isolated loader state. Runtime experiments use disposable documents.
