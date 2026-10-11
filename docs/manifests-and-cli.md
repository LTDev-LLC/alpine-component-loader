# Manifests, generated contracts, and CLI tooling

A version-one component manifest is a JSON-safe component catalog shared by browser loading, SSR, offline generation,
dependency prefetching, and contract tools. Skeleton loading UI uses a separate manifest.

## Format and schema versions

Package and document versions are independent. This guide covers package `1.0.0`, exposed as
`AlpineComponentLoader.version`.

| Artifact or standard                                            | Version                  | Ownership and compatibility                                                               |
| --------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| Component manifest and route shard                              | `1`                      | ACL-owned; accepted by browser registration, SSR, contracts, routes, and offline tooling. |
| Component `.acl.json` sidecar                                   | `1`                      | ACL-owned authoring metadata.                                                             |
| Route index and skeleton manifest                               | `1`                      | ACL-owned runtime inputs.                                                                 |
| Offline policy and generated precache manifest                  | `1`                      | ACL-owned generator/worker inputs.                                                        |
| Accessibility baseline/report and observability beacon envelope | `1`                      | ACL-owned tooling payloads.                                                               |
| Diagnostic snapshot `schemaVersion`                             | `1`                      | ACL-owned debugger/support payload.                                                       |
| Generated JSON Schemas                                          | ACL document version `1` | The schemas themselves declare the external JSON Schema Draft 2020-12 dialect.            |
| Custom Elements Manifest `schemaVersion`                        | `2.1.0`                  | External Custom Elements Manifest standard; do not reset it to the ACL schema version.    |
| SARIF report and `$schema`                                      | `2.1.0`                  | External SARIF standard; required by SARIF consumers.                                     |

`persistVersion` tracks application migrations. Package versions, JSON Schema Draft 2020-12, and external `2.1.0`
formats do not change ACL’s version-one manifest format.

## Starter projects

Create a build-free or Vite project; the command does not install dependencies:

```bash
npx alpine-component-loader create my-components
npx alpine-component-loader create my-vite-app --template vite
```

The `vanilla` starter demonstrates URL manifests. The [Vite starter](../starters/vite/README.md) adds route shards,
routing, HMR, contracts, forms, boundaries, metrics, and accessibility policies. Existing files require `--force` to
replace. The [playground](../examples/playground/README.md) demonstrates isolated loaders. Contributors can stage
selected examples with `npm run stage -- <example...>`; see [example staging](../examples/README.md) for shared modules,
captured skeletons, and atomic output.

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

`manifest` recursively discovers `.html`/`.htm` files. Basenames become tags (`profile-card.html` → `<profile-card>`),
which must be valid, unique custom-element names. Adjacent `<tag>.acl.json` sidecars declare dependencies, groups,
options, and metadata.

Output includes relative sources, dependencies inferred from known component tags, and SHA-256 revisions:

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

`--dry-run` previews JSON without writing; `--json` returns a structured command result:

```bash
npx alpine-component-loader manifest components --out acl-manifest.json --dry-run
npx alpine-component-loader manifest components --out acl-manifest.json --dry-run --json
```

## Generated fields and authored fields

Generation infers these fields from component files:

- `.html` and `.htm` files are discovered recursively in stable path order.
- The basename becomes the lower-case component tag.
- `source` is relative to the output manifest directory.
- A dependency is inferred structurally with parse5 when a template contains another known component tag, including
  nested templates and multiline or unusually quoted markup.
- `options.templateRevision` is a `sha256-` digest of the template contents.
- Known nested component hosts, named/default `<slot>` elements, static stylesheet links, and static external script
  sources are structurally discoverable.
- Sidecar `groups` populate manifest group membership.

Safe inference writes structurally certain dependencies, slots, and external assets; it never enables scripts. `$props`,
literal `$dispatch`/`$emit` names, and data attributes are diagnostics only. Choose `--infer safe` (default), `report`
(diagnostics without inferred metadata), or `off`. Shadow behavior, prop/event schemas, data authorization,
loading/fallback templates, and descriptions require sidecars. Authored fields take precedence.

Existing output requires `--force` or `--update`. Updates refresh generated sources/revisions and preserve other
authored fields. Sidecar dependencies, options, metadata, and groups are authoritative. Missing components remain with a
warning unless `--prune` is supplied:

