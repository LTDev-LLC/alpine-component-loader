# Manifests, generated contracts, and CLI tooling

A version-one component manifest is a reusable, JSON-safe description of the components in an application. The browser loader, static SSR renderer, offline generator, dependency prefetcher, and contract generator all consume the same component manifest. Skeleton loading UI uses a separate generated skeleton manifest.

## Format and schema versions

Package releases and document schemas are versioned independently. This
documentation describes package `1.0.0`; the built runtime exposes that value
through `AlpineComponentLoader.version`.

| Artifact or standard | Version | Ownership and compatibility |
| --- | --- | --- |
| Component manifest and route shard | `1` | ACL-owned; accepted by browser registration, SSR, contracts, routes, and offline tooling. |
| Component `.acl.json` sidecar | `1` | ACL-owned authoring metadata. |
| Route index and skeleton manifest | `1` | ACL-owned runtime inputs. |
| Offline policy and generated precache manifest | `1` | ACL-owned generator/worker inputs. |
| Accessibility baseline/report and observability beacon envelope | `1` | ACL-owned tooling payloads. |
| Diagnostic snapshot `schemaVersion` | `1` | ACL-owned debugger/support payload. |
| Generated JSON Schemas | ACL document version `1` | The schemas themselves declare the external JSON Schema Draft 2020-12 dialect. |
| Custom Elements Manifest `schemaVersion` | `2.1.0` | External Custom Elements Manifest standard; do not reset it to the ACL schema version. |
| SARIF report and `$schema` | `2.1.0` | External SARIF standard; required by SARIF consumers. |

Application persistence envelopes use their configured `persistVersion`; that
number is application migration state, not an ACL schema version. Likewise,
package `1.0.0`, JSON Schema Draft 2020-12, and the external `2.1.0` formats do
not imply that an ACL version-one manifest should be rewritten.

## Starter projects

Create a build-free project or a Vite project without running an installer on the user's behalf:

```bash
npx alpine-component-loader create my-components
npx alpine-component-loader create my-vite-app --template vite
```

The maintained `vanilla` starter is a minimal URL-manifest workflow. The more complete [Vite starter](../starters/vite/README.md) includes two dependency-expanded route shards, base-aware client routing, targeted HMR, generated contracts, a form-associated component, an error boundary, bounded observability, and accessibility policy files. Existing files remain protected unless `--force` is explicit. The static [playground](../examples/playground/README.md) demonstrates isolated loader instances and is deployed through GitHub Pages. Repository contributors can run `npm run stage -- <example...>` or the equivalent `npm run staging -- <example...>` for any ordered selection of Playground, Feature Lab, Accessibility, and Offline. The command builds ACL, checks/installs Playwright Chromium, bundles the selected pages into one atomic `_site` artifact, and gives them one shared family of direct `/dist/*.min.js` import-map entries. It also captures responsive CSS skeletons for each selected page, writes them below that example’s `skeletons/` directory, and links them early in the staged document head. A single selection uses a root redirect; multiple distinct selections use the generated static catalog. Capture failures preserve the previous `_site`, and Offline staging precaches the final linked skeleton stylesheet.

## Quick start

Given one component template per file:

```text
components/
├── avatar-image.html
├── avatar-image.acl.json
├── profile-card.html
└── profile-card.acl.json
```

generate and validate the component manifest:

```bash
npx alpine-component-loader manifest components --out acl-manifest.json
npx alpine-component-loader validate acl-manifest.json
```

The `manifest` command recursively finds `.html` and `.htm` files. A filename becomes the custom-element tag, so `profile-card.html` becomes `<profile-card>`. Adjacent `<tag>.acl.json` sidecars own JSON-safe dependencies, groups, options, and metadata. Filenames must produce valid, unique custom-element names containing a hyphen.

The generated manifest contains relative template sources, dependencies inferred from known custom-element tags in the templates, and SHA-256 template revisions:

