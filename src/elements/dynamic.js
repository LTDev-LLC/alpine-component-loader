// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js',
    importLocalModule = (specifier) => import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)),
    [{ HTMLElementBase, validateCustomElementName }, { ACLLoadError, delayWithSignal, toACLLoadError }] =
        await Promise.all([importLocalModule('../runtime/config.js'), importLocalModule('../runtime/errors.js')]);

// Keep dynamic loader controls from being forwarded to rendered children
const internalAttributes = new Set([
    'is',
    'keep-alive',
    'keep-alive-max',
    'transition',
    'transition-duration',
    'data-acl-component',
]);

// Append a transform or filter effect while preserving authored inline styles
const appendEffect = (base, effect) => `${base || ''} ${effect}`.trim();

// Define the temporary outgoing incoming and active styles for every fallback transition
const transitionPresets = Object.freeze({
    fade: {
        properties: ['opacity'],
        // Run the outgoing operation
        outgoing: () => ({ opacity: '0' }),
        // Run the incoming operation
        incoming: () => ({ opacity: '0' }),
        // Run the active operation
        active: (previous) => ({ opacity: previous.opacity || '1' }),
    },
    scale: {
        properties: ['opacity', 'transform'],
        // Run the outgoing operation
        outgoing: (previous) => ({
            opacity: '0',
            transform: appendEffect(previous.transform, 'scale(0.96)'),
        }),
        // Run the incoming operation
        incoming: (previous) => ({
            opacity: '0',
            transform: appendEffect(previous.transform, 'scale(0.96)'),
        }),
        // Run the active operation
        active: (previous) => ({
            opacity: previous.opacity || '1',
            transform: previous.transform || 'scale(1)',
        }),
    },
    'slide-left': {
        properties: ['opacity', 'transform'],
        // Run the outgoing operation
        outgoing: (previous) => ({
            opacity: '0',
            transform: appendEffect(previous.transform, 'translateX(-1.5rem)'),
        }),
        // Run the incoming operation
        incoming: (previous) => ({
            opacity: '0',
            transform: appendEffect(previous.transform, 'translateX(1.5rem)'),
        }),
        // Run the active operation
        active: (previous) => ({
            opacity: previous.opacity || '1',
            transform: previous.transform || 'translateX(0)',
        }),
    },
    'slide-right': {
        properties: ['opacity', 'transform'],
        // Run the outgoing operation
        outgoing: (previous) => ({
            opacity: '0',
            transform: appendEffect(previous.transform, 'translateX(1.5rem)'),
        }),
        // Run the incoming operation
        incoming: (previous) => ({
            opacity: '0',
            transform: appendEffect(previous.transform, 'translateX(-1.5rem)'),
        }),
        // Run the active operation
        active: (previous) => ({
            opacity: previous.opacity || '1',
            transform: previous.transform || 'translateX(0)',
        }),
    },
    blur: {
        properties: ['opacity', 'filter'],
        // Run the outgoing operation
        outgoing: (previous) => ({
            opacity: '0',
            filter: appendEffect(previous.filter, 'blur(8px)'),
        }),
        // Run the incoming operation
        incoming: (previous) => ({
            opacity: '0',
            filter: appendEffect(previous.filter, 'blur(8px)'),
        }),
        // Run the active operation
        active: (previous) => ({
            opacity: previous.opacity || '1',
            filter: previous.filter || 'blur(0)',
        }),
    },
});

// Resolve named CSS transitions with fade as the default fallback
const getTransitionPreset = (name) => transitionPresets[name] || transitionPresets.fade;

// Capture every inline style that a temporary transition may replace
const captureInlineStyles = (element, properties) =>
    Object.fromEntries(
        ['transition', 'willChange', ...properties].map(
            // Transform the current item
            (property) => [property, element.style[property]],
        ),
    );

// Apply a compact inline style record to one transition target
const applyInlineStyles = (element, styles) =>
    Object.entries(styles).forEach(([property, value]) => {
        // Process the current item
        element.style[property] = value;
    });

// Restore authored inline styles after transition work settles or aborts
const restoreInlineStyles = (element, styles) => applyInlineStyles(element, styles);

