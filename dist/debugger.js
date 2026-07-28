// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Propagate jsDelivr's generated minified entry suffix to package-owned dependencies
const isMinifiedModule = new URL(import.meta.url).pathname.endsWith('.min.js'), resolveLocalModule = (specifier)=>isMinifiedModule ? specifier.replace(/\.js$/, '.min.js') : specifier, importLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), importDeferredLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), [{ pushBoundedRecord }, { ACLLoadError }] = await Promise.all([
    importLocalModule('./runtime/overlay-utils.js'),
    importLocalModule('./acl-load-error.js')
]);
// Style definitions used by debugger tooltip and overlays
const debuggerCss = {
    tooltip: {
        position: 'fixed',
        zIndex: 10000,
        background: '#1f2937',
        color: '#f3f4f6',
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '11px',
        fontFamily: 'monospace',
        pointerEvents: 'none',
        border: '1px solid #374151',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
        maxWidth: '300px',
        whiteSpace: 'pre-wrap',
        display: 'none'
    },
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9998,
        overflow: 'hidden'
    },
    overlayBoxes: {
        position: 'absolute',
        border: '4px solid',
        boxSizing: 'border-box'
    },
    overlayBoxesColors: {
        default: '#22c55e',
        update: '#fbbf24',
        selected: '#38bdf8'
    },
    meta: {
        marginTop: '6px',
        paddingTop: '6px',
        borderTop: '1px solid #374151',
        color: '#cbd5e1'
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
    }
};
// Bound diagnostic and virtualized UI work to predictable limits
const MAX_CONTENT_LENGTH = 6000, MAX_TIMELINE_ENTRIES = 100, VIRTUAL_LIST_THRESHOLD = 200, VIRTUAL_LIST_ROW_HEIGHT = 28, SENSITIVE_KEY_PATTERN = /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|credential)/i, ACL_EVENT_TYPES = [
    'acl:loadstart',
    'acl:loadend',
    'acl:error',
    'acl:cachehit',
    'acl:cacheevict',
    'acl:revalidated',
    'acl:dev-reload',
    'acl:dev-reload-start',
    'acl:dev-reload-end',
    'acl:a11y'
];
// Serialize camelCase style objects into inline CSS text
const toCssString = (styleObj)=>{
    return Object.entries(styleObj).map(// Transform the current item
    ([k, v])=>`${k.replace(/[A-Z]/g, // Transform the matched text
        (m)=>`-${m.toLowerCase()}`)}:${v}`).join(';');
};
// Redact sensitive query parameters while preserving a useful normalized URL
const redactUrl = (value)=>{
    if (typeof value !== 'string') return value;
    // Guard the redact url operation against runtime failures
    try {
        const url = new URL(value, typeof document === 'undefined' ? 'http://localhost' : document.baseURI);
        // Process each key
        for (const key of [
            ...url.searchParams.keys()
        ]){
            if (SENSITIVE_KEY_PATTERN.test(key)) url.searchParams.set(key, '[REDACTED]');
        }
        return url.href;
    } catch  {
        return value;
    }
};
// Derive loading status from the canonical component lifecycle state
const isComponentLoading = (element)=>element?._state === 'deferred' || element?._state === 'loading';
// Produce a JSON-safe diagnostic value without leaking common credentials
export const redactDiagnostics = (value, key = '', seen = new WeakSet())=>{
    if (SENSITIVE_KEY_PATTERN.test(key)) return '[REDACTED]';
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return /url$/i.test(key) ? redactUrl(value) : value;
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
    if (typeof value !== 'object') return String(value);
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) return value.map(// Transform the current item
    (item)=>redactDiagnostics(item, key, seen));
    const result = {};
    // Process each entry
    for (const [childKey, childValue] of Object.entries(value))result[childKey] = redactDiagnostics(childValue, childKey, seen);
    return result;
};
// Convert one live component into the serializable subset used by diagnostics
const describeComponent = (el)=>({
        tag: el.localName,
        state: el._state,
        loading: isComponentLoading(el),
        connected: Boolean(el.isConnected),
        performance: redactDiagnostics(el._perf || {}),
        props: redactDiagnostics(el.$props || {}),
        debug: redactDiagnostics(el._aclDebug || {})
    });
