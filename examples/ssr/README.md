# SSR example

This example renders a Shadow DOM component on a dependency-free Node HTTP server, including typed props, named/default slots, progressive hydration markers, and bounded initial data from either `dataResolver` or `dataPolicy`. The browser adopts the Declarative Shadow DOM tree, parses the non-executable JSON payload, initializes Alpine, and skips both the component template and initial `data.src` requests.

```bash
npm run build
npm run example:ssr
```

Open `http://127.0.0.1:4174`. Disable JavaScript to verify the profile remains visible, then enable it to see the hydration status, server-resolved profile state, and interactive counter.

The hydration client starts at `/dist/index.min.js`. This example's custom Node
server mirrors the development server's physical-file-first `.min.js` fallback,
so it minifies missing JavaScript siblings in memory and the loader requests
deferred runtime modules only as hydration needs them.

The example server also embeds the repository development HMR channel. Editing a component template clears the Node renderer cache and state-preservingly reloads matching hydrated instances. Content-only edits inside stable inline ACL templates can use the same targeted revision protocol; edits elsewhere in `index.html.tmpl` reload the page. The template is read again for every full server render.

The SSR renderer does not execute Alpine, serialize application stores, or follow `data.src`. Its explicit resolver returns a JSON-safe status value using the typed props, and `maxDataBytes` bounds the serialized payload. It also emits authored fallback content; Alpine directives activate during browser hydration.

Open `http://127.0.0.1:4174/?data=policy` to use the mutually exclusive `dataPolicy` renderer. The example authorizes one exact public origin, derives query parameters from the component props, supplies a local demonstration fetch implementation, and accepts only the resulting JSON-compatible value. The same policy path enforces request method, redirect, timeout, response-size, credential, origin, and sensitive-header rules before initial data can be embedded.

Open `http://127.0.0.1:4174/?hydrate=interaction`, then hover, touch, or focus the profile card. Valid SSR content stays visible while hydration is deferred and the host reports its state through `data-acl-hydration-state`. The server also accepts `visible`, `idle`, and `media` for the `hydrate` query value; invalid SSR still uses ordinary client loading instead of the progressive trigger.

Open `http://127.0.0.1:4174/?mismatch=1` to force an outdated hydration marker. The server content remains visible while the ordinary client template request completes, after which the status reports the safe fallback.

For a broader gallery covering batch rendering, multiple component contracts, slots, data, events, sanitizer parity, and observability, continue to the [SSR feature lab](../feature-lab-ssr/README.md).

To render a Light DOM definition structurally, set `renderLightDom: true` on the renderer or `lightDom: true` on one call. The complete ownership and fallback rules are in [Static SSR and hydration](../../docs/ssr.md#opt-in-light-dom-ssr).
