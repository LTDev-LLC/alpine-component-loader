# SSE HMR example

The dev server supplies minified ACL imports, an EventSource client, and targeted template reloads. Application and HMR
code share `/__acl_hmr/modules/*.min.js`.

```bash
npm run serve -- examples/hmr/
```

Open <http://127.0.0.1:4173/>, change the counter and focused draft, then edit `components/live-card.html`. HMR
preserves props, values, focus, and selection without page-authored connection code.

A late `template[x-acl="auto-observed-note"]` upgrades its existing host, demonstrating `/auto` observation. Set
`window.AlpineComponentLoaderConfig.observeTemplates = false` before import to retain only the initial scan.

From the repository root:

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
    reason: 'hmr',
});
```

Calling `element.reload()` without options remains a hard reload.

Stable inline ACL templates also receive state-preserving updates: the server announces a revision and the client
fetches changed bodies. Markup, identities, contracts, malformed/conflicting markers, or inactive ID templates trigger a
page reload. Both declaration spellings use `kind: "component"`.

Inside the example, run `npm run serve`; choose another page/port with `npm run serve -- alternate.html --port 5000`.

The dev client targets the default registry. For independent ownership and disposal, use `createLoader()` as in the
[Playground](../playground/README.md).

The [Vite starter](../../starters/vite/README.md) uses the same targeted reload path through its injected virtual HMR
client.

## Startup entry and fallback APIs

`/auto` demonstrates late-template discovery; core requires [explicit registration/observation](../../docs/core.md).

Await optional polyfills before dynamically importing `/auto`, then await `startAutoLoader()` for registration. See
[polyfill bootstrap](../../docs/polyfills.md).

## Transformation and cancellation probes

**Mount transformation probe** enables trusted scripts, scoped CSS, slots, and a preserved input. Edit
`components/transform-card.html` or select **Reload while preserving draft**. Other templates retain normal
sanitization.

**Reload/Remove a pending request** uses an isolated abort-aware transport to verify final-owner cancellation and
stale-content exclusion. `?polyfills=1&fallback=1` gates startup and forces the self-hosted ShadyDOM demo.