```json
{
    "version": 1,
    "components": {
        "avatar-image": {
            "source": "components/avatar-image.html",
            "dependencies": [],
            "options": {
                "templateRevision": "sha256-..."
            }
        },
        "profile-card": {
            "source": "components/profile-card.html",
            "dependencies": ["avatar-image"],
            "options": {
                "templateRevision": "sha256-..."
            }
        }
    },
    "groups": {}
}
```

Use `--dry-run` to print the proposed JSON without writing it, and `--json` when another tool needs the structured command result:

```bash
npx alpine-component-loader manifest components --out acl-manifest.json --dry-run
npx alpine-component-loader manifest components --out acl-manifest.json --dry-run --json
```

## Generated fields and authored fields

Generation can reliably infer only information present in the component directory:

- `.html` and `.htm` files are discovered recursively in stable path order.
- The basename becomes the lower-case component tag.
- `source` is relative to the output manifest directory.
- A dependency is inferred structurally with parse5 when a template contains another known component tag, including nested templates and multiline or unusually quoted markup.
- `options.templateRevision` is a `sha256-` digest of the template contents.
- Known nested component hosts, named/default `<slot>` elements, static stylesheet links, and static external script sources are structurally discoverable.
- Sidecar `groups` populate manifest group membership.

Safe inference writes only structurally certain dependencies, slots, and external asset descriptors; it never enables script execution. Likely `$props` references, literal `$dispatch`/`$emit` event names, and declarative data attributes are reported as non-authoritative diagnostics. Use `--infer safe` (default), `--infer report` to report without writing inferred metadata, or `--infer off`. Shadow behavior, prop/event schemas, data authorization, loading/fallback templates, and descriptions remain sidecar-owned. Sidecar values always win and generated updates never overwrite authored fields.

The command refuses to replace an existing output unless `--force` is supplied. `--update` safely refreshes generated source and revision fields while preserving fields that are not owned by a sidecar. Sidecar top-level dependencies, options, metadata, and group declarations are authoritative when present. Components missing from disk are retained with a warning; add `--prune` to remove them:

```bash
npx alpine-component-loader manifest components --out acl-manifest.json --update
npx alpine-component-loader manifest components --out acl-manifest.json --update --prune
```

The `init` command creates both the template and its version-one sidecar. Use `schema --kind component` for editor validation of sidecars, `schema --kind manifest` for the aggregate manifest, and `schema --kind offline` for offline policy files.

## Complete component manifest

Component entries may be a source string or a full definition. Use the full form when the component needs options, dependencies, or metadata:

```json
{
    "$schema": "./acl-manifest.schema.json",
    "version": 1,
    "basePath": "./",
    "components": {
        "avatar-image": "components/avatar-image.html",
        "profile-card": {
            "source": "components/profile-card.html",
            "dependencies": ["avatar-image"],
            "options": {
                "shadow": true,
                "templateRevision": "sha256-REPLACE_WITH_GENERATED_VALUE",
                "attributes": {
                    "name": {
                        "type": "String",
                        "required": true
                    },
                    "count": {
                        "type": "Number",
                        "default": 0
                    },
                    "status": {
                        "type": "String",
                        "options": ["active", "away"]
                    }
                },
                "data": {
                    "src": "/api/profile",
                    "target": "$data",
                    "cacheStrategy": "network-first"
                }
            },
            "metadata": {
                "description": "A profile summary that can be rendered on the server.",
                "events": {
                    "profile-follow": {
                        "description": "Emitted when the follow button is activated.",
                        "detail": {
                            "type": "object",
                            "properties": {
                                "id": { "type": "string" }
                            },
                            "required": ["id"]
                        }
                    }
                },
                "slots": {
                    "default": { "description": "Profile summary text." },
                    "avatar": { "description": "Avatar content or image." },
                    "actions": { "description": "Profile action controls." }
                }
            }
        }
    },
    "groups": {
        "profile": ["profile-card"],
        "critical": ["profile-card"]
    }
}
```

