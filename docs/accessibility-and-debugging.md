# Accessibility and debugging

## Headless route audits

Run the built-in rules and axe against a local route or absolute URL:

```bash
npx alpine-component-loader audit / --root examples/feature-lab
npx alpine-component-loader audit https://preview.example.com/account --format sarif --out audit.sarif
```

Repeat `--route` to crawl selected routes. Output formats are `console`, `json`, `junit`, and `sarif`; `--no-axe` keeps the command dependency-free beyond Playwright and uses only ACL's scanner rules. Console errors and uncaught page errors are included and cause a non-zero exit status alongside accessibility violations.

## Baselines and expiring suppressions

Create or refresh a version-one baseline atomically:

```bash
npx alpine-component-loader audit / \
  --baseline .acl/a11y-baseline.json \
  --update-baseline

npx alpine-component-loader audit / \
  --baseline .acl/a11y-baseline.json \
  --suppressions .acl/a11y-suppressions.json \
  --format sarif \
  --out reports/a11y.sarif
```

Finding fingerprints normalize route path/query, engine, rule, and selector, so development origins and ports do not destabilize the baseline. With a baseline, new unsuppressed findings, expired suppressions, and page errors fail the command. Reports classify findings as `new`, `unchanged`, `suppressed`, `resolved`, or `expired` in console, JSON, JUnit, and SARIF output.

The baseline is deliberately small and maps each fingerprint to its normalized finding:

```json
{
    "version": 1,
    "generatedAt": "2026-07-25T00:00:00.000Z",
    "findings": {
        "Nf7jYQv3JmK8g4Yk4zlLx2qkT6oQzv7r3bL8dC9sP1A": {
            "route": "/account",
            "engine": "axe",
            "rule": "button-name",
            "selector": "#save",
            "severity": "critical",
            "remediation": "Give the button an accessible name."
        }
    }
}
```

Suppressions require an exact rule, a reason, and an ISO 8601 expiration timestamp. Route, engine, and selector are optional exact-match refinements:

```json
{
    "suppressions": [
        {
            "rule": "color-contrast",
            "route": "/legacy",
            "engine": "axe",
            "selector": "#third-party-widget",
            "reason": "Vendor replacement tracked in APP-142",
            "expires": "2026-12-31T00:00:00Z"
        }
    ]
}
```

`--update-baseline` stores current unsuppressed findings only. Resolved findings disappear from the replacement baseline, while active suppressions remain policy rather than becoming accepted debt.

