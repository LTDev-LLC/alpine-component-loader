# Skeleton loading UI

ACL captures rendered component geometry as responsive loading skeletons. Placeholders reserve mobile and desktop layout
during loading, reducing shifts without copying application content.

Capture a running page with working components and fixture data; skeletons are not derived from the component manifest.

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

CSS matches hosts before definition and while `aria-busy="true"`, stopping when ready. No registration is required.

Regenerate and publish skeletons when loading geometry changes.

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

Masks/fragments contain anonymous rectangles, excluding text, form values, URLs, IDs, events, and DOM structure.
Dimensions reflect fixture data; use realistic, non-sensitive states.

The first capturable instance of each tag wins per viewport; later variants produce warnings. Use separate tags or
targeted fixture pages for different layouts.

## Choose an output mode

| Mode            | Generated files                                                | Use it when                                                                                 |
| --------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `css` (default) | `acl-skeletons.css`                                            | You want a placeholder before loader JavaScript runs and the simplest integration.          |
| `manifest`      | `acl-skeletons.generated.js` and `acl-skeletons.generated.css` | You want ACL to mount generated loading markup through its normal loading-UI lifecycle.     |
| `both`          | All three files                                                | You want to evaluate or publish both delivery choices. Integrate only one choice on a page. |

### Standalone CSS mode

```bash
npx alpine-component-loader skeleton ./public --mode css
```

Link `acl-skeletons.css` in the head. It reserves host dimensions, hides unfinished children, and paints responsive SVG
masks. Reduced-motion preferences disable shimmer.

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

The manifest supplies fallback `loadingHtml`. Authored component/global `loadingTemplate` or `loadingHtml` takes
precedence. Registration affects future loads, not work in progress.

## Capture routes and components

Without `--route`, capture uses the entry page. Repeat it for routes; supplying routes replaces the default, so include
the entry explicitly if needed:

```bash
npx alpine-component-loader skeleton ./public \
  --route / \
  --route /account \
  --route /settings \
  --out-dir ./public/skeletons
```

Routes resolve against the temporary server or remote origin and must work without an existing signed-in session.

Filter by exact tags using repeated options or comma-separated values:

```bash
npx alpine-component-loader skeleton ./public \
  --include account-card,account-nav \
  --exclude admin-panel
```

`--include` makes missing requested components fail capture, useful for fixtures.

## Responsive capture

Defaults are mobile `390x844`, desktop `1440x900`, and breakpoint `768px`. Adjust them to your responsive design:

```bash
npx alpine-component-loader skeleton ./public \
  --mobile 412x915 \
  --desktop 1600x1000 \
  --breakpoint 800
```

Geometry switches at the breakpoint. If only one viewport succeeds, ACL warns and reuses that capture at both sizes.

## Failures and safe regeneration

Route, readiness, or requested-component failures preserve previous artifacts and prevent writes. Use `--allow-partial`
to publish a successful subset:

```bash
npx alpine-component-loader skeleton ./public \
  --route / \
  --route /optional-preview \
  --allow-partial
```

ACL-marked generated files can be replaced automatically. Unrecognized outputs require `--force`.

If capture fails:

- Run `npx playwright install chromium` if the browser is missing.
- Confirm the target works when served and that its scripts, component templates, fonts, and fixture APIs are reachable.
- Confirm at least one selected component is visible, has non-zero dimensions, and reaches ACL's `ready` state.
- Increase `--timeout` for slow initialization or data loading.
- Use `--include` with a small, deterministic fixture page to isolate a component.

See the [CLI reference](manifests-and-cli.md#cli-option-reference),
[authored loading/fallback UI](components.md#loading-and-fallback-ui), and
[skeleton registration API](api.md#skeleton-manifests).
