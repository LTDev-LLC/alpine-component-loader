// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

export const createErrorBoundary = ()=>class ACLErrorBoundary extends HTMLElement {
        constructor(){
            super();
            Object.defineProperty(this, '__aclBoundary', {
                value: true
            });
            this._errors = [];
            this._failed = new Set();
            const root = this.attachShadow({
                mode: 'open'
            }), content = document.createElement('slot'), fallback = document.createElement('slot'), generated = document.createElement('div'), message = document.createElement('p'), retry = document.createElement('button');
            content.setAttribute('part', 'content');
            fallback.name = 'fallback';
            fallback.setAttribute('part', 'fallback');
            fallback.hidden = true;
            generated.setAttribute('part', 'fallback');
            generated.setAttribute('role', 'alert');
            generated.hidden = true;
            message.textContent = 'A component failed to load.';
            retry.type = 'button';
            retry.textContent = 'Retry';
            retry.addEventListener('click', ()=>void this.retry());
            generated.append(message, retry);
            root.append(content, fallback, generated);
            this._contentSlot = content;
            this._fallbackSlot = fallback;
            this._generatedFallback = generated;
            this.setAttribute('data-acl-boundary-state', 'ready');
            this.addEventListener('acl:error', (event)=>this._captureError(event));
        }
        get error() {
            return this._errors.at(-1)?.error || null;
        }
        get errors() {
            return this._errors.map((entry)=>({
                    ...entry
                }));
        }
        _captureError(event) {
            const path = event.composedPath?.() || [], nearest = path.find(// Run this operation
            (node)=>node?.__aclBoundary);
            if (nearest !== this) return;
            event.stopPropagation();
            const component = event.detail?.component || path.find(// Run this operation
            (node)=>node?.hasAttribute?.('data-acl-component')) || null, entry = {
                error: event.detail?.error || new Error('Component failure'),
                component,
                phase: event.detail?.phase || null,
                timestamp: Date.now()
            };
            this._errors.push(entry);
            if (component) this._failed.add(component);
            this._contentSlot.hidden = true;
            const authored = Boolean(this.querySelector('[slot="fallback"]'));
            this._fallbackSlot.hidden = !authored;
            this._generatedFallback.hidden = authored;
            this.setAttribute('data-acl-boundary-state', 'error');
            this.dispatchEvent(new CustomEvent('acl:boundary-error', {
                bubbles: true,
                composed: true,
                detail: entry
            }));
        }
        reset() {
            const previous = this.errors;
            this._errors = [];
            this._failed.clear();
            this._contentSlot.hidden = false;
            this._fallbackSlot.hidden = true;
            this._generatedFallback.hidden = true;
            this.setAttribute('data-acl-boundary-state', 'ready');
            this.dispatchEvent(new CustomEvent('acl:boundary-reset', {
                bubbles: true,
                composed: true,
                detail: {
                    errors: previous
                }
            }));
        }
        async retry() {
            const components = [
                ...this._failed
            ].filter(// Run this operation
            (component)=>component?.isConnected), detail = {
                // Configure this value
                components,
                errors: this.errors
            };
            this.setAttribute('data-acl-boundary-state', 'retrying');
            this.dispatchEvent(new CustomEvent('acl:boundary-retry', {
                bubbles: true,
                composed: true,
                detail
            }));
            const results = await Promise.allSettled(components.map(// Run this operation
            (component)=>typeof component.reload === 'function' ? component.reload({
                    reason: 'boundary-retry'
                }) : Promise.reject(new TypeError('Failed boundary child cannot reload.'))));
            if (results.every((result)=>result.status === 'fulfilled') && components.every((component)=>component._state === 'ready')) this.reset();
            else this.setAttribute('data-acl-boundary-state', 'error');
            return results;
        }
    };
export default createErrorBoundary;
