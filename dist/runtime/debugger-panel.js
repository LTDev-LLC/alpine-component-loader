// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Propagate jsDelivr's generated minified chunk suffix to package-owned dependencies
const isMinifiedModule = new URL(import.meta.url).pathname.endsWith('.min.js'), resolveLocalModule = (specifier)=>isMinifiedModule ? specifier.replace(/\.js$/, '.min.js') : specifier, importLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), { createUiButton, createUiNode } = await importLocalModule('./overlay-utils.js');
const css = {
    panel: {
        position: 'fixed',
        right: '12px',
        top: '12px',
        zIndex: 10001,
        width: '360px',
        maxWidth: 'calc(100vw - 24px)',
        height: 'min(760px, calc(100vh - 24px))',
        overflow: 'hidden',
        background: '#0f172a',
        color: '#e5e7eb',
        border: '1px solid #334155',
        borderRadius: '8px',
        boxShadow: '0 20px 35px rgba(15,23,42,0.25)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: '11px',
        display: 'none',
        flexDirection: 'column',
        pointerEvents: 'auto'
    },
    header: {
        position: 'sticky',
        top: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        background: '#111827',
        padding: '10px',
        borderBottom: '1px solid #334155',
        fontWeight: 700,
        color: '#f8fafc'
    },
    body: {
        padding: '10px',
        display: 'grid',
        gridTemplateRows: 'auto auto minmax(88px, 1fr) minmax(76px, 0.7fr) minmax(90px, 0.8fr) auto minmax(110px, 1fr) auto minmax(84px, 0.7fr) auto minmax(84px, 0.7fr) auto minmax(84px, 0.7fr) auto',
        gap: '10px',
        flex: '1 1 auto',
        minHeight: 0,
        overflow: 'hidden'
    },
    section: {
        display: 'grid',
        gap: '6px'
    },
    list: {
        display: 'grid',
        gap: '4px',
        alignContent: 'start',
        minHeight: 0,
        overflowY: 'auto'
    },
    pre: {
        margin: 0,
        padding: '8px',
        minHeight: 0,
        overflow: 'auto',
        background: '#020617',
        border: '1px solid #1e293b',
        borderRadius: '6px',
        whiteSpace: 'pre-wrap'
    },
    label: {
        color: '#93c5fd',
        fontWeight: 700,
        marginBottom: '-2px'
    },
    controls: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        marginTop: '8px'
    },
    button: {
        appearance: 'none',
        border: '1px solid #4b5563',
        borderRadius: '4px',
        background: '#111827',
        color: '#f9fafb',
        fontSize: '11px',
        lineHeight: 1,
        padding: '5px 7px',
        cursor: 'pointer'
    },
    close: {
        appearance: 'none',
        border: '1px solid #475569',
        borderRadius: '4px',
        background: '#020617',
        color: '#e5e7eb',
        width: '24px',
        height: '24px',
        padding: 0,
        lineHeight: 1,
        cursor: 'pointer',
        fontWeight: 700
    }
};
const stateCss = `[data-acl-debug-ui],[data-acl-debug-ui] *{box-sizing:border-box}@media (max-width:520px),(max-height:520px) and (max-width:900px){#acl-debug-panel{inset:0!important;width:100vw!important;max-width:none!important;height:100dvh!important;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}#acl-debug-panel .acl-debug-panel-header{padding:10px!important}#acl-debug-panel [aria-label="Turn off debugging"]{width:44px!important;height:44px!important;flex:0 0 44px}#acl-debug-panel .acl-debug-panel-body{display:flex!important;flex-direction:column;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior:contain;padding:10px!important}#acl-debug-panel .acl-debug-panel-body>*{flex:0 0 auto;min-width:0}#acl-debug-panel .acl-debug-panel-filters{display:grid!important;grid-template-columns:minmax(0,1fr) auto}#acl-debug-panel .acl-debug-panel-filters>*{min-width:0;width:100%}#acl-debug-panel .acl-debug-panel-list{height:min(180px,30dvh);min-height:120px!important}#acl-debug-panel pre{max-height:160px!important}#acl-debug-panel .acl-debug-panel-controls>button{min-height:44px}}`;
const node = (tag, options)=>{
    // Run the node operation
    return createUiNode(document, tag, options);
}, button = (text)=>{
    // Run the button operation
    return createUiButton(document, text, css.button);
};
// Construct the secondary debugger panel in its own chunk while keeping the
// public injection and toggle APIs synchronous
export const ensureDebuggerPanel = ()=>{
    let panel = document.getElementById('acl-debug-panel');
    if (panel) return panel;
    panel = node('aside', {
        style: css.panel
    });
    panel.id = 'acl-debug-panel';
    panel.dataset.aclDebugUi = 'true';
    const style = node('style', {
        text: stateCss
    }), header = node('div', {
        className: 'acl-debug-panel-header',
        style: css.header
    }), close = node('button', {
        text: 'X',
        style: css.close,
        ariaLabel: 'Turn off debugging'
    });
    close.type = 'button';
    close.title = 'Turn off debugging';
    header.append(node('span', {
        text: 'ACL Debugger'
    }), close);
    const body = node('div', {
        className: 'acl-debug-panel-body',
        style: css.body
    }), summary = node('div', {
        style: css.section
    }), filters = node('div', {
        className: 'acl-debug-panel-filters',
        style: css.controls
    }), search = node('input', {
        style: {
            ...css.button,
            flex: 1
        },
        ariaLabel: 'Search components'
    }), status = node('select', {
        style: css.button,
        ariaLabel: 'Filter component status'
    }), list = node('div', {
        className: 'acl-debug-panel-list',
        style: css.list
    }), meta = node('pre', {
        style: css.pre
    }), props = node('pre', {
        style: css.pre
    }), contentLabel = node('div', {
        text: 'Element content',
        style: css.label
    }), content = node('pre', {
        style: {
            ...css.pre,
            maxHeight: '220px'
        }
    }), controls = node('div', {
        className: 'acl-debug-panel-controls',
        style: css.controls
    });
    search.type = 'search';
    search.placeholder = 'Search components';
    [
        [
            'all',
            'All'
        ],
        [
            'loading',
            'Loading'
        ],
        [
            'ready',
            'Ready'
        ],
        [
            'error',
            'Error'
        ],
        [
            'a11y',
            'A11y'
        ]
    ].forEach(([value, label])=>{
        // Process the current item
        const option = node('option', {
            text: label
        });
        option.value = value;
        status.appendChild(option);
    });
    filters.append(search, status);
    const scroll = button('Scroll to selected'), reload = button('Reload selected'), clear = button('Clear selected cache'), snapshot = button('Capture snapshot'), diff = button('Diff latest'), exportButton = button('Export diagnostics'), timelineLabel = node('div', {
        text: 'Lifecycle timeline',
        style: css.label
    }), timeline = node('pre', {
        style: {
            ...css.pre,
            maxHeight: '150px'
        }
    }), requestsLabel = node('div', {
        text: 'Request and cache activity',
        style: css.label
    }), requests = node('pre', {
        style: {
            ...css.pre,
            maxHeight: '130px'
        }
    }), a11yLabel = node('div', {
        text: 'Accessibility',
        style: css.label
    }), a11y = node('pre', {
        style: {
            ...css.pre,
            maxHeight: '130px'
        }
    });
    controls.append(scroll, reload, clear, snapshot, diff, exportButton);
    body.append(summary, filters, list, meta, props, contentLabel, content, timelineLabel, timeline, requestsLabel, requests, a11yLabel, a11y, controls);
    panel.append(style, header, body);
    panel._nodes = {
        summary,
        search,
        status,
        list,
        meta,
        props,
        content,
        timeline,
        requests,
        a11y,
        scroll,
        reload,
        clear,
        export: exportButton,
        snapshot,
        diff,
        close
    };
    document.body.appendChild(panel);
    return panel;
};
