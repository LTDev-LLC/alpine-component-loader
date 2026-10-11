// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

// Optional deferred activation strategies share the component's cancellation owner
export const withTriggers = (Base, { settings }) =>
    class extends Base {
        _initHydrationTrigger(mode) {
            if (mode === 'visible') {
                if (!('IntersectionObserver' in window)) {
                    this._beginHydration();
                    return;
                }
                this._useEnvironment(false, (module) => {
                    this._observer = module.observeDeferredComponent(this, true);
                });
                return;
            }
            if (mode === 'idle') {
                this._initIdleLoader();
                return;
            }
            if (mode === 'interaction') {
                const start = // Run this operation
                        () => this._beginHydration(),
                    events = ['pointerover', 'touchstart', 'focusin'];
                events.forEach((event) =>
                    this.addEventListener(event, start, {
                        // Configure this value
                        capture: true,
                        passive: true,
                    }),
                );
                (this._hydrationCleanups ||= []).push(() =>
                    events.forEach((event) => this.removeEventListener(event, start, { capture: true })),
                );
                return;
            }
            if (mode === 'media') {
                const query = this.getAttribute('hydrate-media') || settings.hydrateMedia,
                    media = window.matchMedia(query),
                    change = // Run this operation
                        () => {
                            if (media.matches) this._beginHydration();
                        };
                if (media.matches) this._beginHydration();
                else {
                    media.addEventListener?.('change', change);
                    (this._hydrationCleanups ||= []).push(() => media.removeEventListener?.('change', change));
                }
            }
        }

        _initLazyObserver() {
            if (!('IntersectionObserver' in window)) {
                this._load();
                return;
            }
            const placeholder = document.createElement('div');
            placeholder.style.minHeight = '1px';
            placeholder.setAttribute('data-acl-placeholder', '');
            this._root.appendChild(placeholder);
            this._useEnvironment(false, (module) => {
                this._observer = module.observeDeferredComponent(this, false);
            });
        }

        _initIdleLoader() {
            if ('requestIdleCallback' in window) {
                this._idleCallbackId = requestIdleCallback(
                    () => {
                        // Run the scheduled idle task
                        this._idleCallbackId = null;
                        if (this.isConnected) {
                            if (this._ssrHydration) this._beginHydration();
                            else this._load();
                        }
                    },
                    { timeout: 2000 },
                );
            } else {
                this._idleTimeoutId = setTimeout(() => {
                    // Run the scheduled delayed task
                    this._idleTimeoutId = null;
                    if (this.isConnected) {
                        if (this._ssrHydration) this._beginHydration();
                        else this._load();
                    }
                }, 200);
            }
        }
    };
