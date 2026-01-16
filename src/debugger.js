/**
 * @license ACLDebugger
 *
 * Copyright (c) LTDev LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// CSS for debugger
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
        display: 'none',
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
        border: '4px solid #22c55e',
        boxSizing: 'border-box',
    }
};

// Helper to convert JS style objects to CSS strings
const toCssString = (styleObj) => {
    return Object.entries(styleObj)
        .map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${v}`)
        .join(';');
};

// Debugger class to inject into the AlpineComponentLoader class
export default class ACLDebugger {
    static inject(loaderClass) {
        if (!loaderClass) {
            console.error('[ACLDebugger] No ComponentLoader class provided to inject().');
            return;
        }

        // Overwrite the stub method with the real implementation
        loaderClass.toggleDebug = function () {
            const active = (this.globalConfig.debug = !this.globalConfig.debug);
            document.body.classList.toggle('acl-debug-active', active);

            // Create the tooltip element if it doesn't exist
            let tooltip = document.getElementById('acl-debug-tooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.id = 'acl-debug-tooltip';
                tooltip.style.cssText = toCssString(debuggerCss.tooltip);

                // Title
                const titleNode = document.createElement('strong');
                titleNode.style.color = '#4ade80';

                // Title separator
                const hr = document.createElement('div');
                hr.style.margin = '4px 0';
                hr.style.borderBottom = '1px solid #374151';

                // Status info
                const statusNode = document.createElement('div');

                // Prop info
                const propsNode = document.createElement('pre');
                propsNode.style.cssText = 'margin: 4px 0 0 0; opacity: 0.8;';

                // Append once
                tooltip.append(titleNode, hr, statusNode, propsNode);

                // Save references for fast updates
                tooltip._nodes = { title: titleNode, status: statusNode, props: propsNode };

                // Append to body
                document.body.appendChild(tooltip);
            }

            // Create the overlay container if it doesn't exist
            let overlayContainer = document.getElementById('acl-debug-overlays');
            if (!overlayContainer) {
                overlayContainer = document.createElement('div');
                overlayContainer.id = 'acl-debug-overlays';
                overlayContainer.style.cssText = toCssString(debuggerCss.overlay);
                document.body.appendChild(overlayContainer);
            }

            // State management, tracking hovered component + mouse position
            let mouseX = 0,
                mouseY = 0,
                hoveredElement = null;

            // Lightweight mouse listener for finding hovered component + mouse position
            const onMouseMove = (e) => {
                mouseX = e.clientX;
                mouseY = e.clientY;

                // Find hovered component (handling Shadow DOM)
                hoveredElement = (e.composedPath() || []).find(node => node.nodeType === 1 && node.hasAttribute('data-acl-component'));
            };

            // If active, start debugging!
            if (active) {
                document.addEventListener('mousemove', onMouseMove, { passive: true });

                // Render loop, with throttling, handles overlay + tooltip
                const renderLoop = () => {
                    if (!AlpineComponentLoader.globalConfig.debug) {
                        overlayContainer.replaceChildren(); // Cleanup
                        tooltip.style.display = 'none';
                        document.removeEventListener('mousemove', onMouseMove);
                        return;
                    }

                    // Overlay logic (DOM Pooling) for component positions
                    const components = document.querySelectorAll('[data-acl-component]'),
                        children = overlayContainer.children;
                    let usedBoxCount = 0;

                    // Measure all components recursively to find visible areas
                    components.forEach((el) => {
                        let rect = el.getBoundingClientRect();

                        // Attempt to find visible area of children for collapsed elements
                        if (rect.width === 0 && rect.height === 0) {
                            const nodes = el.shadowRoot ? el.shadowRoot.children : el.children;
                            if (nodes.length > 0) {
                                let minX = Infinity,
                                    minY = Infinity,
                                    maxX = -Infinity,
                                    maxY = -Infinity,
                                    found = false;

                                // Measure children recursively until we find a valid visible area
                                for (const child of nodes) {
                                    const cRect = child.getBoundingClientRect();
                                    if (cRect.width > 0 || cRect.height > 0) {
                                        found = true;
                                        minX = Math.min(minX, cRect.left);
                                        minY = Math.min(minY, cRect.top);
                                        maxX = Math.max(maxX, cRect.right);
                                        maxY = Math.max(maxY, cRect.bottom);
                                    }
                                }

                                // Found a valid visible area, use it
                                if (found)
                                    rect = {
                                        left: minX,
                                        top: minY,
                                        width: maxX - minX,
                                        height: maxY - minY
                                    };
                            }
                        }

                        // Only draw if we have a valid visible area
                        if (rect.width > 0 && rect.height > 0 &&
                            rect.top < window.innerHeight &&
                            rect.left < window.innerWidth &&
                            (rect.top + rect.height) > 0 &&
                            (rect.left + rect.width) > 0
                        ) {
                            // Reuse existing box or create new one
                            let box = children[usedBoxCount];
                            if (!box) {
                                box = document.createElement('div');
                                box.style.cssText = toCssString(debuggerCss.overlayBoxes);
                                overlayContainer.appendChild(box);
                            }

                            // Fast style update
                            box.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
                            box.style.width = `${rect.width}px`;
                            box.style.height = `${rect.height}px`;
                            box.style.display = 'block'; // Ensure it's visible

                            // Count the used boxes
                            usedBoxCount++;
                        }
                    });

                    // Hide unused boxes in the pool
                    for (let i = usedBoxCount; i < children.length; i++)
                        children[i].style.display = 'none';

                    // Tooltip logic, apply position + content
                    if (hoveredElement) {
                        tooltip.style.display = 'block';

                        // Content Update
                        tooltip._nodes.title.textContent = `<${hoveredElement.getAttribute('data-acl-component')}>`;
                        tooltip._nodes.status.textContent = hoveredElement._loading ? 'Loading...' : 'Ready';
                        tooltip._nodes.status.style.color = hoveredElement._loading ? '#fbbf24' : '#4ade80';

                        // Display all props
                        tooltip._nodes.props.textContent = JSON.stringify(hoveredElement.$props, null, 2);

                        // Base position information
                        const offset = 15,
                            tRect = tooltip.getBoundingClientRect(),
                            winW = window.innerWidth,
                            winH = window.innerHeight;

                        // Initial positioning
                        let left = mouseX + offset,
                            top = mouseY + offset;

                        // Keep tooltip on screen within offset
                        if (left + tRect.width > winW)
                            left = mouseX - tRect.width - offset;
                        if (top + tRect.height > winH)
                            top = mouseY - tRect.height - offset;
                        if (left < 0)
                            left = offset;
                        if (top < 0)
                            top = offset;

                        // Update position
                        tooltip.style.left = `${left}px`;
                        tooltip.style.top = `${top}px`;
                    } else {
                        tooltip.style.display = 'none';
                    }
                    requestAnimationFrame(renderLoop);
                };
                requestAnimationFrame(renderLoop);
            }
        }
    }
}