```bash
npx alpine-component-loader manifest components --out acl-manifest.json --update
npx alpine-component-loader manifest components --out acl-manifest.json --update --prune
```

`init` creates a template and version-one sidecar. Generate editor schemas with `schema --kind component`, `manifest`,
or `offline`.

## Complete component manifest

Entries accept a source string or a definition. Use definitions for options, dependencies, or metadata:

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

`basePath` prefixes relative sources across browser, SSR, and offline tools. Absolute sources and remote URLs are
unchanged. Dependencies must name components in the same manifest, with no duplicates, self-references, or cycles.
Registration orders dependencies first.

`options.attributes` defines runtime props and types. Metadata describes tooling contracts without changing rendering.
Event-detail schemas support JSON-safe primitives, objects, arrays, `properties`, `items`, required keys, enums, and
nullability.

## Scaffold a component

`init` creates a template and can add it to a new or existing manifest:

```bash
npx alpine-component-loader init profile-card \
  --dir components \
  --manifest acl-manifest.json \
  --shadow
```

`--shadow` adds `options.shadow: true`. Add revisions and prop/metadata contracts manually or from generated output.
`--dry-run` previews source; `--force` permits replacing files and duplicate manifest entries.

## Register a manifest in the browser

`registerManifest()` takes a parsed object. Fetch and parse the manifest before startup:

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

`prefetch: true` selects all registered components; an array selects groups/tags. Results settle independently,
including failures.

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

URL loading defaults to a 10-second timeout and 1 MiB limit. It supports integrity, caching, abort, and custom fetch;
deduplicates concurrent URL/integrity requests per loader; and evicts failures for retry. Sources resolve against the
final manifest URL. Routes use exact matching.

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

Paths resolve from the config file; unknown keys fail validation. Precedence is CLI flags → Vite options → project
config → defaults. Commands discover `acl.config.mjs` from the invocation directory or accept `--config`. Offline uses
`--project-config`, reserving `--config` for its policy.

Top-level project configuration groups are:

| Field        | Purpose                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `root`       | Shared project root; relative paths below resolve from the config file.                         |
| `components` | Component directory, manifest output, inference, update, and prune policy.                      |
| `routes`     | Source manifest, route output, discovery target/browser, timeout, and entries.                  |
| `contracts`  | Type declarations, Custom Elements Manifest, and manifest/component/offline schema outputs.     |
| `offline`    | Manifest, selected groups/assets, browser base, namespace, policy, and JavaScript minification. |
| `watch`      | Task selection, debounce, and safety-scan interval.                                             |
| `audit`      | Routes, report format/output, browser, baseline, and suppressions.                              |
| `vite`       | Module delivery and route-copy behavior shared with the plugin.                                 |
| `skeleton`   | Capture target/routes, filters, viewports, output mode, and overwrite policy.                   |

`loadProjectConfig({ configFile, invocationDirectory, optional, overrides })` returns resolved `config`, `configFile`,
and `configDirectory`. Most apps use `defineConfig()` and CLI discovery.

## Route shards and watch mode

Generate independent version-one route manifests plus `acl-routes.json`:

```bash
npx alpine-component-loader routes --config acl.config.mjs --force
npx alpine-component-loader routes --route /account --target ./index.html --force
```

Route roots expand through dependencies. `discover: true` also crawls the rendered document and open Shadow Roots with
Playwright, warning about unknown components. Shard names include a stable route key and content hash; the index records
URLs, SHA-256 revisions, and ordered components.

Each configured route entry supports:

| Field        | Contract                                                                 |
| ------------ | ------------------------------------------------------------------------ |
| `key`        | Stable exact lookup key.                                                 |
| `id`         | Alias used when `key` is omitted.                                        |
| `path`       | Navigation path and final fallback key; required for discovery.          |
| `components` | Authored component roots.                                                |
| `groups`     | Authored manifest groups.                                                |
| `discover`   | Whether Playwright should add components observed on the rendered route. |

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

Shard URLs resolve against the route-index URL. Use `baseUrl` to override an in-memory index’s base.

Watch configured filesystem tasks with serialized, debounced regeneration:

```bash
npx alpine-component-loader watch
npx alpine-component-loader watch --task manifest --task types
npx alpine-component-loader watch --include-expensive
npx alpine-component-loader watch --poll-interval 0
```

