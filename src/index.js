/**
 * @license AlpineComponentLoader
 *
 * Copyright (c) LTDev LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Cache for constructible stylesheets (Internal styles only)
const styleSheetCache = new Map();

// Cache for External Script loading states (Prevent duplicate execution)
const scriptLoadCache = new Map();

// Type map for prop attribute definitions
const typeMap = {
    'String': String,
    'Number': Number,
    'Boolean': Boolean,
    'Array': Array,
    'Object': Object
};

// Cache for xxternal data requests (Prevent duplicate API calls)
const dataFetchCache = new Map();

// Helper to convert JS style objects to CSS strings
const toCssString = (styleObj) => {
    return Object.entries(styleObj)
        .map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${v}`)
        .join(';');
};

// Helper to ensure values are string-safe for URLs (stringifies objects/arrays)
const toUrlValue = (v) => encodeURIComponent((typeof v === 'object' && v !== null) ? JSON.stringify(v) : v);

// Helper to convert JS objects to URLSearchParams (supports nested objects and arrays)
function toSearchParamsDeep(obj) {
    const _params = new URLSearchParams(),
        // Support nested objects and arrays in query parameters
        add = (key, value) => {
            if (value == null)
                return;

            // Support arrays
            if (Array.isArray(value))
                return value.forEach((v) => add(key, v));

            // Support nested objects
            if (typeof value === "object") {
                for (const [k, v] of Object.entries(value))
                    add(`${key}[${k}]`, v);
                return;
            }

            // Add parameter
            _params.append(key, toUrlValue(value));
        };

    // Add parameters
    for (const [k, v] of Object.entries(obj ?? {}))
        add(k, v);

    return _params;
}

export default class AlpineComponentLoader {
    static _started = false;
    static _registry = new Map();
    static _debugger = false;

    // Global default configuration
    static globalConfig = {
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

        // Data fetching
        dataFetchParams: null,
        dataFetchKeys: null,
        dataFetchPoll: null,
        dataFetchTimeout: 30000,

        // Template caching
        cacheTemplates: true,
        _templateCacheVersion: '0.0.1',
        _templateCachePrefix: 'alpine-component-loader-',
        _templateCacheKey: `alpine-component-loader-0.0.1`,
        _templateCacheExpire: 15 * 60 * 1000,
    };

    // Start loading components + setup component proxy
    static async start() {
        if (AlpineComponentLoader._started)
            return;
        AlpineComponentLoader._started = true;

        // Cleanup old caches
        await AlpineComponentLoader.pruneCaches();

        // Register default components
        AlpineComponentLoader.registerComponent();
        AlpineComponentLoader.registerDynamicLoader();
        AlpineComponentLoader.registerTemplates();
    }

    // Clear caches from unmatched versions
    static async pruneCaches(prefix = AlpineComponentLoader.globalConfig._templateCachePrefix, current = AlpineComponentLoader.globalConfig._templateCacheKey) {
        if (!('caches' in window))
            return;
        return await Promise.all((await caches.keys())
            .filter(key => key.startsWith(prefix))
            .filter(key => key !== current)
            .map(key => caches.delete(key)));
    }

    // Manually clear all template caches
    static async clearCache(current = AlpineComponentLoader.globalConfig._templateCacheKey) {
        if (!('caches' in window)) {
            console.warn('[ACL] Cache API not supported.');
            return;
        }

        // Clear all caches with the specified prefix
        return await Promise.all((await caches.keys())
            .filter(key => key.startsWith(current))
            .map(key => caches.delete(key)));
    }

    // Update global configuration
    static config(options) {
        Object.assign(AlpineComponentLoader.globalConfig, options);
    }

    // Register default custom component
    static registerComponent(name = AlpineComponentLoader.globalConfig.defaultComponentName) {
        if (!customElements.get(name))
            customElements.define(name, AlpineDeclarativeLoader);
    }

    // Register default dynamic loader
    static registerDynamicLoader(name = AlpineComponentLoader.globalConfig.defaultDynamicName) {
        if (!customElements.get(name))
            customElements.define(name, AlpineDynamicLoader);
    }

    // Auto-discover <template acl-component="name"> elements
    static registerTemplates() {
        document.querySelectorAll('template[acl-component]').forEach(tpl => {
            const tagName = tpl.getAttribute('acl-component');
            if (!tagName)
                return;

            // Parse acl-props attribute as JSON
            let config;
            try {
                config = {
                    attributes: Object.fromEntries(Object.entries(JSON.parse(tpl.getAttribute('acl-props') || '{}')).map(([key, val]) => [
                        key,
                        (typeof val === 'object' && val.type) ? {
                            ...val,
                            type: typeMap[val.type] || String
                        } : (typeMap[val] || String)
                    ]))
                }
            } catch (e) {
                console.warn(`[ACL] Invalid JSON in acl-props for <${tagName}>`, e);
            }

            // Define the component
            AlpineComponentLoader.define(tagName, tpl, config || {});
        });
    }

    // Toggle the built-in debugger
    static toggleDebug() {
        console.warn('[ACL] Debugger not loaded. Import \"acl-debugger.js\" to enable.');
    }

    // Prefetch a component's template by tag name to warm the cache
    static async prefetch(tagName) {
        const config = AlpineComponentLoader._registry.get(tagName);
        if (!config) {
            console.warn(`[ACL] Cannot prefetch <${tagName}>: component not defined.`);
            return;
        }
        return await AlpineComponentLoader.loadTemplate(config.source, config.settings);
    }

    // Centralized static template loader for components
    static async loadTemplate(source, settings) {
        // Handle HTMLTemplateElement or ID selector
        if (source instanceof HTMLTemplateElement) {
            return source.content;
        } else if (typeof source === 'string' && source.startsWith('#')) {
            const el = document.querySelector(source);
            if (!el)
                return Promise.reject(new Error(`Template ID "${source}" not found`));
            if (!(el instanceof HTMLTemplateElement))
                return Promise.reject(new Error(`ID "${source}" is not a <template>`));
            return el.content;
        }

        // Check Cache API
        const useCache = settings.cacheTemplates && 'caches' in window,
            faH = 'acl__fetched-at__';

        // Cache API
        let _cache;
        if (useCache) {
            try {
                // Open cache
                _cache = await caches.open(settings._templateCacheKey);

                // Read from cache + check expiration
                const match = await _cache.match(source);
                if (match?.ok) {
                    const fetchedAt = Number(match.headers.get(faH));
                    if (!Number.isNaN(fetchedAt) && (Date.now() - fetchedAt) < settings._templateCacheExpire)
                        return match.text();
                    await _cache.delete(settings._templateCacheKey);
                }
            } catch { /* Ignore cache read errors */ }
        }

        // Network fetch
        const res = await fetch(source, { cache: 'no-store' });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);

        // Write to Cache API
        if (useCache) {
            try {
                // Clone response + headers
                const clone = res.clone(),
                    headers = new Headers(clone.headers);

                // Set cache expiration header
                headers.set(faH, Date.now().toString());

                // Write to cache
                await _cache.put(
                    source,
                    new Response(clone.body, {
                        status: clone.status,
                        statusText: clone.statusText,
                        headers
                    })
                );
            } catch { /* Ignore cache write errors */ }

            // If the browser supports ReadableStream and it's a large file, return the stream
            if (res.body && typeof ReadableStream !== 'undefined')
                return res.body.pipeThrough(new TextDecoderStream());
        }

        // Return HTML string
        return res.text();
    }

    // Define a new component from a URL, ID, or Template element
    static define(tagName, source, config = {}) {
        // Merge defaults, global config, and instance config
        const settings = {
            attributes: {},
            loading: 'eager',
            hooks: {
                beforeFetch: (opts) => opts,
                afterFetch: (data) => data,
            },
            ...AlpineComponentLoader.globalConfig,
            ...config,
            externalCss: [
                ...(AlpineComponentLoader.globalConfig.externalCss || []),
                ...(config.externalCss || [])
            ],
            externalScripts: [
                ...(AlpineComponentLoader.globalConfig.externalScripts || []),
                ...(config.externalScripts || [])
            ],
            sharedStyleSheets: [
                ...(AlpineComponentLoader.globalConfig.sharedStyleSheets || []),
                ...(config.sharedStyleSheets || [])
            ],
            errorCss: {
                ...{
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
                },
                ...(AlpineComponentLoader.globalConfig.errorCss || {}),
                ...(config.errorCss || {})
            },
            forwardEvents: [
                ...(AlpineComponentLoader.globalConfig.forwardEvents || []),
                ...(config.forwardEvents || [])
            ],
            fallback: config.fallback || null,
            persist: config.persist || false,
            persistKey: config.persistKey || null,
            persistDebounce: config.persistDebounce || 250,
            bindStore: config.bindStore || null,
            dataSrc: config.dataSrc || null,
            dataFetchParams: config.dataFetchParams || AlpineComponentLoader.globalConfig.dataFetchParams || null,
            dataFetchKeys: config.dataFetchKeys || AlpineComponentLoader.globalConfig.dataFetchKeys || null,
            dataFetchPoll: config.dataFetchPoll || AlpineComponentLoader.globalConfig.dataFetchPoll || null,
            dataFetchTimeout: config.dataFetchTimeout || AlpineComponentLoader.globalConfig.dataFetchTimeout || 30000,
            dataFetchOptions: config.dataFetchOptions || {},
        };

        // Track observed attributes internally
        const observedAttrs = [
            ...new Set([
                ...Object.keys(settings.attributes),
                'bind-store',
                'data-src',
                'data-fetch-params',
                'data-fetch-keys',
                'data-fetch-poll',
                'data-fetch-timeout',
            ]),
        ];

        // Prepend base path if source is a URL string
        let contentSource = source;
        if (typeof source === 'string' && !source.startsWith('#') && settings.basePath)
            contentSource = settings.basePath + source;

        // Register in internal registry to enable prefetching
        AlpineComponentLoader._registry.set(tagName, { source: contentSource, settings });

        // Return helpers to be assigned to $el.$props
        const helpers = (_this) => ({
            $emit: (name, detail) => _this.dispatchEvent(new CustomEvent(name, {
                bubbles: true,
                composed: true,
                detail
            })),
            $reload: () => _this.reload(),
        });

        // Create component class
        class AlpineExternalComponent extends HTMLElement {
            constructor() {
                super();

                // Initialize props
                let _$props = {
                    $data: null,
                    $loading: false,
                    $error: null,
                    $lastUpdated: Date.now(),
                    ...helpers(this),
                    ...settings.attributes || {}
                };

                // Initialize state and attributes
                this._initialized = false;
                this._loading = false;
                this._disconnectTimeout = null;
                this._fetchAbortController = null;
                this.$props = window.Alpine ? window.Alpine.reactive(_$props) : _$props;
                this._root = settings.shadow ? this.attachShadow({ mode: 'open' }) : this;
                this._observer = null;
                this._scopeId = `scope-${Math.random().toString(36).slice(2, 9)}`;
                this._slotObserver = null;
                this._originalLightDom = document.createDocumentFragment();
                this._pollTimer = null;
            }

            // Define observed attributes
            static get observedAttributes() {
                return observedAttrs;
            }

            // Reactively update props when attributes change
            attributeChangedCallback(name, oldVal, newVal) {
                if (oldVal === newVal)
                    return;

                // Watch data-src and renamed fetch attributes
                if (['data-src', 'data-fetch-params', 'data-fetch-keys', 'data-fetch-timeout'].includes(name)) {
                    if (this._initialized)
                        this._fetchData(this.getAttribute('data-src') || settings.dataSrc);
                } else if (name === 'data-poll')
                    this._startPolling(); // Restart polling with new interval
                else
                    this._updateProp(name, newVal);

                // Emit updated event
                if (this._initialized) {
                    this._triggerHook('updated', { name, oldVal, newVal });
                }
            }

            // Initialize on insertion
            connectedCallback() {
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
                if (this._loading)
                    return;

                // Lock loading state
                this._loading = true;

                // Sync attributes immediately for eager loading
                this._syncAllAttributes();

                // Check loading mode and load
                const loadMode = this.getAttribute('loading') || settings.loading;
                if (loadMode === 'lazy')
                    this._initLazyObserver();
                else if (loadMode === 'idle')
                    this._initIdleLoader();
                else
                    this._load();

                // Initialize data polling if configured
                this._startPolling();
            }

            // Cleanup memory on removal
            disconnectedCallback() {
                // Stop polling
                this._stopPolling();

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
                this._disconnectTimeout = setTimeout(() => {
                    // If we got re-attached after a slower move, abort cleanup
                    if (this.isConnected) {
                        this._disconnectTimeout = null;
                        return;
                    }

                    // Emit unmounted
                    this._triggerHook('unmounted');

                    // Cancel any pending fetches
                    if (this._fetchAbortController)
                        this._fetchAbortController.abort();
                    if (this._observer)
                        this._observer.disconnect();
                    if (this._root && window.Alpine && this._initialized)
                        window.Alpine.destroyTree(this._root);

                    // Reset state so the component can revive if re-attached
                    this._initialized = false;
                    this._loading = false;
                    this._disconnectTimeout = null;
                }, 250);
            }

            // Initiate the recursive polling timeout
            _startPolling() {
                this._stopPolling();
                const interval = parseInt(this.getAttribute('data-fetch-poll') || settings.dataFetchPoll);
                if (isNaN(interval) || interval <= 0)
                    return;

                // Start the timer
                this._pollTimer = setTimeout(async () => {
                    if (!this.isConnected)
                        return;

                    // Fetch data again
                    const src = this.getAttribute('data-src') || settings.dataSrc;
                    if (src && this._initialized && !this.$props.$loading)
                        await this._fetchData(src, true);

                    // Schedule next tick
                    this._startPolling();
                }, interval);
            }

            // Clear the active polling timeout
            _stopPolling() {
                if (this._pollTimer) {
                    clearTimeout(this._pollTimer);
                    this._pollTimer = null;
                }
            }

            // intersectionObserver for lazy loading
            _initLazyObserver() {
                const placeholder = document.createElement('div');
                placeholder.style.minHeight = '1px';
                this._root.appendChild(placeholder);
                this._observer = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting) {
                        this._load();
                        this._observer.disconnect();
                        this._observer = null; // Kill the observer reference
                    }
                }, { rootMargin: '100px' });
                this._observer.observe(this);
            }

            // Idle loading strategy
            _initIdleLoader() {
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(() => this._load(), { timeout: 2000 });
                } else {
                    setTimeout(() => this._load(), 200);
                }
            }

            // Initialize MutationObserver for dynamic Light DOM slots
            _initSlotObserver() {
                if (this._slotObserver)
                    return;

                this._slotObserver = new MutationObserver((mutations) => mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        // Only handle Elements and Text nodes
                        if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE)
                            return;

                        // Ignore the slot containers themselves if they trigger an add
                        if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-acl-slot'))
                            return;

                        // Determine target slot name + find the internal slot container
                        const slotName = (node.nodeType === Node.ELEMENT_NODE ? node.getAttribute('slot') : null) || 'default',
                            container = this._root.querySelector(`div[data-acl-slot="${slotName}"]`);

                        // Move the node into the container
                        if (container)
                            container.appendChild(node);
                    });
                }));

                // Only observe direct children additions
                this._slotObserver.observe(this, { childList: true });
            }

            // Allow the component to be reloaded
            async reload() {
                if (this._loading)
                    return;
                console.log(`[ACL] Reloading <${tagName}>...`);

                // Clear data cache for this specific endpoint
                const currentDataSrc = this.getAttribute('data-src') || settings.dataSrc;
                if (currentDataSrc)
                    dataFetchCache.delete(currentDataSrc);

                // Clear caches specific to this component's source
                if (settings.cacheTemplates) {
                    const cache = await caches.open(settings._templateCacheKey);
                    await cache.delete(contentSource);
                }

                // Reset state
                this._initialized = false;
                this.$props.$loading = true;
                this.$props.$error = null;
                this.$props.$data = null;

                // Re-trigger load
                await this._load();
            }

            // Main load sequence
            async _load() {
                const startMark = performance.now();
                try {
                    // Lock loading state
                    if (this._initialized)
                        return;

                    // Emit beforeMount
                    this._triggerHook('beforeMount');

                    // Load external dependencies, get content, and data if needed
                    const promises = [
                        (settings.externalCss.length || settings.externalScripts.length) ? this._loadExternalDependencies() : Promise.resolve(),
                        this._resolveContent(contentSource),
                        (settings.dataSrc || this.getAttribute('data-src')) ? this._fetchData(this.getAttribute('data-src') || settings.dataSrc) : Promise.resolve(),
                    ];

                    // Get content from the resolved source
                    const content = (await Promise.all(promises))[1];

                    // Capture existing children for slotting if using Light DOM
                    let lightSlots = null;
                    if (!settings.shadow)
                        lightSlots = this._captureLightSlots();

                    // Strict clear of root element
                    this._root.replaceChildren();

                    // Inject CSS Links into Shadow (Apply Styles locally)
                    if (settings.shadow && settings.externalCss.length) {
                        settings.externalCss.forEach(url => {
                            const link = document.createElement('link');
                            link.rel = 'stylesheet';
                            link.href = url;
                            this._root.appendChild(link);
                        });
                    }

                    // Render content safely
                    await this._renderSafe(content, lightSlots);

                    // Setup event bubbling for Shadow DOM
                    if (settings.shadow && settings.forwardEvents.length > 0)
                        this._setupEventForwarding();

                    // Start observing Light DOM for dynamic updates
                    if (!settings.shadow)
                        this._initSlotObserver();

                    // Initialize Alpine
                    await this._initAlpine();

                    // Stop timer and store metrics
                    this._perf = { duration: performance.now() - startMark };

                    // Mark success and unlock
                    this._initialized = true;
                    this._loading = false;

                    // Dispatch 'mount' event
                    this._dispatch('mount');
                    this._triggerHook('mounted');

                    //Dispatch 'loaded' event
                    this._dispatch('loaded');
                } catch (err) {
                    console.error(`[ACL] <${tagName}>`, err);
                    this._loading = false; // Unlock on error so we can retry
                    const fallbackSource = this.getAttribute('fallback') || settings.fallback;
                    if (fallbackSource) {
                        try {
                            // Clear failed state
                            this._root.replaceChildren();

                            // Render fallback; pass null for slots as fallback usually doesn't slot user content
                            await this._renderSafe(await this._resolveContent(fallbackSource), null);

                            // Init Alpine (so fallback can be interactive)
                            await this._initAlpine();

                            // Stop timer and store metrics
                            this._perf = { duration: performance.now() - startMark };

                            // Mark success and unlock
                            this._initialized = true;

                            // Dispatch 'loaded' event
                            this._dispatch('loaded');

                            // Stop here, do not render default error
                            return;
                        } catch (fallbackErr) {
                            console.error(`[ACL] <${tagName}> Fallback Failed:`, fallbackErr);
                            // If fallback fails, show original error (or combined)
                            this._renderError(`Load Failed: ${err.message}. (Fallback also failed)`);
                        }
                    } else {
                        // Standard Error Display
                        this._renderError(err.message);
                    }
                }
            }

            // Handle data fetching for APIs with caching, placeholders, and parameters
            async _fetchData(url, skipCache = false) {
                if (!url)
                    return;

                // Abort any pending component request and init new controller
                if (this._fetchAbortController)
                    this._fetchAbortController.abort();
                this._fetchAbortController = new AbortController();
                const signal = this._fetchAbortController.signal;

                // Initialize reactive states for loading and error resets
                this.$props.$loading = true;
                this.$props.$error = null;
                this.$props.$data = null;

                // Enforce request timeout via AbortController cancellation
                const timeoutId = setTimeout(() => this._fetchAbortController.abort('Timeout'), settings.dataFetchTimeout);

                try {
                    // Helper to resolve attributes as JSON, Expressions, or Functions (Sync/Async)
                    const resolveValue = async (attrName, configVal) => {
                        let result = {};
                        const attrVal = this.getAttribute(attrName),
                            context = {
                                el: this,
                                $el: this,
                                props: this.$props,
                                $props: this.$props,
                                root: this._root,
                                $root: this._root,
                            };
                        if (attrVal) {
                            const trimmed = attrVal.trim();
                            try {
                                // Attempt standard JSON parsing first
                                if (trimmed.startsWith('{') || trimmed.startsWith('['))
                                    result = JSON.parse(trimmed.replace(/'/g, '"'));
                                else throw new Error();
                            } catch {
                                try {
                                    // Evaluate as JS: supports arrow functions and dynamic expressions
                                    // We inject $props and $el into the function scope for convenience
                                    const evaled = (new Function('$props', '$el', `return (${trimmed})`))(this.$props, this);
                                    result = typeof evaled === 'function' ? await evaled.call(this, context) : evaled;
                                } catch (e) {
                                    console.warn(`[ACL] Invalid value in ${attrName} for <${tagName}>`, e);
                                }
                            }
                        }

                        // Merge with JS-based configuration (if provided)
                        if (configVal) {
                            result = {
                                ...result,
                                ...(
                                    (
                                        typeof configVal === 'function'
                                            ? await configVal.call(this, context)
                                            : configVal
                                    ) || {})
                            };
                        }

                        return result;
                    };

                    // Resolve placeholders and query parameters from both HTML and JS config
                    const keys = await resolveValue('data-fetch-keys', settings.dataFetchKeys),
                        params = await resolveValue('data-fetch-params', settings.dataFetchParams);

                    // Perform URL placeholder replacement (e.g., :userId -> 123)
                    let resolvedUrl = url;
                    Object.entries(keys).forEach(([k, v]) => resolvedUrl = resolvedUrl.replace(`:${k}`, toUrlValue(v)));

                    // Build final URL string with appended query parameters
                    let finalUrl = new URL(resolvedUrl, window.location.origin);
                    if (Object.keys(params).length > 0)
                        finalUrl.search = toSearchParamsDeep(params).toString();

                    // Convert to string for caching
                    finalUrl = finalUrl.toString();

                    // Bypass shared cache if requested
                    if (skipCache)
                        dataFetchCache.delete(finalUrl);

                    // Shared cache management (Deduplicate identical requests)
                    if (!dataFetchCache.has(finalUrl)) {
                        const fetchTask = (async () => {
                            let options = {
                                method: 'GET',
                                headers: { 'Accept': 'application/json' },
                                ...AlpineComponentLoader.globalConfig?.dataFetchOptions || {},
                                ...settings?.dataFetchOptions || {}
                            };

                            // Apply beforeFetch hook for global or local request customization
                            if (typeof settings?.hooks?.beforeFetch === 'function') {
                                try {
                                    const modified = await settings.hooks.beforeFetch(options);
                                    if (modified && typeof modified === 'object')
                                        options = modified;
                                } catch (e) {
                                    console.warn(`[ACL] beforeFetch hook error for <${tagName}>`, e);
                                }
                            }

                            // Fetch and validate response status and content type
                            const res = await fetch(finalUrl, options);
                            if (!res.ok)
                                throw new Error(`API Error: ${res.status}`);

                            // Validate content type header as JSON
                            const contentType = res.headers.get("content-type");
                            if (!contentType?.includes("application/json"))
                                throw new Error("Invalid JSON response");

                            // Parse JSON response
                            return await res.json();
                        })();

                        // Store pending promise in cache and prune on failure
                        dataFetchCache.set(finalUrl, fetchTask);
                        fetchTask.catch(() => dataFetchCache.delete(finalUrl));
                    }

                    // Race the shared network task against local abort/timeout logic
                    const json = await Promise.race([
                        dataFetchCache.get(finalUrl),
                        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }))
                    ]);

                    // Transform received data via afterFetch hook
                    let processedData = json;
                    if (typeof settings?.hooks?.afterFetch === 'function') {
                        try {
                            let modified = await settings.hooks.afterFetch(json);
                            if (modified && typeof modified === 'object')
                                processedData = modified;
                        } catch (e) {
                            console.warn(`[ACL] afterFetch hook error for <${tagName}>`, e);
                        }
                    }

                    // Finalize component data update if not locally aborted
                    if (!signal.aborted)
                        this.$props.$data = processedData;

                } catch (e) {
                    // Handle errors or timeout cancellations for the specific instance
                    if (signal.aborted) {
                        if (signal.reason === 'Timeout') {
                            this.$props.$error = `Request timed out after ${settings.fetchTimeout}ms`;
                            this.$props.$data = null;
                        }
                        return;
                    }
                    console.error(`[ACL] Fetch failed for ${url}`, e);
                    this.$props.$error = e.message;
                    this.$props.$data = null;
                } finally {
                    // Cleanup timers and unlock component loading states
                    clearTimeout(timeoutId);
                    if (!signal.aborted || signal.reason === 'Timeout') {
                        this.$props.$loading = false;
                        if (this._fetchAbortController?.signal === signal)
                            this._fetchAbortController = null;
                    }
                }
            }

            // Helper to execute hooks
            _triggerHook(hookName, detail = {}) {
                if (settings.hooks && typeof settings.hooks[hookName] === 'function') {
                    settings.hooks[hookName].call(this, {
                        el: this,
                        root: this._root,
                        props: this.$props,
                        ...detail
                    });
                }
            }

            // Load external CSS/JS dependencies
            async _loadExternalDependencies() {
                const promises = [];

                // CSS: Always inject into global head
                // This ensures @font-face and @keyframes are registered globally
                settings.externalCss.forEach(url => {
                    // Check if link exists in head
                    if (!document.querySelector(`link[href="${url}"]`)) {
                        const link = document.createElement('link');
                        link.rel = 'stylesheet';
                        link.href = url;
                        document.head.appendChild(link);
                    }
                });

                // Scripts: Only inject if not already loaded
                // This ensures scripts are loaded in the correct order
                settings.externalScripts.forEach(url => {
                    if (!scriptLoadCache.has(url)) {
                        const p = new Promise((resolve, reject) => {
                            if (document.querySelector(`script[src="${url}"]`)) {
                                resolve();
                                return;
                            }
                            const script = document.createElement('script');
                            script.src = url;
                            script.async = true;
                            script.onload = () => resolve();
                            script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
                            document.head.appendChild(script);
                        });
                        scriptLoadCache.set(url, p);
                    }
                    promises.push(scriptLoadCache.get(url));
                });

                // Wait for all promises
                await Promise.all(promises);
            }

            // Manual slot polyfill for Light DOM
            _captureLightSlots() {
                // Recover slotted nodes if re-rendering (prevent loss)
                if (this._initialized)
                    this._root.querySelectorAll('[data-acl-slot]').forEach(container => {
                        while (container.firstChild)
                            this._originalLightDom.appendChild(container.firstChild);
                    });

                // Capture any new direct children (First load or dynamic additions)
                while (this.firstChild)
                    this._originalLightDom.appendChild(this.firstChild);

                // We iterate the storage fragment to sort nodes into the slots map
                // Note: The nodes physically exist in the fragment until moved by _renderSafe
                return Array.from(this._originalLightDom.childNodes).reduce((slots, node) => {
                    // Determine slot name
                    const name = (
                        node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('slot')
                    ) ? node.getAttribute('slot') : 'default';

                    // Add node to slot
                    return {
                        ...slots,
                        [name]: (slots[name] || []).concat(node)
                    };
                }, { default: [] });
            }

            // Render logic using DOM manipulation
            async _renderSafe(content, lightSlots) {
                let rootNode;

                // Convert stream to string if needed
                if (content instanceof ReadableStream) {
                    const reader = content.getReader(),
                        decoder = new TextDecoder(),
                        accumulator = [];
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done)
                            break;
                        accumulator.push(typeof value === 'string' ? value : decoder.decode(value, { stream: true }));
                    }
                    content = accumulator.join('') + decoder.decode();

                    console.log('[ACL] Stream content loaded as string.');
                }

                // Parse string to DOM if needed, otherwise clone fragment
                if (typeof content === 'string') {
                    // Parse HTML to DOM
                    const doc = (new DOMParser()).parseFromString(content, 'text/html');

                    // Create document fragment to hold elements
                    rootNode = document.createDocumentFragment();

                    // Move elements from head/body (styles, title, meta and actual markup)
                    [
                        ...Array.from(doc.head.childNodes),
                        ...Array.from(doc.body.childNodes),
                    ].forEach(node => rootNode.appendChild(node));
                } else
                    rootNode = content.cloneNode(true);

                // Process styles (constructible, scoping, or stripping)
                if (!settings.stripStyles) {
                    const styles = Array.from(rootNode.querySelectorAll('style'));

                    // Constructible stylesheets (Shadow DOM only)
                    if (settings.shadow && settings.useConstructibleStyles && document.adoptedStyleSheets) {
                        const combinedCss = styles.map(s => s.textContent).join('\n');
                        let sheet = null;

                        if (combinedCss.trim().length > 0) {
                            if (styleSheetCache.has(combinedCss))
                                sheet = styleSheetCache.get(combinedCss);
                            else {
                                sheet = new CSSStyleSheet();
                                sheet.replaceSync(combinedCss);
                                styleSheetCache.set(combinedCss, sheet);
                            }
                        }

                        // Apply shared + internal styles
                        this._root.adoptedStyleSheets = [
                            ...(settings.sharedStyleSheets || []),
                            ...(sheet ? [sheet] : [])
                        ];

                        // Remove style tags since we moved them to adoptedStyleSheets
                        styles.forEach(el => el.remove());
                    } else {
                        // Fallback: Standard tag injection + scoping
                        styles.forEach(style => {
                            if (!settings.shadow) {
                                // Native @scope support
                                if ('CSSScopeRule' in window) {
                                    style.textContent = `@scope { ${style.textContent.replace(/:host/g, ':scope')} }`;
                                } else {
                                    this.setAttribute('data-scope', this._scopeId);

                                    // Handles :host(.active) -> tagName[data-scope].active
                                    // Handles :host -> tagName[data-scope]
                                    const scopeSelector = `${tagName}[data-scope="${this._scopeId}"]`;
                                    if (style.textContent.includes(':host')) {
                                        style.textContent = style.textContent
                                            .replace(/:host\s*\(([^)]+)\)/g, `${scopeSelector}$1`) // Handle :host(...)
                                            .replace(/:host/g, scopeSelector);                     // Handle :host
                                    }
                                }
                            }
                        });
                    }
                } else {
                    rootNode.querySelectorAll('style').forEach(el => el.remove());
                }

                // Process scripts (security check and re-creation)
                const scripts = [];
                if (settings.executeScripts) {
                    rootNode.querySelectorAll('script').forEach(oldScript => {
                        const newScript = document.createElement('script');
                        Array.from(oldScript.attributes).forEach(attr =>
                            newScript.setAttribute(attr.name, attr.value)
                        );
                        newScript.textContent = oldScript.textContent;
                        scripts.push(newScript);
                        oldScript.remove();
                    });
                } else {
                    rootNode.querySelectorAll('script').forEach(el => el.remove());
                }

                // Inject Light DOM slots if needed
                if (!settings.shadow) {
                    // Instead of replacing the slot entirely, we replace it with a persistent container
                    // This allows us to append new nodes to it later via the MutationObserver
                    rootNode.querySelectorAll('slot').forEach(slotEl => {
                        const name = slotEl.getAttribute('name') || 'default';

                        // Create a transparent wrapper acting as the slot
                        const anchor = document.createElement('div');
                        anchor.style.display = 'contents';
                        anchor.setAttribute('data-acl-slot', name);

                        // Insert pre-captured nodes (initial render)
                        const nodesToInsert = lightSlots ? lightSlots[name] : null;
                        if (nodesToInsert && nodesToInsert.length > 0) {
                            nodesToInsert.forEach(node => anchor.appendChild(node));
                        }
                        // Fallback content (if no nodes provided)
                        else if (slotEl.childNodes.length > 0) {
                            while (slotEl.firstChild)
                                anchor.appendChild(slotEl.firstChild);
                        }

                        // Replace the <slot> tag with our anchor
                        slotEl.replaceWith(anchor);
                    });
                }

                // Move nodes to component root
                while (rootNode.firstChild) {
                    const node = rootNode.firstChild;

                    // Attach props directly to element
                    if (node.nodeType === 1)
                        node.$props = this.$props;

                    // Append to root
                    this._root.appendChild(node);
                }

                // Append scripts to trigger execution
                scripts.forEach(s => this._root.appendChild(s));
            }

            // Forward specific events out of Shadow DOM
            _setupEventForwarding() {
                settings.forwardEvents.forEach(eventName => {
                    this._root.addEventListener(eventName, (e) => {
                        this.dispatchEvent(new CustomEvent(eventName, {
                            bubbles: true,
                            composed: true,
                            detail: e.detail
                        }));
                    });
                });
            }

            // Advanced prop validation and type casting
            _updateProp(name, value) {
                // Skip data-src, it's handled separately
                if (name === 'data-src')
                    return;

                // Get config
                const configDef = settings.attributes[name];

                // Normalization: handle { type: String } vs just String
                const type = (configDef && configDef.type) ? configDef.type : configDef,
                    required = (configDef && configDef.required) === true,
                    validator = (configDef && configDef.validator) ? configDef.validator : null,
                    defaultValue = (configDef && configDef.hasOwnProperty('default')) ? configDef.default : undefined,
                    options = (configDef && configDef.options) ? configDef.options : null,
                    schema = (configDef && configDef.schema) ? configDef.schema : null;

                // Handle null/undefined values
                if (value === null || value === undefined) {
                    if (defaultValue !== undefined) {
                        this.$props[name] = defaultValue;
                        return;
                    }
                    if (required)
                        console.warn(`[ACL] Missing required prop "${name}" on <${tagName}>`);

                    this._applyTypeDefault(name, type);
                    return;
                }

                // Type Casting
                let parsedValue;
                if (type === Boolean) {
                    parsedValue = (value !== null && value !== 'false');
                } else if (type === Number) {
                    const num = Number(value);
                    parsedValue = isNaN(num) ? 0 : num;
                } else if (type === Object || type === Array) {
                    try {
                        if (!value) parsedValue = (type === Array) ? [] : {};
                        else parsedValue = JSON.parse(value.replace(/'/g, '"'));
                    } catch (e) {
                        console.warn(`[ACL] Attribute "${name}" is invalid JSON:`, value);
                        parsedValue = (type === Array) ? [] : {};
                    }
                } else {
                    parsedValue = value;
                }

                // Validate against 'enums' (allowed values)
                if (options && Array.isArray(options) && !options.includes(parsedValue)) {
                    console.warn(`[ACL] Value "${parsedValue}" is not a valid option for prop "${name}" on <${tagName}>. Allowed:`, options);
                    if (defaultValue !== undefined)
                        this.$props[name] = defaultValue;
                    else if (this.$props[name] === undefined)
                        this._applyTypeDefault(name, type);
                    return;
                }

                // Validate with a JSON Schema
                if (schema && type === Object && typeof parsedValue === 'object' && parsedValue !== null) {
                    if (Object.entries(schema).some(([k, t]) => {
                        const val = parsedValue[k];
                        if (val === undefined)
                            return true;
                        if (t === String)
                            return typeof val !== 'string';
                        if (t === Number)
                            return typeof val !== 'number';
                        if (t === Boolean)
                            return typeof val !== 'boolean';
                        if (t === Array)
                            return !Array.isArray(val);
                        if (t === Object)
                            return typeof val !== 'object' || Array.isArray(val) || val === null;
                        return false;
                    })) {
                        console.warn(`[ACL] Schema validation failed for prop "${name}" on <${tagName}>.`);
                        if (defaultValue !== undefined)
                            this.$props[name] = defaultValue;
                        else if (this.$props[name] === undefined)
                            this._applyTypeDefault(name, type);
                        return;
                    }
                }

                // Validation: Custom Validator
                if (validator && typeof validator === 'function') {
                    if (!validator(parsedValue)) {
                        console.warn(`[ACL] Validation failed for prop "${name}" on <${tagName}>. Value:`, parsedValue);
                        // If we have a default, use it
                        if (defaultValue !== undefined)
                            this.$props[name] = defaultValue;
                        // If prop is currently undefined (initial load), set a safe type default
                        else if (this.$props[name] === undefined)
                            this._applyTypeDefault(name, type);
                        // If prop already had a value (update), do nothing (keep old valid value)
                        return;
                    }
                }

                this.$props[name] = parsedValue;
            }

            // Helper for type safety
            _applyTypeDefault(name, type) {
                if (type === Number)
                    this.$props[name] = 0;
                else if (type === Boolean)
                    this.$props[name] = false;
                else if (type === Array)
                    this.$props[name] = [];
                else if (type === Object)
                    this.$props[name] = {};
                else this.$props[name] = '';
            }

            // Reactively update props when attributes change
            _syncAllAttributes() {
                observedAttrs.forEach(name => this._updateProp(name, this.getAttribute(name)));
            }

            // Initialize persistence strategy with helpers
            _initPersistence() {
                const mode = this.getAttribute('persist') || settings.persist;
                if (!mode)
                    return;

                // Choose storage (default to sessionStorage if not specified), generate key, and debounce config
                const storage = (mode === 'local') ? localStorage : sessionStorage,
                    key = this.getAttribute('persist-key') || settings.persistKey ||
                        `acl:${this.localName}:${this.id ? ':' + this.id : 'no-id'}`,
                    debounceMs = parseInt(this.getAttribute('persist-debounce') || settings.persistDebounce || '250', 10);

                // Debounce timer for persistence
                let _timer = null;

                // Create a clean snapshot
                const getSnapshot = () => Object.fromEntries(
                    Object.entries(this.$props)
                        .filter(([k, v]) => !k.startsWith('$') && typeof v !== 'function')
                );

                // Perform immediate save
                const saveNow = (value) => {
                    if (_timer)
                        clearTimeout(_timer);
                    _timer = null;
                    storage.setItem(key, JSON.stringify(value || getSnapshot()));
                };

                // Attach persistence helpers
                this.$props.$persistence = {
                    $key: key,
                    $save: (value) => {
                        if (debounceMs > 0) {
                            if (_timer)
                                clearTimeout(_timer);
                            _timer = setTimeout(() => saveNow(value), debounceMs);
                        } else {
                            saveNow(value);
                        }
                    },
                    $clear: () => {
                        if (_timer)
                            clearTimeout(_timer);
                        _timer = null;
                        storage.removeItem(key);
                    },
                    $get: (k = null, fallback = null) => {
                        try {
                            let stored = JSON.parse(storage.getItem(key));
                            return (k ? stored[k] : stored) || fallback;
                        } catch (e) {
                            return fallback;
                        }
                    },
                    $flush: () => {
                        if (_timer)
                            saveNow();
                    }
                };

                // Restore state on load
                try {
                    const stored = this.$props.$persistence.$get();
                    if (stored && typeof stored === 'object')
                        for (const k in this.$props)
                            if (Object.prototype.hasOwnProperty.call(stored, k))
                                this.$props[k] = stored[k];
                } catch (e) {
                    console.warn(`[ACL] Restore failed for ${key}`, e);
                }

                // Start saving on Alpine updates
                Alpine.effect(() => this.$props.$persistence.$save(getSnapshot()));

                // Flush on page unload to prevent data loss
                if (debounceMs > 0)
                    window.addEventListener('beforeunload', () => this.$props.$persistence.$flush());
            }

            // Wait for Alpine.js to load
            async _initAlpine() {
                if (window.Alpine)
                    return this._finishAlpineInit();

                // Bind to alpine:init event + timeout if it is not fired
                return new Promise((resolve, reject) => {
                    document.addEventListener('alpine:init', () => {
                        this._finishAlpineInit();
                        resolve();
                    }, { once: true });

                    // Timeout
                    setTimeout(() => {
                        if (window.Alpine) {
                            this._finishAlpineInit();
                            resolve();
                        }
                        else
                            reject(new Error("Alpine.js not found (Timeout)"));
                    }, 5000);
                });
            }

            // Bridge props to Alpine store and init tree once Alpine is ready
            _finishAlpineInit() {
                // Bind Alpine store if provided
                const storeName = this.getAttribute('bind-store') || settings.bindStore;
                if (storeName) {
                    let store = Alpine.store(storeName);
                    if (store) {
                        // Merge Alpine store with provided $props
                        if (this.$props && typeof this.$props === 'object')
                            Object.keys(this.$props)
                                .filter(key => store[key] === undefined)
                                .forEach(key => store[key] = this.$props[key]);

                        // Set $props to Alpine store
                        this.$props = store;
                    } else {
                        console.error(`[ACL] Store "${storeName}" not found. Falling back to local state.`);
                        this.$props = window.Alpine.reactive(this.$props || {});
                    }
                } else {
                    // Initialize Alpine Store
                    this.$props = window.Alpine.reactive(this.$props || {});
                }

                // Initialize persistence
                this._initPersistence();

                // Track reactive updates for the debugger
                // We manually touch all props *except* $lastUpdated to avoid an infinite loop
                Alpine.effect(() => {
                    if (this.$props) {
                        Object.keys(this.$props).forEach(k => {
                            if (k !== '$lastUpdated')
                                void this.$props[k];
                        });
                        this.$props.$lastUpdated = Date.now();
                    }
                });

                // Set an anonymous Alpine store for debugging
                Alpine.store(`props_${tagName}_${Math.random().toString(36).slice(2)}`, this.$props);

                // Pass the reactive reference to all children
                // Any change to this.$props by children will now update the Store directly (and vice versa)
                if (this._root && this._root.children)
                    Array.from(this._root.children).forEach(node => {
                        if (node.nodeType === 1)
                            node.$props = this.$props;
                    });

                // We wrap in nextTick to ensure the DOM is settled before Alpine scans it
                window.Alpine.nextTick(() => {
                    if (this._root)
                        window.Alpine.initTree(this._root);
                });
            }

            // Render error message safely
            _renderError(msg) {
                const container = document.createElement('div');
                container.style.cssText = toCssString(settings.errorCss);

                const header = document.createElement('strong');
                header.textContent = `Load Failed: <${tagName}>`;

                const code = document.createElement('code');
                code.textContent = msg;
                code.style.display = 'block';
                code.style.marginTop = '4px';
                container.appendChild(header);
                container.appendChild(code);

                if (settings.shadow)
                    this._root.replaceChildren(container);
                else
                    this._root.appendChild(container);
            }

            // Dispatch custom event
            _dispatch(eventName) {
                this.dispatchEvent(new CustomEvent(eventName, {
                    bubbles: true,
                    composed: true,
                    detail: { props: this.$props }
                }));
            }

            // Resolve URL string, ID selector, or Template object
            async _resolveContent(source) {
                return await AlpineComponentLoader.loadTemplate(source, settings);
            }

            // Helpers to deal with template caches within the component
            // TODO: Implement as a an available Alpine directive/$props function
            async _pruneCache() { return await AlpineComponentLoader.pruneCache(settings._templateCachePrefix, settings._templateCacheKey); }
            async _clearCache() { return await AlpineComponentLoader.clearCache(settings._templateCacheKey); }
        }

        // Register custom element
        customElements.define(tagName, AlpineExternalComponent);
    }
}

