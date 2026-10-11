let componentReady = false;
import AlpineComponentLoader from 'alpine-component-loader/core';

const component = document.querySelector('a11y-demo-card'),
    status = document.querySelector('#audit-status'),
    summary = document.querySelector('#audit-summary'),
    resultsList = document.querySelector('#audit-results'),
    eventOutput = document.querySelector('#event-output'),
    controls = {
        audit: document.querySelector('#audit-component'),
        introduce: document.querySelector('#introduce-issues'),
        fix: document.querySelector('#fix-issues'),
        debugger: document.querySelector('#open-debugger'),
    };

component.addEventListener(
    'loaded',
    // Complete the current demonstration operation
    () => {
        componentReady = true;
    },
    { once: true },
);

// Extend the built-in checks with an application ownership policy
const applicationAuditor = async (root, { basic }) => {
    await Promise.resolve();
    const violations = basic(root);
    root.querySelectorAll('[data-review-region]:not([data-owner])').forEach(
        // Process the current item
        () =>
            violations.push({
                rule: 'review-owner',
                severity: 'moderate',
                selector: '[data-review-region]',
                remediation: 'Add data-owner so the application can route accessibility review ownership.',
            }),
    );
    return violations;
};

// Coalesce optional tool activation while leaving the manual startup path free of their imports
const manualTools = new URLSearchParams(location.search).get('tools') === 'manual';
let audits = null,
    scanner = null,
    debuggerModule = null,
    toolsPromise = null;
const ensureAudits = () =>
    (toolsPromise ||= import('alpine-component-loader/a11y')
        .then(({ default: ACLA11y }) => {
            // Keep one observation owner even when several controls activate concurrently
            audits = ACLA11y.observe(AlpineComponentLoader, {
                auditor: applicationAuditor,
                debounce: 0,
            });
            if (window.__aclA11yExample) window.__aclA11yExample.audits = audits;
            return audits;
        })
        // Settle feature activation and allow a clean retry
        .catch((error) => {
            toolsPromise = null;
            throw error;
        }));

const ensureScanner = async () => {
    // Mount the optional scanner only when its UI is requested
    if (!scanner) {
        const { default: ACLA11yScanner } = await import('alpine-component-loader/a11y-scanner');
        scanner ||= ACLA11yScanner.mount({ auditor: applicationAuditor });
        if (window.__aclA11yExample) window.__aclA11yExample.scanner = scanner;
    }
};

const ensureDebugger = async () => {
    // Preserve one debugger integration while deferring its implementation in manual mode
    if (!debuggerModule) {
        debuggerModule = (await import('alpine-component-loader/debugger')).default;
        debuggerModule.inject(AlpineComponentLoader);
    }
};
if (!manualTools) {
    await ensureAudits();
    await ensureScanner();
    await ensureDebugger();
}
window.addEventListener(
    'pagehide',
    // Complete the current demonstration operation
    () => {
        audits?.disconnect();
        scanner?.destroy();
    },
    { once: true },
);

// Render normalized violations without inserting auditor HTML
const renderResult = (result) => {
    const violations = result?.violations || [],
        count = violations.length;
    status.dataset.state = count ? 'fail' : 'pass';
    status.textContent = count ? `${count} violations` : '0 violations';
    summary.textContent = count
        ? `Found ${count} normalized violations in ${result.duration.toFixed(1)}ms.`
        : `No violations found in ${result.duration.toFixed(1)}ms.`;
    resultsList.replaceChildren(
        ...violations.map((item) => {
            // Transform the current item
            const row = document.createElement('li'),
                heading = document.createElement('strong'),
                detail = document.createElement('p');
            heading.textContent = `${item.severity}: ${item.rule}`;
            detail.textContent = `${item.selector} - ${item.remediation}`;
            row.append(heading, detail);
            return row;
        }),
    );
    window.__aclA11yExample.latest = result;
};

document.addEventListener('acl:a11y', (event) => {
    // Handle the acl:a11y event
    if (event.target !== component) return;
    eventOutput.textContent = JSON.stringify(event.detail, null, 2);
    window.__aclA11yExample.eventCount++;
    renderResult(event.detail);
});

const audit = async () => {
    // Run the audit operation
    status.dataset.state = 'pending';
    status.textContent = 'Auditing…';
    return await (await ensureAudits()).audit(component);
};

// Replace semantic elements because tag names cannot be mutated in place
const replaceHeading = (tagName) => {
    const current = component.shadowRoot.querySelector('[data-review-heading]');
    if (current.localName === tagName) return;
    const replacement = document.createElement(tagName);
    replacement.dataset.reviewHeading = '';
    replacement.textContent = current.textContent;
    current.replaceWith(replacement);
};

const replaceTableHeading = (tagName) => {
    // Run the replace table heading operation
    const current = component.shadowRoot.querySelector('[data-table-heading]');
    if (current.localName === tagName) return;
    const replacement = document.createElement(tagName);
    replacement.dataset.tableHeading = '';
    replacement.textContent = current.textContent;
    if (tagName === 'th') replacement.scope = 'col';
    current.replaceWith(replacement);
};