Watch uses a recursive native watcher when available, otherwise per-directory watchers. Regeneration is debounced and
serialized; failures preserve valid artifacts, replacements are atomic, and termination closes watchers. Safety scans
default to 5,000 ms; `--poll-interval` overrides `watch.pollInterval`, and `0` disables scans. Route crawling, skeleton
capture, and audits require explicit selection or `--include-expensive`.

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

The Vite plugin runs manifest, contract, and route generators; externalizes ACL; serves readable native ESM in
development; injects import maps; and sends targeted HMR. Production modules are copied to
`assets/alpine-component-loader/<version>/`. For managed delivery, set
`{ moduleDelivery: 'external', moduleBase: 'https://cdn.example/acl/' }`.

| Plugin option     | Default                                | Contract                                                                           |
| ----------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| `configFile`      | discovered `acl.config.mjs`            | Explicit project configuration path.                                               |
| `moduleDelivery`  | `copy`                                 | `copy` package modules into the build or use an application-owned `external` base. |
| `moduleDirectory` | `assets/alpine-component-loader/1.0.0` | Build-relative destination for copied modules.                                     |
| `moduleBase`      | none                                   | Required URL base when `moduleDelivery: "external"`.                               |
| `routeDirectory`  | `acl-routes`                           | Build-relative route index/shard destination.                                      |
| `generate`        | `true`                                 | Run configured manifest, contract, and route generation before serving/building.   |

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

`custom-elements.json` is editor output. The precache manifest belongs to the service worker. Neither goes to
`registerManifest()`; skeleton manifests use `registerSkeletonManifest()`.

## Validate manifests and directories

Generate the version-one JSON Schema and reference it from the manifest with `$schema`:

```bash
npx alpine-component-loader schema --out acl-manifest.schema.json
npx alpine-component-loader validate acl-manifest.json
```

Validation shares runtime normalization and checks local sources. A directory validates its `acl-manifest.json`, or
discoverable templates when no manifest exists:

```bash
npx alpine-component-loader validate components
```

Validation reports diagnostics, exits unsuccessfully on errors, and does not rewrite files.

## Generate TypeScript and editor contracts

Generate declarations and a Custom Elements Manifest from the enriched component manifest:

```bash
npx alpine-component-loader types acl-manifest.json \
  --out generated/acl-components.d.ts \
  --custom-elements-out generated/custom-elements.json
```

Declarations augment `HTMLElementTagNameMap` with typed props, properties, and event listeners. Custom Elements Manifest
output describes components, properties, attributes, events, and slots for editors.

Manifest prop types are `String`, `Number`, `Boolean`, `Array`, or `Object`. Functions such as validators and coercers
require JavaScript definitions.

`--dry-run` validates without writing; add `--json` for structured content. `--force` replaces outputs. Default
filenames are `acl-components.d.ts`, `custom-elements.json`, and `acl-manifest.schema.json` in the current directory.

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

Output is `acl-precache-manifest.json` and `acl-sw.js`. Selected definitions provide templates, external assets, loading
templates, and fallbacks. Add shell files and browser modules with repeatable `--asset`. See
[offline setup](offline.md).

`--minify-js` gives explicit local JavaScript assets virtual `.min.js` URLs and hashes the minified bytes. Existing
minified files, remote URLs, and discovered component assets are unchanged. The command does not write minified files;
your build or server must serve them. The packaged development server supports these virtual responses.

## Generate a skeleton manifest

Skeleton generation captures a local page or remote URL at mobile and desktop sizes; geometry comes from the rendered
page:

```bash
npx alpine-component-loader skeleton ./index.html \
  --mode manifest \
  --out-dir skeletons
```

`--mode manifest` writes `acl-skeletons.generated.js` and `.css`; `--mode both` also writes `acl-skeletons.css`.
Register the generated module before startup:

```js
import AlpineComponentLoader from 'alpine-component-loader';
import skeletons from './skeletons/acl-skeletons.generated.js';
import './skeletons/acl-skeletons.generated.css';

await AlpineComponentLoader.registerSkeletonManifest(skeletons);
await AlpineComponentLoader.start();
```

Repeat `--route` for pages; use `--include`/`--exclude` for tags. Replacing non-generated files requires `--force`.

See [Skeleton loading UI](skeletons.md) for the complete capture and integration workflow.

## CLI option reference

`npx alpine-component-loader --help` lists commands. Value options accept `--name value` or `--name=value`.

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