`basePath` is combined with relative component sources by the browser, SSR, and offline tooling. An absolute source or remote URL is not prefixed. Dependencies must name components in the same manifest, cannot contain duplicates or self-references, and must form an acyclic graph. Normalization registers dependencies before the components that use them.

Prop names and runtime prop types come only from `options.attributes`. Metadata describes components to generated tools; it does not change runtime rendering. Metadata event-detail schemas support JSON-safe primitive, object, and array shapes, `properties`, `items`, required keys, enums, and nullability.

## Scaffold a component

`init` creates a template and can add it to a new or existing manifest:

```bash
npx alpine-component-loader init profile-card \
  --dir components \
  --manifest acl-manifest.json \
  --shadow
```

`--shadow` adds `options.shadow: true`. The incremental entry does not include a content revision or prop/metadata contracts, so add those manually or copy the revision from a generated manifest. `--dry-run` previews the component source. Existing component files and duplicate manifest entries are protected unless `--force` is used.

## Register a manifest in the browser

`registerManifest()` accepts a parsed manifest object, not a URL. Fetch and parse the file first, then register it before startup:

```js
import AlpineComponentLoader from 'alpine-component-loader';

const response = await fetch('/acl-manifest.json');
if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);

const manifest = await response.json();
const result = await AlpineComponentLoader.registerManifest(manifest, {
    prefetch: ['critical'],
    concurrency: 2,
});

console.log(result.registered);
console.log(result.prefetched);
await AlpineComponentLoader.start();
```

`prefetch` may be `true` for every registered component or an array of group/tag names. Every prefetch result is settled independently so one failed template does not hide the status of the others.

For URL loading and route shards:

```js
const controller = new AbortController();

await AlpineComponentLoader.registerManifestFrom('/acl-manifest.json', {
    signal: controller.signal,
    cache: 'no-cache',
    integrity: 'sha256-…',
    timeout: 5000,
    maxBytes: 512 * 1024,
});
await AlpineComponentLoader.registerRouteManifest('account/settings', '/routes/acl-routes.json');
```

The URL loader enforces a default 10-second timeout and 1 MiB response limit, supports integrity/cache/abort/custom-fetch options, deduplicates concurrent URL/integrity requests per loader, evicts failures for retry, and resolves component paths relative to the final manifest URL. Route lookup is exact; it does not use prefixes or route-pattern matching.

## Shared project configuration

Export configuration from `acl.config.mjs` with the typed `defineConfig()` helper:

```js
import { defineConfig } from 'alpine-component-loader/project';

export default defineConfig({
    root: '.',
    components: {
        directory: './components',
        manifest: './public/acl-manifest.json',
        inference: 'safe',
    },
    routes: {
        manifest: './public/acl-manifest.json',
        outDir: './public/routes',
        entries: [
            { key: 'home', path: '/', components: ['home-page'] },
            { key: 'account', path: '/account', groups: ['account'], discover: true },
        ],
    },
    contracts: {
        types: './generated/acl-components.d.ts',
        customElements: './generated/custom-elements.json',
    },
    offline: {
        manifest: './public/acl-manifest.json',
        outDir: './public',
        groups: ['critical'],
        assets: ['./public/index.html', './public/app.js'],
        baseUrl: '/my-app/',
        namespace: 'my-app',
        config: './acl-offline.json',
    },
    watch: { tasks: ['manifest', 'types', 'routes'], debounce: 100, pollInterval: 5000 },
    audit: {
        routes: ['/'],
        root: './public',
        baseline: './.acl/a11y-baseline.json',
        suppressions: './.acl/a11y-suppressions.json',
    },
    vite: {
        moduleDelivery: 'copy',
        routeDirectory: 'acl-routes',
    },
});
```