// Declarative component proxy, replaces itself with the loaded component
class AlpineDeclarativeLoader extends HTMLElement {
    async connectedCallback() {
        const src = this.getAttribute('src') || this.getAttribute('url');
        if (!src) {
            console.error(`<${this.localName}>: missing "src" attribute`);
            return;
        }

        // Determine Tag Name (Attribute > Filename)
        let tagName = this.getAttribute('tag');
        if (!tagName)
            tagName = (src.split('/').pop()).split('.').shift(); // Strip extension

        // Validate tag name; ensure it contains a hyphen
        if (!tagName.includes('-')) {
            console.error(`<${this.localName}>: Tag name "${tagName}" must contain a hyphen.`);
            return;
        }

        // Parse Config from Attributes
        const config = {
            shadow: this.hasAttribute('shadow') ? (this.getAttribute('shadow') !== 'false') : AlpineComponentLoader.globalConfig.shadow,
            loading: this.getAttribute('loading') || 'eager',
            dataSrc: this.getAttribute('data-src') || null,
            bindStore: this.getAttribute('bind-store') || null,
            fallback: this.getAttribute('fallback') || null,
            attributes: {} // Auto-inference of props
        };

        // Define the component (if not already defined)
        if (!customElements.get(tagName)) {
            // Heuristic: Check other attributes to guess Prop Types
            for (const attr of this.attributes) {
                if ([
                    'src', 'url', 'tag', 'shadow', 'loading', 'class', 'style', 'id', 'bind-store', 'fallback',
                    'data-src', 'data-fetch-keys', 'data-fetch-params', 'data-fetch-timeout', 'data-fetch-poll'
                ].includes(attr.name))
                    continue;

                // If value looks like JSON Array/Object, treat as such
                const val = attr.value.trim();

                // Try to infer type
                let inferredType = String;
                if (val.startsWith('[') || val.startsWith('{')) inferredType = (val.startsWith('[')) ? Array : Object;
                else if (val === 'true' || val === 'false' || val === '') inferredType = Boolean;
                else if (!isNaN(Number(val))) inferredType = Number;

                // Add to config
                config.attributes[attr.name] = inferredType;
            }

            // Define the component
            AlpineComponentLoader.define(tagName, src, config);
        }

        // Create the REAL element
        const realElement = document.createElement(tagName);

        // Forward Attributes (Props, Classes, IDs)
        for (const attr of this.attributes) {
            if (['src', 'url', 'tag', 'shadow'].includes(attr.name))
                continue; // Don't forward loader-specific config
            realElement.setAttribute(attr.name, attr.value);
        }

        // Move any children (slots) to the REAL element
        while (this.firstChild)
            realElement.appendChild(this.firstChild);

        // Swap in the DOM
        this.replaceWith(realElement);
    }
}

