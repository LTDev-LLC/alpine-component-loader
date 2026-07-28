# SSE HMR example

The reusable development server serves the current directory, completes the
page's minified import map, injects its EventSource bootstrap into `index.html`,
and selectively reloads changed component templates. The application and HMR
client both use `/__acl_hmr/modules/*.min.js`; the server creates each response
only when the browser requests that module.

```bash
npm run serve -- examples/hmr/
```

Open <http://127.0.0.1:4173/>, change the counter, type into the draft field, and leave the field focused. Then edit `components/live-card.html`. The template updates while public props, form values, focus, and text selection are preserved. No HMR connection code is required in the page.

From the repository root, the shortcut command is:

```bash
npm run example:hmr
```

The SSE endpoint is `/__acl_hmr/events`. Component edits broadcast:

```json
{
  "type": "acl:template-changed",
  "source": "/components/live-card.html",
  "fallback": true
}
```

The injected client uses the state-preserving reload mode:

```javascript
await element.reload({
  preserveState: true,
  clearTemplate: false,
  clearData: false,
  reason: 'hmr'
});
```

Calling `element.reload()` without options remains a hard reload.

Inline ACL templates in a served page use the same state-preserving path. When an edit changes only the contents of stable `template[acl-component]` or active `template[id]` elements, the server announces an opaque revision and the browser pulls only those template bodies. Page markup, template identities, template attributes/contracts, malformed markup, and inactive ID templates fall back to an ordinary page reload.

From inside the example directory, `npm run serve` works as before. Use a different index or port with `npm run serve -- alternate.html --port 5000`.

This page uses the default loader because the injected development client targets one application registry. Tests, micro-frontends, or multiple application roots that need independent registries and teardown should use `createLoader()`; the [static playground](../playground/README.md) demonstrates that lifecycle.

For Vite applications, use the maintained [Vite starter](../../starters/vite/README.md). `alpine-component-loader/vite` injects a virtual HMR client that translates template file events into the same targeted `reload({ preserveState: true })` path, while also externalizing ACL and serving its native module tree.