Paths resolve from the configuration file. Unknown keys fail validation. CLI flags override Vite-plugin options, which override project configuration, which overrides defaults. Project commands discover `acl.config.mjs` from the invocation directory or accept `--config`; `offline` uses `--project-config` because its existing `--config` flag remains the offline policy.

Top-level project configuration groups are:

| Field | Purpose |
| --- | --- |
| `root` | Shared project root; relative paths below resolve from the config file. |
| `components` | Component directory, manifest output, inference, update, and prune policy. |
| `routes` | Source manifest, route output, discovery target/browser, timeout, and entries. |
| `contracts` | Type declarations, Custom Elements Manifest, and manifest/component/offline schema outputs. |
| `offline` | Manifest, selected groups/assets, browser base, namespace, policy, and JavaScript minification. |
| `watch` | Task selection, debounce, and safety-scan interval. |
| `audit` | Routes, report format/output, browser, baseline, and suppressions. |
| `vite` | Module delivery and route-copy behavior shared with the plugin. |
| `skeleton` | Capture target/routes, filters, viewports, output mode, and overwrite policy. |

`loadProjectConfig()` accepts `configFile`, `invocationDirectory`, `optional`,
and normalized `overrides`; it returns the resolved `config`, discovered
`configFile`, and `configDirectory`. Most applications only need
`defineConfig()` and CLI discovery.

## Route shards and watch mode

Generate independent version-one route manifests plus `acl-routes.json`:

```bash
npx alpine-component-loader routes --config acl.config.mjs --force
npx alpine-component-loader routes --route /account --target ./index.html --force
```

Authored component/group roots are expanded through the dependency graph. Routes marked `discover: true` additionally crawl the rendered document and every open Shadow Root with Playwright. Unknown observed components become warnings. Shard filenames combine a stable route key with a short content hash; the index records each shard URL, SHA-256 revision, and ordered component list.

Each configured route entry supports:

| Field | Contract |
| --- | --- |
| `key` | Stable exact lookup key. |
| `id` | Alias used when `key` is omitted. |
| `path` | Navigation path and final fallback key; required for discovery. |
| `components` | Authored component roots. |
| `groups` | Authored manifest groups. |
| `discover` | Whether Playwright should add components observed on the rendered route. |

At least one of `key`, `id`, or `path` must be non-empty.

Each shard remains an independent version-one component manifest:

```json
{
    "version": 1,
    "basePath": "..",
    "components": {
        "account-nav": "components/account-nav.html",
        "account-shell": {
            "source": "components/account-shell.html",
            "dependencies": ["account-nav"]
        }
    },
    "groups": {
        "account": ["account-shell", "account-nav"]
    }
}
```

The index maps the stable authored key to the content-addressed shard:

```json
{
    "version": 1,
    "routes": {
        "account/settings": {
            "manifest": "./acl-route-account-settings-e3b0c442.json",
            "revision": "sha256-…",
            "components": ["account-nav", "account-shell"]
        }
    }
}
```

Relative shard URLs resolve against the route-index URL. A caller can override that base for an in-memory index with the `baseUrl` option.

Watch configured filesystem tasks with serialized, debounced regeneration:

```bash
npx alpine-component-loader watch
npx alpine-component-loader watch --task manifest --task types
npx alpine-component-loader watch --include-expensive
npx alpine-component-loader watch --poll-interval 0
```

The coordinator prefers one recursive native watcher and safely falls back to
per-directory watchers. It preserves the last valid artifact after failures,
reruns dirty work after the active pass, writes replacements atomically, and
closes watchers on termination signals. `watch.pollInterval` defaults to
`5000`; the CLI `--poll-interval` overrides configuration, and `0` disables
periodic safety scans. Browser-backed route crawling, skeleton capture, and
audits run only when explicitly selected or enabled with
`--include-expensive`.

