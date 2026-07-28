// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Propagate jsDelivr's generated minified suffix to package-owned dependencies
const currentModuleUrl = new URL(import.meta.url), isMinifiedModule = currentModuleUrl.pathname.endsWith('.min.js'), resolveLocalModule = (specifier)=>{
    const resolved = new URL(isMinifiedModule ? specifier.replace(/\.js$/, '.min.js') : specifier, currentModuleUrl);
    if (currentModuleUrl.searchParams.has('acl-instance')) resolved.searchParams.set('acl-instance', currentModuleUrl.searchParams.get('acl-instance'));
    return resolved.href;
}, importLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), importDeferredLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), [{ hasOwn, setBoundedMapEntry }, { ACLLoadError, raceWithSignal }, { cloneRuntimeValue, parseJson, stableStringify }, { validateSchemaShape }] = await Promise.all([
    importLocalModule('../config.js'),
    importLocalModule('../errors.js'),
    importLocalModule('../values.js'),
    importLocalModule('../props.js')
]);
let assetsModulePromise = null, cachesModulePromise = null, renderingModulePromise = null;
// Memoize optional runtime modules independently and permit a later retry after failures
const loadRuntimeModule = (specifier, getCurrent, setCurrent)=>{
    const current = getCurrent();
    if (current) return current;
    const operation = importDeferredLocalModule(specifier).catch((error)=>{
        // Evict only the failed operation without disturbing a newer retry
        if (getCurrent() === operation) setCurrent(null);
        throw new ACLLoadError('Unable to load an optional asset runtime module.', {
            code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
            phase: 'runtime-import',
            cause: error,
            retryable: true
        });
    });
    setCurrent(operation);
    return operation;
}, loadAssetsModule = ()=>loadRuntimeModule('../assets.js', ()=>assetsModulePromise, (value)=>{
        assetsModulePromise = value;
    }), loadCachesModule = ()=>loadRuntimeModule('../caches.js', ()=>cachesModulePromise, (value)=>{
        cachesModulePromise = value;
    }), loadRenderingModule = ()=>loadRuntimeModule('../rendering.js', ()=>renderingModulePromise, (value)=>{
        renderingModulePromise = value;
    });
