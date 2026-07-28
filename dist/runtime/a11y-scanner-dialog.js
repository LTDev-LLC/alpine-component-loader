// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Propagate jsDelivr's generated minified chunk suffix to package-owned dependencies
const isMinifiedModule = new URL(import.meta.url).pathname.endsWith('.min.js'), resolveLocalModule = (specifier)=>isMinifiedModule ? specifier.replace(/\.js$/, '.min.js') : specifier, importLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), { appendUiNode, createUiButton, toCss } = await importLocalModule('./overlay-utils.js');
const styles = {
    toggle: {
        position: 'fixed',
        zIndex: 10000,
        appearance: 'none',
        border: '1px solid #14532d',
        borderRadius: '20px',
        background: '#166534',
        color: '#f0fdf4',
        padding: '8px 16px',
        boxShadow: '0 4px 6px rgba(0,0,0,.1)',
        cursor: 'pointer',
        fontFamily: 'system-ui,sans-serif',
        fontSize: '12px',
        fontWeight: 700,
        lineHeight: 'normal',
        whiteSpace: 'nowrap'
    },
    modal: {
        position: 'fixed',
        inset: 0,
        zIndex: 10003,
        display: 'grid',
        placeItems: 'center',
        padding: '20px',
        background: 'rgba(15,23,42,.72)',
        fontFamily: 'system-ui,sans-serif',
        overscrollBehavior: 'contain'
    },
    dialog: {
        display: 'flex',
        flexDirection: 'column',
        width: 'min(820px,100%)',
        maxHeight: 'min(760px,calc(100vh - 40px))',
        overflow: 'hidden',
        border: '1px solid #cbd5e1',
        borderRadius: '12px',
        background: '#fff',
        color: '#0f172a',
        boxShadow: '0 24px 70px rgba(15,23,42,.38)'
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '14px 18px',
        borderBottom: '1px solid #e2e8f0',
        background: '#f8fafc'
    },
    footer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '12px',
        padding: '14px 18px',
        borderTop: '1px solid #e2e8f0',
        background: '#f8fafc'
    },
    title: {
        margin: 0,
        fontSize: '18px',
        lineHeight: 1.3
    },
    summary: {
        margin: 0,
        padding: '12px 18px',
        borderBottom: '1px solid #e2e8f0',
        color: '#334155'
    },
    results: {
        flex: '1 1 auto',
        minHeight: '120px',
        overflow: 'auto',
        overscrollBehavior: 'contain',
        padding: '16px 18px'
    },
    empty: {
        margin: 0,
        padding: '24px',
        borderRadius: '8px',
        background: '#f0fdf4',
        color: '#166534',
        textAlign: 'center'
    },
    group: {
        margin: '0 0 16px',
        padding: '14px',
        border: '1px solid #e2e8f0',
        borderRadius: '8px'
    },
    groupTitle: {
        margin: '0 0 10px',
        fontFamily: 'ui-monospace,monospace',
        fontSize: '14px',
        fontWeight: 700,
        lineHeight: 1.4
    },
    list: {
        display: 'grid',
        gap: '10px',
        margin: 0,
        padding: 0,
        listStyle: 'none'
    },
    finding: {
        padding: '10px',
        borderLeft: '4px solid #d97706',
        background: '#fffbeb'
    },
    findingTitle: {
        display: 'block',
        marginBottom: '4px'
    },
    findingSelector: {
        overflowWrap: 'anywhere',
        color: '#475569'
    },
    findingText: {
        margin: '5px 0 0'
    },
    error: {
        margin: 0,
        padding: '10px',
        borderLeft: '4px solid #dc2626',
        background: '#fef2f2',
        color: '#991b1b'
    },
    button: {
        appearance: 'none',
        border: '1px solid #94a3b8',
        borderRadius: '6px',
        background: '#fff',
        color: '#0f172a',
        padding: '7px 11px',
        cursor: 'pointer',
        fontFamily: 'system-ui,sans-serif',
        fontSize: '13px',
        fontWeight: 600,
        lineHeight: 1.2
    },
    close: {
        width: '32px',
        height: '32px',
        padding: 0,
        fontSize: '18px'
    }
};
const stateCss = `[data-acl-a11y-scanner-ui],[data-acl-a11y-scanner-ui] *{box-sizing:border-box}#acl-a11y-scanner-toggle:hover{background:#15803d!important}#acl-a11y-scanner-modal[hidden]{display:none!important}.acl-a11y-scanner-group:last-child{margin-bottom:0!important}.acl-a11y-scanner-button:hover{background:#f1f5f9!important}.acl-a11y-scanner-button:disabled{cursor:wait;opacity:.65}@media (max-width:520px),(max-height:520px) and (max-width:900px){#acl-a11y-scanner-modal{padding:0!important}.acl-a11y-scanner-dialog{width:100vw!important;height:100dvh!important;max-height:none!important;border:0!important;border-radius:0!important}.acl-a11y-scanner-header{padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 12px max(12px,env(safe-area-inset-left))!important;flex:0 0 auto}#acl-a11y-scanner-summary{padding:10px max(12px,env(safe-area-inset-right))!important;flex:0 0 auto}.acl-a11y-scanner-results{min-height:0!important;padding:12px max(12px,env(safe-area-inset-right))!important}.acl-a11y-scanner-footer{padding:12px max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))!important;flex:0 0 auto}.acl-a11y-scanner-button{min-height:44px}.acl-a11y-scanner-close{width:44px!important;height:44px!important;flex:0 0 44px}.acl-a11y-scanner-group{padding:12px!important}}`, append = appendUiNode, action = (documentRef, text, className = 'acl-a11y-scanner-button')=>{
    // Run the action operation
    return createUiButton(documentRef, text, styles.button, className);
};
export const createScannerUi = (documentRef)=>{
    // Create scanner ui
    const style = append(documentRef, documentRef.createDocumentFragment(), 'style', '', stateCss), toggle = action(documentRef, 'A11y Audit', '');
    style.dataset.aclA11yScannerUi = 'true';
    toggle.id = 'acl-a11y-scanner-toggle';
    toggle.dataset.aclA11yScannerUi = 'true';
    toggle.style.cssText = toCss(styles.toggle);
    const modal = documentRef.createElement('div'), dialog = documentRef.createElement('section'), header = documentRef.createElement('header');
    modal.id = 'acl-a11y-scanner-modal';
    modal.dataset.aclA11yScannerUi = 'true';
    modal.style.cssText = toCss(styles.modal);
    modal.hidden = true;
    dialog.className = 'acl-a11y-scanner-dialog';
    dialog.style.cssText = toCss(styles.dialog);
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'acl-a11y-scanner-title');
    dialog.setAttribute('aria-describedby', 'acl-a11y-scanner-summary');
    dialog.tabIndex = -1;
    header.className = 'acl-a11y-scanner-header';
    header.style.cssText = toCss(styles.header);
    const title = append(documentRef, header, 'h2', 'acl-a11y-scanner-title', 'ACL Accessibility Audit', styles.title), headerClose = action(documentRef, '×', 'acl-a11y-scanner-button acl-a11y-scanner-close');
    title.id = 'acl-a11y-scanner-title';
    headerClose.style.cssText = toCss({
        ...styles.button,
        ...styles.close
    });
    headerClose.setAttribute('aria-label', 'Close accessibility scanner');
    header.appendChild(headerClose);
    const summary = append(documentRef, dialog, 'p', 'acl-a11y-scanner-summary', 'Ready to scan active ACL components.', styles.summary), results = documentRef.createElement('div'), footer = documentRef.createElement('footer'), rescan = action(documentRef, 'Rescan'), footerClose = action(documentRef, 'Close');
    summary.id = 'acl-a11y-scanner-summary';
    summary.setAttribute('role', 'status');
    summary.setAttribute('aria-live', 'polite');
    results.className = 'acl-a11y-scanner-results';
    results.style.cssText = toCss(styles.results);
    results.tabIndex = 0;
    results.setAttribute('role', 'region');
    results.setAttribute('aria-label', 'Accessibility audit findings');
    footer.className = 'acl-a11y-scanner-footer';
    footer.style.cssText = toCss(styles.footer);
    footer.append(rescan, footerClose);
    dialog.prepend(header);
    dialog.append(results, footer);
    modal.appendChild(dialog);
    documentRef.body.append(style, toggle, modal);
    return {
        style,
        toggle,
        modal,
        dialog,
        summary,
        results,
        rescan,
        headerClose,
        footerClose
    };
};
export const renderScannerLoading = (documentRef, nodes)=>{
    // Render scanner loading
    nodes.summary.textContent = 'Scanning active ACL components…';
    nodes.results.replaceChildren();
    append(documentRef, nodes.results, 'p', 'acl-a11y-scanner-empty', 'Audit in progress…', styles.empty);
};
export const renderScannerResult = (documentRef, nodes, result)=>{
    // Render scanner result
    nodes.summary.textContent = `Scanned ${result.componentCount} component${result.componentCount === 1 ? '' : 's'} in ${result.duration.toFixed(1)}ms: ${result.violationCount} finding${result.violationCount === 1 ? '' : 's'}, ${result.errorCount} error${result.errorCount === 1 ? '' : 's'}.`;
    nodes.results.replaceChildren();
    if (!result.componentCount || !result.violationCount && !result.errorCount) {
        append(documentRef, nodes.results, 'p', 'acl-a11y-scanner-empty', result.componentCount ? 'No accessibility findings were detected.' : 'No active ACL components were found.', styles.empty);
        return;
    }
    result.components.forEach((component, index)=>{
        // Process the current item
        if (!component.violations.length && !component.error) return;
        const group = documentRef.createElement('section');
        group.className = 'acl-a11y-scanner-group';
        group.style.cssText = toCss(styles.group);
        append(documentRef, group, 'h3', '', `${index + 1}. <${component.tag}> - ${component.violations.length} finding${component.violations.length === 1 ? '' : 's'}`, styles.groupTitle);
        if (component.error) append(documentRef, group, 'p', 'acl-a11y-scanner-error', `Audit failed: ${component.error}`, styles.error);
        if (component.violations.length) {
            const list = documentRef.createElement('ol');
            list.className = 'acl-a11y-scanner-list';
            list.style.cssText = toCss(styles.list);
            component.violations.forEach((finding)=>{
                // Process the current item
                const item = documentRef.createElement('li');
                item.className = 'acl-a11y-scanner-finding';
                item.style.cssText = toCss(styles.finding);
                append(documentRef, item, 'strong', '', `${finding.severity}: ${finding.rule}`, styles.findingTitle);
                append(documentRef, item, 'code', '', finding.selector, styles.findingSelector);
                append(documentRef, item, 'p', '', finding.remediation, styles.findingText);
                list.appendChild(item);
            });
            group.appendChild(list);
        }
        nodes.results.appendChild(group);
    });
};