| Task                | Typical dependency                                     | Default watch eligibility                       |
| ------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| `manifest`          | Component templates and sidecars                       | Filesystem-only                                 |
| `types`, `schema`   | Current component manifest                             | Filesystem-only                                 |
| `routes`            | Current manifest; Playwright only for `discover: true` | Authored routes are cheap; crawling is explicit |
| `offline`           | Current manifest and offline policy                    | Filesystem-only                                 |
| `skeleton`, `audit` | Running browser and rendered routes                    | Explicit or `--include-expensive`               |

## Vite integration

```js
import { defineConfig } from 'vite';
import { alpineComponentLoader } from 'alpine-component-loader/vite';

export default defineConfig({
    base: '/my-app/',
    plugins: [alpineComponentLoader()],
});
```

Register only the current route's shard:

```js
import AlpineComponentLoader from 'alpine-component-loader';
import { registerRoute, routeIndexUrl } from 'virtual:alpine-component-loader/routes';

const start = async () => {
    console.debug('ACL route index', routeIndexUrl);
    await registerRoute('account/settings');
    await AlpineComponentLoader.start();
};

start();
```

The Vite plugin runs the shared manifest/contract/route generators, externalizes ACL from optimization and Rollup, serves the readable native module tree in development, injects matching import maps, emits targeted template HMR, and copies modules to `assets/alpine-component-loader/<version>/` in production. For application-managed delivery use `{ moduleDelivery: 'external', moduleBase: 'https://cdn.example/acl/' }`.

| Plugin option | Default | Contract |
| --- | --- | --- |
| `configFile` | discovered `acl.config.mjs` | Explicit project configuration path. |
| `moduleDelivery` | `copy` | `copy` package modules into the build or use an application-owned `external` base. |
| `moduleDirectory` | `assets/alpine-component-loader/1.0.0` | Build-relative destination for copied modules. |
| `moduleBase` | none | Required URL base when `moduleDelivery: "external"`. |
| `routeDirectory` | `acl-routes` | Build-relative route index/shard destination. |
| `generate` | `true` | Run configured manifest, contract, and route generation before serving/building. |

## Which feature uses which manifest?

| Feature                          | Input                                       | Generated output or consumer                                               |
| -------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| Browser registration             | Component manifest                          | `registerManifest()` defines components and groups                         |
| Route-aware registration         | Route index plus independent v1 shards      | Exact keys register one dependency-expanded shard                          |
| Dependency and adaptive prefetch | Component manifest                          | `dependencies` and `groups` select template graphs                         |
| Static SSR and hydration         | Enriched component manifest                 | `createSSRRenderer()` reads sources, props, Shadow settings, and revisions |
| Offline support                  | Component manifest plus explicit app assets | `acl-precache-manifest.json` and `acl-sw.js`                               |
| TypeScript/editor contracts      | Enriched component manifest                 | `acl-components.d.ts` and `custom-elements.json`                           |
| Manifest validation              | Generated JSON Schema                       | `acl-manifest.schema.json` for editors and validators                      |
| Skeleton loading UI              | Rendered pages, not the component manifest  | `acl-skeletons.generated.js` and reservation CSS                           |

The Custom Elements Manifest (`custom-elements.json`) is editor/tooling output and is not registered with the runtime. The offline precache manifest is consumed by the generated service worker, not by `registerManifest()`. The skeleton manifest has a different `skeletons` shape and is registered with `registerSkeletonManifest()`.

## Validate manifests and directories

Generate the version-one JSON Schema and reference it from the manifest with `$schema`:

```bash
npx alpine-component-loader schema --out acl-manifest.schema.json
npx alpine-component-loader validate acl-manifest.json
```

Validation uses the same normalization rules as the runtime and also checks local component sources. A directory target validates its `acl-manifest.json` when present; otherwise it validates discoverable component templates:

```bash
npx alpine-component-loader validate components
```

Validation reports all discoverable diagnostics and exits unsuccessfully when errors are present. It does not rewrite project files.

## Generate TypeScript and editor contracts