// Dynamic component switcher
class AlpineDynamicLoader extends HTMLElement {
    static get observedAttributes() {
        return ['is'];
    }

    constructor() {
        super();
        this._cache = new Map();
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (name === 'is' && newVal && newVal !== oldVal)
            this._switch(newVal);
    }

    connectedCallback() {
        this.setAttribute('data-acl-component', 'acl-dynamic');
        if (!this.firstElementChild && this.getAttribute('is'))
            this._switch(this.getAttribute('is'));
    }

    disconnectedCallback() {
        // Cleanup cache to prevent memory leaks when loader is removed
        this._cache.forEach(el => {
            if (el._root && window.Alpine)
                window.Alpine.destroyTree(el._root);
        });
        this._cache.clear();
    }

    // Switch to a new component with View Transitions support
    async _switch(tag) {
        if (!tag)
            return;
        tag = tag.toLowerCase();

        const updateDOM = () => {
            const keepAlive = this.hasAttribute('keep-alive'),
                current = this.firstElementChild;

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
                if (current && !keepAlive)
                    this._cache.delete(current.tagName.toLowerCase());
            }

            // Restore or Create new component
            let el;
            if (keepAlive && this._cache.has(tag)) {
                el = this._cache.get(tag);

                // Restore scroll position
                if (el._savedScroll)
                    setTimeout(() => el.scrollTop = el._savedScroll, 0);
            } else {
                try {
                    el = document.createElement(tag);
                    // Forward attributes (excluding loader-specific ones)
                    Array.from(this.attributes).forEach(attr => {
                        if (!['is', 'keep-alive'].includes(attr.name))
                            el.setAttribute(attr.name, attr.value);
                    });
                } catch (e) {
                    console.error(`[ACL] Failed to create: <${tag}>`, e);
                }
            }

            // Add to DOM
            if (el)
                this.appendChild(el);

            // Return the new element
            return el;
        };

        // Use native View Transitions if available for animated switching
        if (document.startViewTransition) {
            document.startViewTransition(() => updateDOM());
        } else {
            // Manual fallback transition logic (Fade out/in)
            const current = this.firstElementChild;
            if (current) {
                current.style.transition = 'opacity 0.1s ease-out';
                current.style.opacity = '0';
                await new Promise(r => setTimeout(r, 100));
            }

            // Update DOM
            const el = updateDOM();
            if (el) {
                el.style.opacity = '0';
                el.style.transition = 'opacity 0.1s ease-in';
                requestAnimationFrame(() => {
                    el.style.opacity = '1';
                    setTimeout(() => {
                        el.style.transition = '';
                        el.style.opacity = '';
                    }, 100);
                });
            }
        }
    }
}

// Once DOM is ready, start loading components
try {
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', AlpineComponentLoader.start, { once: true });
    } else {
        AlpineComponentLoader.start();
    }
} catch (e) {
    console.warn(`[ACL] Failed to register components:`, e);
}