// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Keep the built-in rule data portable so audits require no external engine
const DEFAULT_DEBOUNCE = 50, results = new WeakMap(), FOCUSABLE_SELECTOR = [
    'a[href]',
    'area[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'iframe',
    '[tabindex]',
    '[contenteditable="true"]'
].join(','), INTERACTIVE_CONTAINER_SELECTOR = 'button, a[href], [role="button"], [role="link"]', ARIA_VALUE_RULES = {
    'aria-hidden': [
        'true',
        'false'
    ],
    'aria-disabled': [
        'true',
        'false'
    ],
    'aria-expanded': [
        'true',
        'false'
    ],
    'aria-selected': [
        'true',
        'false'
    ],
    'aria-atomic': [
        'true',
        'false'
    ],
    'aria-busy': [
        'true',
        'false'
    ],
    'aria-modal': [
        'true',
        'false'
    ],
    'aria-multiline': [
        'true',
        'false'
    ],
    'aria-multiselectable': [
        'true',
        'false'
    ],
    'aria-readonly': [
        'true',
        'false'
    ],
    'aria-required': [
        'true',
        'false'
    ],
    'aria-checked': [
        'true',
        'false',
        'mixed'
    ],
    'aria-pressed': [
        'true',
        'false',
        'mixed'
    ],
    'aria-current': [
        'page',
        'step',
        'location',
        'date',
        'time',
        'true',
        'false'
    ],
    'aria-live': [
        'off',
        'polite',
        'assertive'
    ],
    'aria-haspopup': [
        'false',
        'true',
        'menu',
        'listbox',
        'tree',
        'grid',
        'dialog'
    ],
    'aria-sort': [
        'none',
        'ascending',
        'descending',
        'other'
    ],
    'aria-orientation': [
        'horizontal',
        'vertical'
    ]
};
// Build a short stable-enough selector for debugger output and custom reports
const selectorFor = (element, root)=>{
    if (element.id) return `#${element.id}`;
    const parts = [];
    let current = element;
    // Continue until the operation completes
    while(current && current !== root && parts.length < 5){
        const siblings = current.parentElement ? Array.from(current.parentElement.children).filter(// Select matching items
        (node)=>node.localName === current.localName) : [];
        parts.unshift(`${current.localName}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ''}`);
        current = current.parentElement;
    }
    return parts.join(' > ') || element.localName;
};
// Treat programmatic naming separately from visible descendant text
const hasExplicitAccessibleName = (element)=>Boolean(element.getAttribute('aria-label')?.trim() || element.getAttribute('aria-labelledby')?.trim() || element.getAttribute('title')?.trim());
const hasAccessibleName = (element)=>{
    // Check whether accessible name
    return Boolean(hasExplicitAccessibleName(element) || element.localName === 'input' && [
        'button',
        'submit',
        'reset'
    ].includes(element.type) && element.value?.trim() || element.textContent?.trim());
};
const isPotentiallyFocusable = (element)=>{
    // Check whether potentially focusable
    return !element.hasAttribute('disabled') && !element.closest('[hidden], [inert]') && element.getAttribute('tabindex') !== '-1';
};
const directChild = (element, tagName)=>{
    // Run the direct child operation
    return Array.from(element.children || []).find(// Find the matching item
    (child)=>child.localName === tagName) || null;
};
// Prefer the platform BCP 47 parser while retaining support for older browsers
const hasValidLanguageTag = (value)=>{
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    if (typeof Intl?.Locale === 'function') {
        // Guard the has valid language tag operation against runtime failures
        try {
            new Intl.Locale(normalized);
            return true;
        } catch  {
            return false;
        }
    }
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(normalized);
};
const violation = (rule, severity, element, root, remediation)=>{
    // Run the violation operation
    return {
        rule,
        severity,
        selector: selectorFor(element, root),
        remediation
    };
};
// Run the dependency-free development rule set against one component root
export const runBasicAccessibilityAudit = (root)=>{
    // Collect violations and expose a scoped selector helper
    const violations = [], query = (selector)=>Array.from(root.querySelectorAll?.(selector) || []);
    // Audit common names and form relationships
    query('img:not([alt])').forEach(// Process the current item
    (element)=>violations.push(violation('image-alt', 'serious', element, root, 'Add an alt attribute; use alt="" for decorative images.')));
    query('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]').filter(// Select matching items
    (element)=>!hasAccessibleName(element)).forEach(// Process the current item
    (element)=>violations.push(violation('control-name', 'serious', element, root, 'Provide visible text, aria-label, or aria-labelledby.')));
    query('input:not([type="hidden"]), select, textarea').forEach((element)=>{
        // Process the current item
        const id = element.id, labelled = element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || element.closest('label') || id && root.querySelector?.(`label[for="${globalThis.CSS?.escape ? CSS.escape(id) : id}"]`);
        if (!labelled) violations.push(violation('form-label', 'serious', element, root, 'Associate the field with a label or accessible name.'));
    });
    // Collect IDs before reporting every collision after the first occurrence
    const ids = new Map();
    query('[id]').forEach((element)=>{
        // Process the current item
        const matches = ids.get(element.id) || [];
        matches.push(element);
        ids.set(element.id, matches);
    });
    ids.forEach(// Process the current item
    (matches)=>matches.slice(1).forEach(// Process the current item
        (element)=>violations.push(violation('duplicate-id', 'moderate', element, root, 'Use an ID that is unique within the component root.'))));
    // Validate every token in multi-value ARIA reference attributes
    query('[aria-labelledby], [aria-describedby], [aria-controls]').forEach((element)=>{
        // Process the current item
        for (const attribute of [
            'aria-labelledby',
            'aria-describedby',
            'aria-controls'
        ]){
            // Process each id
            for (const id of (element.getAttribute(attribute) || '').split(/\s+/).filter(Boolean)){
                if (!root.getElementById?.(id) && !root.querySelector?.(`#${globalThis.CSS?.escape ? CSS.escape(id) : id}`)) violations.push(violation('aria-reference', 'serious', element, root, `Ensure ${attribute} references an existing ID.`));
            }
        }
    });
    // Preserve heading structure without requiring a particular starting level
    let previousLevel = 0;
    query('h1, h2, h3, h4, h5, h6').forEach((element)=>{
        // Process the current item
        const level = Number(element.localName.slice(1));
        if (previousLevel && level > previousLevel + 1) violations.push(violation('heading-order', 'moderate', element, root, 'Do not skip heading levels.'));
        previousLevel = level;
    });
    // Cover accessible names for navigation headings and embedded documents
    query('a[href], [role="link"]').filter(// Select matching items
    (element)=>!hasAccessibleName(element)).forEach(// Process the current item
    (element)=>violations.push(violation('link-name', 'serious', element, root, 'Provide descriptive link text, aria-label, or aria-labelledby.')));
    query('h1, h2, h3, h4, h5, h6').filter(// Select matching items
    (element)=>!hasAccessibleName(element)).forEach(// Process the current item
    (element)=>violations.push(violation('heading-name', 'serious', element, root, 'Provide visible or programmatic text for every heading.')));
    query('iframe').filter(// Select matching items
    (element)=>!hasExplicitAccessibleName(element)).forEach(// Process the current item
    (element)=>violations.push(violation('iframe-title', 'serious', element, root, 'Add a concise title or accessible name that describes the frame.')));
    // Protect predictable focus order and prevent hidden or nested focus targets
    query('[tabindex]').filter(// Select matching items
    (element)=>isPotentiallyFocusable(element) && Number(element.getAttribute('tabindex')) > 0).forEach(// Process the current item
    (element)=>violations.push(violation('positive-tabindex', 'moderate', element, root, 'Use DOM order and tabindex="0" instead of a positive tabindex.')));
    query('[aria-hidden="true"]').forEach((container)=>{
        // Process the current item
        const focusable = [
            ...container.matches?.(FOCUSABLE_SELECTOR) ? [
                container
            ] : [],
            ...container.querySelectorAll(FOCUSABLE_SELECTOR)
        ].filter(isPotentiallyFocusable);
        focusable.forEach(// Process the current item
        (element)=>violations.push(violation('aria-hidden-focus', 'serious', element, root, 'Remove focusable content from aria-hidden regions or remove aria-hidden.')));
    });
    query(FOCUSABLE_SELECTOR).filter(isPotentiallyFocusable).forEach((element)=>{
        // Process the current item
        const parentInteractive = element.parentElement?.closest(INTERACTIVE_CONTAINER_SELECTOR);
        if (parentInteractive) violations.push(violation('interactive-nesting', 'serious', element, root, 'Do not nest one interactive control inside another.'));
    });
    // Require the structural labels expected by common semantic containers
    query('dialog, [role="dialog"], [role="alertdialog"]').filter(// Select matching items
    (element)=>!hasExplicitAccessibleName(element)).forEach(// Process the current item
    (element)=>violations.push(violation('dialog-name', 'serious', element, root, 'Give the dialog an aria-label, aria-labelledby reference, or title.')));
    query('fieldset').filter(// Select matching items
    (element)=>!directChild(element, 'legend')).forEach(// Process the current item
    (element)=>violations.push(violation('fieldset-legend', 'moderate', element, root, 'Add a legend as a direct child to describe the grouped controls.')));
    query('details').filter(// Select matching items
    (element)=>element.firstElementChild?.localName !== 'summary').forEach(// Process the current item
    (element)=>violations.push(violation('details-summary', 'serious', element, root, 'Add a summary as the first child of the details element.')));
    query('table').filter(// Select matching items
    (element)=>![
            'none',
            'presentation'
        ].includes(element.getAttribute('role'))).forEach((element)=>{
        // Process the current item
        const caption = directChild(element, 'caption');
        if (!caption?.textContent?.trim() && !hasExplicitAccessibleName(element)) violations.push(violation('table-name', 'moderate', element, root, 'Add a caption or accessible name that describes the table.'));
        if (element.querySelector('td') && !element.querySelector('th')) violations.push(violation('table-headers', 'serious', element, root, 'Associate data cells with row or column headers.'));
    });
    query('[role="img"]').filter(// Select matching items
    (element)=>!hasExplicitAccessibleName(element) && !(element.localName === 'svg' && directChild(element, 'title')?.textContent?.trim())).forEach(// Process the current item
    (element)=>violations.push(violation('graphic-name', 'serious', element, root, 'Give meaningful graphics an aria-label, aria-labelledby reference, or title.')));
    // Validate enumerated ARIA state values and explicit language declarations
    Object.entries(ARIA_VALUE_RULES).forEach(([attribute, allowed])=>{
        // Process the current item
        query(`[${attribute}]`).filter(// Select matching items
        (element)=>!allowed.includes(element.getAttribute(attribute)?.trim().toLowerCase())).forEach(// Process the current item
        (element)=>violations.push(violation('aria-value', 'serious', element, root, `Use a valid ${attribute} value: ${allowed.join(', ')}.`)));
    });
    query('[lang]').filter(// Select matching items
    (element)=>!hasValidLanguageTag(element.getAttribute('lang'))).forEach(// Process the current item
    (element)=>violations.push(violation('language-tag', 'moderate', element, root, 'Use a valid BCP 47 language tag, such as en or en-US.')));
    return violations;
};
// Normalize external auditor shapes into the debugger contract
const normalizeViolations = (value, root)=>Array.from(value || []).map(// Transform the current item
    (item)=>({
            rule: String(item.rule || item.id || 'custom'),
            severity: String(item.severity || item.impact || 'moderate'),
            selector: String(item.selector || item.target || selectorFor(root.host || root, root)),
            remediation: String(item.remediation || item.help || 'Review this accessibility issue.')
        }));