Generate declarations and a Custom Elements Manifest from the enriched component manifest:

```bash
npx alpine-component-loader types acl-manifest.json \
  --out generated/acl-components.d.ts \
  --custom-elements-out generated/custom-elements.json
```

Declarations augment `HTMLElementTagNameMap`, expose typed `$props` and properties, and add typed custom-event listener overloads. The Custom Elements Manifest contains descriptions, properties, attributes, events, and slots for compatible editors and documentation tools.

Only JSON-serializable prop type names are supported in a manifest: `String`, `Number`, `Boolean`, `Array`, and `Object`. Runtime-only functions such as validators and coercers belong in JavaScript definitions rather than a JSON manifest.

Use `--dry-run` to validate without writing, combine it with `--json` to inspect structured generated content, and use `--force` to replace existing artifacts. Without explicit output flags, the CLI writes `acl-components.d.ts`, `custom-elements.json`, or `acl-manifest.schema.json` in the current working directory.

## Generate offline artifacts

The offline command takes the component manifest and expands the selected dependency graph:

```bash
npx alpine-component-loader offline acl-manifest.json \
  --group critical \
  --asset index.html \
  --asset app.js \
  --asset styles.css \
  --config acl-offline.json \
  --base-url /app \
  --out-dir public \
  --namespace app \
  --force
```

It creates `acl-precache-manifest.json` and `acl-sw.js`. Component templates, their external assets, loading templates, and fallbacks are discovered from the selected component definitions; application shell files and imported browser modules must be supplied with repeatable `--asset` flags. See [Offline behavior](offline.md) for scope, URL, and activation guidance.

Add `--minify-js` when those explicit local JavaScript assets should be
published and precached as virtual `.min.js` URLs. The generator hashes the
actual minified bytes, leaves existing `.min.js` and remote URLs unchanged, and
does not rewrite component assets discovered from the manifest. It does not
write physical minified files; use these virtual URLs with the packaged
development server, a jsDelivr-style CDN, or another host that provides the
matching `.min.js` responses.

## Generate a skeleton manifest

Skeleton generation renders a local page or remote URL at mobile and desktop sizes. It does not derive loading geometry from the component manifest:

```bash
npx alpine-component-loader skeleton ./index.html \
  --mode manifest \
  --out-dir skeletons
```

`--mode manifest` writes `acl-skeletons.generated.js` and `acl-skeletons.generated.css`; `--mode both` also writes the standalone `acl-skeletons.css`. Import and register the generated module before component startup:

```js
import AlpineComponentLoader from 'alpine-component-loader';
import skeletons from './skeletons/acl-skeletons.generated.js';
import './skeletons/acl-skeletons.generated.css';

await AlpineComponentLoader.registerSkeletonManifest(skeletons);
await AlpineComponentLoader.start();
```

Use `--route` repeatedly to capture more pages and `--include` or `--exclude` to select component tags. The generator protects non-generated files unless `--force` is supplied.

## CLI option reference

Run `npx alpine-component-loader --help` for the installed version's command summary. Options accept `--name value` or `--name=value` where a value is required.