`create`, `init`, `manifest`, `offline`, `types`, and `schema` support `--dry-run`/`--force`. Validation and audits are
read-only except explicit report output. Project/contract commands use `--json`; audits use `--format json`. Skeleton
capture has separate `--force` and `--allow-partial` controls.

### Optional tooling in lean installations

Default installs include optional `parse5` and `@swc/core`. With `--omit=optional`, help, imports, starter creation,
schemas, and readable serving still work without loading either tool.

| Requested feature                                                                | Tool required in a lean install |
| -------------------------------------------------------------------------------- | ------------------------------- |
| Component inspection, `manifest`, project validation, and inline-template HMR    | `parse5`                        |
| `alpine-component-loader/ssr`                                                    | `parse5`                        |
| Generated `.min.js` server responses or explicitly minified generated JavaScript | `@swc/core`                     |

Missing tools report `ACL_OPTIONAL_DEPENDENCY_MISSING`, the feature/dependency, and its install command. Readable
serving works without SWC.

## Development server and command discovery

Serve a directory or a specific HTML entry during development:

```bash
npx alpine-component-loader serve ./public --host 127.0.0.1 --port 4173
npx alpine-component-loader --help
```

The server supports local development. Production hosting, routing, bundling, and worker delivery belong to the
application.

An injected EventSource client receives template-specific HMR and reloads for other file changes. See
[manual HMR and state preservation](lifecycle.md#development-server-and-targeted-hmr).

The server serves existing `.min.js` files unchanged. For missing ones with a matching `.js` source, it generates and
caches a response in memory until the source changes. This includes `/__acl_hmr/modules/`. Map ACL to
`/__acl_hmr/modules/index.min.js` to use the minified family for both app and HMR imports.

For feature-specific workflows, continue to [Static SSR and hydration](ssr.md), [Offline behavior](offline.md),
[Adaptive prefetch](prefetch.md), and [Components, props, slots, and rendering](components.md).

## Explicit module preloads and offline runtime expansion

Generate hints for the components required on the initial page:

```sh
alpine-component-loader preload acl-manifest.json --entry-url https://cdn.jsdelivr.net/gh/LouisT/alpine-component-loader@latest/dist/index.min.js --group initial --feature scheduler --out acl-preloads.html
```

Repeat `--tag`, `--group`, and `--feature`. `--json` returns `{ urls, html }`; `--out`, `--dry-run`, and `--force`
control output. Without tags/groups, only the runtime and explicit features are hinted. Invalid selections reject
generation. Each eager dependency gets one explicit hint; see
[modulepreload behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/modulepreload).

Vite `>=5 <9` supports opt-in `preload`, for example
`{ tags: ['initial-card'], groups: ['initial'], features: ['scheduler'] }`. HTML hints use the configured manifest and
import-map delivery base. Integration checks cover pinned Vite 5-8 and development, including Rolldown production
builds. See [Vite migration](https://vite.dev/guide/migration).

Offline accepts `runtime: { entryUrl, features }`, or `--runtime-entry` and repeatable `--runtime-feature`. The shared
graph expands selected components and capabilities. Declare imperative features such as `dynamic`, `debugger`, or
`offline`. Manifest lazy loading, visible hydration, and environmentally paused polling infer `environment`;
attribute/API activation needs `--feature environment` or `--runtime-feature environment`. Authored assets, remote
policies, and revisions still apply.

Use `core.min.js` with `--entry-url`/`--runtime-entry` for explicit startup. Vite’s
`preload: { entry: 'core', groups: ['initial'] }` selects its `/core` mapping; the default is the root entry. Both
remain mapped.

`preload.entry` selects hints; app code must import `/core` to use [explicit startup](core.md). The `polyfills` selector
includes the wrapper, not upstream scripts or initialization. For offline fallback, self-host vendor files, list them as
assets, and pass their URLs to `loadPolyfills()`. See [polyfill delivery](polyfills.md#self-hosted-delivery).

Selectors include `hydration`, `triggers`, `styles`, `slots`, and `scripts`. Preloads infer manifest options; explicitly
select content-dependent styles/slots. Offline also inspects local component, loading, and fallback templates and
conservatively includes styles/slots for opaque remote templates. SSR and imperative features require explicit
selection. Shared implementation URLs are deduplicated.