// Build one synchronized CSS transition declaration for all preset properties
const createTransitionValue = (properties, duration, easing) =>
    properties
        .map(
            // Transform the current item
            (property) => `${property} ${duration}ms ${easing}`,
        )
        .join(', ');

// Create the dynamic switcher class bound to the loader's registry and global settings
export const createDynamicLoader = (loaderClass) =>
    class AlpineDynamicLoader extends HTMLElementBase {
        // Observe only target-tag changes; other attributes are forwarded by a MutationObserver
        static get observedAttributes() {
            return ['is'];
        }

        // Initialize cache, transition, observer, and timer ownership fields
        constructor() {
            super();
            this._cache = new Map();
            this._attrObserver = null;
            this._switchGeneration = 0;
            this._transitionController = null;
            this._transitionFrame = null;
            this._transitionTimer = null;
            this._scrollTimer = null;
        }

        // Start a new switch when the observed target changes on a connected host
        attributeChangedCallback(name, oldValue, newValue) {
            if (name === 'is' && newValue !== oldValue && this.isConnected) void this._switch(newValue);
        }

        // Start attribute forwarding and render the initial target on connection
        connectedCallback() {
            this.setAttribute('data-acl-component', 'acl-dynamic');
            this._startAttributeObserver();
            if (!this.firstElementChild && this.getAttribute('is')) void this._switch(this.getAttribute('is'));
        }

        // Invalidate pending switches and destroy every active or cached child on disconnect
        disconnectedCallback() {
            this._switchGeneration++;
            this._cancelTransitionWork();
            this._attrObserver?.disconnect();
            this._attrObserver = null;
            this._cache.forEach(
                // Process the current item
                (element) => this._destroyCachedElement(element),
            );
            this._cache.clear();
            this.setAttribute('aria-busy', 'false');
        }

        // Abort and release all transition, frame, and scroll work owned by the current switch
        _cancelTransitionWork() {
            this._transitionController?.abort('Superseded');
            this._transitionController = null;
            if (this._transitionFrame != null) cancelAnimationFrame(this._transitionFrame);
            this._transitionFrame = null;
            if (this._transitionTimer != null) clearTimeout(this._transitionTimer);
            this._transitionTimer = null;
            if (this._scrollTimer != null) clearTimeout(this._scrollTimer);
            this._scrollTimer = null;
        }

        // Mirror future public host-attribute mutations to active and cached children
        _startAttributeObserver() {
            if (this._attrObserver) return;
            this._attrObserver = new MutationObserver(
                // Process observed DOM mutations
                (mutations) =>
                    mutations.forEach((mutation) => {
                        // Process the current item
                        if (mutation.type === 'attributes' && !internalAttributes.has(mutation.attributeName))
                            this._syncAttributeToChildren(mutation.attributeName);
                    }),
            );
            this._attrObserver.observe(this, { attributes: true });
        }

        // Apply one host attribute change to every active and keep-alive child
        _syncAttributeToChildren(name) {
            const targets = [...this.children, ...this._cache.values()];
            targets.forEach((element) => {
                // Process the current item
                if (this.hasAttribute(name)) element.setAttribute(name, this.getAttribute(name));
                else element.removeAttribute(name);
            });
        }

        // Copy the complete current public host attribute set to one child
        _syncAttributesToChild(element) {
            Array.from(this.attributes).forEach((attribute) => {
                // Process the current item
                if (!internalAttributes.has(attribute.name)) element.setAttribute(attribute.name, attribute.value);
            });
        }

        // Normalize the keep-alive bound while preserving an explicit Infinity value
        _getKeepAliveMax() {
            const raw = this.getAttribute('keep-alive-max') ?? loaderClass.globalConfig.keepAliveMax;
            if (raw === Infinity || raw === 'Infinity') return Infinity;
            const max = Number(raw);
            return Number.isFinite(max) && max >= 0 ? max : Infinity;
        }

        // Invoke component teardown before detaching a cached child
        _destroyCachedElement(element) {
            if (!element) return;
            void element._destroyImmediately?.();
            element.remove();
        }

        // Evict the oldest cached children with a bounded linear pass
        _pruneKeepAliveCache() {
            const max = this._getKeepAliveMax();
            if (!Number.isFinite(max)) return;
            const evictions = Math.max(0, this._cache.size - Math.floor(max)),
                tags = this._cache.keys();
            // Iterate over the indexed values
            for (let index = 0; index < evictions; index++) {
                const oldestTag = tags.next().value,
                    oldest = this._cache.get(oldestTag);
                this._cache.delete(oldestTag);
                this._destroyCachedElement(oldest);
            }
        }

        // Destroy the active target and all cached targets when no component is requested
        _removeAll() {
            const active = this.firstElementChild;
            if (active) this._destroyCachedElement(active);
            this.replaceChildren();
            this._cache.forEach(
                // Process the current item
                (element) => this._destroyCachedElement(element),
            );
            this._cache.clear();
            this.setAttribute('aria-busy', 'false');
        }

        // Replace the active child for the current generation and restore cached UI state
        _swap(tag, generation, shouldRestoreFocus) {
            if (generation !== this._switchGeneration) return null;
            const keepAlive = this.hasAttribute('keep-alive'),
                current = this.firstElementChild;
            // Move the outgoing child to the map tail so insertion order acts as LRU order
            if (current && keepAlive) {
                current._savedScroll = current.scrollTop;
                current._isKeptAlive = true;
                this._cache.delete(current.localName);
                this._cache.set(current.localName, current);
                current.remove();
                current._isKeptAlive = false;
                this._pruneKeepAliveCache();
            } else {
                this.replaceChildren();
                if (current) this._cache.delete(current.localName);
            }

            let element;
            // Reactivate a cached child or construct a fresh instance for the requested tag
            if (keepAlive && this._cache.has(tag)) {
                element = this._cache.get(tag);
                this._cache.delete(tag);
                this._cache.set(tag, element);
                this._syncAttributesToChild(element);
                if (element._savedScroll) {
                    // Restore scroll only if this reactivated child still belongs to the latest switch
                    this._scrollTimer = setTimeout(() => {
                        // Run the scheduled delayed task
                        this._scrollTimer = null;
                        if (generation === this._switchGeneration && element.isConnected)
                            element.scrollTop = element._savedScroll;
                    }, 0);
                }
            } else {
                element = document.createElement(tag);
                this._syncAttributesToChild(element);
            }
            this.appendChild(element);

            if (shouldRestoreFocus) {
                const focusTarget = element.matches?.('[autofocus],[data-acl-autofocus]')
                    ? element
                    : element.querySelector?.(
                          '[autofocus],[data-acl-autofocus],button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])',
                      );
                focusTarget?.focus?.({ preventScroll: true });
            }
            return element;
        }

        // Validate and perform the latest requested switch using the selected transition strategy
        async _switch(rawTag) {
            this._cancelTransitionWork();
            const generation = ++this._switchGeneration;
            if (!rawTag) {
                this._removeAll();
                return;
            }

            let tag;
            // Guard the switch operation against runtime failures
            try {
                tag = validateCustomElementName(rawTag);
            } catch (error) {
                this._reportSwitchError(error, rawTag);
                return;
            }
            if (!customElements.get(tag)) {
                this._reportSwitchError(
                    new ACLLoadError(`Dynamic component <${tag}> is not registered.`, {
                        code: 'ACL_DYNAMIC_COMPONENT_MISSING',
                        phase: 'dynamic',
                    }),
                    tag,
                );
                return;
            }

            // A generation token and abort signal prevent stale transitions from committing a swap
            const transitionController = new AbortController(),
                transitionSignal = transitionController.signal;
            this._transitionController = transitionController;

            this.setAttribute('aria-busy', 'true');
            const activeElement = document.activeElement,
                shouldRestoreFocus = Boolean(activeElement && this.contains(activeElement)),
                requested = this.getAttribute('transition') || loaderClass.globalConfig.dynamicTransition || 'auto',
                reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
                transition = reducedMotion ? 'none' : requested,
                useViewTransition =
                    (transition === 'view' || transition === 'auto') &&
                    typeof document.startViewTransition === 'function',
                duration = Math.max(
                    0,
                    Number(this.getAttribute('transition-duration') ?? loaderClass.globalConfig.transitionDuration) ||
                        0,
                ),
                preset = getTransitionPreset(transition),
                // Swap the active dynamic component while retaining focus state
                swap = () => this._swap(tag, generation, shouldRestoreFocus);

            // Prefer native view transitions and fall back to an abort-aware opacity transition
            if (transition === 'none') {
                swap();
            } else if (useViewTransition) {
                // Guard the switch operation against runtime failures
                try {
                    const viewTransition = document.startViewTransition(swap);
                    // Consume auxiliary promise rejections when Chromium skips a native view transition
                    void viewTransition.ready?.catch(() => {
                        // Ignore skipped view transition readiness failures
                    });
                    void viewTransition.updateCallbackDone?.catch(() => {
                        // Ignore skipped view transition callback failures
                    });
                    await viewTransition.finished;
                } catch {
                    if (generation === this._switchGeneration) swap();
                }
            } else {
                const current = this.firstElementChild,
                    previous = current ? captureInlineStyles(current, preset.properties) : null;
                if (current) {
                    current.style.willChange = preset.properties.join(', ');
                    current.style.transition = createTransitionValue(preset.properties, duration, 'ease-out');
                    applyInlineStyles(current, preset.outgoing(previous));
                    // Guard the switch operation against runtime failures
                    try {
                        await delayWithSignal(duration, transitionSignal);
                    } catch {
                        // A newer switch or disconnect owns the next render
                    }
                    if (generation !== this._switchGeneration || transitionSignal.aborted) {
                        restoreInlineStyles(current, previous);
                        return;
                    }
                    // Restore temporary styles before keep-alive caches or reactivates the child
                    restoreInlineStyles(current, previous);
                }
                const incoming = swap();
                if (incoming) {
                    const previousIncoming = captureInlineStyles(incoming, preset.properties);
                    incoming.style.willChange = preset.properties.join(', ');
                    applyInlineStyles(incoming, preset.incoming(previousIncoming));
                    incoming.style.transition = createTransitionValue(preset.properties, duration, 'ease-in');
                    // Own both the animation frame and fallback timer through one idempotent finisher
                    await new Promise((resolve) => {
                        // Settle the asynchronous operation
                        let settled = false;
                        // Restore inline styles and release transition resources exactly once
                        const finish = () => {
                            if (settled) return;
                            settled = true;
                            transitionSignal.removeEventListener('abort', finish);
                            if (this._transitionFrame != null) cancelAnimationFrame(this._transitionFrame);
                            if (this._transitionTimer != null) clearTimeout(this._transitionTimer);
                            this._transitionFrame = null;
                            this._transitionTimer = null;
                            restoreInlineStyles(incoming, previousIncoming);
                            resolve();
                        };
                        transitionSignal.addEventListener('abort', finish, { once: true });
                        this._transitionFrame = requestAnimationFrame(() => {
                            // Run the scheduled animation task
                            this._transitionFrame = null;
                            if (generation !== this._switchGeneration || transitionSignal.aborted) {
                                finish();
                                return;
                            }
                            applyInlineStyles(incoming, preset.active(previousIncoming));
                            this._transitionTimer = setTimeout(finish, duration);
                        });
                    });
                }
            }
            if (this._transitionController === transitionController) this._transitionController = null;
            if (generation === this._switchGeneration) {
                this.setAttribute('aria-busy', 'false');
            }
        }

        // Emit a typed public error without leaving the switcher marked busy
        _reportSwitchError(error, tag) {
            console.error(`[ACL] Failed to switch dynamic component to <${tag || ''}>`, error);
            this.setAttribute('aria-busy', 'false');
            this.dispatchEvent(
                new CustomEvent('acl:error', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        component: this,
                        tagName: this.localName,
                        targetTag: tag || null,
                        phase: 'dynamic',
                        error: toACLLoadError(error, {
                            code: 'ACL_DYNAMIC_SWITCH_FAILED',
                            phase: 'dynamic',
                        }),
                        timestamp: Date.now(),
                    },
                }),
            );
        }
    };
