# ACL vanilla starter

Serve this directory over HTTP, then edit `components/hello-card.html` and its adjacent `hello-card.acl.json` contract:

```bash
npx alpine-component-loader serve .
```

`app.js` uses `registerManifestFrom('./acl-manifest.json')`, so relative component sources are resolved from the final manifest URL and the request receives the runtime timeout and response-size protections. The page also wraps the component in a lazily discovered `<acl-boundary>` with an authored fallback.

`acl.config.mjs` is the shared source for component, route, contract, and watch paths. Validate and regenerate from the project root:

```bash
npx alpine-component-loader validate acl-manifest.json
npx alpine-component-loader manifest --update
npx alpine-component-loader routes --force
npx alpine-component-loader types acl-manifest.json --force
```

The sidecar owns authored options and metadata; safe inference refreshes only structurally certain dependencies, slots, assets, template source, and SHA-256 revision. See likely prop/event/data diagnostics without writing inferred metadata:

```bash
npx alpine-component-loader manifest --infer report --dry-run
```

Keep filesystem-backed artifacts current in one serialized process:

```bash
npx alpine-component-loader watch
```

The configured watch tasks are `manifest`, `types`, and `routes`. Browser-backed crawling, skeletons, and audits remain opt-in through explicit tasks or `--include-expensive`.

Generate editor schemas when desired:

```bash
npx alpine-component-loader schema --kind component --out acl-component.schema.json
npx alpine-component-loader schema --kind manifest --out acl-manifest.schema.json
```

Run `npx alpine-component-loader audit / --root .` for a headless accessibility and console-error check.