export const auditAccessibility = async (root, { auditor = null } = {})=>{
    // Give custom auditors access to the basic rules for additive integrations
    const startedAt = performance.now(), violations = auditor ? normalizeViolations(await auditor(root, {
        basic: runBasicAccessibilityAudit
    }), root) : runBasicAccessibilityAudit(root);
    return {
        violations,
        duration: performance.now() - startedAt
    };
};
// Audit components after load and development reload without affecting the root runtime
export const observeAccessibility = (loaderClass, { auditor = null, debounce = DEFAULT_DEBOUNCE, logFindings = false } = {})=>{
    if (typeof document === 'undefined') throw new TypeError('[ACL A11y] Accessibility observation requires browser DOM APIs.');
    const generations = new WeakMap(), timers = new WeakMap();
    let disconnected = false;
    // Ignore stale asynchronous results when a newer audit starts for the same host
    const auditElement = async (element)=>{
        if (!element || disconnected) return null;
        const generation = (generations.get(element) || 0) + 1;
        generations.set(element, generation);
        const root = element.shadowRoot || element, result = await auditAccessibility(root, {
            auditor
        });
        if (disconnected || generations.get(element) !== generation) return null;
        results.set(element, result);
        element.dispatchEvent(new CustomEvent('acl:a11y', {
            bubbles: true,
            composed: true,
            detail: {
                tag: element.localName,
                ...result
            }
        }));
        if (logFindings && result.violations.length) {
            globalThis.console?.warn?.(`[ACL A11y] Found ${result.violations.length} accessibility finding${result.violations.length === 1 ? '' : 's'} in <${element.localName}>.`, result.violations);
        }
        return result;
    };
    // Collapse load and hot-reload bursts into one audit per component
    const schedule = (element)=>{
        // Schedule
        clearTimeout(timers.get(element));
        timers.set(element, setTimeout(()=>{
            // Run the scheduled delayed task
            timers.delete(element);
            void auditElement(element);
        }, Math.max(0, Number(debounce) || 0)));
    }, onReady = (event)=>{
        const element = event.composedPath?.().find(// Run the element operation
        (node)=>node?.hasAttribute?.('data-acl-component')) || event.target;
        schedule(element);
    };
    document.addEventListener('acl:loadend', onReady, true);
    document.addEventListener('acl:dev-reload-end', onReady, true);
    return {
        audit: auditElement,
        // Get results
        getResults: (element)=>results.get(element) || null,
        disconnect () {
            // Run the disconnect operation
            if (disconnected) return;
            disconnected = true;
            document.removeEventListener('acl:loadend', onReady, true);
            document.removeEventListener('acl:dev-reload-end', onReady, true);
        },
        loader: loaderClass
    };
};
export default {
    audit: auditAccessibility,
    observe: observeAccessibility,
    runBasicAudit: runBasicAccessibilityAudit
};