The [accessibility example](../examples/a11y/README.md#baseline-and-suppression-workflow) includes ready-to-run baseline and suppression files plus console/SARIF command lines.

Accessibility auditing and interactive debugging are opt-in development tools. They are shipped as separate entry points and are not imported by the core runtime.

## Run the basic accessibility audit

`alpine-component-loader/a11y` includes a dependency-free set of common structural checks:

```js
import { auditAccessibility } from 'alpine-component-loader/a11y';

const card = document.querySelector('profile-card');
const root = card.shadowRoot || card;
const result = await auditAccessibility(root);

console.log(`Audited in ${result.duration.toFixed(1)} ms`);
console.table(result.violations);
```

The asynchronous result contains normalized `violations` and total audit
`duration` in milliseconds.

Each violation contains a stable-enough selector for diagnostics, a rule, severity, and remediation:

```js
{
    rule: 'control-name',
    severity: 'serious',
    selector: 'article > button',
    remediation: 'Provide visible text, aria-label, or aria-labelledby.',
}
```

Use `runBasicAccessibilityAudit(root)` when only the synchronous violation array is needed:

```js
import { runBasicAccessibilityAudit } from 'alpine-component-loader/a11y';

const violations = runBasicAccessibilityAudit(document.querySelector('#fixture'));
```

The built-in rules cover common accessible names, form labels, duplicate IDs, ARIA references/values, focusability conflicts, landmark/document basics, and interactive nesting. They intentionally do not attempt a full accessibility conformance evaluation.

## Observe loaded components

Audit components after normal loads and development reloads:

```js
import { observeAccessibility } from 'alpine-component-loader/a11y';

const observer = observeAccessibility(AlpineComponentLoader, {
    debounce: 50,
    logFindings: true,
});

document.addEventListener('acl:a11y', event => {
    const { tag, violations, duration } = event.detail;
    updateAccessibilityPanel({ tag, violations, duration });
});
```

The observer audits a component's open shadow root or Light DOM host and stores the latest result by element:

```js
const card = document.querySelector('profile-card');
const immediate = await observer.audit(card);
const latest = observer.getResults(card);

console.assert(immediate === latest);
```

Release its document listeners and pending behavior during development-tool teardown:

```js
observer.disconnect();
```

Stale asynchronous results are ignored when a newer audit begins for the same element. Auditor failures remain development-tool failures and do not alter component rendering.

The returned observer controller exposes:

| Member | Result |
| --- | --- |
| `audit(element)` | Audit one component immediately and return its latest result. |
| `getResults(element)` | Return the last completed result for an element, or `null`. |
| `disconnect()` | Remove owned document listeners and cancel pending observer behavior. |
| `loader` | The loader class supplied to `observeAccessibility()`. |

## Supply a custom auditor

A custom auditor receives the component root and the built-in rule function. It may replace or extend the built-in results:

```js
const auditor = async (root, { basic }) => {
    const builtIn = basic(root);
    const axeResult = await axe.run(root);
    const axeViolations = axeResult.violations.flatMap(violation =>
        violation.nodes.map(node => ({
            rule: violation.id,
            severity: violation.impact ?? 'moderate',
            selector: node.target.join(' '),
            remediation: violation.help,
        })),
    );

    return [...builtIn, ...axeViolations];
};

const result = await auditAccessibility(card.shadowRoot || card, { auditor });
```

Returned entries are normalized, so integrations may use `rule`/`severity`/`selector`/`remediation` or common `id`/`impact`/`target`/`help` fields. Configure and load Axe or another engine in the application; ACL does not bundle it.

## Mount the floating scanner

The `a11y-scanner` entry adds an opt-in launcher and modal results panel:

```js
import { mountAccessibilityScanner } from 'alpine-component-loader/a11y-scanner';

const scanner = mountAccessibilityScanner({
    root: document,
    concurrency: 4,
    button: {
        bottom: 16,
        right: 16,
    },
});
```

Scanner options are:

| Option | Default | Contract |
| --- | --- | --- |
| `root` | `document` | Document, element, or open shadow root to scan. |
| `auditor` | built-in rules | Optional application auditor. |
| `concurrency` | `4` | Positive bound for component audits. |
| `button` | bottom-right defaults | Launcher placement and companion-selector offsets. |

Scan without opening the panel, or open it and receive the same page result:

```js
const result = await scanner.scan();
console.log(result.componentCount, result.violationCount, result.errorCount);

await scanner.open();
scanner.close();
console.log(scanner.getResult());
```

The scanner discovers active ACL Light DOM and open Shadow DOM components, bounds audit concurrency, and isolates per-component failures. Its modal restores previous focus and traps keyboard focus while open.

Destroy the complete UI and owned listeners when the tool is no longer needed:

```js
scanner.destroy();
```

After destruction, scan/open operations reject rather than silently creating another panel. Mount a new scanner explicitly if development tooling is restarted.

The scanner controller surface is:

| Member | Result |
| --- | --- |
| `scan()` | Audit without opening the modal. |
| `open()` | Audit as needed, open the modal, and return the page result. |
| `close()` | Close the modal and restore focus. |
| `getResult()` | Return the latest page result or `null`. |
| `destroy()` | Permanently remove UI, listeners, and owned work. |

## Inject the debugger

The debugger adds an opt-in overlay with component state, lifecycle and request activity, cache/data diagnostics, reload/cache actions, snapshots, diffs, and virtualized lists:

```js
import ACLDebugger from 'alpine-component-loader/debugger';

ACLDebugger.inject(AlpineComponentLoader);
await AlpineComponentLoader.toggleDebug();
```

Call `toggleDebug()` again to stop the live debugger. Injection replaces the root loader's diagnostic stub; importing the debugger alone does not modify the page.

For a keyboard-accessible application control:

```html
<button id="toggle-acl-debugger" type="button">Toggle component debugger</button>
```

```js
document.querySelector('#toggle-acl-debugger').addEventListener('click', () => {
    void AlpineComponentLoader.toggleDebug();
});
```

The overlay is for local development. Do not expose it as an end-user support console without reviewing its UI, data retention, and application authorization requirements.

## Create diagnostic snapshots

Snapshots can be produced without opening the overlay:

```js
import {
    createComponentSnapshot,
    createDiagnosticSnapshot,
    diffDiagnosticSnapshots,
} from 'alpine-component-loader/debugger';

const before = createDiagnosticSnapshot(AlpineComponentLoader);
const component = createComponentSnapshot(document.querySelector('profile-card'));

await document.querySelector('profile-card').reload({ preserveState: true });

const after = createDiagnosticSnapshot(AlpineComponentLoader);
const changes = diffDiagnosticSnapshots(before, after);

console.log(component, changes);
```

`ACLDebugger.getSnapshot(AlpineComponentLoader)` returns the active debugger snapshot when available and otherwise builds an equivalent static snapshot.

Snapshots use `schemaVersion: 1` and include generation metadata, sanitized
global configuration, registered tags, cache summaries, and component
diagnostics. An active debugger may add timeline, request activity, stored
snapshots, and current selection.

## Redaction

Diagnostic exports recursively redact credential-like names and sensitive URL query values. Apply the exported helper before combining application-owned data with a report:

```js
import { redactDiagnostics } from 'alpine-component-loader/debugger';

const safe = redactDiagnostics({
    url: '/api/profile?token=secret',
    authorization: 'Bearer secret',
    status: 'failed',
});
```

ACL snapshots do not intentionally include fetched payloads or persistence contents. Application code can still make a report sensitive by attaching its own state, DOM text, screenshots, or logs; review exports before sharing them.

## Limits of automated tools

Automated checks assist development but do not replace:

- Keyboard-only and switch-device testing.
- Screen-reader testing across supported browser/assistive-technology combinations.
- Contrast checks across all component states and themes.
- Zoom, reflow, reduced-motion, localization, and right-to-left testing.
- Product-specific focus order, announcements, instructions, and error recovery.
- Testing with disabled users.

Treat findings as actionable signals, not a conformance certificate. Keep audits in component tests and run broader page-level checks on integrated routes.

For structured local metrics and redaction guarantees see [Observability](observability.md). For lifecycle cleanup see [Lifecycle, events, and dynamic components](lifecycle.md).