export const createComponentSnapshot = (element)=>{
    // Create component snapshot
    return redactDiagnostics({
        capturedAt: new Date().toISOString(),
        component: describeComponent(element),
        content: getElementContentSnapshot(element)
    });
};
// Produce stable leaf changes suitable for UI and diagnostic exports
export const diffDiagnosticSnapshots = (before, after)=>{
    const changes = [], visit = (left, right, path = '$')=>{
        // Visit
        if (Object.is(left, right)) return;
        if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) {
            changes.push({
                path,
                before: redactDiagnostics(left),
                after: redactDiagnostics(right)
            });
            return;
        }
        const keys = new Set([
            ...Object.keys(left),
            ...Object.keys(right)
        ]);
        keys.forEach(// Process the current item
        (key)=>visit(left[key], right[key], `${path}.${key}`));
    };
    visit(before, after);
    return changes;
};
// Build a bounded, serializable snapshot suitable for issue reports
export const createDiagnosticSnapshot = (loaderClass, root = typeof document === 'undefined' ? null : document)=>{
    const components = root ? Array.from(root.querySelectorAll('[data-acl-component]')).map(describeComponent) : [];
    return redactDiagnostics({
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        loaderVersion: loaderClass?.version || loaderClass?.VERSION || null,
        config: loaderClass?.globalConfig || {},
        registeredTags: loaderClass?.getRegisteredTags?.() || [],
        dataCache: loaderClass?.getDataCacheInfo?.() || null,
        components
    });
};
// Create or reuse the debug tooltip element and cached child nodes
const ensureTooltip = ()=>{
    let tooltip = document.getElementById('acl-debug-tooltip');
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.id = 'acl-debug-tooltip';
    tooltip.dataset.aclDebugUi = 'true';
    tooltip.style.cssText = toCssString(debuggerCss.tooltip);
    const titleNode = document.createElement('strong');
    titleNode.style.color = '#4ade80';
    const hr = document.createElement('div');
    hr.style.margin = '4px 0';
    hr.style.borderBottom = '1px solid #374151';
    const statusNode = document.createElement('div');
    const perfNode = document.createElement('div');
    perfNode.style.marginTop = '2px';
    perfNode.style.fontSize = '0.9em';
    const propsNode = document.createElement('pre');
    propsNode.style.cssText = 'margin: 4px 0 0 0; opacity: 0.8;';
    const metaNode = document.createElement('div');
    metaNode.style.cssText = toCssString(debuggerCss.meta);
    tooltip.append(titleNode, hr, statusNode, perfNode, metaNode, propsNode);
    tooltip._nodes = {
        title: titleNode,
        status: statusNode,
        perf: perfNode,
        meta: metaNode,
        props: propsNode
    };
    document.body.appendChild(tooltip);
    return tooltip;
};
// Create or reuse the overlay container for component bounds
const ensureOverlay = ()=>{
    let overlay = document.getElementById('acl-debug-overlays');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'acl-debug-overlays';
    overlay.dataset.aclDebugUi = 'true';
    overlay.style.cssText = toCssString(debuggerCss.overlay);
    document.body.appendChild(overlay);
    return overlay;
};
// Measure the visible rectangle for normal or collapsed host elements
const getVisibleRect = (el)=>{
    let rect = el.getBoundingClientRect();
    // Derive bounds from visible children when hosts collapse to zero size
    if (rect.width === 0 && rect.height === 0) {
        const nodes = el.shadowRoot ? el.shadowRoot.children : el.children;
        if (nodes.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, found = false;
            // Process each child
            for (const child of nodes){
                const cRect = child.getBoundingClientRect();
                if (cRect.width > 0 || cRect.height > 0) {
                    found = true;
                    minX = Math.min(minX, cRect.left);
                    minY = Math.min(minY, cRect.top);
                    maxX = Math.max(maxX, cRect.right);
                    maxY = Math.max(maxY, cRect.bottom);
                }
            }
            if (found) rect = {
                left: minX,
                top: minY,
                width: maxX - minX,
                height: maxY - minY
            };
        }
    }
    return rect;
};
// Check whether a measured rectangle intersects the viewport
const isVisible = (rect)=>rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth && rect.top + rect.height > 0 && rect.left + rect.width > 0;
// Convert booleans and missing values into compact inspector text
const formatCacheState = (value)=>{
    if (value === true) return 'hit';
    if (value === false) return 'miss';
    return 'n/a';
};
// Keep large DOM snapshots useful without letting the panel balloon forever
const truncate = (value, limit = MAX_CONTENT_LENGTH)=>{
    if (!value || value.length <= limit) return value || '';
    return `${value.slice(0, limit)}\n... truncated ${value.length - limit} characters`;
};
// Build a readable snapshot of the selected host and its rendered content
const getElementContentSnapshot = (el)=>{
    if (!el) return '';
    const attrs = el.getAttributeNames().filter(// Select matching items
    (name)=>name !== 'data-acl-component').map(// Transform the current item
    (name)=>`${name}="${el.getAttribute(name)}"`).join(' '), hostLine = `<${el.localName}${attrs ? ` ${attrs}` : ''}>`, lightDom = el.innerHTML.trim(), shadowDom = el.shadowRoot?.innerHTML?.trim() || '', renderedText = (el.shadowRoot || el).textContent.replace(/\s+/g, ' ').trim();
    return truncate([
        `Host\n${hostLine}`,
        lightDom ? `Light DOM\n${lightDom}` : 'Light DOM\n(empty)',
        shadowDom ? `Shadow DOM\n${shadowDom}` : null,
        renderedText ? `Rendered text\n${renderedText}` : null
    ].filter(Boolean).join('\n\n'));
};
// Create the mutable debugger state used while debug mode is active
const createDebuggerState = (loaderClass, ensurePanel)=>{
    const tooltip = ensureTooltip(), overlayContainer = ensureOverlay(), panel = ensurePanel();
    let mouseX = 0, mouseY = 0, hoveredElement = null, selectedElement = null, selectedComponentId = null, frameId = null, scrollFrameId = null, components = [], componentIdCounter = 1, componentIds = new WeakMap(), componentsDirty = true, panelDirty = true, renderedListKey = '', revealSelectedInList = false, layoutDirty = true, active = false, timeline = [], requestActivity = [], snapshots = [], a11yResults = new WeakMap();
    // Coalesce observer and input updates into at most one animation-frame render
    const scheduleRender = ()=>{
        if (!active || frameId != null) return;
        // Clear frame ownership before rendering so updates raised during render can reschedule
        frameId = requestAnimationFrame(()=>{
            // Run the scheduled animation task
            frameId = null;
            renderFrame();
        });
    };
    // Mark component and layout caches for refresh
    const markDirty = ()=>{
        componentsDirty = true;
        panelDirty = true;
        layoutDirty = true;
        scheduleRender();
    };
    // Assign a stable session-local identifier without retaining detached elements
    const getComponentId = (el)=>{
        if (!componentIds.has(el)) componentIds.set(el, String(componentIdCounter++));
        return componentIds.get(el);
    };
    // Refresh the cached component host list from the document
    const refreshComponents = ()=>{
        components = Array.from(document.querySelectorAll('[data-acl-component]'));
        components.forEach(getComponentId);
        if (selectedComponentId) {
            selectedElement = components.find(// Find the matching item
            (el)=>getComponentId(el) === selectedComponentId) || null;
            if (!selectedElement) selectedComponentId = null;
        } else if (selectedElement && !selectedElement.isConnected) {
            selectedElement = null;
        }
        componentsDirty = false;
        panelDirty = true;
        renderedListKey = '';
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        components.forEach((el)=>{
            // Process the current item
            resizeObserver.observe(el);
            intersectionObserver.observe(el);
        });
    };
    // Resolve the selected element and discard stale disconnected references
    const getSelectedElement = ()=>{
        if (selectedElement && !selectedElement.isConnected) {
            selectedElement = null;
            selectedComponentId = null;
        }
        if (!selectedElement && selectedComponentId) selectedElement = components.find(// Find the matching item
        (el)=>getComponentId(el) === selectedComponentId) || null;
        return selectedElement;
    };
    // Refresh dirty component state before resolving a panel action target
    const getActionTarget = ()=>{
        if (componentsDirty) refreshComponents();
        return getSelectedElement();
    };
    // Resolve a panel row identifier against the current live component list
    const getComponentById = (id)=>{
        if (componentsDirty) refreshComponents();
        return components.find(// Find the matching item
        (el)=>getComponentId(el) === id) || null;
    };
    // Reveal a component and schedule a post-scroll overlay measurement
    const scrollElementIntoView = (el)=>{
        if (!el?.isConnected) return;
        el.scrollIntoView({
            block: 'center',
            inline: 'center',
            behavior: 'auto'
        });
        layoutDirty = true;
        if (scrollFrameId != null) cancelAnimationFrame(scrollFrameId);
        // Measure again after the browser applies the requested scroll position
        scrollFrameId = requestAnimationFrame(()=>{
            // Run the scheduled animation task
            scrollFrameId = null;
            layoutDirty = true;
            scheduleRender();
        });
    };
    // Adjust only the panel list scroll position needed to reveal one row
    const scrollListItemIntoView = (button)=>{
        if (!button) return;
        const list = panel._nodes.list, top = button.offsetTop, bottom = top + button.offsetHeight, viewTop = list.scrollTop, viewBottom = viewTop + list.clientHeight;
        if (top < viewTop) list.scrollTop = top;
        else if (bottom > viewBottom) list.scrollTop = bottom - list.clientHeight;
    };
    // Select a connected component and mark its panel and overlay projections dirty
    const selectElement = (el, { scroll = false, revealInList = true } = {})=>{
        if (!el?.isConnected) return;
        selectedElement = el;
        selectedComponentId = getComponentId(el);
        if (revealInList) revealSelectedInList = true;
        if (scroll) scrollElementIntoView(el);
        layoutDirty = true;
        panelDirty = true;
        renderedListKey = '';
        renderPanel();
        scheduleRender();
    };
    // Track pointer position and the hovered component host
    const onMouseMove = (e)=>{
        if (panel.contains(e.target)) {
            hoveredElement = null;
            tooltip.style.display = 'none';
            scheduleRender();
            return;
        }
        mouseX = e.clientX;
        mouseY = e.clientY;
        const nextHoveredElement = (e.composedPath() || []).find(// Find the matching item
        (node)=>node.nodeType === 1 && node.hasAttribute('data-acl-component'));
        if (!nextHoveredElement) {
            hoveredElement = null;
            tooltip.style.display = 'none';
            scheduleRender();
            return;
        }
        if (nextHoveredElement === hoveredElement) {
            scheduleRender();
            return;
        }
        hoveredElement = nextHoveredElement;
        if (hoveredElement && hoveredElement !== getSelectedElement()) selectElement(hoveredElement);
        scheduleRender();
    };
    // Redraw visible component boxes using the cached host list
    const updateOverlays = ()=>{
        if (componentsDirty) refreshComponents();
        const children = overlayContainer.children;
        let usedBoxCount = 0;
        components.forEach((el)=>{
            // Process the current item
            const rect = getVisibleRect(el);
            if (!isVisible(rect)) return;
            let box = children[usedBoxCount];
            if (!box) {
                box = document.createElement('div');
                box.style.cssText = toCssString(debuggerCss.overlayBoxes);
                overlayContainer.appendChild(box);
            }
            box.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
            box.style.width = `${rect.width}px`;
            box.style.height = `${rect.height}px`;
            box.style.display = 'block';
            const isSelected = el === getSelectedElement();
            box.style.borderColor = isSelected ? debuggerCss.overlayBoxesColors.selected : debuggerCss.overlayBoxesColors[el.$props?.$lastUpdated && Date.now() - el.$props.$lastUpdated < 1000 ? 'update' : 'default'];
            box.style.borderWidth = isSelected ? '4px' : '3px';
            box.style.boxShadow = isSelected ? '0 0 0 4px rgba(56,189,248,0.28), 0 0 24px rgba(14,165,233,0.55)' : 'none';
            box.style.borderRadius = isSelected ? '6px' : '0';
            usedBoxCount++;
        });
        // Iterate over the indexed values
        for(let i = usedBoxCount; i < children.length; i++)children[i].style.display = 'none';
    };
    // Update tooltip content and keep it inside the viewport
    const updateTooltip = ()=>{
        if (!hoveredElement) {
            tooltip.style.display = 'none';
            return;
        }
        tooltip.style.display = 'block';
        tooltip._nodes.title.textContent = `<${hoveredElement.getAttribute('data-acl-component')}>`;
        tooltip._nodes.status.textContent = isComponentLoading(hoveredElement) ? 'Loading...' : 'Ready';
        tooltip._nodes.status.style.color = isComponentLoading(hoveredElement) ? '#fbbf24' : '#4ade80';
        if (hoveredElement._perf && hoveredElement._perf.duration) {
            const time = hoveredElement._perf.duration.toFixed(1);
            tooltip._nodes.perf.textContent = `Load: ${time}ms`;
            tooltip._nodes.perf.style.color = time > 100 ? '#f87171' : '#94a3b8';
            tooltip._nodes.perf.style.display = 'block';
        } else {
            tooltip._nodes.perf.style.display = 'none';
        }
        const debug = hoveredElement._aclDebug || {}, dataInfo = debug.dataUrl && typeof loaderClass.getDataCacheInfo === 'function' ? loaderClass.getDataCacheInfo(debug.dataUrl) : null;
        tooltip._nodes.meta.textContent = [
            `Template cache: ${formatCacheState(debug.templateCacheHit)}`,
            `Data cache: ${formatCacheState(debug.dataCacheHit)}`,
            debug.dataUrl ? `Data URL: ${debug.dataUrl}` : null,
            dataInfo ? `Data cache size: ${loaderClass.getDataCacheInfo().size}` : null
        ].filter(Boolean).join('\n');
        // Guard the update tooltip operation against runtime failures
        try {
            tooltip._nodes.props.textContent = JSON.stringify(hoveredElement.$props, null, 2);
        } catch  {
            tooltip._nodes.props.textContent = '[unserializable props]';
        }
        const offset = 15, tRect = tooltip.getBoundingClientRect(), winW = window.innerWidth, winH = window.innerHeight;
        let left = mouseX + offset, top = mouseY + offset;
        if (left + tRect.width > winW) left = mouseX - tRect.width - offset;
        if (top + tRect.height > winH) top = mouseY - tRect.height - offset;
        if (left < 0) left = offset;
        if (top < 0) top = offset;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    };
    // Refresh the floating inspector list only when the live component set changes
    const renderComponentList = ()=>{
        if (componentsDirty) refreshComponents();
        const selected = getSelectedElement(), query = panel._nodes.search.value.trim().toLowerCase(), status = panel._nodes.status.value, listedComponents = components.filter((element)=>{
            // Select matching items
            const debug = element._aclDebug || {}, matchesQuery = !query || [
                element.localName,
                element._state,
                debug.source,
                element.$props?.$error
            ].some(// Check the current item
            (value)=>String(value || '').toLowerCase().includes(query));
            if (!matchesQuery) return false;
            if (status === 'loading') return isComponentLoading(element);
            if (status === 'ready') return element._state === 'ready';
            if (status === 'error') return Boolean(element.$props?.$error);
            if (status === 'a11y') return Boolean(a11yResults.get(element)?.violations?.length);
            return true;
        }), listKey = `${query}:${status}:` + listedComponents.map(// Transform the current item
        (el)=>[
                getComponentId(el),
                el.localName,
                isComponentLoading(el) ? '1' : '0',
                el === selected ? 'selected' : ''
            ].join(':')).join('|');
        if (listKey === renderedListKey) {
            if (revealSelectedInList) {
                const button = selectedComponentId ? panel._nodes.list.querySelector(`button[data-acl-debug-id="${selectedComponentId}"]`) : null;
                scrollListItemIntoView(button);
                revealSelectedInList = false;
            }
            return;
        }
        const listScrollTop = panel._nodes.list.scrollTop, virtualized = listedComponents.length > VIRTUAL_LIST_THRESHOLD, overscan = 8, visibleRows = Math.max(12, Math.ceil(panel._nodes.list.clientHeight / VIRTUAL_LIST_ROW_HEIGHT)), selectedIndex = selected ? listedComponents.indexOf(selected) : -1;
        let startIndex = virtualized ? Math.max(0, Math.floor(listScrollTop / VIRTUAL_LIST_ROW_HEIGHT) - overscan) : 0, endIndex = virtualized ? Math.min(listedComponents.length, startIndex + visibleRows + overscan * 2) : listedComponents.length;
        if (revealSelectedInList && virtualized && selectedIndex >= 0 && (selectedIndex < startIndex || selectedIndex >= endIndex)) {
            panel._nodes.list.scrollTop = Math.max(0, selectedIndex * VIRTUAL_LIST_ROW_HEIGHT);
            startIndex = Math.max(0, selectedIndex - overscan);
            endIndex = Math.min(listedComponents.length, startIndex + visibleRows + overscan * 2);
        }
        let selectedButton = null;
        panel._nodes.list.replaceChildren();
        if (virtualized && startIndex > 0) {
            const spacer = document.createElement('div');
            spacer.style.height = `${startIndex * VIRTUAL_LIST_ROW_HEIGHT}px`;
            spacer.setAttribute('aria-hidden', 'true');
            panel._nodes.list.appendChild(spacer);
        }
        listedComponents.slice(startIndex, endIndex).forEach((el, offset)=>{
            // Process the current item
            const index = startIndex + offset, id = getComponentId(el), button = document.createElement('button');
            button.type = 'button';
            button.dataset.aclDebugId = id;
            button.textContent = `${index + 1}. <${el.localName}> ${isComponentLoading(el) ? '(loading)' : ''}`;
            button.style.cssText = toCssString({
                ...debuggerCss.button,
                textAlign: 'left',
                background: el === selected ? '#1d4ed8' : '#111827',
                borderColor: el === selected ? debuggerCss.overlayBoxesColors.selected : '#4b5563'
            });
            if (el === selected) selectedButton = button;
            panel._nodes.list.appendChild(button);
        });
        if (virtualized && endIndex < listedComponents.length) {
            const spacer = document.createElement('div');
            spacer.style.height = `${(listedComponents.length - endIndex) * VIRTUAL_LIST_ROW_HEIGHT}px`;
            spacer.setAttribute('aria-hidden', 'true');
            panel._nodes.list.appendChild(spacer);
        }
        panel._nodes.list.scrollTop = listScrollTop;
        if (revealSelectedInList) {
            scrollListItemIntoView(selectedButton);
            revealSelectedInList = false;
        }
        renderedListKey = listKey;
    };
    // Update selected component metadata, props, content, and action buttons
    const renderPanelDetails = ()=>{
        if (componentsDirty) refreshComponents();
        const selected = getSelectedElement(), dataInfo = typeof loaderClass.getDataCacheInfo === 'function' ? loaderClass.getDataCacheInfo() : {
            size: 0,
            keys: []
        }, registered = typeof loaderClass.getRegisteredTags === 'function' ? loaderClass.getRegisteredTags() : [];
        panel._nodes.summary.textContent = [
            `Live components: ${components.length}`,
            `Registered: ${registered.length}`,
            `Data cache entries: ${dataInfo?.size ?? 0}`
        ].join('\n');
        panel._nodes.timeline.textContent = timeline.length ? timeline.slice(-30).map(// Transform the current item
        (entry)=>`${entry.time} ${entry.type} <${entry.tag}>${entry.code ? ` ${entry.code}` : ''}`).join('\n') : 'No lifecycle events recorded.';
        panel._nodes.requests.textContent = requestActivity.length ? requestActivity.slice(-30).map(// Transform the current item
        (entry)=>`${entry.time} ${entry.type} ${entry.phase || ''} ${entry.source || ''}${entry.reason ? ` (${entry.reason})` : ''}`).join('\n') : 'No request activity recorded.';
        if (!selected) {
            panel._nodes.meta.textContent = 'Select a component from the list.';
            panel._nodes.props.textContent = '';
            panel._nodes.content.textContent = '';
            panel._nodes.a11y.textContent = 'Select a component to inspect accessibility results.';
            panel._nodes.scroll.disabled = true;
            panel._nodes.reload.disabled = true;
            panel._nodes.clear.disabled = true;
            panel._nodes.snapshot.disabled = true;
            panel._nodes.diff.disabled = true;
            panelDirty = false;
            return;
        }
        const debug = selected._aclDebug || {}, selectedDataInfo = debug.dataUrl && typeof loaderClass.getDataCacheInfo === 'function' ? loaderClass.getDataCacheInfo(debug.dataUrl) : null;
        panel._nodes.meta.textContent = [
            `Selected: <${selected.localName}>`,
            `State: ${selected._state}`,
            `Template cache: ${formatCacheState(debug.templateCacheHit)}`,
            `Data cache: ${formatCacheState(debug.dataCacheHit)}`,
            debug.dataCacheStrategy ? `Data strategy: ${debug.dataCacheStrategy}` : null,
            debug.dataTarget ? `Data target: ${debug.dataTarget}` : null,
            debug.dataUrl ? `Data URL: ${debug.dataUrl}` : null,
            selectedDataInfo ? `Subscribers: ${selectedDataInfo.subscribers}` : null
        ].filter(Boolean).join('\n');
        // Guard the render panel details operation against runtime failures
        try {
            panel._nodes.props.textContent = JSON.stringify(selected.$props, null, 2);
        } catch  {
            panel._nodes.props.textContent = '[unserializable props]';
        }
        panel._nodes.content.textContent = getElementContentSnapshot(selected);
        const selectedA11y = a11yResults.get(selected);
        panel._nodes.a11y.textContent = selectedA11y ? selectedA11y.violations.length ? selectedA11y.violations.map(// Transform the current item
        (item)=>`${item.severity} ${item.rule} ${item.selector}\n${item.remediation}`).join('\n\n') : `No violations (${selectedA11y.duration.toFixed(1)}ms).` : 'No accessibility audit recorded.';
        panel._nodes.scroll.disabled = !selected;
        panel._nodes.reload.disabled = typeof selected.reload !== 'function';
        panel._nodes.clear.disabled = !selected.$props?.$cache;
        panel._nodes.snapshot.disabled = false;
        panel._nodes.diff.disabled = snapshots.filter(// Select matching items
        (item)=>item.componentId === selectedComponentId).length < 2;
        panelDirty = false;
    };
    // Render both panel regions immediately for direct user actions
    const renderPanel = ()=>{
        renderComponentList();
        renderPanelDetails();
    };
    // Render once when observers or user input mark state dirty
    const renderFrame = ()=>{
        if (!active || !loaderClass.globalConfig.debug) return;
        if (layoutDirty) {
            updateOverlays();
            layoutDirty = false;
        }
        updateTooltip();
        renderComponentList();
        if (panelDirty) renderPanelDetails();
    };
    // Identify debugger-owned DOM so its own mutations do not trigger render loops
    const isDebuggerNode = (node)=>{
        const el = node?.nodeType === 1 ? node : node?.parentElement;
        return Boolean(el && (el.dataset?.aclDebugUi === 'true' || el.hasAttribute?.('data-acl-debug-id') || el === panel || el === tooltip || el === overlayContainer || panel.contains(el) || tooltip.contains(el) || overlayContainer.contains(el)));
    };
    // Refresh components only when application DOM, rather than debugger UI, changes
    const mutationObserver = new MutationObserver((mutations)=>{
        // Process observed DOM mutations
        const onlyDebuggerUiChanged = mutations.every(// Check every item
        (mutation)=>isDebuggerNode(mutation.target));
        if (!onlyDebuggerUiChanged) markDirty();
    });
    // Recompute overlay geometry after a tracked component changes size
    const resizeObserver = new ResizeObserver(()=>{
        // Process observed size changes
        layoutDirty = true;
        scheduleRender();
    });
    // Recompute overlay geometry when a tracked component enters or leaves view
    const intersectionObserver = new IntersectionObserver(()=>{
        // Process intersection changes
        layoutDirty = true;
        scheduleRender();
    });
    // Record a bounded, redacted lifecycle entry and schedule panel refresh
    const onLifecycleEvent = (event)=>{
        const target = event.composedPath?.().find(// Run the target operation
        (node)=>node?.nodeType === 1 && node.hasAttribute?.('data-acl-component')) || event.target;
        pushBoundedRecord(timeline, {
            time: new Date().toISOString().slice(11, 23),
            type: event.type.slice(4),
            tag: target?.localName || 'unknown',
            code: event.detail?.error?.code || event.detail?.code || '',
            detail: redactDiagnostics(event.detail || {})
        }, MAX_TIMELINE_ENTRIES);
        if (event.type === 'acl:a11y' && target?.nodeType === 1) a11yResults.set(target, redactDiagnostics(event.detail || {
            violations: []
        }));
        if ([
            'acl:loadstart',
            'acl:loadend',
            'acl:cachehit',
            'acl:cacheevict',
            'acl:revalidated'
        ].includes(event.type)) {
            pushBoundedRecord(requestActivity, {
                time: new Date().toISOString().slice(11, 23),
                type: event.type.slice(4),
                phase: event.detail?.phase || '',
                source: redactUrl(event.detail?.source || event.detail?.url || ''),
                reason: event.detail?.reason || '',
                duration: event.detail?.duration || null
            }, MAX_TIMELINE_ENTRIES);
        }
        panelDirty = true;
        layoutDirty = true;
        scheduleRender();
    };
    // Mark layout dirty after viewport changes
    const onViewportChange = ()=>{
        layoutDirty = true;
        scheduleRender();
    };
    // Recalculate the virtualized row window when a large list scrolls
    const onPanelListScroll = ()=>{
        if (components.length <= VIRTUAL_LIST_THRESHOLD) return;
        renderedListKey = '';
        scheduleRender();
    };
    // Select and reveal the component represented by a delegated list-row click
    const onPanelListClick = (event)=>{
        const button = event.target.closest('button[data-acl-debug-id]');
        if (!button || !panel._nodes.list.contains(button)) return;
        event.preventDefault();
        event.stopPropagation();
        const el = getComponentById(button.dataset.aclDebugId);
        if (el) selectElement(el, {
            scroll: true
        });
    };
    panel._nodes.list.addEventListener('click', onPanelListClick);
    panel._nodes.list.addEventListener('scroll', onPanelListScroll, {
        passive: true
    });
    const onFilterChange = ()=>{
        // Run the on filter change operation
        renderedListKey = '';
        panelDirty = true;
        scheduleRender();
    };
    panel._nodes.search.addEventListener('input', onFilterChange);
    panel._nodes.status.addEventListener('change', onFilterChange);
    // Reflect asynchronous action ownership in a panel button's disabled styling
    const updateButtonState = (button, isWorking)=>{
        button.disabled = isWorking;
        button.style.opacity = isWorking ? '0.65' : '1';
    };
    // Scroll the current selection into the center of the viewport
    panel._nodes.scroll.addEventListener('click', (event)=>{
        // Handle the click event
        event.preventDefault();
        event.stopPropagation();
        const selected = getActionTarget();
        if (selected) {
            selectElement(selected);
            scrollElementIntoView(selected);
        }
    });
    // Await a selected component reload while preventing duplicate panel actions
    panel._nodes.reload.addEventListener('click', async (event)=>{
        // Handle the click event
        event.preventDefault();
        event.stopPropagation();
        const selected = getActionTarget();
        if (selected && typeof selected.reload === 'function') {
            selectElement(selected);
            updateButtonState(panel._nodes.reload, true);
            // Guard the create debugger state operation against runtime failures
            try {
                await selected.reload();
            } finally{
                updateButtonState(panel._nodes.reload, false);
                markDirty();
                renderPanel();
            }
        }
    });
    // Clear both template and data cache state owned by the selected component
    panel._nodes.clear.addEventListener('click', async (event)=>{
        // Handle the click event
        event.preventDefault();
        event.stopPropagation();
        const selected = getActionTarget();
        if (selected?.$props?.$cache) {
            selectElement(selected);
            updateButtonState(panel._nodes.clear, true);
            // Guard the create debugger state operation against runtime failures
            try {
                await selected.$props.$cache.clear();
            } finally{
                updateButtonState(panel._nodes.clear, false);
                markDirty();
                renderPanel();
            }
        }
    });
    panel._nodes.snapshot.addEventListener('click', (event)=>{
        // Handle the click event
        event.preventDefault();
        event.stopPropagation();
        const selected = getActionTarget();
        if (!selected) return;
        const componentSnapshots = snapshots.filter(// Select matching items
        (item)=>item.componentId === selectedComponentId);
        snapshots.push({
            name: `${selected.localName}-${componentSnapshots.length + 1}`,
            componentId: selectedComponentId,
            snapshot: createComponentSnapshot(selected)
        });
        if (snapshots.length > MAX_TIMELINE_ENTRIES) snapshots.shift();
        panelDirty = true;
        renderPanel();
    });
    panel._nodes.diff.addEventListener('click', (event)=>{
        // Handle the click event
        event.preventDefault();
        event.stopPropagation();
        const selected = getActionTarget(), matching = snapshots.filter(// Select matching items
        (item)=>item.componentId === selectedComponentId);
        if (!selected || matching.length < 2) return;
        const before = matching[matching.length - 2], after = matching[matching.length - 1];
        panel._nodes.content.textContent = `${before.name} → ${after.name}\n\n${JSON.stringify(diffDiagnosticSnapshots(before.snapshot, after.snapshot), null, 2)}`;
    });
    // Extend the global diagnostic snapshot with debugger timeline and selection state
    const getSnapshot = ()=>({
            ...createDiagnosticSnapshot(loaderClass),
            timeline: redactDiagnostics(timeline),
            requestActivity: redactDiagnostics(requestActivity),
            snapshots: redactDiagnostics(snapshots),
            selected: selectedElement ? describeComponent(selectedElement) : null
        });
    // Download the redacted diagnostic snapshot and promptly revoke its object URL
    panel._nodes.export.addEventListener('click', (event)=>{
        // Handle the click event
        event.preventDefault();
        event.stopPropagation();
        const blob = new Blob([
            JSON.stringify(getSnapshot(), null, 2)
        ], {
            type: 'application/json'
        }), url = URL.createObjectURL(blob), anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `acl-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        anchor.click();
        setTimeout(// Run the scheduled delayed task
        ()=>URL.revokeObjectURL(url), 0);
    });
    // Route panel closure through the loader toggle so state and UI stay synchronized
    panel._nodes.close.addEventListener('click', (event)=>{
        // Handle the click event
        event.preventDefault();
        event.stopPropagation();
        if (loaderClass.globalConfig.debug) loaderClass.toggleDebug();
    });
    return {
        // Attach observers and schedule the initial debugger render
        start () {
            if (active) return;
            active = true;
            markDirty();
            panel.style.display = 'flex';
            refreshComponents();
            renderPanel();
            document.addEventListener('mousemove', onMouseMove, {
                passive: true
            });
            window.addEventListener('scroll', onViewportChange, {
                passive: true
            });
            window.addEventListener('resize', onViewportChange, {
                passive: true
            });
            ACL_EVENT_TYPES.forEach(// Process the current item
            (type)=>document.addEventListener(type, onLifecycleEvent, true));
            mutationObserver.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
            scheduleRender();
        },
        // Remove listeners and clear debugger UI state
        stop () {
            active = false;
            document.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('scroll', onViewportChange);
            window.removeEventListener('resize', onViewportChange);
            ACL_EVENT_TYPES.forEach(// Process the current item
            (type)=>document.removeEventListener(type, onLifecycleEvent, true));
            mutationObserver.disconnect();
            resizeObserver.disconnect();
            intersectionObserver.disconnect();
            if (frameId) cancelAnimationFrame(frameId);
            frameId = null;
            if (scrollFrameId != null) cancelAnimationFrame(scrollFrameId);
            scrollFrameId = null;
            hoveredElement = null;
            selectedElement = null;
            selectedComponentId = null;
            components = [];
            componentIds = new WeakMap();
            componentIdCounter = 1;
            componentsDirty = true;
            panelDirty = true;
            renderedListKey = '';
            overlayContainer.replaceChildren();
            panel._nodes.list.replaceChildren();
            tooltip.style.display = 'none';
            panel.style.display = 'none';
        },
        getSnapshot
    };
};
// Debugger integration that patches the loader toggle hook
export default class ACLDebugger {
    // Return the active debugger snapshot or build an equivalent one while inactive
    static getSnapshot(loaderClass) {
        return loaderClass?._debuggerState?.getSnapshot?.() || createDiagnosticSnapshot(loaderClass);
    }
    // Install the debugger toggle on the provided loader class
    static inject(loaderClass) {
        if (!loaderClass) {
            console.error('[ACLDebugger] No AlpineComponentLoader class provided to inject().');
            return;
        }
        // Replace the loader stub with the live debugger toggle
        loaderClass.toggleDebug = function() {
            // Run the deferred operation
            const active = this.globalConfig.debug = !this.globalConfig.debug;
            document.body.classList.toggle('acl-debug-active', active);
            if (!this._debuggerStatePromise) {
                const loading = importDeferredLocalModule('./runtime/debugger-panel.js').then(({ ensureDebuggerPanel })=>{
                    // Initialize debugger state after its optional panel arrives
                    if (!this._debuggerState) this._debuggerState = createDebuggerState(this, ensureDebuggerPanel);
                    return this._debuggerState;
                }).catch((error)=>{
                    // Evict failed panel imports so a later toggle can retry
                    if (this._debuggerStatePromise === loading) this._debuggerStatePromise = null;
                    throw new ACLLoadError('Unable to load the debugger panel.', {
                        code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
                        phase: 'runtime-import',
                        cause: error,
                        retryable: true
                    });
                });
                this._debuggerStatePromise = loading;
            }
            const toggled = this._debuggerStatePromise.then((state)=>{
                // Apply the latest toggle state after deferred initialization
                if (this.globalConfig.debug) state.start();
                else state.stop();
            });
            void toggled.catch((error)=>{
                // Report ignored event-handler failures while preserving rejection for explicit callers
                this._report?.('warn', '[ACL] Failed to toggle the debugger panel.', error, {
                    phase: 'debugger'
                });
            });
            return toggled;
        };
    }
}