// Private custom-element controller with definition context supplied by the facade
export const withComponentRendering = (Base, { AlpineComponentLoader, settings, tagName, internalObservedAttrs })=>{
    return class extends Base {
        _runHookDetached(hookName, detail = {}) {
            void this._triggerHook(hookName, detail).catch((error)=>{
                // Handle the rejected operation
                AlpineComponentLoader._report('error', `[ACL] ${hookName} hook failed for <${tagName}>`, error, {
                    tagName,
                    phase: 'hook',
                    hook: hookName
                });
                this._dispatchAcl('error', {
                    error,
                    phase: 'hook',
                    hook: hookName
                });
            });
        }
        async _appendShadowExternalStyles(signal = null) {
            const { applyAssetDescriptor } = await loadAssetsModule();
            await Promise.all(settings.externalCss.map(// Transform the current item
            (descriptor)=>new Promise((resolve, reject)=>{
                    // Settle the asynchronous operation
                    const link = document.createElement('link');
                    let settled = false, timeoutId = null, releaseCleanup = ()=>{
                    // Leave cleanup unowned until registration completes
                    };
                    // Settle each shadow stylesheet through one path that releases every listener
                    const cleanup = ()=>{
                        clearTimeout(timeoutId);
                        link.removeEventListener('load', onLoad);
                        link.removeEventListener('error', onError);
                        signal?.removeEventListener('abort', onAbort);
                        releaseCleanup();
                    }, finish = (callback, value)=>{
                        if (settled) return;
                        settled = true;
                        cleanup();
                        callback(value);
                    }, createError = ()=>new ACLLoadError(`Failed to apply stylesheet: ${descriptor.url}`, {
                            code: 'ACL_ASSET_LOAD_FAILED',
                            phase: 'asset'
                        }), createCancelError = ()=>new ACLLoadError('Component asset load was canceled.', {
                            code: 'ACL_LOAD_CANCELED',
                            phase: 'asset'
                        }), onLoad = ()=>finish(resolve), onError = ()=>finish(reject, createError()), onAbort = ()=>finish(reject, createCancelError());
                    if (signal?.aborted) {
                        onAbort();
                        return;
                    }
                    link.rel = 'stylesheet';
                    link.href = descriptor.url;
                    applyAssetDescriptor(link, descriptor);
                    link.addEventListener('load', onLoad, {
                        once: true
                    });
                    link.addEventListener('error', onError, {
                        once: true
                    });
                    signal?.addEventListener('abort', onAbort, {
                        once: true
                    });
                    timeoutId = setTimeout(onError, descriptor.timeout);
                    releaseCleanup = this._addCleanup(// Register cleanup work
                    ()=>finish(reject, createError()));
                    this._root.appendChild(link);
                })));
        }
        async _loadExternalDependencies(signal = null) {
            const [{ applyAssetDescriptor, findExternalScript, findExternalStyle, normalizeAssetUrl }, { scriptLoadCache, styleLoadPromiseCache }] = await Promise.all([
                loadAssetsModule(),
                loadCachesModule()
            ]);
            // Race shared global work against only this component's local load signal
            const awaitForComponent = (promise)=>raceWithSignal(promise, signal, // Settle the abortable promise
                ()=>new ACLLoadError('Component asset load was canceled.', {
                        code: 'ACL_LOAD_CANCELED',
                        phase: 'asset'
                    }));
            // Inject CSS into document head and await readiness so components do not flash unstyled
            await Promise.all(settings.externalCss.map(async (descriptor)=>{
                // Transform the current item
                const url = descriptor.url, cacheKey = stableStringify({
                    url: normalizeAssetUrl(url),
                    ...descriptor
                });
                let loadPromise = styleLoadPromiseCache.get(cacheKey);
                if (!loadPromise) {
                    // Share one global stylesheet request across every component using its descriptor
                    loadPromise = new Promise((resolve, reject)=>{
                        // Settle the asynchronous operation
                        let link = findExternalStyle(url), timeoutId = null;
                        // Remove request listeners and its fallback timeout on every outcome
                        const cleanup = ()=>{
                            clearTimeout(timeoutId);
                            link?.removeEventListener('load', onLoad);
                            link?.removeEventListener('error', onError);
                        };
                        // Mark the shared stylesheet ready before resolving all consumers
                        const onLoad = ()=>{
                            cleanup();
                            if (link) link.dataset.aclLoaded = 'true';
                            resolve();
                        };
                        // Remove only loader-owned failed stylesheets before rejecting consumers
                        const onError = ()=>{
                            cleanup();
                            if (link?.dataset.aclOwned === 'true') link.remove();
                            reject(new ACLLoadError(`Failed to load stylesheet: ${url}`, {
                                code: 'ACL_ASSET_LOAD_FAILED',
                                phase: 'asset'
                            }));
                        };
                        if (link?.dataset.aclLoaded === 'true' || link?.sheet) {
                            resolve();
                            return;
                        }
                        if (!link) {
                            link = document.createElement('link');
                            link.rel = 'stylesheet';
                            link.href = url;
                            link.dataset.aclOwned = 'true';
                            applyAssetDescriptor(link, descriptor);
                            document.head.appendChild(link);
                        }
                        link.addEventListener('load', onLoad, {
                            once: true
                        });
                        link.addEventListener('error', onError, {
                            once: true
                        });
                        timeoutId = setTimeout(onError, descriptor.timeout);
                    });
                    // A failed shared request must be evicted so a later component can retry it
                    loadPromise.catch(()=>{
                        // Handle the rejected operation
                        if (styleLoadPromiseCache.get(cacheKey) === loadPromise) styleLoadPromiseCache.delete(cacheKey);
                    });
                    setBoundedMapEntry(styleLoadPromiseCache, cacheKey, loadPromise, settings.runtimeCacheMax);
                }
                await awaitForComponent(loadPromise);
            }));
            // Scripts: load sequentially so dependency order is preserved
            for (const descriptor of settings.externalScripts){
                const url = descriptor.url, cacheKey = stableStringify({
                    url: normalizeAssetUrl(url),
                    ...descriptor
                });
                let loadPromise = scriptLoadCache.get(cacheKey);
                if (!loadPromise) {
                    // Share one ordered global script request across every matching component
                    loadPromise = new Promise((resolve, reject)=>{
                        // Settle the asynchronous operation
                        const existing = findExternalScript(url);
                        if (existing && (existing.dataset.aclLoaded === 'true' || existing.dataset.aclOwned !== 'true')) {
                            resolve();
                            return;
                        }
                        const script = existing || document.createElement('script');
                        let timeoutId = null;
                        // Remove request listeners and its fallback timeout on every outcome
                        const cleanup = ()=>{
                            clearTimeout(timeoutId);
                            script.removeEventListener('load', onLoad);
                            script.removeEventListener('error', onError);
                        };
                        // Mark the shared script ready before resolving all consumers
                        const onLoad = ()=>{
                            cleanup();
                            script.dataset.aclLoaded = 'true';
                            resolve();
                        };
                        // Remove only loader-owned failed scripts before rejecting consumers
                        const onError = ()=>{
                            cleanup();
                            if (script.dataset.aclOwned === 'true') script.remove();
                            reject(new ACLLoadError(`Failed to load script: ${url}`, {
                                code: 'ACL_ASSET_LOAD_FAILED',
                                phase: 'asset'
                            }));
                        };
                        script.addEventListener('load', onLoad, {
                            once: true
                        });
                        script.addEventListener('error', onError, {
                            once: true
                        });
                        if (!existing) {
                            script.src = url;
                            script.dataset.aclOwned = 'true';
                            applyAssetDescriptor(script, descriptor);
                        }
                        script.async = false;
                        if (!existing) document.head.appendChild(script);
                        timeoutId = setTimeout(onError, descriptor.timeout);
                    });
                    // A failed shared request must be evicted so a later component can retry it
                    loadPromise.catch(()=>{
                        // Handle the rejected operation
                        if (scriptLoadCache.get(cacheKey) === loadPromise) scriptLoadCache.delete(cacheKey);
                    });
                    setBoundedMapEntry(scriptLoadCache, cacheKey, loadPromise, settings.runtimeCacheMax);
                }
                await awaitForComponent(loadPromise);
            }
        }
        _captureLightSlots() {
            this._lightSlotNodes ||= new Set();
            this._originalLightDom ||= document.createDocumentFragment();
            // Recover only tracked consumer nodes; rendered template nodes are never slot input
            const nodesToStore = [];
            this._lightSlotNodes.forEach((node)=>{
                // Process the current item
                if (!node.parentNode) {
                    this._lightSlotNodes.delete(node);
                    return;
                }
                if (node.parentNode !== this._originalLightDom) nodesToStore.push(node);
            });
            this._originalLightDom.append(...nodesToStore);
            // Before the first render, direct host children are consumer-provided slot nodes
            if (!this._hasRenderedContent) {
                // Exclude loader placeholders while retaining every authored slot node by identity
                const initialNodes = Array.from(this.childNodes).filter((node)=>{
                    // Select matching items
                    if (this._ssrLightNodes?.has(node)) return false;
                    if (node.nodeType === Node.ELEMENT_NODE && (node.hasAttribute('data-acl-placeholder') || node.hasAttribute('data-acl-loading'))) {
                        node.remove();
                        return false;
                    }
                    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-acl-form-proxy')) return false;
                    this._lightSlotNodes.add(node);
                    return true;
                });
                this._originalLightDom.append(...initialNodes);
            }
            // Sort tracked nodes while they physically remain in the storage fragment
            const slots = {
                default: []
            };
            this._lightSlotNodes.forEach((node)=>{
                // Process the current item
                const name = node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('slot') ? node.getAttribute('slot') : 'default';
                (slots[name] ||= []).push(node);
            });
            return slots;
        }
        async _renderSafe(content, lightSlots) {
            const { applySanitizer, cloneParsedFragment, scopeLightDomCss } = await loadRenderingModule();
            let rootNode;
            // Parse string to DOM if needed, otherwise clone fragment
            if (typeof content === 'string') {
                rootNode = cloneParsedFragment(content, settings);
            } else rootNode = content.cloneNode(true);
            rootNode = await applySanitizer(rootNode, settings, {
                el: this,
                root: this._root,
                props: this.$props,
                tagName
            });
            // Process styles through constructible sheets scoping or stripping
            if (!settings.stripStyles) {
                const styles = Array.from(rootNode.querySelectorAll('style'));
                // Use constructible stylesheets for Shadow DOM when supported
                if (settings.shadow && settings.useConstructibleStyles && document.adoptedStyleSheets) {
                    const combinedCss = styles.map(// Transform the current item
                    (s)=>s.textContent).join('\n');
                    let sheet = null;
                    if (combinedCss.trim().length > 0) {
                        const { styleSheetCache } = await loadCachesModule();
                        if (styleSheetCache.has(combinedCss)) sheet = styleSheetCache.get(combinedCss);
                        else {
                            sheet = new CSSStyleSheet();
                            sheet.replaceSync(combinedCss);
                            setBoundedMapEntry(styleSheetCache, combinedCss, sheet, settings.runtimeCacheMax);
                        }
                    }
                    // Apply shared + internal styles
                    this._root.adoptedStyleSheets = [
                        ...settings.sharedStyleSheets || [],
                        ...sheet ? [
                            sheet
                        ] : []
                    ];
                    // Remove style tags since we moved them to adoptedStyleSheets
                    styles.forEach(// Process the current item
                    (el)=>el.remove());
                } else {
                    // Fallback: Standard tag injection + scoping
                    styles.forEach((style)=>{
                        // Process the current item
                        if (!settings.shadow) {
                            // Native @scope support
                            if ('CSSScopeRule' in window) {
                                style.textContent = `@scope { ${style.textContent.replace(/:host/g, ':scope')} }`;
                            } else {
                                this._scopeId ||= `scope-${Math.random().toString(36).slice(2, 9)}`;
                                this.setAttribute('data-scope', this._scopeId);
                                const scopeSelector = `${tagName}[data-scope="${this._scopeId}"]`;
                                style.textContent = scopeLightDomCss(style.textContent, scopeSelector);
                            }
                        }
                    });
                }
            } else {
                rootNode.querySelectorAll('style').forEach(// Process the current item
                (el)=>el.remove());
            }
            // Recreate script tags so inserted component scripts execute
            const scripts = [];
            if (settings.executeScripts) {
                rootNode.querySelectorAll('script').forEach((oldScript)=>{
                    // Process the current item
                    const newScript = document.createElement('script');
                    Array.from(oldScript.attributes).forEach(// Process the current item
                    (attr)=>newScript.setAttribute(attr.name, attr.value));
                    newScript.textContent = oldScript.textContent;
                    scripts.push(newScript);
                    oldScript.remove();
                });
            } else {
                rootNode.querySelectorAll('script').forEach(// Process the current item
                (el)=>el.remove());
            }
            // Replace Light DOM slots with containers that can receive user nodes
            if (!settings.shadow) {
                // Replace light DOM slots with persistent containers for later observer updates
                rootNode.querySelectorAll('slot').forEach((slotEl)=>{
                    // Process the current item
                    const name = slotEl.getAttribute('name') || 'default';
                    // Create a transparent wrapper acting as the slot
                    const anchor = document.createElement('div');
                    anchor.style.display = 'contents';
                    anchor.setAttribute('data-acl-slot', name);
                    // Insert pre-captured nodes on the initial render
                    const nodesToInsert = lightSlots ? lightSlots[name] : null;
                    if (nodesToInsert && nodesToInsert.length > 0) anchor.append(...nodesToInsert);
                    else if (slotEl.childNodes.length > 0) {
                        anchor.append(...Array.from(slotEl.childNodes));
                    }
                    // Replace the <slot> tag with our anchor
                    slotEl.replaceWith(anchor);
                });
            }
            // Move nodes to component root
            this._installAlpinePropsScope();
            const rootChildren = Array.from(rootNode.childNodes);
            rootChildren.forEach((node)=>{
                // Process the current item
                this._exposePropsToNode(node);
            });
            this._root.append(...rootChildren);
            this._hasRenderedContent = true;
            // Append scripts to trigger execution
            this._root.append(...scripts);
        }
        _setupEventForwarding() {
            this._forwardEventCleanups?.forEach(// Process the current item
            (cleanup)=>cleanup());
            this._forwardEventCleanups = null;
            settings.events.forward.forEach((eventRule)=>{
                // Redispatch the configured event name without reprocessing forwarded events
                const handler = (e)=>{
                    this.dispatchEvent(new CustomEvent(eventRule.as, {
                        bubbles: eventRule.bubbles,
                        composed: eventRule.composed,
                        detail: e.detail
                    }));
                };
                this._root.addEventListener(eventRule.from, handler);
                (this._forwardEventCleanups ||= []).push(// Capture the pushed value
                ()=>this._root.removeEventListener(eventRule.from, handler));
            });
        }
        _updateProp(name, value) {
            // Skip loader internals, they are handled separately
            if (internalObservedAttrs.has(name)) return;
            // Read the declared prop configuration for this attribute
            const configDef = settings.attributes[name];
            // Normalize object and constructor prop definitions
            const type = configDef && configDef.type ? configDef.type : configDef, required = (configDef && configDef.required) === true, nullable = (configDef && configDef.nullable) === true, coerce = configDef && typeof configDef.coerce === 'function' ? configDef.coerce : null, validator = configDef && configDef.validator ? configDef.validator : null, configuredDefault = configDef && hasOwn(configDef, 'default') ? configDef.default : undefined, getDefaultValue = ()=>cloneRuntimeValue(typeof configuredDefault === 'function' ? configuredDefault.call(this) : configuredDefault), options = configDef && configDef.options ? configDef.options : null, schema = configDef && configDef.schema ? configDef.schema : null;
            // Handle null/undefined values
            if (value === null || value === undefined) {
                if (configuredDefault !== undefined) {
                    this.$props[name] = getDefaultValue();
                    return;
                }
                if (required) this._reportPropIssue(`[ACL] Missing required prop "${name}" on <${tagName}>.`);
                if (nullable) {
                    this.$props[name] = null;
                    return;
                }
                this._applyTypeDefault(name, type);
                return;
            }
            // Cast string attributes into configured runtime types
            let parsedValue;
            if (nullable && value === 'null') {
                parsedValue = null;
            } else if (coerce) {
                parsedValue = coerce.call(this, value, {
                    el: this,
                    props: this.$props,
                    name,
                    definition: configDef
                });
            } else if (type === Boolean) {
                parsedValue = value !== null && value !== 'false';
            } else if (type === Number) {
                const num = Number(value);
                if (isNaN(num)) {
                    this._reportPropIssue(`[ACL] Attribute "${name}" must be a number on <${tagName}>.`);
                    parsedValue = 0;
                } else parsedValue = num;
            } else if (type === Object || type === Array) {
                if (!value) parsedValue = type === Array ? [] : {};
                else {
                    const invalid = Symbol('invalid-json');
                    parsedValue = parseJson(value, invalid);
                    if (parsedValue === invalid) {
                        this._reportPropIssue(`[ACL] Attribute "${name}" contains invalid JSON on <${tagName}>.`);
                        parsedValue = type === Array ? [] : {};
                    }
                }
                if (type === Array && !Array.isArray(parsedValue) || type === Object && (typeof parsedValue !== 'object' || Array.isArray(parsedValue) || parsedValue === null)) {
                    this._reportPropIssue(`[ACL] Attribute "${name}" does not match its declared type on <${tagName}>.`);
                    parsedValue = type === Array ? [] : {};
                }
            } else {
                parsedValue = value;
            }
            if (parsedValue === null && nullable) {
                this.$props[name] = null;
                return;
            }
            // Validate against enum-style allowed values
            if (options && Array.isArray(options) && !options.includes(parsedValue)) {
                this._reportPropIssue(`[ACL] Value "${parsedValue}" is not a valid option for prop "${name}" on <${tagName}>. Allowed: ${options.join(', ')}.`);
                if (configuredDefault !== undefined) this.$props[name] = getDefaultValue();
                else if (this.$props[name] === undefined) this._applyTypeDefault(name, type);
                return;
            }
            // Validate nested object shapes
            if (schema && type === Object && typeof parsedValue === 'object' && parsedValue !== null) {
                const schemaError = validateSchemaShape(parsedValue, schema, name);
                if (schemaError) {
                    this._reportPropIssue(`[ACL] Schema validation failed for prop "${name}" on <${tagName}>: ${schemaError}`);
                    if (configuredDefault !== undefined) this.$props[name] = getDefaultValue();
                    else if (this.$props[name] === undefined) this._applyTypeDefault(name, type);
                    return;
                }
            }
            // Validate with a custom predicate when provided
            if (validator && typeof validator === 'function') {
                if (!validator(parsedValue)) {
                    this._reportPropIssue(`[ACL] Validation failed for prop "${name}" on <${tagName}>.`);
                    // Prefer the configured default after validation failure
                    if (configuredDefault !== undefined) this.$props[name] = getDefaultValue();
                    else if (this.$props[name] === undefined) this._applyTypeDefault(name, type);
                    // Keep the previous valid value when an update fails validation
                    return;
                }
            }
            this.$props[name] = parsedValue;
        }
    };
};