// Introduce one deterministic violation for every rule demonstrated by the page
const introduceIssues = () => {
    const root = component.shadowRoot;
    root.querySelector('.avatar').removeAttribute('alt');
    root.querySelector('[data-save-action]').textContent = '';
    root.querySelector('[data-save-action]').setAttribute('aria-expanded', 'sometimes');
    root.querySelector('[data-email-label]').removeAttribute('for');
    root.querySelector('#profile-email').setAttribute('aria-describedby', 'missing-profile-help');
    root.querySelector('[data-identity="primary"]').id = 'duplicate-identity';
    root.querySelector('[data-identity="secondary"]').id = 'duplicate-identity';
    root.querySelector('[data-review-region]').removeAttribute('data-owner');
    const helpLink = root.querySelector('[data-help-link]');
    helpLink.textContent = '';
    helpLink.tabIndex = 3;
    root.querySelector('[data-focus-region]').setAttribute('aria-hidden', 'true');
    const nestingRegion = root.querySelector('[data-nesting-region]');
    nestingRegion.setAttribute('role', 'button');
    nestingRegion.setAttribute('aria-label', 'Nested interaction example');
    nestingRegion.tabIndex = 0;
    root.querySelector('[data-demo-dialog]').removeAttribute('aria-label');
    root.querySelector('[data-preferences-legend]')?.remove();
    root.querySelector('[data-audit-summary]')?.remove();
    root.querySelector('[data-table-caption]')?.remove();
    root.querySelector('[data-status-graphic]').removeAttribute('aria-label');
    root.querySelector('[data-language]').lang = 'not_a_locale';
    replaceHeading('h4');
    replaceTableHeading('td');
};

// Restore valid semantics idempotently so the repair action can run repeatedly
const fixIssues = () => {
    const root = component.shadowRoot;
    root.querySelector('.avatar').alt = 'Alpine Component Loader profile';
    root.querySelector('[data-save-action]').textContent = 'Save profile';
    root.querySelector('[data-save-action]').removeAttribute('aria-expanded');
    root.querySelector('[data-email-label]').setAttribute('for', 'profile-email');
    root.querySelector('#profile-email').removeAttribute('aria-describedby');
    root.querySelector('[data-identity="primary"]').id = 'identity-primary';
    root.querySelector('[data-identity="secondary"]').id = 'identity-secondary';
    root.querySelector('[data-review-region]').dataset.owner = 'design-system';
    const helpLink = root.querySelector('[data-help-link]');
    helpLink.textContent = 'Read audit guidance';
    helpLink.removeAttribute('tabindex');
    root.querySelector('[data-focus-region]').removeAttribute('aria-hidden');
    const nestingRegion = root.querySelector('[data-nesting-region]');
    nestingRegion.removeAttribute('role');
    nestingRegion.removeAttribute('aria-label');
    nestingRegion.removeAttribute('tabindex');
    root.querySelector('[data-demo-dialog]').setAttribute('aria-label', 'Audit details');
    const fieldset = root.querySelector('[data-preferences]');
    if (!root.querySelector('[data-preferences-legend]')) {
        const legend = document.createElement('legend');
        legend.dataset.preferencesLegend = '';
        legend.textContent = 'Audit notifications';
        fieldset.prepend(legend);
    }
    const details = root.querySelector('[data-audit-details]');
    if (!root.querySelector('[data-audit-summary]')) {
        const detailsSummary = document.createElement('summary');
        detailsSummary.dataset.auditSummary = '';
        detailsSummary.textContent = 'Semantic details control';
        details.prepend(detailsSummary);
    }
    const table = root.querySelector('[data-audit-table]');
    if (!root.querySelector('[data-table-caption]')) {
        const caption = document.createElement('caption');
        caption.dataset.tableCaption = '';
        caption.textContent = 'Latest audit status';
        table.prepend(caption);
    }
    root.querySelector('[data-status-graphic]').setAttribute('aria-label', 'Passing audit status');
    root.querySelector('[data-language]').lang = 'en-US';
    replaceHeading('h3');
    replaceTableHeading('th');
};

controls.audit.addEventListener(
    'click',
    // Handle the click event
    () => void audit(),
);
controls.introduce.addEventListener('click', async () => {
    // Handle the click event
    introduceIssues();
    await audit();
});
controls.fix.addEventListener('click', async () => {
    // Handle the click event
    fixIssues();
    await audit();
});
controls.debugger.addEventListener('click', async () => {
    // Handle the click event
    await ensureDebugger();
    await AlpineComponentLoader.toggleDebug();
    await audit();
});

window.__aclA11yExample = {
    audits,
    scanner,
    component,
    eventCount: 0,
    latest: null,
    ready: false,
};
window.AlpineComponentLoader = AlpineComponentLoader;

// Wait for the first component load before running the initial audit
AlpineComponentLoader.config({ basePath: './components/' });
AlpineComponentLoader.define('a11y-demo-card', 'audit-card.html', { shadow: true });
await AlpineComponentLoader.start();
if (!componentReady)
    await new Promise(
        // Settle the asynchronous operation
        (resolve) => component.addEventListener('loaded', resolve, { once: true }),
    );
if (!manualTools) await audit();
else status.textContent = 'Component ready; audit tools activate when requested';
window.__aclA11yExample.ready = true;
// Handle the lifecycle event and release owned work
document.querySelector('#activate-scanner').addEventListener('click', () => {
    void ensureScanner();
});
