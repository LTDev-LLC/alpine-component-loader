# Accessibility auditing example

Demonstrates optional accessibility audits, a modal scanner, custom async rules, `acl:a11y` events, and debugger results
across Shadow DOM.

From the repository root:

```bash
npm run build
npm run example:a11y
```

Open <http://127.0.0.1:4173/>. The page starts clean and uses prebuilt `core.min.js`; audit/debugger modules load when
activated.

For a backend-free static artifact, run:

```bash
npm run stage -- a11y
```

The staged page uses `/examples/a11y/`, direct minified imports, and the repository's Alpine pin. Additional static
selections share its runtime and root catalog.

1. **Introduce issues** adds 18 built-in violations and one custom ownership violation.
2. Inspect results and the latest `acl:a11y` event.
3. **A11y Audit** scans all active components.
4. **Open debugger** records a fresh audit; select `<a11y-demo-card>` to inspect its Accessibility panel.
5. **Fix issues** returns to zero violations.

The automatic observer combines basic rules with an async application rule:

```javascript
const audits = ACLA11y.observe(AlpineComponentLoader, {
    debounce: 0,
    logFindings: false,
    async auditor(root, { basic }) {
        return [...basic(root), ...(await runApplicationRules(root))];
    },
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

The clean page passes. Use `--route` for more pages, `--format` for console/JSON/JUnit/SARIF, or `--no-axe` for ACL-only
rules. Page errors affect the report and exit status.

## Baseline and suppression workflow

Review findings before updating the [baseline](acl-a11y-baseline.json). The
[suppression file](acl-a11y-suppressions.json) shows a scoped, expiring exception:

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

CI fails on new unsuppressed findings, expired suppressions, or page errors. Fingerprints normalize route, engine, rule,
and selector. Suppressions need a reason and ISO expiry; reports classify new, unchanged, suppressed, resolved, and
expired findings.

## Startup entry and fallback APIs

`app.js` uses core and explicit registration. Audit/debugger entries share its default loader. See
[core startup](../../docs/core.md).

For fallback APIs, await `loadPolyfills()` before dynamically importing `app.js`. See
[polyfill bootstrap and CSP](../../docs/polyfills.md).

## Manual activation and runtime accessibility

`?tools=manual` renders first, then loads tools through **Run audit**, **Activate scanner**, and **Open debugger**.
Default startup enables automatic audits and the scanner. Teardown releases both.

Experiments cover announcements, retry, scheduling, and pooled subscriptions while retaining keyboard focus.
`?polyfills=1` runs the self-hosted bootstrap before Alpine/application code.
