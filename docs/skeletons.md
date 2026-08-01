# Skeleton loading UI

ACL can capture the rendered geometry of your components and turn it into responsive loading skeletons. The generated placeholders reserve the component's mobile and desktop layout while its template, assets, and data load, reducing layout shifts without copying application content into the generated files.

Skeletons are generated from a running page, not from `acl-manifest.json`. Capture a representative page after its components and fixture data can load successfully.

## Quick start

Install the Chromium browser used by the capture command once:

```bash
npx playwright install chromium
```

Generate the default standalone stylesheet from a local HTML file or application directory:

```bash
npx alpine-component-loader skeleton ./public/index.html \
  --out-dir ./public/skeletons
```

Link the generated stylesheet after your base styles and before the loader JavaScript:

```html
<head>
    <link rel="stylesheet" href="/styles.css">
    <link rel="stylesheet" href="/skeletons/acl-skeletons.css">
    <script type="module" src="/app.js"></script>
</head>
```

The stylesheet applies to matching elements before their custom element is defined and while ACL exposes `aria-busy="true"`. It stops matching when the component is ready. No JavaScript registration is needed.

Run the command again whenever a component's loading geometry changes, then commit or publish the regenerated file with the application.

## What capture does

The positional target can be:

- A directory, which ACL serves temporarily with its `index.html` as the entry page.
- An HTML file, which ACL serves from the local root.
- An `http:` or `https:` URL, which ACL captures directly.

For each selected route, the generator:

1. Opens the page at the mobile and desktop viewports.
2. Disables animation, waits for fonts, scrolls the page, and activates lazy or deferred components.
3. Waits for at least one visible instance of each discovered ACL component type to reach the `ready` state.
4. Captures the first visible, non-zero-size instance of each tag at each viewport.
5. Writes the requested artifacts only after capture succeeds.

The generated masks and fragments contain anonymous rectangles. They do not retain text, form values, URLs, IDs, event attributes, or the application DOM structure. Their dimensions still reflect the rendered fixture data, so use realistic but non-sensitive states.

If the same tag appears in several layouts or routes, the first capturable instance for each viewport wins and the command reports a warning for later instances. Give materially different layouts separate component tags, or use `--include` and dedicated fixture pages to generate the intended variant.

## Choose an output mode

| Mode | Generated files | Use it when |
| --- | --- | --- |
| `css` (default) | `acl-skeletons.css` | You want a placeholder before loader JavaScript runs and the simplest integration. |
| `manifest` | `acl-skeletons.generated.js` and `acl-skeletons.generated.css` | You want ACL to mount generated loading markup through its normal loading-UI lifecycle. |
| `both` | All three files | You want to evaluate or publish both delivery choices. Integrate only one choice on a page. |

### Standalone CSS mode

```bash
npx alpine-component-loader skeleton ./public --mode css
```

Link `acl-skeletons.css` in the document head as shown in the quick start. The CSS reserves captured host dimensions, hides unfinished child content, and paints responsive SVG masks. It also disables shimmer when the user prefers reduced motion.

Customize its colors with CSS custom properties:

```css
:root {
    --acl-skeleton-base: #dbe3ec;
    --acl-skeleton-highlight: rgba(255, 255, 255, 0.7);
}
```

### Manifest mode

```bash
npx alpine-component-loader skeleton ./public \
  --mode manifest \
  --out-dir ./public/skeletons
```

Import the reservation stylesheet and register the generated manifest before starting the loader:

```js
import AlpineComponentLoader from 'alpine-component-loader';
import skeletons from './skeletons/acl-skeletons.generated.js';
import './skeletons/acl-skeletons.generated.css';

await AlpineComponentLoader.registerSkeletonManifest(skeletons);
await AlpineComponentLoader.start();
```

The generated manifest supplies fallback `loadingHtml` for captured tags. A component or global configuration with an authored `loadingTemplate` or `loadingHtml` keeps that authored loading UI. Registration affects eligible future loads; it does not replace a load already in progress.

## Capture routes and components

With no `--route`, ACL captures the target entry page. Add `--route` once per application route you need. When any routes are supplied, only those routes are captured, so include the entry route explicitly if you still need it:

```bash
npx alpine-component-loader skeleton ./public \
  --route / \
  --route /account \
  --route /settings \
  --out-dir ./public/skeletons
```

Routes resolve against the local temporary server or remote target origin. The route must render its ACL components without relying on an existing signed-in browser session.

Filter capture by exact custom-element tag names. Values may be comma-separated or the options may be repeated:

```bash
npx alpine-component-loader skeleton ./public \
  --include account-card,account-nav \
  --exclude admin-panel
```

`--include` is especially useful for a dedicated skeleton fixture: it makes a missing requested component a reported failure instead of silently omitting it.

## Responsive capture

The defaults are a `390x844` mobile viewport, a `1440x900` desktop viewport, and a `768px` breakpoint. Override them together when they do not match the application's responsive design:

```bash
npx alpine-component-loader skeleton ./public \
  --mobile 412x915 \
  --desktop 1600x1000 \
  --breakpoint 800
```

The generated media query uses the mobile capture below the breakpoint and the desktop capture at or above it. If only one responsive variant succeeds, ACL reports a warning and reuses the available geometry for both sizes.

## Failures and safe regeneration

Capture is strict by default: a route, readiness, or requested-component failure prevents any output from being written. This preserves the previous valid artifacts. Use `--allow-partial` only when publishing the successful subset is intentional:

```bash
npx alpine-component-loader skeleton ./public \
  --route / \
  --route /optional-preview \
  --allow-partial
```

Generated artifacts carry an ACL header and can be replaced by later runs. The command refuses to overwrite an unrecognized file with the same name; `--force` explicitly permits that replacement.

If capture fails:

- Run `npx playwright install chromium` if the browser is missing.
- Confirm the target works when served and that its scripts, component templates, fonts, and fixture APIs are reachable.
- Confirm at least one selected component is visible, has non-zero dimensions, and reaches ACL's `ready` state.
- Increase `--timeout` for slow initialization or data loading.
- Use `--include` with a small, deterministic fixture page to isolate a component.

For every option and default, see the [CLI option reference](manifests-and-cli.md#cli-option-reference). For authored loading and error UI, see [Loading and fallback UI](components.md#loading-and-fallback-ui). The separate [skeleton manifest API](api.md#skeleton-manifests) documents runtime registration.
