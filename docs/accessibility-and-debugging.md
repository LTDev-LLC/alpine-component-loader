# Accessibility and debugging

## Headless route audits

Run the built-in rules and axe against a local route or absolute URL:

```bash
npx alpine-component-loader audit / --root examples/feature-lab
npx alpine-component-loader audit https://preview.example.com/account --format sarif --out audit.sarif
```

Repeat `--route` to select routes. Formats are `console`, `json`, `junit`, and `sarif`. `--no-axe` uses only ACL rules
and Playwright. Accessibility violations, console errors, and uncaught page errors cause a non-zero exit.

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

Fingerprints normalize route path/query, engine, rule, and selector, excluding development origins/ports. With a
baseline, new unsuppressed findings, expired suppressions, and page errors fail. Reports classify findings as `new`,
`unchanged`, `suppressed`, `resolved`, or `expired`.

The baseline maps fingerprints to normalized findings:

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

Suppressions require an exact rule, reason, and ISO 8601 expiration. Route, engine, and selector can narrow the match:

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

`--update-baseline` stores current unsuppressed findings and removes resolved ones. Active suppressions stay in policy
rather than becoming baseline debt.

The [accessibility example](../examples/a11y/README.md#baseline-and-suppression-workflow) includes ready-to-run baseline
and suppression files plus console/SARIF command lines.

Audits and debugging are opt-in development entries, loaded separately from the runtime.

## Run the basic accessibility audit

`/a11y` provides dependency-free structural checks:

```js
import { auditAccessibility } from 'alpine-component-loader/a11y';

const card = document.querySelector('profile-card');
const root = card.shadowRoot || card;
const result = await auditAccessibility(root);

console.log(`Audited in ${result.duration.toFixed(1)} ms`);
console.table(result.violations);
```

Results contain normalized `violations` and total `duration` in milliseconds.

Violations include a diagnostic selector, rule, severity, and remediation:

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

Rules check names, form labels, duplicate IDs, ARIA, focusability, landmarks, and interactive nesting. They do not
establish full accessibility conformance.

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

The observer audits open Shadow Roots or Light DOM hosts and stores each element’s latest result:

```js
const card = document.querySelector('profile-card');
const immediate = await observer.audit(card);
const latest = observer.getResults(card);

console.assert(immediate === latest);
```

Release listeners and pending work during teardown:

```js
observer.disconnect();
```

New audits supersede stale results. Auditor failures do not affect rendering.

The returned observer controller exposes:

| Member                | Result                                                                |
| --------------------- | --------------------------------------------------------------------- |
| `audit(element)`      | Audit one component immediately and return its latest result.         |
| `getResults(element)` | Return the last completed result for an element, or `null`.           |
| `disconnect()`        | Remove owned document listeners and cancel pending observer behavior. |
| `loader`              | The loader class supplied to `observeAccessibility()`.                |

## Supply a custom auditor

Custom auditors receive the component root and built-in rule function and can replace or extend results:

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

Results accept ACL fields (`rule`, `severity`, `selector`, `remediation`) or common engine fields (`id`, `impact`,
`target`, `help`). Applications load/configure Axe or other engines.

## Mount the floating scanner

`/a11y-scanner` adds a launcher and modal results panel:

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

| Option        | Default               | Contract                                           |
| ------------- | --------------------- | -------------------------------------------------- |
| `root`        | `document`            | Document, element, or open shadow root to scan.    |
| `auditor`     | built-in rules        | Optional application auditor.                      |
| `concurrency` | `4`                   | Positive bound for component audits.               |
| `button`      | bottom-right defaults | Launcher placement and companion-selector offsets. |

Scan without opening the panel, or open it and receive the same page result:

```js
const result = await scanner.scan();
console.log(result.componentCount, result.violationCount, result.errorCount);

await scanner.open();
scanner.close();
console.log(scanner.getResult());
```

The scanner discovers active Light DOM and open Shadow DOM components, bounds concurrency, and isolates failures. The
modal traps focus and restores previous focus on close.

Destroy the complete UI and owned listeners when the tool is no longer needed:

```js
scanner.destroy();
```

After destruction, scan/open calls reject. Mount a new scanner to restart tooling.

The scanner controller surface is:

| Member        | Result                                                       |
| ------------- | ------------------------------------------------------------ |
| `scan()`      | Audit without opening the modal.                             |
| `open()`      | Audit as needed, open the modal, and return the page result. |
| `close()`     | Close the modal and restore focus.                           |
| `getResult()` | Return the latest page result or `null`.                     |
| `destroy()`   | Permanently remove UI, listeners, and owned work.            |

## Inject the debugger

The debugger overlay shows lifecycle, requests, cache/data diagnostics, reload/cache actions, snapshots, diffs, and
virtualized lists:

```js
import ACLDebugger from 'alpine-component-loader/debugger';

ACLDebugger.inject(AlpineComponentLoader);
await AlpineComponentLoader.toggleDebug();
```

Call `toggleDebug()` again to stop it. Injection replaces the loader’s diagnostic stub; importing alone does not modify
the page.

For a keyboard-accessible application control:

```html
<button id="toggle-acl-debugger" type="button">Toggle component debugger</button>
```

```js
document.querySelector('#toggle-acl-debugger').addEventListener('click', () => {
    void AlpineComponentLoader.toggleDebug();
});
```

The overlay is for local development. Review retention, UI, and authorization before exposing it to end users.

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

`ACLDebugger.getSnapshot(AlpineComponentLoader)` uses an active debugger or builds a static snapshot.

Version-one snapshots include generation metadata, sanitized configuration, tags, cache summaries, and component
diagnostics. Active debuggers may add timeline, requests, stored snapshots, and selection.

## Redaction

Exports redact credential-like names and sensitive URL queries. Apply the helper when adding application data:

```js
import { redactDiagnostics } from 'alpine-component-loader/debugger';

const safe = redactDiagnostics({
    url: '/api/profile?token=secret',
    authorization: 'Bearer secret',
    status: 'failed',
});
```

ACL excludes fetched payloads and persistence contents. Attached state, DOM text, screenshots, or logs may still be
sensitive; review reports before sharing.

## Limits of automated tools

Automated checks assist development but do not replace:

- Keyboard-only and switch-device testing.
- Screen-reader testing across supported browser/assistive-technology combinations.
- Contrast checks across all component states and themes.
- Zoom, reflow, reduced-motion, localization, and right-to-left testing.
- Product-specific focus order, announcements, instructions, and error recovery.
- Testing with disabled users.

Findings guide remediation without certifying conformance. Include component audits and page-level checks in testing.

For structured local metrics and redaction guarantees see [Observability](observability.md). For lifecycle cleanup see
[Lifecycle, events, and dynamic components](lifecycle.md).