| Command             | Option                                  | Default and behavior                                                           |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `create`            | positional directory                    | Required starter destination.                                                  |
| `create`            | `--template <name>`                     | `vanilla`; also accepts `vite`.                                                |
| `serve`             | positional directory or HTML file       | Invocation directory and `index.html`.                                         |
| `serve`             | `--root <directory>`                    | Invocation directory; base for static files and a positional target.           |
| `serve`             | `--host <host>`                         | `127.0.0.1`.                                                                   |
| `serve`             | `--port <port>`                         | `4173`; accepts 0 through 65535.                                               |
| `skeleton`          | positional URL, directory, or HTML file | Required capture target.                                                       |
| `skeleton`          | `--root <directory>`                    | Invocation directory for local target resolution.                              |
| `skeleton`          | `--route <path>`                        | Repeatable route; otherwise capture the resolved entry route.                  |
| `skeleton`          | `--out-dir <directory>`                 | `skeletons` below the resolved local root.                                     |
| `skeleton`          | `--mode <mode>`                         | `css`; also accepts `manifest` or `both`.                                      |
| `skeleton`          | `--include <tags>` / `--exclude <tags>` | Comma-separated tag filters; repeatable values are deduplicated.               |
| `skeleton`          | `--timeout <ms>`                        | `15000`; positive navigation/readiness timeout.                                |
| `skeleton`          | `--mobile <width>x<height>`             | `390x844`.                                                                     |
| `skeleton`          | `--desktop <width>x<height>`            | `1440x900`.                                                                    |
| `skeleton`          | `--breakpoint <px>`                     | `768`; positive mobile media-query boundary.                                   |
| `skeleton`          | `--allow-partial`                       | Write successful captures when another route/viewport fails.                   |
| `skeleton`          | `--force`                               | Permit replacement of output not carrying the generated-file header.           |
| `audit`             | positional route or URL                 | Required unless a repeatable `--route` is provided.                            |
| `audit`             | `--root <directory>`                    | Invocation directory containing `index.html` for local routes.                 |
| `audit`             | `--route <path-or-url>`                 | Add another route to the crawl.                                                |
| `audit`             | `--format <format>`                     | `console`; also accepts `json`, `junit`, or `sarif`.                           |
| `audit`             | `--out <file>`                          | Write the selected report while retaining structured results.                  |
| `audit`             | `--no-axe`                              | Run only ACL's dependency-free scanner rules.                                  |
| `audit`             | `--timeout <ms>`                        | `15000`; positive navigation deadline.                                         |
| `audit`             | `--baseline <file>`                     | Compare stable finding fingerprints with a v1 baseline.                        |
| `audit`             | `--suppressions <file>`                 | Apply exact, reasoned, expiring suppressions.                                  |
| `audit`             | `--update-baseline`                     | Atomically replace the baseline with current unsuppressed findings.            |
| `init`              | positional tag                          | Required valid custom-element tag.                                             |
| `init`              | `--dir <directory>`                     | `components`.                                                                  |
| `init`              | `--manifest <file>`                     | Optionally create/update one v1 manifest entry.                                |
| `init`              | `--shadow`                              | Add `options.shadow: true` to that manifest entry.                             |
| `manifest`          | positional directory                    | `components`.                                                                  |
| `manifest`          | `--out <file>`                          | `acl-manifest.json`.                                                           |
| `manifest`          | `--update`                              | Refresh generated fields and merge sidecar-owned fields safely.                |
| `manifest`          | `--prune`                               | With `--update`, remove manifest components missing from disk.                 |
| `manifest`          | `--infer <mode>`                        | `safe`; also accepts `report` or `off`.                                        |
| `routes`            | `--manifest <file>`                     | Source v1 component manifest.                                                  |
| `routes`            | `--route <path>`                        | Repeatable route crawl; configured routes are used otherwise.                  |
| `routes`            | `--target <url-or-file>`                | Application target for browser discovery.                                      |
| `routes`            | `--out-dir <directory>`                 | Route shard and index destination.                                             |
| `watch`             | `--task <name>`                         | Repeatable configured generator task.                                          |
| `watch`             | `--include-expensive`                   | Include configured browser-backed tasks.                                       |
| `watch`             | `--debounce <ms>`                       | `100`; non-negative change debounce.                                           |
| `watch`             | `--poll-interval <ms>`                  | `5000`; non-negative safety scan interval; `0` disables scans.                 |
| `validate`          | positional manifest/directory           | Current directory; read-only.                                                  |
| `offline`           | positional manifest                     | Required v1 component manifest.                                                |
| `offline`           | `--group <name>`                        | Repeatable graph root; without it include all components.                      |
| `offline`           | `--asset <path-or-url>`                 | Repeatable additional shell/static asset.                                      |
| `offline`           | `--minify-js`                           | Publish explicit local JavaScript assets as minified URLs.                     |
| `offline`           | `--out-dir <directory>`                 | `offline`.                                                                     |
| `offline`           | `--base-url <path>`                     | `/`; browser URL base for local assets.                                        |
| `offline`           | `--namespace <name>`                    | `default`; generated cache namespace.                                          |
| `offline`           | `--config <file>`                       | Optional version-one activation, navigation, and bounded runtime-route policy. |
| `offline`           | `--project-config <file>`               | Explicit shared ACL project configuration.                                     |
| `types`             | positional manifest                     | Required enriched component manifest.                                          |
| `types`             | `--out <file>`                          | `acl-components.d.ts`.                                                         |
| `types`             | `--custom-elements-out <file>`          | `custom-elements.json`.                                                        |
| `schema`            | `--kind <kind>`                         | `manifest`; also accepts `component` or `offline`.                             |
| `schema`            | `--out <file>`                          | Kind-specific schema filename; no positional manifest.                         |
| Writing commands    | `--dry-run`                             | Validate and print planned output without writing.                             |
| Structured commands | `--json`                                | Emit machine-readable results.                                                 |
| Writing commands    | `--force`                               | Permit replacement according to the command's safety rules.                    |
| Project commands    | `--config <file>`                       | Explicit shared project configuration; flags retain highest precedence.        |
| Every command       | `-h` / `--help`                         | Print command help without starting servers, browsers, or generators.          |

