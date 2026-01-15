function _array_like_to_array(arr, len) {
    if (len == null || len > arr.length) len = arr.length;
    for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
    return arr2;
}
function _array_with_holes(arr) {
    if (Array.isArray(arr)) return arr;
}
function _array_without_holes(arr) {
    if (Array.isArray(arr)) return _array_like_to_array(arr);
}
function _assert_this_initialized(self) {
    if (self === void 0) {
        throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    }
    return self;
}
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
    try {
        var info = gen[key](arg);
        var value = info.value;
    } catch (error) {
        reject(error);
        return;
    }
    if (info.done) {
        resolve(value);
    } else {
        Promise.resolve(value).then(_next, _throw);
    }
}
function _async_to_generator(fn) {
    return function() {
        var self = this, args = arguments;
        return new Promise(function(resolve, reject) {
            var gen = fn.apply(self, args);
            function _next(value) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
            }
            function _throw(err) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
            }
            _next(undefined);
        });
    };
}
function _call_super(_this, derived, args) {
    derived = _get_prototype_of(derived);
    return _possible_constructor_return(_this, _is_native_reflect_construct() ? Reflect.construct(derived, args || [], _get_prototype_of(_this).constructor) : derived.apply(_this, args));
}
function _class_call_check(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
    }
}
function _construct(Parent, args, Class) {
    if (_is_native_reflect_construct()) {
        _construct = Reflect.construct;
    } else {
        _construct = function construct(Parent, args, Class) {
            var a = [
                null
            ];
            a.push.apply(a, args);
            var Constructor = Function.bind.apply(Parent, a);
            var instance = new Constructor();
            if (Class) _set_prototype_of(instance, Class.prototype);
            return instance;
        };
    }
    return _construct.apply(null, arguments);
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
function _define_property(obj, key, value) {
    if (key in obj) {
        Object.defineProperty(obj, key, {
            value: value,
            enumerable: true,
            configurable: true,
            writable: true
        });
    } else {
        obj[key] = value;
    }
    return obj;
}
function _get_prototype_of(o) {
    _get_prototype_of = Object.setPrototypeOf ? Object.getPrototypeOf : function getPrototypeOf(o) {
        return o.__proto__ || Object.getPrototypeOf(o);
    };
    return _get_prototype_of(o);
}
function _inherits(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
        throw new TypeError("Super expression must either be null or a function");
    }
    subClass.prototype = Object.create(superClass && superClass.prototype, {
        constructor: {
            value: subClass,
            writable: true,
            configurable: true
        }
    });
    if (superClass) _set_prototype_of(subClass, superClass);
}
function _instanceof(left, right) {
    if (right != null && typeof Symbol !== "undefined" && right[Symbol.hasInstance]) {
        return !!right[Symbol.hasInstance](left);
    } else {
        return left instanceof right;
    }
}
function _is_native_function(fn) {
    return Function.toString.call(fn).indexOf("[native code]") !== -1;
}
function _iterable_to_array(iter) {
    if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) return Array.from(iter);
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
function _non_iterable_spread() {
    throw new TypeError("Invalid attempt to spread non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _object_spread(target) {
    for(var i = 1; i < arguments.length; i++){
        var source = arguments[i] != null ? arguments[i] : {};
        var ownKeys = Object.keys(source);
        if (typeof Object.getOwnPropertySymbols === "function") {
            ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function(sym) {
                return Object.getOwnPropertyDescriptor(source, sym).enumerable;
            }));
        }
        ownKeys.forEach(function(key) {
            _define_property(target, key, source[key]);
        });
    }
    return target;
}
function ownKeys(object, enumerableOnly) {
    var keys = Object.keys(object);
    if (Object.getOwnPropertySymbols) {
        var symbols = Object.getOwnPropertySymbols(object);
        if (enumerableOnly) {
            symbols = symbols.filter(function(sym) {
                return Object.getOwnPropertyDescriptor(object, sym).enumerable;
            });
        }
        keys.push.apply(keys, symbols);
    }
    return keys;
}
function _object_spread_props(target, source) {
    source = source != null ? source : {};
    if (Object.getOwnPropertyDescriptors) {
        Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
    } else {
        ownKeys(Object(source)).forEach(function(key) {
            Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
        });
    }
    return target;
}
function _possible_constructor_return(self, call) {
    if (call && (_type_of(call) === "object" || typeof call === "function")) {
        return call;
    }
    return _assert_this_initialized(self);
}
function _set_prototype_of(o, p) {
    _set_prototype_of = Object.setPrototypeOf || function setPrototypeOf(o, p) {
        o.__proto__ = p;
        return o;
    };
    return _set_prototype_of(o, p);
}
function _sliced_to_array(arr, i) {
    return _array_with_holes(arr) || _iterable_to_array_limit(arr, i) || _unsupported_iterable_to_array(arr, i) || _non_iterable_rest();
}
function _to_consumable_array(arr) {
    return _array_without_holes(arr) || _iterable_to_array(arr) || _unsupported_iterable_to_array(arr) || _non_iterable_spread();
}
function _type_of(obj) {
    "@swc/helpers - typeof";
    return obj && typeof Symbol !== "undefined" && obj.constructor === Symbol ? "symbol" : typeof obj;
}
function _unsupported_iterable_to_array(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return _array_like_to_array(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(n);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _array_like_to_array(o, minLen);
}
function _wrap_native_super(Class) {
    var _cache = typeof Map === "function" ? new Map() : undefined;
    _wrap_native_super = function wrapNativeSuper(Class) {
        if (Class === null || !_is_native_function(Class)) return Class;
        if (typeof Class !== "function") {
            throw new TypeError("Super expression must either be null or a function");
        }
        if (typeof _cache !== "undefined") {
            if (_cache.has(Class)) return _cache.get(Class);
            _cache.set(Class, Wrapper);
        }
        function Wrapper() {
            return _construct(Class, arguments, _get_prototype_of(this).constructor);
        }
        Wrapper.prototype = Object.create(Class.prototype, {
            constructor: {
                value: Wrapper,
                enumerable: false,
                writable: true,
                configurable: true
            }
        });
        return _set_prototype_of(Wrapper, Class);
    };
    return _wrap_native_super(Class);
}
function _is_native_reflect_construct() {
    try {
        var result = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {}));
    } catch (_) {}
    return (_is_native_reflect_construct = function() {
        return !!result;
    })();
}
function _ts_generator(thisArg, body) {
    var f, y, t, _ = {
        label: 0,
        sent: function() {
            if (t[0] & 1) throw t[1];
            return t[1];
        },
        trys: [],
        ops: []
    }, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype), d = Object.defineProperty;
    return d(g, "next", {
        value: verb(0)
    }), d(g, "throw", {
        value: verb(1)
    }), d(g, "return", {
        value: verb(2)
    }), typeof Symbol === "function" && d(g, Symbol.iterator, {
        value: function() {
            return this;
        }
    }), g;
    function verb(n) {
        return function(v) {
            return step([
                n,
                v
            ]);
        };
    }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while(g && (g = 0, op[0] && (_ = 0)), _)try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [
                op[0] & 2,
                t.value
            ];
            switch(op[0]){
                case 0:
                case 1:
                    t = op;
                    break;
                case 4:
                    _.label++;
                    return {
                        value: op[1],
                        done: false
                    };
                case 5:
                    _.label++;
                    y = op[1];
                    op = [
                        0
                    ];
                    continue;
                case 7:
                    op = _.ops.pop();
                    _.trys.pop();
                    continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
                        _ = 0;
                        continue;
                    }
                    if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
                        _.label = op[1];
                        break;
                    }
                    if (op[0] === 6 && _.label < t[1]) {
                        _.label = t[1];
                        t = op;
                        break;
                    }
                    if (t && _.label < t[2]) {
                        _.label = t[2];
                        _.ops.push(op);
                        break;
                    }
                    if (t[2]) _.ops.pop();
                    _.trys.pop();
                    continue;
            }
            op = body.call(thisArg, _);
        } catch (e) {
            op = [
                6,
                e
            ];
            y = 0;
        } finally{
            f = t = 0;
        }
        if (op[0] & 5) throw op[1];
        return {
            value: op[0] ? op[1] : void 0,
            done: true
        };
    }
}
/**
 * @license AlpineComponentLoader
 *
 * Copyright (c) LTDev LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ // Cache for constructible stylesheets (Internal styles only)
var styleSheetCache = new Map();
// Cache for External Script loading states (Prevent duplicate execution)
var scriptLoadCache = new Map();
// Type map for prop attribute definitions
var typeMap = {
    'String': String,
    'Number': Number,
    'Boolean': Boolean,
    'Array': Array,
    'Object': Object
};
// CSS for debugger
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
        border: '3px solid #22c55e',
        boxSizing: 'border-box',
        transition: 'all 0.1s ease-out'
    }
};
// Helper to convert JS style objects to CSS strings
var toCssString = function(styleObj) {
    return Object.entries(styleObj).map(function(param) {
        var _param = _sliced_to_array(param, 2), k = _param[0], v = _param[1];
        return "".concat(k.replace(/[A-Z]/g, function(m) {
            return "-".concat(m.toLowerCase());
        }), ":").concat(v);
    }).join(';');
};
var AlpineComponentLoader = /*#__PURE__*/ function() {
    "use strict";
    function AlpineComponentLoader() {
        _class_call_check(this, AlpineComponentLoader);
    }
    _create_class(AlpineComponentLoader, null, [
        {
            key: "start",
            value: // Start loading components + setup component proxy
            function start() {
                return _async_to_generator(function() {
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                if (AlpineComponentLoader._started) return [
                                    2
                                ];
                                AlpineComponentLoader._started = true;
                                // Cleanup old caches
                                return [
                                    4,
                                    AlpineComponentLoader.pruneCaches()
                                ];
                            case 1:
                                _state.sent();
                                // Register default components
                                AlpineComponentLoader.registerComponent();
                                AlpineComponentLoader.registerDynamicLoader();
                                AlpineComponentLoader.registerTemplates();
                                return [
                                    2
                                ];
                        }
                    });
                })();
            }
        },
        {
            key: "pruneCaches",
            value: // Clear caches from unmatched versions
            function pruneCaches() {
                return _async_to_generator(function() {
                    var prefix, current, _;
                    var _arguments = arguments;
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                prefix = _arguments.length > 0 && _arguments[0] !== void 0 ? _arguments[0] : AlpineComponentLoader.globalConfig._templateCachePrefix, current = _arguments.length > 1 && _arguments[1] !== void 0 ? _arguments[1] : AlpineComponentLoader.globalConfig._templateCacheKey;
                                if (!('caches' in window)) return [
                                    2
                                ];
                                _ = Promise.all;
                                return [
                                    4,
                                    caches.keys()
                                ];
                            case 1:
                                return [
                                    4,
                                    _.apply(Promise, [
                                        _state.sent().filter(function(key) {
                                            return key.startsWith(prefix);
                                        }).filter(function(key) {
                                            return key !== current;
                                        }).map(function(key) {
                                            return caches.delete(key);
                                        })
                                    ])
                                ];
                            case 2:
                                return [
                                    2,
                                    _state.sent()
                                ];
                        }
                    });
                }).apply(this, arguments);
            }
        },
        {
            key: "clearCache",
            value: // Manually clear all template caches
            function clearCache() {
                return _async_to_generator(function() {
                    var current, _;
                    var _arguments = arguments;
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                current = _arguments.length > 0 && _arguments[0] !== void 0 ? _arguments[0] : AlpineComponentLoader.globalConfig._templateCacheKey;
                                if (!('caches' in window)) {
                                    console.warn('[AlpineComponentLoader] Cache API not supported.');
                                    return [
                                        2
                                    ];
                                }
                                _ = Promise.all;
                                return [
                                    4,
                                    caches.keys()
                                ];
                            case 1:
                                return [
                                    4,
                                    _.apply(Promise, [
                                        _state.sent().filter(function(key) {
                                            return key.startsWith(current);
                                        }).map(function(key) {
                                            return caches.delete(key);
                                        })
                                    ])
                                ];
                            case 2:
                                // Clear all caches with the specified prefix
                                return [
                                    2,
                                    _state.sent()
                                ];
                        }
                    });
                }).apply(this, arguments);
            }
        },
        {
            key: "config",
            value: // Update global configuration
            function config(options) {
                Object.assign(AlpineComponentLoader.globalConfig, options);
            }
        },
        {
            key: "registerComponent",
            value: // Register default custom component
            function registerComponent() {
                var name = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : AlpineComponentLoader.globalConfig.defaultComponentName;
                if (!customElements.get(name)) customElements.define(name, AlpineDeclarativeLoader);
            }
        },
        {
            key: "registerDynamicLoader",
            value: // Register default dynamic loader
            function registerDynamicLoader() {
                var name = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : AlpineComponentLoader.globalConfig.defaultDynamicName;
                if (!customElements.get(name)) customElements.define(name, AlpineDynamicLoader);
            }
        },
        {
            key: "registerTemplates",
            value: // Auto-discover <template acl-component="name"> elements
            function registerTemplates() {
                document.querySelectorAll('template[acl-component]').forEach(function(tpl) {
                    var tagName = tpl.getAttribute('acl-component');
                    if (!tagName) return;
                    // Parse acl-props attribute as JSON
                    var config;
                    try {
                        config = {
                            attributes: Object.fromEntries(Object.entries(JSON.parse(tpl.getAttribute('acl-props') || '{}')).map(function(param) {
                                var _param = _sliced_to_array(param, 2), key = _param[0], val = _param[1];
                                return [
                                    key,
                                    (typeof val === "undefined" ? "undefined" : _type_of(val)) === 'object' && val.type ? _object_spread_props(_object_spread({}, val), {
                                        type: typeMap[val.type] || String
                                    }) : typeMap[val] || String
                                ];
                            }))
                        };
                    } catch (e) {
                        console.warn("[AlpineComponentLoader] Invalid JSON in acl-props for <".concat(tagName, ">"), e);
                    }
                    // Define the component
                    AlpineComponentLoader.define(tagName, tpl, config || {});
                });
            }
        },
        {
            key: "toggleDebug",
            value: // Toggle the built-in debugger
            function toggleDebug() {
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
                    // Prop info
                    var propsNode = document.createElement('pre');
                    propsNode.style.cssText = 'margin: 4px 0 0 0; opacity: 0.8;';
                    // Append once
                    tooltip.append(titleNode, hr, statusNode, propsNode);
                    // Save references for fast updates
                    tooltip._nodes = {
                        title: titleNode,
                        status: statusNode,
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
                var onMouseMove = function(e) {
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
                    var renderLoop = function() {
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
                            if (rect.width > 0 && rect.height > 0) {
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
            }
        },
        {
            key: "define",
            value: // Define a new component from a URL, ID, or Template element
            function define(tagName, source) {
                var config = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
                // Merge defaults, global config, and instance config
                var settings = _object_spread_props(_object_spread({
                    attributes: {},
                    loading: 'eager',
                    hooks: {
                        beforeFetch: function(opts) {
                            return opts;
                        },
                        afterFetch: function(data) {
                            return data;
                        }
                    }
                }, AlpineComponentLoader.globalConfig, config), {
                    externalCss: _to_consumable_array(AlpineComponentLoader.globalConfig.externalCss || []).concat(_to_consumable_array(config.externalCss || [])),
                    externalScripts: _to_consumable_array(AlpineComponentLoader.globalConfig.externalScripts || []).concat(_to_consumable_array(config.externalScripts || [])),
                    sharedStyleSheets: _to_consumable_array(AlpineComponentLoader.globalConfig.sharedStyleSheets || []).concat(_to_consumable_array(config.sharedStyleSheets || [])),
                    errorCss: _object_spread({}, {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        padding: '1rem',
                        border: '1px solid #fca5a5',
                        backgroundColor: '#fee2e2',
                        color: '#991b1b',
                        borderRadius: '6px',
                        fontFamily: 'sans-serif',
                        fontSize: '0.9rem'
                    }, AlpineComponentLoader.globalConfig.errorCss || {}, config.errorCss || {}),
                    forwardEvents: _to_consumable_array(AlpineComponentLoader.globalConfig.forwardEvents || []).concat(_to_consumable_array(config.forwardEvents || [])),
                    fallback: config.fallback || null,
                    persist: config.persist || false,
                    persistKey: config.persistKey || null,
                    persistDebounce: config.persistDebounce || 250,
                    bindStore: config.bindStore || null,
                    dataSrc: config.dataSrc || null,
                    fetchTimeout: config.fetchTimeout || 30000,
                    fetchOptions: config.fetchOptions || {}
                });
                // Track observed attributes internally
                var observedAttrs = _to_consumable_array(new Set(_to_consumable_array(Object.keys(settings.attributes)).concat([
                    'bind-store',
                    'data-src'
                ])));
                // Prepend base path if source is a URL string
                var contentSource = source;
                if (typeof source === 'string' && !source.startsWith('#') && settings.basePath) contentSource = settings.basePath + source;
                // Create component class
                var AlpineExternalComponent = /*#__PURE__*/ function(HTMLElement1) {
                    _inherits(AlpineExternalComponent, HTMLElement1);
                    function AlpineExternalComponent() {
                        _class_call_check(this, AlpineExternalComponent);
                        var _this;
                        _this = _call_super(this, AlpineExternalComponent);
                        // Helper to emit events via $el.$props.$emit
                        var $emit = function(name, detail) {
                            _this.dispatchEvent(new CustomEvent(name, {
                                bubbles: true,
                                composed: true,
                                detail: detail
                            }));
                        };
                        // Initialize state and attributes
                        _this._initialized = false;
                        _this._loading = false;
                        _this._disconnectTimeout = null;
                        _this._fetchAbortController = null;
                        _this.$props = window.Alpine ? window.Alpine.reactive(_object_spread({
                            $data: null,
                            $loading: false,
                            $error: null,
                            $emit: $emit
                        }, settings.attributes || {})) : {
                            data: null,
                            loading: false,
                            error: null,
                            $emit: $emit
                        };
                        _this._root = settings.shadow ? _this.attachShadow({
                            mode: 'open'
                        }) : _this;
                        _this._observer = null;
                        _this._scopeId = "scope-".concat(Math.random().toString(36).slice(2, 9));
                        _this._slotObserver = null; // Initialize observer reference
                        return _this;
                    }
                    _create_class(AlpineExternalComponent, [
                        {
                            // Reactively update props when attributes change
                            key: "attributeChangedCallback",
                            value: function attributeChangedCallback(name, oldVal, newVal) {
                                if (oldVal === newVal) return;
                                // Update prop and validate
                                if (name === 'data-src') {
                                    if (this._initialized) this._fetchData(newVal);
                                } else {
                                    this._updateProp(name, newVal);
                                }
                                // Lifecycle: Updated
                                if (this._initialized) this._triggerHook('updated', {
                                    name: name,
                                    oldVal: oldVal,
                                    newVal: newVal
                                });
                            }
                        },
                        {
                            // Initialize on insertion
                            key: "connectedCallback",
                            value: function connectedCallback() {
                                this.setAttribute('data-acl-component', this.tagName);
                                // If we are just moving nodes, the disconnect timer is still running
                                // We clear it so the component stays alive
                                if (this._disconnectTimeout) {
                                    clearTimeout(this._disconnectTimeout);
                                    this._disconnectTimeout = null;
                                    return; // It was just a move, do nothing.
                                }
                                // If kept-alive and already initialized, just reactivate
                                if (this._initialized) {
                                    this._triggerHook('activated');
                                    return;
                                }
                                // Guard against parallel loading or already initialized states
                                if (this._loading) return;
                                // Lock loading state
                                this._loading = true;
                                // Sync attributes immediately for eager loading
                                this._syncAllAttributes();
                                // Check loading mode and load
                                var loadMode = this.getAttribute('loading') || settings.loading;
                                if (loadMode === 'lazy') this._initLazyObserver();
                                else if (loadMode === 'idle') this._initIdleLoader();
                                else this._load();
                            }
                        },
                        {
                            // Cleanup memory on removal
                            key: "disconnectedCallback",
                            value: function disconnectedCallback() {
                                var _this = this;
                                // Stop observing slots
                                if (this._slotObserver) {
                                    this._slotObserver.disconnect();
                                    this._slotObserver = null;
                                }
                                // If flagged with keep-alive, skip destruction
                                if (this._isKeptAlive || this.hasAttribute('keep-alive')) {
                                    this._triggerHook('deactivated');
                                    return;
                                }
                                // Don't destroy immediately; give moves/rewrites time to reattach
                                this._disconnectTimeout = setTimeout(function() {
                                    // If we got re-attached after a slower move, abort cleanup
                                    if (_this.isConnected) {
                                        _this._disconnectTimeout = null;
                                        return;
                                    }
                                    // Lifecycle: Unmounted
                                    _this._triggerHook('unmounted');
                                    // Cancel any pending fetches
                                    if (_this._fetchAbortController) _this._fetchAbortController.abort();
                                    if (_this._observer) _this._observer.disconnect();
                                    if (_this._root && window.Alpine && _this._initialized) window.Alpine.destroyTree(_this._root);
                                    // Reset state so the component can revive if re-attached
                                    _this._initialized = false;
                                    _this._loading = false;
                                    _this._disconnectTimeout = null;
                                }, 250);
                            }
                        },
                        {
                            // intersectionObserver for lazy loading
                            key: "_initLazyObserver",
                            value: function _initLazyObserver() {
                                var _this = this;
                                var placeholder = document.createElement('div');
                                placeholder.style.minHeight = '1px';
                                this._root.appendChild(placeholder);
                                this._observer = new IntersectionObserver(function(entries) {
                                    if (entries[0].isIntersecting) {
                                        _this._load();
                                        _this._observer.disconnect();
                                        _this._observer = null; // Kill the observer reference
                                    }
                                }, {
                                    rootMargin: '100px'
                                });
                                this._observer.observe(this);
                            }
                        },
                        {
                            // Idle loading strategy
                            key: "_initIdleLoader",
                            value: function _initIdleLoader() {
                                var _this = this;
                                if ('requestIdleCallback' in window) {
                                    requestIdleCallback(function() {
                                        return _this._load();
                                    }, {
                                        timeout: 2000
                                    });
                                } else {
                                    setTimeout(function() {
                                        return _this._load();
                                    }, 200);
                                }
                            }
                        },
                        {
                            // Initialize MutationObserver for dynamic Light DOM slots
                            key: "_initSlotObserver",
                            value: function _initSlotObserver() {
                                var _this = this;
                                if (this._slotObserver) return;
                                this._slotObserver = new MutationObserver(function(mutations) {
                                    return mutations.forEach(function(mutation) {
                                        mutation.addedNodes.forEach(function(node) {
                                            // Only handle Elements and Text nodes
                                            if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) return;
                                            // Ignore the slot containers themselves if they trigger an add
                                            if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-acl-slot')) return;
                                            // Determine target slot name + find the internal slot container
                                            var slotName = (node.nodeType === Node.ELEMENT_NODE ? node.getAttribute('slot') : null) || 'default', container = _this._root.querySelector('div[data-acl-slot="'.concat(slotName, '"]'));
                                            // Move the node into the container
                                            if (container) container.appendChild(node);
                                        });
                                    });
                                });
                                // Only observe direct children additions
                                this._slotObserver.observe(this, {
                                    childList: true
                                });
                            }
                        },
                        {
                            key: "_load",
                            value: // Main load sequence
                            function _load() {
                                return _async_to_generator(function() {
                                    var _this, promises, content, lightSlots, err, fallbackSource, _, _1, fallbackErr;
                                    return _ts_generator(this, function(_state) {
                                        switch(_state.label){
                                            case 0:
                                                _this = this;
                                                _state.label = 1;
                                            case 1:
                                                _state.trys.push([
                                                    1,
                                                    5,
                                                    ,
                                                    14
                                                ]);
                                                // Lock loading state
                                                if (this._initialized) return [
                                                    2
                                                ];
                                                // Lifecycle: Before Mount
                                                this._triggerHook('beforeMount');
                                                // Load external dependencies, get content, and data if needed
                                                promises = [
                                                    settings.externalCss.length || settings.externalScripts.length ? this._loadExternalDependencies() : Promise.resolve(),
                                                    this._resolveContent(contentSource),
                                                    settings.dataSrc || this.getAttribute('data-src') ? this._fetchData(this.getAttribute('data-src') || settings.dataSrc) : Promise.resolve()
                                                ];
                                                return [
                                                    4,
                                                    Promise.all(promises)
                                                ];
                                            case 2:
                                                content = _state.sent()[1];
                                                // Capture existing children for slotting if using Light DOM
                                                lightSlots = null;
                                                if (!settings.shadow) lightSlots = this._captureLightSlots();
                                                // Strict clear of root element
                                                this._root.replaceChildren();
                                                // Inject CSS Links into Shadow (Apply Styles locally)
                                                if (settings.shadow && settings.externalCss.length) {
                                                    settings.externalCss.forEach(function(url) {
                                                        var link = document.createElement('link');
                                                        link.rel = 'stylesheet';
                                                        link.href = url;
                                                        _this._root.appendChild(link);
                                                    });
                                                }
                                                // Render content safely
                                                return [
                                                    4,
                                                    this._renderSafe(content, lightSlots)
                                                ];
                                            case 3:
                                                _state.sent();
                                                // Setup event bubbling for Shadow DOM
                                                if (settings.shadow && settings.forwardEvents.length > 0) this._setupEventForwarding();
                                                // Start observing Light DOM for dynamic updates
                                                if (!settings.shadow) this._initSlotObserver();
                                                // Initialize Alpine
                                                return [
                                                    4,
                                                    this._initAlpine()
                                                ];
                                            case 4:
                                                _state.sent();
                                                // Mark success and unlock
                                                this._initialized = true;
                                                this._loading = false;
                                                // Lifecycle: Mounted
                                                this._dispatch('mount');
                                                this._triggerHook('mounted');
                                                //Dispatch 'loaded' event
                                                this._dispatch('loaded');
                                                return [
                                                    3,
                                                    14
                                                ];
                                            case 5:
                                                err = _state.sent();
                                                console.error("[AlpineComponentLoader] <".concat(tagName, ">"), err);
                                                this._loading = false; // Unlock on error so we can retry
                                                fallbackSource = this.getAttribute('fallback') || settings.fallback;
                                                if (!fallbackSource) return [
                                                    3,
                                                    12
                                                ];
                                                _state.label = 6;
                                            case 6:
                                                _state.trys.push([
                                                    6,
                                                    10,
                                                    ,
                                                    11
                                                ]);
                                                // Clear failed state
                                                this._root.replaceChildren();
                                                _1 = (_ = this)._renderSafe;
                                                return [
                                                    4,
                                                    this._resolveContent(fallbackSource)
                                                ];
                                            case 7:
                                                // Render fallback; pass null for slots as fallback usually doesn't slot user content
                                                return [
                                                    4,
                                                    _1.apply(_, [
                                                        _state.sent(),
                                                        null
                                                    ])
                                                ];
                                            case 8:
                                                _state.sent();
                                                // Init Alpine (so fallback can be interactive)
                                                return [
                                                    4,
                                                    this._initAlpine()
                                                ];
                                            case 9:
                                                _state.sent();
                                                // Mark success and unlock
                                                this._initialized = true;
                                                // Dispatch 'loaded' event
                                                this._dispatch('loaded');
                                                // Stop here, do not render default error
                                                return [
                                                    2
                                                ];
                                            case 10:
                                                fallbackErr = _state.sent();
                                                console.error("[AlpineComponentLoader] <".concat(tagName, "> Fallback Failed:"), fallbackErr);
                                                // If fallback fails, show original error (or combined)
                                                this._renderError("Load Failed: ".concat(err.message, ". (Fallback also failed)"));
                                                return [
                                                    3,
                                                    11
                                                ];
                                            case 11:
                                                return [
                                                    3,
                                                    13
                                                ];
                                            case 12:
                                                // Standard Error Display
                                                this._renderError(err.message);
                                                _state.label = 13;
                                            case 13:
                                                return [
                                                    3,
                                                    14
                                                ];
                                            case 14:
                                                return [
                                                    2
                                                ];
                                        }
                                    });
                                }).call(this);
                            }
                        },
                        {
                            key: "_fetchData",
                            value: // Handle data fetching for APIs
                            function _fetchData(url) {
                                return _async_to_generator(function() {
                                    var _this, signal, timeoutId, _AlpineComponentLoader_globalConfig, _settings_hooks, _settings_hooks1, options, modifiedOptions, res, contentType, json, e, modified, e1, _this__fetchAbortController;
                                    return _ts_generator(this, function(_state) {
                                        switch(_state.label){
                                            case 0:
                                                _this = this;
                                                if (!url) return [
                                                    2
                                                ];
                                                // Abort previous request (Fixes Race Conditions)
                                                if (this._fetchAbortController) this._fetchAbortController.abort();
                                                this._fetchAbortController = new AbortController();
                                                signal = this._fetchAbortController.signal;
                                                // Set Loading State
                                                this.$props.$loading = true;
                                                this.$props.$error = null;
                                                // Setup Timeout
                                                timeoutId = setTimeout(function() {
                                                    return _this._fetchAbortController.abort('Timeout');
                                                }, settings.fetchTimeout);
                                                _state.label = 1;
                                            case 1:
                                                _state.trys.push([
                                                    1,
                                                    11,
                                                    12,
                                                    13
                                                ]);
                                                // Prepare Options
                                                options = _object_spread_props(_object_spread({
                                                    method: 'GET',
                                                    headers: {
                                                        'Accept': 'application/json'
                                                    }
                                                }, ((_AlpineComponentLoader_globalConfig = AlpineComponentLoader.globalConfig) === null || _AlpineComponentLoader_globalConfig === void 0 ? void 0 : _AlpineComponentLoader_globalConfig.fetchOptions) || {}, (settings === null || settings === void 0 ? void 0 : settings.fetchOptions) || {}), {
                                                    signal: signal
                                                });
                                                if (!(typeof (settings === null || settings === void 0 ? void 0 : (_settings_hooks = settings.hooks) === null || _settings_hooks === void 0 ? void 0 : _settings_hooks.beforeFetch) === 'function')) return [
                                                    3,
                                                    3
                                                ];
                                                return [
                                                    4,
                                                    settings.hooks.beforeFetch(options)
                                                ];
                                            case 2:
                                                modifiedOptions = _state.sent();
                                                if (modifiedOptions && (typeof modifiedOptions === "undefined" ? "undefined" : _type_of(modifiedOptions)) === 'object') options = modifiedOptions;
                                                _state.label = 3;
                                            case 3:
                                                return [
                                                    4,
                                                    fetch(url, options)
                                                ];
                                            case 4:
                                                res = _state.sent();
                                                // Clear the fetch timeout
                                                clearTimeout(timeoutId);
                                                // Validate response
                                                if (!res.ok) throw new Error("API Error: ".concat(res.status, " ").concat(res.statusText));
                                                // Validate Content Type
                                                contentType = res.headers.get("content-type");
                                                if (!contentType || !contentType.includes("application/json")) throw new Error('Invalid response. Expected JSON, got "'.concat(contentType, '"'));
                                                _state.label = 5;
                                            case 5:
                                                _state.trys.push([
                                                    5,
                                                    7,
                                                    ,
                                                    8
                                                ]);
                                                return [
                                                    4,
                                                    res.json()
                                                ];
                                            case 6:
                                                json = _state.sent();
                                                return [
                                                    3,
                                                    8
                                                ];
                                            case 7:
                                                e = _state.sent();
                                                throw new Error("Invalid JSON: ".concat(e.message));
                                            case 8:
                                                if (!(typeof (settings === null || settings === void 0 ? void 0 : (_settings_hooks1 = settings.hooks) === null || _settings_hooks1 === void 0 ? void 0 : _settings_hooks1.afterFetch) === 'function')) return [
                                                    3,
                                                    10
                                                ];
                                                return [
                                                    4,
                                                    settings.hooks.afterFetch(json)
                                                ];
                                            case 9:
                                                modified = _state.sent();
                                                if (modified && (typeof modified === "undefined" ? "undefined" : _type_of(modified)) === 'object') json = modified;
                                                _state.label = 10;
                                            case 10:
                                                // Only update if not aborted
                                                if (!signal.aborted) this.$props.$data = json;
                                                return [
                                                    3,
                                                    13
                                                ];
                                            case 11:
                                                e1 = _state.sent();
                                                // Handle Aborts vs Real Errors
                                                if (e1.name === 'AbortError' || signal.aborted) {
                                                    if (signal.reason === 'Timeout') {
                                                        this.$props.$error = "Request timed out after ".concat(settings.fetchTimeout, "ms");
                                                        this.$props.$data = null;
                                                    }
                                                    return [
                                                        2
                                                    ];
                                                }
                                                console.error("[AlpineComponentLoader] Fetch failed for ".concat(url), e1);
                                                this.$props.$error = e1.message;
                                                this.$props.$data = null;
                                                return [
                                                    3,
                                                    13
                                                ];
                                            case 12:
                                                // Cleanup
                                                clearTimeout(timeoutId);
                                                // Only turn off loading if this request wasn't superseded by a new one
                                                if (!signal.aborted || signal.reason === 'Timeout') {
                                                    ;
                                                    this.$props.$loading = false;
                                                    if (((_this__fetchAbortController = this._fetchAbortController) === null || _this__fetchAbortController === void 0 ? void 0 : _this__fetchAbortController.signal) === signal) this._fetchAbortController = null;
                                                }
                                                return [
                                                    7
                                                ];
                                            case 13:
                                                return [
                                                    2
                                                ];
                                        }
                                    });
                                }).call(this);
                            }
                        },
                        {
                            // Helper to execute hooks
                            key: "_triggerHook",
                            value: function _triggerHook(hookName) {
                                var detail = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
                                if (settings.hooks && typeof settings.hooks[hookName] === 'function') {
                                    settings.hooks[hookName].call(this, _object_spread({
                                        el: this,
                                        root: this._root,
                                        props: this.$props
                                    }, detail));
                                }
                            }
                        },
                        {
                            key: "_loadExternalDependencies",
                            value: // Load external CSS/JS dependencies
                            function _loadExternalDependencies() {
                                return _async_to_generator(function() {
                                    var promises;
                                    return _ts_generator(this, function(_state) {
                                        switch(_state.label){
                                            case 0:
                                                promises = [];
                                                // CSS: Always inject into global head
                                                // This ensures @font-face and @keyframes are registered globally
                                                settings.externalCss.forEach(function(url) {
                                                    // Check if link exists in head
                                                    if (!document.querySelector('link[href="'.concat(url, '"]'))) {
                                                        var link = document.createElement('link');
                                                        link.rel = 'stylesheet';
                                                        link.href = url;
                                                        document.head.appendChild(link);
                                                    }
                                                });
                                                // Scripts: Only inject if not already loaded
                                                // This ensures scripts are loaded in the correct order
                                                settings.externalScripts.forEach(function(url) {
                                                    if (!scriptLoadCache.has(url)) {
                                                        var p = new Promise(function(resolve, reject) {
                                                            if (document.querySelector('script[src="'.concat(url, '"]'))) {
                                                                resolve();
                                                                return;
                                                            }
                                                            var script = document.createElement('script');
                                                            script.src = url;
                                                            script.async = true;
                                                            script.onload = function() {
                                                                return resolve();
                                                            };
                                                            script.onerror = function() {
                                                                return reject(new Error("Failed to load script: ".concat(url)));
                                                            };
                                                            document.head.appendChild(script);
                                                        });
                                                        scriptLoadCache.set(url, p);
                                                    }
                                                    promises.push(scriptLoadCache.get(url));
                                                });
                                                // Wait for all promises
                                                return [
                                                    4,
                                                    Promise.all(promises)
                                                ];
                                            case 1:
                                                _state.sent();
                                                return [
                                                    2
                                                ];
                                        }
                                    });
                                })();
                            }
                        },
                        {
                            // Manual slot polyfill for Light DOM
                            key: "_captureLightSlots",
                            value: function _captureLightSlots() {
                                var slots = {
                                    default: []
                                };
                                Array.from(this.childNodes).forEach(function(node) {
                                    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('slot')) {
                                        var name = node.getAttribute('slot');
                                        if (!slots[name]) slots[name] = [];
                                        slots[name].push(node);
                                    } else {
                                        slots.default.push(node);
                                    }
                                });
                                return slots;
                            }
                        },
                        {
                            key: "_renderSafe",
                            value: // Render logic using DOM manipulation
                            function _renderSafe(content, lightSlots) {
                                return _async_to_generator(function() {
                                    var _this, rootNode, styles, combinedCss, sheet, scripts, node;
                                    return _ts_generator(this, function(_state) {
                                        _this = this;
                                        // Parse string to DOM if needed, otherwise clone fragment
                                        if (typeof content === 'string') rootNode = new DOMParser().parseFromString(content, 'text/html').body;
                                        else rootNode = content.cloneNode(true);
                                        // Process styles (Constructible, Scoping, or Stripping)
                                        if (!settings.stripStyles) {
                                            styles = Array.from(rootNode.querySelectorAll('style'));
                                            // Feature: Constructible Stylesheets (Shadow DOM only)
                                            if (settings.shadow && settings.useConstructibleStyles && document.adoptedStyleSheets) {
                                                combinedCss = styles.map(function(s) {
                                                    return s.textContent;
                                                }).join('\n');
                                                sheet = null;
                                                if (combinedCss.trim().length > 0) {
                                                    if (styleSheetCache.has(combinedCss)) {
                                                        sheet = styleSheetCache.get(combinedCss);
                                                    } else {
                                                        sheet = new CSSStyleSheet();
                                                        sheet.replaceSync(combinedCss);
                                                        styleSheetCache.set(combinedCss, sheet);
                                                    }
                                                }
                                                // Apply shared + internal styles
                                                this._root.adoptedStyleSheets = _to_consumable_array(settings.sharedStyleSheets || []).concat(_to_consumable_array(sheet ? [
                                                    sheet
                                                ] : []));
                                                // Remove style tags since we moved them to adoptedStyleSheets
                                                styles.forEach(function(el) {
                                                    return el.remove();
                                                });
                                            } else {
                                                // Fallback: Standard tag injection + Scoping
                                                styles.forEach(function(style) {
                                                    if (!settings.shadow) {
                                                        // Native @scope support
                                                        if ('CSSScopeRule' in window) {
                                                            style.textContent = "@scope { ".concat(style.textContent.replace(/:host/g, ':scope'), " }");
                                                        } else {
                                                            _this.setAttribute('data-scope', _this._scopeId);
                                                            // Rewrite :host to data-scope attribute
                                                            if (style.textContent.includes(':host')) style.textContent = style.textContent.replace(/:host/g, "".concat(tagName, '[data-scope="').concat(_this._scopeId, '"]'));
                                                        }
                                                    }
                                                });
                                            }
                                        } else {
                                            rootNode.querySelectorAll('style').forEach(function(el) {
                                                return el.remove();
                                            });
                                        }
                                        // Process scripts (security check and re-creation)
                                        scripts = [];
                                        if (settings.executeScripts) {
                                            rootNode.querySelectorAll('script').forEach(function(oldScript) {
                                                var newScript = document.createElement('script');
                                                Array.from(oldScript.attributes).forEach(function(attr) {
                                                    return newScript.setAttribute(attr.name, attr.value);
                                                });
                                                newScript.textContent = oldScript.textContent;
                                                scripts.push(newScript);
                                                oldScript.remove();
                                            });
                                        } else {
                                            rootNode.querySelectorAll('script').forEach(function(el) {
                                                return el.remove();
                                            });
                                        }
                                        // Inject Light DOM slots if needed
                                        if (!settings.shadow) {
                                            // Instead of replacing the slot entirely, we replace it with a persistent container
                                            // This allows us to append new nodes to it later via the MutationObserver
                                            rootNode.querySelectorAll('slot').forEach(function(slotEl) {
                                                var name = slotEl.getAttribute('name') || 'default';
                                                // Create a transparent wrapper acting as the slot
                                                var anchor = document.createElement('div');
                                                anchor.style.display = 'contents';
                                                anchor.setAttribute('data-acl-slot', name);
                                                // Insert pre-captured nodes (initial render)
                                                var nodesToInsert = lightSlots ? lightSlots[name] : null;
                                                if (nodesToInsert && nodesToInsert.length > 0) {
                                                    nodesToInsert.forEach(function(node) {
                                                        return anchor.appendChild(node);
                                                    });
                                                } else if (slotEl.childNodes.length > 0) {
                                                    while(slotEl.firstChild)anchor.appendChild(slotEl.firstChild);
                                                }
                                                // Replace the <slot> tag with our anchor
                                                slotEl.replaceWith(anchor);
                                            });
                                        }
                                        // Move nodes to component root
                                        while(rootNode.firstChild){
                                            node = rootNode.firstChild;
                                            // Attach props directly to element
                                            if (node.nodeType === 1) node.$props = this.$props;
                                            // Append to root
                                            this._root.appendChild(node);
                                        }
                                        // Append scripts to trigger execution
                                        scripts.forEach(function(s) {
                                            return _this._root.appendChild(s);
                                        });
                                        return [
                                            2
                                        ];
                                    });
                                }).call(this);
                            }
                        },
                        {
                            // Forward specific events out of Shadow DOM
                            key: "_setupEventForwarding",
                            value: function _setupEventForwarding() {
                                var _this = this;
                                settings.forwardEvents.forEach(function(eventName) {
                                    _this._root.addEventListener(eventName, function(e) {
                                        _this.dispatchEvent(new CustomEvent(eventName, {
                                            bubbles: true,
                                            composed: true,
                                            detail: e.detail
                                        }));
                                    });
                                });
                            }
                        },
                        {
                            // Advanced Prop Validation and Type Casting
                            key: "_updateProp",
                            value: function _updateProp(name, value) {
                                // Skip data-src, it's handled separately
                                if (name === 'data-src') return;
                                // Get config
                                var configDef = settings.attributes[name];
                                // Normalization: handle { type: String } vs just String
                                var type = configDef && configDef.type ? configDef.type : configDef, required = (configDef && configDef.required) === true, validator = configDef && configDef.validator ? configDef.validator : null, defaultValue = configDef && configDef.hasOwnProperty('default') ? configDef.default : undefined;
                                // Handle Missing / Null Attributes
                                if (value === null || value === undefined) {
                                    if (defaultValue !== undefined) {
                                        this.$props[name] = defaultValue;
                                        return;
                                    }
                                    if (required) console.warn('[AlpineComponentLoader] Missing required prop "'.concat(name, '" on <').concat(tagName, ">"));
                                    this._applyTypeDefault(name, type);
                                    return;
                                }
                                // Type Casting
                                var parsedValue;
                                if (type === Boolean) {
                                    parsedValue = value !== null && value !== 'false';
                                } else if (type === Number) {
                                    var num = Number(value);
                                    parsedValue = isNaN(num) ? 0 : num;
                                } else if (type === Object || type === Array) {
                                    try {
                                        if (!value) parsedValue = type === Array ? [] : {};
                                        else parsedValue = JSON.parse(value.replace(/'/g, '"'));
                                    } catch (e) {
                                        console.warn('[AlpineComponentLoader] Attribute "'.concat(name, '" is invalid JSON:'), value);
                                        parsedValue = type === Array ? [] : {};
                                    }
                                } else {
                                    parsedValue = value;
                                }
                                // Validation: Custom Validator
                                if (validator && typeof validator === 'function') {
                                    if (!validator(parsedValue)) {
                                        console.warn('[AlpineComponentLoader] Validation failed for prop "'.concat(name, '" on <').concat(tagName, ">. Value:"), parsedValue);
                                        // If we have a default, use it
                                        if (defaultValue !== undefined) this.$props[name] = defaultValue;
                                        else if (this.$props[name] === undefined) this._applyTypeDefault(name, type);
                                        // If prop already had a value (update), do nothing (keep old valid value)
                                        return;
                                    }
                                }
                                this.$props[name] = parsedValue;
                            }
                        },
                        {
                            // Helper for type safety
                            key: "_applyTypeDefault",
                            value: function _applyTypeDefault(name, type) {
                                if (type === Number) this.$props[name] = 0;
                                else if (type === Boolean) this.$props[name] = false;
                                else if (type === Array) this.$props[name] = [];
                                else if (type === Object) this.$props[name] = {};
                                else this.$props[name] = '';
                            }
                        },
                        {
                            // Reactively update props when attributes change
                            key: "_syncAllAttributes",
                            value: function _syncAllAttributes() {
                                var _this = this;
                                observedAttrs.forEach(function(name) {
                                    return _this._updateProp(name, _this.getAttribute(name));
                                });
                            }
                        },
                        {
                            // Initialize persistence strategy with helpers
                            key: "_initPersistence",
                            value: function _initPersistence() {
                                var _this = this;
                                var mode = this.getAttribute('persist') || settings.persist;
                                if (!mode) return;
                                // Choose storage (default to sessionStorage if not specified), generate key, and debounce config
                                var storage = mode === 'local' ? localStorage : sessionStorage, key = this.getAttribute('persist-key') || settings.persistKey || "acl:".concat(this.localName, ":").concat(this.id ? ':' + this.id : 'no-id'), debounceMs = parseInt(this.getAttribute('persist-debounce') || settings.persistDebounce || '250', 10);
                                // Debounce timer for persistence
                                var _timer = null;
                                // Create a clean snapshot
                                var getSnapshot = function() {
                                    return Object.fromEntries(Object.entries(_this.$props).filter(function(param) {
                                        var _param = _sliced_to_array(param, 2), k = _param[0], v = _param[1];
                                        return !k.startsWith('$') && typeof v !== 'function';
                                    }));
                                };
                                // Perform immediate save
                                var saveNow = function(value) {
                                    if (_timer) clearTimeout(_timer);
                                    _timer = null;
                                    storage.setItem(key, JSON.stringify(value || getSnapshot()));
                                };
                                // Attach persistence helpers
                                this.$props.$persistence = {
                                    $key: key,
                                    $save: function(value) {
                                        if (debounceMs > 0) {
                                            if (_timer) clearTimeout(_timer);
                                            _timer = setTimeout(function() {
                                                return saveNow(value);
                                            }, debounceMs);
                                        } else {
                                            saveNow(value);
                                        }
                                    },
                                    $clear: function() {
                                        if (_timer) clearTimeout(_timer);
                                        _timer = null;
                                        storage.removeItem(key);
                                    },
                                    $get: function() {
                                        var k = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : null, fallback = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : null;
                                        try {
                                            var stored = JSON.parse(storage.getItem(key));
                                            return (k ? stored[k] : stored) || fallback;
                                        } catch (e) {
                                            return fallback;
                                        }
                                    },
                                    $flush: function() {
                                        if (_timer) saveNow();
                                    }
                                };
                                // Restore state on load
                                try {
                                    var stored = this.$props.$persistence.$get();
                                    if (stored && (typeof stored === "undefined" ? "undefined" : _type_of(stored)) === 'object') {
                                        for(var k in this.$props)if (Object.prototype.hasOwnProperty.call(stored, k)) this.$props[k] = stored[k];
                                    }
                                } catch (e) {
                                    console.warn("[AlpineComponentLoader] Restore failed for ".concat(key), e);
                                }
                                // Start saving on Alpine updates
                                Alpine.effect(function() {
                                    return _this.$props.$persistence.$save(getSnapshot());
                                });
                                // Flush on page unload to prevent data loss
                                if (debounceMs > 0) window.addEventListener('beforeunload', function() {
                                    return _this.$props.$persistence.$flush();
                                });
                            }
                        },
                        {
                            key: "_initAlpine",
                            value: // Wait for Alpine.js to load
                            function _initAlpine() {
                                return _async_to_generator(function() {
                                    var _this;
                                    return _ts_generator(this, function(_state) {
                                        _this = this;
                                        if (window.Alpine) return [
                                            2,
                                            this._finishAlpineInit()
                                        ];
                                        // Bind to alpine:init event + timeout if it is not fired
                                        return [
                                            2,
                                            new Promise(function(resolve, reject) {
                                                document.addEventListener('alpine:init', function() {
                                                    _this._finishAlpineInit();
                                                    resolve();
                                                }, {
                                                    once: true
                                                });
                                                // Timeout
                                                setTimeout(function() {
                                                    if (window.Alpine) {
                                                        _this._finishAlpineInit();
                                                        resolve();
                                                    } else reject(new Error("Alpine.js not found (Timeout)"));
                                                }, 5000);
                                            })
                                        ];
                                    });
                                }).call(this);
                            }
                        },
                        {
                            // Bridge props to Alpine store and init tree once Alpine is ready
                            key: "_finishAlpineInit",
                            value: function _finishAlpineInit() {
                                var _this = this;
                                // Bind Alpine store if provided
                                var storeName = this.getAttribute('bind-store') || settings.bindStore;
                                if (storeName) {
                                    var store = Alpine.store(storeName);
                                    if (store) {
                                        // Merge Alpine store with provided $props
                                        if (this.$props && _type_of(this.$props) === 'object') Object.keys(this.$props).filter(function(key) {
                                            return store[key] === undefined;
                                        }).forEach(function(key) {
                                            return store[key] = _this.$props[key];
                                        });
                                        // Set $props to Alpine store
                                        this.$props = store;
                                    } else {
                                        console.error('[AlpineComponentLoader] Store "'.concat(storeName, '" not found. Falling back to local state.'));
                                        this.$props = window.Alpine.reactive(this.$props || {});
                                    }
                                } else {
                                    // Initialize Alpine Store
                                    this.$props = window.Alpine.reactive(this.$props || {});
                                }
                                // Initialize persistence
                                this._initPersistence();
                                // Set an anonymous Alpine store for debugging
                                Alpine.store("props_".concat(tagName, "_").concat(Math.random().toString(36).slice(2)), this.$props);
                                // Pass the reactive reference to all children
                                // Any change to this.$props by children will now update the Store directly (and vice versa)
                                if (this._root && this._root.children) Array.from(this._root.children).forEach(function(node) {
                                    if (node.nodeType === 1) node.$props = _this.$props;
                                });
                                // We wrap in nextTick to ensure the DOM is settled before Alpine scans it
                                window.Alpine.nextTick(function() {
                                    if (_this._root) window.Alpine.initTree(_this._root);
                                });
                            }
                        },
                        {
                            // Render error message safely
                            key: "_renderError",
                            value: function _renderError(msg) {
                                var container = document.createElement('div');
                                container.style.cssText = toCssString(settings.errorCss);
                                var header = document.createElement('strong');
                                header.textContent = "Load Failed: <".concat(tagName, ">");
                                var code = document.createElement('code');
                                code.textContent = msg;
                                code.style.display = 'block';
                                code.style.marginTop = '4px';
                                container.appendChild(header);
                                container.appendChild(code);
                                if (settings.shadow) this._root.replaceChildren(container);
                                else this._root.appendChild(container);
                            }
                        },
                        {
                            // Dispatch custom event
                            key: "_dispatch",
                            value: function _dispatch(eventName) {
                                this.dispatchEvent(new CustomEvent(eventName, {
                                    bubbles: true,
                                    composed: true,
                                    detail: {
                                        props: this.$props
                                    }
                                }));
                            }
                        },
                        {
                            // Resolve URL string, ID selector, or Template object
                            key: "_resolveContent",
                            value: function _resolveContent(source) {
                                return function() {
                                    return _async_to_generator(function() {
                                        var el, useCache, faH, _cache, match, fetchedAt, unused, res, clone, headers, unused1;
                                        return _ts_generator(this, function(_state) {
                                            switch(_state.label){
                                                case 0:
                                                    // Handle HTMLTemplateElement or ID Selector (Sync/Fast)
                                                    if (_instanceof(source, HTMLTemplateElement)) {
                                                        return [
                                                            2,
                                                            source.content
                                                        ];
                                                    } else if (typeof source === 'string' && source.startsWith('#')) {
                                                        el = document.querySelector(source);
                                                        if (!el) return [
                                                            2,
                                                            Promise.reject(new Error('Template ID "'.concat(source, '" not found')))
                                                        ];
                                                        if (!_instanceof(el, HTMLTemplateElement)) return [
                                                            2,
                                                            Promise.reject(new Error('ID "'.concat(source, '" is not a <template>')))
                                                        ];
                                                        return [
                                                            2,
                                                            el.content
                                                        ];
                                                    }
                                                    // Check Cache API
                                                    useCache = settings.cacheTemplates && 'caches' in window, faH = 'acl__fetched-at__'; // XXX: Make this configurable?
                                                    if (!useCache) return [
                                                        3,
                                                        7
                                                    ];
                                                    _state.label = 1;
                                                case 1:
                                                    _state.trys.push([
                                                        1,
                                                        6,
                                                        ,
                                                        7
                                                    ]);
                                                    return [
                                                        4,
                                                        caches.open(settings._templateCacheKey)
                                                    ];
                                                case 2:
                                                    // Open cache
                                                    _cache = _state.sent();
                                                    return [
                                                        4,
                                                        _cache.match(source)
                                                    ];
                                                case 3:
                                                    match = _state.sent();
                                                    if (!(match === null || match === void 0 ? void 0 : match.ok)) return [
                                                        3,
                                                        5
                                                    ];
                                                    fetchedAt = Number(match.headers.get(faH));
                                                    if (!Number.isNaN(fetchedAt) && Date.now() - fetchedAt < settings._templateCacheExpire) return [
                                                        2,
                                                        match.text()
                                                    ];
                                                    return [
                                                        4,
                                                        _cache.delete(settings._templateCacheKey)
                                                    ];
                                                case 4:
                                                    _state.sent();
                                                    _state.label = 5;
                                                case 5:
                                                    return [
                                                        3,
                                                        7
                                                    ];
                                                case 6:
                                                    unused = _state.sent();
                                                    return [
                                                        3,
                                                        7
                                                    ];
                                                case 7:
                                                    return [
                                                        4,
                                                        fetch(source, {
                                                            cache: 'no-store'
                                                        })
                                                    ];
                                                case 8:
                                                    res = _state.sent();
                                                    if (!res.ok) throw new Error("HTTP ".concat(res.status));
                                                    if (!useCache) return [
                                                        3,
                                                        12
                                                    ];
                                                    _state.label = 9;
                                                case 9:
                                                    _state.trys.push([
                                                        9,
                                                        11,
                                                        ,
                                                        12
                                                    ]);
                                                    // Clone response + headers
                                                    clone = res.clone(), headers = new Headers(clone.headers);
                                                    // Set cache expiration header
                                                    headers.set(faH, Date.now().toString());
                                                    // Write to cache
                                                    return [
                                                        4,
                                                        _cache.put(source, new Response(clone.body, {
                                                            status: clone.status,
                                                            statusText: clone.statusText,
                                                            headers: headers
                                                        }))
                                                    ];
                                                case 10:
                                                    _state.sent();
                                                    return [
                                                        3,
                                                        12
                                                    ];
                                                case 11:
                                                    unused1 = _state.sent();
                                                    return [
                                                        3,
                                                        12
                                                    ];
                                                case 12:
                                                    // Return HTML string
                                                    return [
                                                        2,
                                                        res.text()
                                                    ];
                                            }
                                        });
                                    })();
                                }();
                            }
                        },
                        {
                            key: "_pruneCache",
                            value: // Helpers to deal with template caches within the component
                            // TODO: Implement as a an available Alpine directive/$props function
                            function _pruneCache() {
                                return _async_to_generator(function() {
                                    return _ts_generator(this, function(_state) {
                                        switch(_state.label){
                                            case 0:
                                                return [
                                                    4,
                                                    AlpineComponentLoader.pruneCache(settings._templateCachePrefix, settings._templateCacheKey)
                                                ];
                                            case 1:
                                                return [
                                                    2,
                                                    _state.sent()
                                                ];
                                        }
                                    });
                                })();
                            }
                        },
                        {
                            key: "_clearCache",
                            value: function _clearCache() {
                                return _async_to_generator(function() {
                                    return _ts_generator(this, function(_state) {
                                        switch(_state.label){
                                            case 0:
                                                return [
                                                    4,
                                                    AlpineComponentLoader.clearCache(settings._templateCacheKey)
                                                ];
                                            case 1:
                                                return [
                                                    2,
                                                    _state.sent()
                                                ];
                                        }
                                    });
                                })();
                            }
                        }
                    ], [
                        {
                            key: "observedAttributes",
                            get: // Define observed attributes
                            function get() {
                                return observedAttrs;
                            }
                        }
                    ]);
                    return AlpineExternalComponent;
                }(_wrap_native_super(HTMLElement));
                // Register custom element
                customElements.define(tagName, AlpineExternalComponent);
            }
        }
    ]);
    return AlpineComponentLoader;
}();
_define_property(AlpineComponentLoader, "_started", false);
// Global default configuration
_define_property(AlpineComponentLoader, "globalConfig", {
    debug: false,
    basePath: '',
    errorCss: {},
    shadow: false,
    useConstructibleStyles: true,
    sharedStyleSheets: [],
    executeScripts: true,
    stripStyles: false,
    forwardEvents: [],
    externalCss: [],
    externalScripts: [],
    defaultComponentName: 'acl-component',
    defaultDynamicName: 'acl-dynamic',
    // Template caching
    cacheTemplates: true,
    _templateCacheVersion: '0.0.1',
    _templateCachePrefix: 'alpine-component-loader-',
    _templateCacheKey: "alpine-component-loader-0.0.1",
    _templateCacheExpire: 15 * 60 * 1000
});
export { AlpineComponentLoader as default };
// Declarative component proxy, replaces itself with the loaded component
var AlpineDeclarativeLoader = /*#__PURE__*/ function(HTMLElement1) {
    "use strict";
    _inherits(AlpineDeclarativeLoader, HTMLElement1);
    function AlpineDeclarativeLoader() {
        _class_call_check(this, AlpineDeclarativeLoader);
        return _call_super(this, AlpineDeclarativeLoader, arguments);
    }
    _create_class(AlpineDeclarativeLoader, [
        {
            key: "connectedCallback",
            value: function connectedCallback() {
                return _async_to_generator(function() {
                    var src, tagName, config, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, attr, val, inferredType, realElement, _iteratorNormalCompletion1, _didIteratorError1, _iteratorError1, _iterator1, _step1, attr1;
                    return _ts_generator(this, function(_state) {
                        src = this.getAttribute('src') || this.getAttribute('url');
                        if (!src) {
                            console.error("<".concat(this.localName, '>: missing "src" attribute'));
                            return [
                                2
                            ];
                        }
                        // Determine Tag Name (Attribute > Filename)
                        tagName = this.getAttribute('tag');
                        if (!tagName) tagName = src.split('/').pop().split('.').shift(); // Strip extension
                        // Validate tag name; ensure it contains a hyphen
                        if (!tagName.includes('-')) {
                            console.error("<".concat(this.localName, '>: Tag name "').concat(tagName, '" must contain a hyphen.'));
                            return [
                                2
                            ];
                        }
                        // Parse Config from Attributes
                        config = {
                            shadow: this.hasAttribute('shadow') ? this.getAttribute('shadow') !== 'false' : AlpineComponentLoader.globalConfig.shadow,
                            loading: this.getAttribute('loading') || 'eager',
                            dataSrc: this.getAttribute('data-src') || null,
                            bindStore: this.getAttribute('bind-store') || null,
                            fallback: this.getAttribute('fallback') || null,
                            attributes: {} // Auto-inference of props
                        };
                        // Define the component (if not already defined)
                        if (!customElements.get(tagName)) {
                            _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                            try {
                                // Heuristic: Check other attributes to guess Prop Types
                                for(_iterator = this.attributes[Symbol.iterator](); !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                                    attr = _step.value;
                                    if ([
                                        'src',
                                        'url',
                                        'tag',
                                        'shadow',
                                        'loading',
                                        'class',
                                        'style',
                                        'id',
                                        'data-src',
                                        'bind-store',
                                        'fallback'
                                    ].includes(attr.name)) continue;
                                    // If value looks like JSON Array/Object, treat as such
                                    val = attr.value.trim();
                                    // Try to infer type
                                    inferredType = String;
                                    if (val.startsWith('[') || val.startsWith('{')) inferredType = val.startsWith('[') ? Array : Object;
                                    else if (val === 'true' || val === 'false' || val === '') inferredType = Boolean;
                                    else if (!isNaN(Number(val))) inferredType = Number;
                                    // Add to config
                                    config.attributes[attr.name] = inferredType;
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
                            // Define the component
                            AlpineComponentLoader.define(tagName, src, config);
                        }
                        // Create the REAL element
                        realElement = document.createElement(tagName);
                        _iteratorNormalCompletion1 = true, _didIteratorError1 = false, _iteratorError1 = undefined;
                        try {
                            // Forward Attributes (Props, Classes, IDs)
                            for(_iterator1 = this.attributes[Symbol.iterator](); !(_iteratorNormalCompletion1 = (_step1 = _iterator1.next()).done); _iteratorNormalCompletion1 = true){
                                attr1 = _step1.value;
                                if ([
                                    'src',
                                    'url',
                                    'tag',
                                    'shadow'
                                ].includes(attr1.name)) continue; // Don't forward loader-specific config
                                realElement.setAttribute(attr1.name, attr1.value);
                            }
                        } catch (err) {
                            _didIteratorError1 = true;
                            _iteratorError1 = err;
                        } finally{
                            try {
                                if (!_iteratorNormalCompletion1 && _iterator1.return != null) {
                                    _iterator1.return();
                                }
                            } finally{
                                if (_didIteratorError1) {
                                    throw _iteratorError1;
                                }
                            }
                        }
                        // Move any children (slots) to the REAL element
                        while(this.firstChild)realElement.appendChild(this.firstChild);
                        // Swap in the DOM
                        this.replaceWith(realElement);
                        return [
                            2
                        ];
                    });
                }).call(this);
            }
        }
    ]);
    return AlpineDeclarativeLoader;
}(_wrap_native_super(HTMLElement));
// Dynamic component switcher
var AlpineDynamicLoader = /*#__PURE__*/ function(HTMLElement1) {
    "use strict";
    _inherits(AlpineDynamicLoader, HTMLElement1);
    function AlpineDynamicLoader() {
        _class_call_check(this, AlpineDynamicLoader);
        var _this;
        _this = _call_super(this, AlpineDynamicLoader);
        _this._cache = new Map();
        return _this;
    }
    _create_class(AlpineDynamicLoader, [
        {
            key: "attributeChangedCallback",
            value: function attributeChangedCallback(name, oldVal, newVal) {
                if (name === 'is' && newVal && newVal !== oldVal) this._switch(newVal);
            }
        },
        {
            key: "connectedCallback",
            value: function connectedCallback() {
                this.setAttribute('data-acl-component', 'acl-dynamic');
                if (!this.firstElementChild && this.getAttribute('is')) this._switch(this.getAttribute('is'));
            }
        },
        {
            key: "disconnectedCallback",
            value: function disconnectedCallback() {
                // Cleanup cache to prevent memory leaks when loader is removed
                this._cache.forEach(function(el) {
                    if (el._root && window.Alpine) window.Alpine.destroyTree(el._root);
                });
                this._cache.clear();
            }
        },
        {
            key: "_switch",
            value: function _switch(tag) {
                if (!tag) return;
                tag = tag.toLowerCase();
                var keepAlive = this.hasAttribute('keep-alive'), current = this.firstElementChild;
                // Cache the current component if keep-alive is active
                if (current && keepAlive) {
                    // Save scroll position before detaching
                    current._savedScroll = current.scrollTop;
                    // Mark as kept alive so disconnectedCallback doesn't destroy it
                    current._isKeptAlive = true;
                    this._cache.set(current.tagName.toLowerCase(), current);
                    // Detach
                    current.remove();
                    // Reset flag for future legitimate removals
                    current._isKeptAlive = false;
                } else {
                    // Standard tear down
                    this.replaceChildren();
                    // If we turned off keep-alive, ensure we don't hold onto old refs
                    if (current && !keepAlive) this._cache.delete(current.tagName.toLowerCase());
                }
                // Restore or Create new component
                if (keepAlive && this._cache.has(tag)) {
                    var el = this._cache.get(tag);
                    this.appendChild(el);
                    // Restore scroll position
                    if (el._savedScroll) el.scrollTop = el._savedScroll;
                } else {
                    try {
                        var el1 = document.createElement(tag);
                        // Forward attributes (excluding loader-specific ones)
                        Array.from(this.attributes).forEach(function(attr) {
                            if (![
                                'is',
                                'keep-alive'
                            ].includes(attr.name)) el1.setAttribute(attr.name, attr.value);
                        });
                        this.appendChild(el1);
                    } catch (e) {
                        console.error("[AlpineComponentLoader] Failed to create: <".concat(tag, ">"), e);
                    }
                }
            }
        }
    ], [
        {
            key: "observedAttributes",
            get: function get() {
                return [
                    'is'
                ];
            }
        }
    ]);
    return AlpineDynamicLoader;
}(_wrap_native_super(HTMLElement));
// Once DOM is ready, start loading components
try {
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', AlpineComponentLoader.start, {
            once: true
        });
    } else {
        AlpineComponentLoader.start();
    }
} catch (e) {
    console.warn("[AlpineComponentLoader] Failed to register components:", e);
}


//# sourceMappingURL=AlpineComponentLoader.js.map