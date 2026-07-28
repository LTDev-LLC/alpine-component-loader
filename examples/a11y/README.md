# Accessibility auditing example

This example demonstrates the optional `alpine-component-loader/a11y` and `alpine-component-loader/a11y-scanner` entries without adding accessibility code to the core loader bundle. It covers automatic post-load audits, manual and page-wide modal audits, the broader semantic and structural rule set, an asynchronous application rule, `acl:a11y` events, stored results, and debugger integration across an open Shadow Root.

From the repository root:

```bash
npm run build
npm run example:a11y
```

Open <http://127.0.0.1:4173/>. The example starts with zero violations.
Its import map opts into `/__acl_hmr/modules/index.min.js`; the local server
generates each requested `.min.js` response on demand, including the debugger
and accessibility modules used here. Unused runtime capabilities are not
requested.

For a backend-free static artifact, run:

```bash
npm run stage -- a11y
```

The staged page keeps its nested `/examples/a11y/` route, maps ACL imports
directly to `/dist/*.min.js`, and loads Alpine 3.15.12 from the pinned jsDelivr
script. More static example names can follow `a11y`; multiple distinct names
share one runtime and produce a root catalog in command-line order.

1. Select **Introduce issues** to create 18 built-in violations covering accessible names, labels, references, heading order, unique IDs, focus order, hidden focus, nested controls, dialogs, fieldsets, details, tables, graphics, ARIA values, and language tags, plus one custom ownership violation.
2. Inspect the normalized results and the latest `acl:a11y` event.
3. Select the floating **A11y Audit** button to scan every active component and review the grouped modal findings.
4. Select **Open debugger** to re-run the audit while recording is active, choose `<a11y-demo-card>`, and review its Accessibility panel.
5. Select **Fix issues** to restore the component and return to zero violations.

The observer uses the dependency-free basic rules plus one asynchronous application rule:

```javascript
const audits = ACLA11y.observe(AlpineComponentLoader, {
    debounce: 0,
    logFindings: false,
    async auditor(root, { basic }) {
        return [
            ...basic(root),
            ...await runApplicationRules(root)
        ];
    }
});
```

Call `audits.disconnect()` when the application no longer needs automatic audits.

The scanner reuses the same custom auditor:

```javascript
const scanner = ACLA11yScanner.mount({ auditor: applicationAuditor });
```

Call `scanner.destroy()` to remove its button, modal, and listeners.

## Headless CI audit

The same page can be audited without opening the scanner UI:

```bash
npx alpine-component-loader audit / \
  --root examples/a11y \
  --format sarif \
  --out test-results/a11y.sarif
```

The initial example is intentionally clean, so this command exits successfully. Add `--route` for more pages, select `console`, `json`, `junit`, or `sarif`, and use `--no-axe` when CI should run only ACL's dependency-free rules. Console errors and uncaught page errors are included in the report and exit status.

## Baseline and suppression workflow

This directory includes a clean version-one [`acl-a11y-baseline.json`](acl-a11y-baseline.json) and an illustrative [`acl-a11y-suppressions.json`](acl-a11y-suppressions.json). Refresh the baseline atomically after reviewing the current unsuppressed findings:

```bash
npx alpine-component-loader audit / \
  --root examples/a11y \
  --baseline examples/a11y/acl-a11y-baseline.json \
  --suppressions examples/a11y/acl-a11y-suppressions.json \
  --update-baseline
```

Use the same files in CI without `--update-baseline`:

```bash
npx alpine-component-loader audit / \
  --root examples/a11y \
  --baseline examples/a11y/acl-a11y-baseline.json \
  --suppressions examples/a11y/acl-a11y-suppressions.json \
  --format sarif \
  --out test-results/a11y.sarif
```

The command fails for new unsuppressed findings, expired suppressions, or page errors. Stable fingerprints normalize route, engine, rule, and selector; reports distinguish new, unchanged, suppressed, resolved, and expired results. Every suppression requires a reason and ISO expiration, while its route, engine, and selector narrow the exact match.