`--dry-run` and `--force` apply to `create`, `init`, `manifest`, `offline`, `types`, and `schema`; `validate` and `audit` are inherently read-only except for an explicit audit report file. `--json` applies to project/contract commands; audit chooses JSON with `--format json`. Skeleton output has its own `--force` and `--allow-partial` controls.

### Optional tooling in lean installations

Default npm installs include `parse5` and `@swc/core`. Browser-only consumers
may install the package with `--omit=optional`; CLI help, package imports,
starter creation, schema generation, and readable JavaScript serving do not
load either tool merely to start.

| Requested feature | Tool required in a lean install |
| --- | --- |
| Component inspection, `manifest`, project validation, and inline-template HMR | `parse5` |
| `alpine-component-loader/ssr` | `parse5` |
| Generated `.min.js` server responses or explicitly minified generated JavaScript | `@swc/core` |

An omitted-tool failure uses code `ACL_OPTIONAL_DEPENDENCY_MISSING` and includes
the dependency name, requested feature, and an `npm install <dependency>`
command. Readable serving remains usable without SWC.

## Development server and command discovery

Serve a directory or a specific HTML entry during development:

```bash
npx alpine-component-loader serve ./public --host 127.0.0.1 --port 4173
npx alpine-component-loader --help
```

The development server is intended for local component work. Production hosting, bundling, routing, and service-worker delivery remain application responsibilities.

The server injects an EventSource bootstrap into the primary page, sends template-specific messages for component HTML changes, and requests a page reload for other files. For manual integration and state-preserving behavior, see [Development server and targeted HMR](lifecycle.md#development-server-and-targeted-hmr).

For local CDN-parity testing, request any contained JavaScript asset with `.min.js`. If that file is absent and the matching `.js` source exists, the server generates the minified response in memory, retains it until the source changes, and never writes it to disk. An existing `.min.js` file is served unchanged. This also works below `/__acl_hmr/modules/`. Map `alpine-component-loader` to `/__acl_hmr/modules/index.min.js` in the page's import map; the server derives the remaining injected package entries from that base and suffix so both the application and HMR client use the fully minified runtime family.

For feature-specific workflows, continue to [Static SSR and hydration](ssr.md), [Offline behavior](offline.md), [Adaptive prefetch](prefetch.md), and [Components, props, slots, and rendering](components.md).
