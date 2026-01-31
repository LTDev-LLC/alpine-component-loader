function _array_like_to_array(arr, len) {
    if (len == null || len > arr.length) len = arr.length;
    for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
    return arr2;
}
function _array_with_holes(arr) {
    if (Array.isArray(arr)) return arr;
}
function _class_call_check(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
    }
}
function _defineProperties(target, props) {
    for(var i = 0; i < props.length; i++){
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
    }
}
function _create_class(Constructor, protoProps, staticProps) {
    if (protoProps) _defineProperties(Constructor.prototype, protoProps);
    if (staticProps) _defineProperties(Constructor, staticProps);
    return Constructor;
}
function _iterable_to_array_limit(arr, i) {
    var _i = arr == null ? null : typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"];
    if (_i == null) return;
    var _arr = [];
    var _n = true;
    var _d = false;
    var _s, _e;
    try {
        for(_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true){
            _arr.push(_s.value);
            if (i && _arr.length === i) break;
        }
    } catch (err) {
        _d = true;
        _e = err;
    } finally{
        try {
            if (!_n && _i["return"] != null) _i["return"]();
        } finally{
            if (_d) throw _e;
        }
    }
    return _arr;
}
function _non_iterable_rest() {
    throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _sliced_to_array(arr, i) {
    return _array_with_holes(arr) || _iterable_to_array_limit(arr, i) || _unsupported_iterable_to_array(arr, i) || _non_iterable_rest();
}
function _unsupported_iterable_to_array(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return _array_like_to_array(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(n);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _array_like_to_array(o, minLen);
}
/**
 * @license ACLDebugger
 *
 * Copyright (c) LTDev LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ // CSS for debugger
var debuggerCss = {
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
        update: '#fbbf24'
    }
};
// Helper to convert JS style objects to CSS strings
var toCssString = function toCssString(styleObj) {
    return Object.entries(styleObj).map(function(param) {
        var _param = _sliced_to_array(param, 2), k = _param[0], v = _param[1];
        return "".concat(k.replace(/[A-Z]/g, function(m) {
            return "-".concat(m.toLowerCase());
        }), ":").concat(v);
    }).join(';');
};
var ACLDebugger = /*#__PURE__*/ function() {
    "use strict";
    function ACLDebugger() {
        _class_call_check(this, ACLDebugger);
    }
    _create_class(ACLDebugger, null, [
        {
            key: "inject",
            value: function inject(loaderClass) {
                if (!loaderClass) {
                    console.error('[ACLDebugger] No ComponentLoader class provided to inject().');
                    return;
                }
                // Overwrite the stub method with the real implementation
                loaderClass.toggleDebug = function() {
                    var active = this.globalConfig.debug = !this.globalConfig.debug;
                    document.body.classList.toggle('acl-debug-active', active);
                    // Create the tooltip element if it doesn't exist
                    var tooltip = document.getElementById('acl-debug-tooltip');
                    if (!tooltip) {
                        tooltip = document.createElement('div');
                        tooltip.id = 'acl-debug-tooltip';
                        tooltip.style.cssText = toCssString(debuggerCss.tooltip);
                        // Title
                        var titleNode = document.createElement('strong');
                        titleNode.style.color = '#4ade80';
                        // Title separator
                        var hr = document.createElement('div');
                        hr.style.margin = '4px 0';
                        hr.style.borderBottom = '1px solid #374151';
                        // Status info
                        var statusNode = document.createElement('div');
                        // Performance info
                        var perfNode = document.createElement('div');
                        perfNode.style.marginTop = '2px';
                        perfNode.style.fontSize = '0.9em';
                        // Prop info
                        var propsNode = document.createElement('pre');
                        propsNode.style.cssText = 'margin: 4px 0 0 0; opacity: 0.8;';
                        // Append once
                        tooltip.append(titleNode, hr, statusNode, perfNode, propsNode);
                        // Save references for fast updates
                        tooltip._nodes = {
                            title: titleNode,
                            status: statusNode,
                            perf: perfNode,
                            props: propsNode
                        };
                        // Append to body
                        document.body.appendChild(tooltip);
                    }
                    // Create the overlay container if it doesn't exist
                    var overlayContainer = document.getElementById('acl-debug-overlays');
                    if (!overlayContainer) {
                        overlayContainer = document.createElement('div');
                        overlayContainer.id = 'acl-debug-overlays';
                        overlayContainer.style.cssText = toCssString(debuggerCss.overlay);
                        document.body.appendChild(overlayContainer);
                    }
                    // State management, tracking hovered component + mouse position
                    var mouseX = 0, mouseY = 0, hoveredElement = null;
                    // Lightweight mouse listener for finding hovered component + mouse position
                    var onMouseMove = function onMouseMove(e) {
                        mouseX = e.clientX;
                        mouseY = e.clientY;
                        // Find hovered component (handling Shadow DOM)
                        hoveredElement = (e.composedPath() || []).find(function(node) {
                            return node.nodeType === 1 && node.hasAttribute('data-acl-component');
                        });
                    };
                    // If active, start debugging!
                    if (active) {
                        document.addEventListener('mousemove', onMouseMove, {
                            passive: true
                        });
                        // Render loop, with throttling, handles overlay + tooltip
                        var renderLoop = function renderLoop1() {
                            if (!AlpineComponentLoader.globalConfig.debug) {
                                overlayContainer.replaceChildren(); // Cleanup
                                tooltip.style.display = 'none';
                                document.removeEventListener('mousemove', onMouseMove);
                                return;
                            }
                            // Overlay logic (DOM Pooling) for component positions
                            var components = document.querySelectorAll('[data-acl-component]'), children = overlayContainer.children;
                            var usedBoxCount = 0;
                            // Measure all components recursively to find visible areas
                            components.forEach(function(el) {
                                var rect = el.getBoundingClientRect();
                                // Attempt to find visible area of children for collapsed elements
                                if (rect.width === 0 && rect.height === 0) {
                                    var nodes = el.shadowRoot ? el.shadowRoot.children : el.children;
                                    if (nodes.length > 0) {
                                        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, found = false;
                                        var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                                        try {
                                            // Measure children recursively until we find a valid visible area
                                            for(var _iterator = nodes[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                                                var child = _step.value;
                                                var cRect = child.getBoundingClientRect();
                                                if (cRect.width > 0 || cRect.height > 0) {
                                                    found = true;
                                                    minX = Math.min(minX, cRect.left);
                                                    minY = Math.min(minY, cRect.top);
                                                    maxX = Math.max(maxX, cRect.right);
                                                    maxY = Math.max(maxY, cRect.bottom);
                                                }
                                            }
                                        } catch (err) {
                                            _didIteratorError = true;
                                            _iteratorError = err;
                                        } finally{
                                            try {
                                                if (!_iteratorNormalCompletion && _iterator.return != null) {
                                                    _iterator.return();
                                                }
                                            } finally{
                                                if (_didIteratorError) {
                                                    throw _iteratorError;
                                                }
                                            }
                                        }
                                        // Found a valid visible area, use it
                                        if (found) rect = {
                                            left: minX,
                                            top: minY,
                                            width: maxX - minX,
                                            height: maxY - minY
                                        };
                                    }
                                }
                                // Only draw if we have a valid visible area
                                if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth && rect.top + rect.height > 0 && rect.left + rect.width > 0) {
                                    var _el_$props;
                                    // Reuse existing box or create new one
                                    var box = children[usedBoxCount];
                                    if (!box) {
                                        box = document.createElement('div');
                                        box.style.cssText = toCssString(debuggerCss.overlayBoxes);
                                        overlayContainer.appendChild(box);
                                    }
                                    // Fast style update
                                    box.style.transform = "translate(".concat(rect.left, "px, ").concat(rect.top, "px)");
                                    box.style.width = "".concat(rect.width, "px");
                                    box.style.height = "".concat(rect.height, "px");
                                    box.style.display = 'block'; // Ensure it's visible
                                    // Flash border color when updated
                                    box.style.borderColor = debuggerCss.overlayBoxesColors[((_el_$props = el.$props) === null || _el_$props === void 0 ? void 0 : _el_$props.$lastUpdated) && Date.now() - el.$props.$lastUpdated < 1000 ? 'update' : 'default'];
                                    // Count the used boxes
                                    usedBoxCount++;
                                }
                            });
                            // Hide unused boxes in the pool
                            for(var i = usedBoxCount; i < children.length; i++)children[i].style.display = 'none';
                            // Tooltip logic, apply position + content
                            if (hoveredElement) {
                                tooltip.style.display = 'block';
                                // Content Update
                                tooltip._nodes.title.textContent = "<".concat(hoveredElement.getAttribute('data-acl-component'), ">");
                                tooltip._nodes.status.textContent = hoveredElement._loading ? 'Loading...' : 'Ready';
                                tooltip._nodes.status.style.color = hoveredElement._loading ? '#fbbf24' : '#4ade80';
                                // Display perf metrics
                                if (hoveredElement._perf && hoveredElement._perf.duration) {
                                    var time = hoveredElement._perf.duration.toFixed(1);
                                    tooltip._nodes.perf.textContent = "Load: ".concat(time, "ms");
                                    tooltip._nodes.perf.style.color = time > 100 ? '#f87171' : '#94a3b8';
                                    tooltip._nodes.perf.style.display = 'block';
                                } else {
                                    tooltip._nodes.perf.style.display = 'none';
                                }
                                // Display all props
                                tooltip._nodes.props.textContent = JSON.stringify(hoveredElement.$props, null, 2);
                                // Base position information
                                var offset = 15, tRect = tooltip.getBoundingClientRect(), winW = window.innerWidth, winH = window.innerHeight;
                                // Initial positioning
                                var left = mouseX + offset, top = mouseY + offset;
                                // Keep tooltip on screen within offset
                                if (left + tRect.width > winW) left = mouseX - tRect.width - offset;
                                if (top + tRect.height > winH) top = mouseY - tRect.height - offset;
                                if (left < 0) left = offset;
                                if (top < 0) top = offset;
                                // Update position
                                tooltip.style.left = "".concat(left, "px");
                                tooltip.style.top = "".concat(top, "px");
                            } else {
                                tooltip.style.display = 'none';
                            }
                            requestAnimationFrame(renderLoop);
                        };
                        requestAnimationFrame(renderLoop);
                    }
                };
            }
        }
    ]);
    return ACLDebugger;
}();
// Debugger class to inject into the AlpineComponentLoader class
export { ACLDebugger as default };


//# sourceMappingURL=ACLDebugger.js.map