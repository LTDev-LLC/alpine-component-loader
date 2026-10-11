// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

const suffix = import.meta.url.split(/[?#]/)[0].endsWith('.min.js') ? '.min.js' : '.js', // Bootstrap without requiring the URL constructor that the full bundle can provide
importLocalModule = (specifier)=>import(/* @vite-ignore */ specifier.replace(/\.js$/, suffix)), { ACLLoadError } = await importLocalModule('./acl-load-error.js'), { getContext, runWhenWebComponentsReady } = await importLocalModule('./runtime/context.js'), // Module-capable engines retain intrinsic promises even when the global constructor needs repair
AsyncPromise = (async ()=>{})().constructor, nativeArrayFrom = Array.from, defaultUrl = 'https://cdn.jsdelivr.net/npm/@webcomponents/webcomponentsjs@2.8.0/webcomponents-loader.js';
// Complete iterable and mapping support omitted by the upstream Array.from shim
const completeArrayFrom = ()=>{
    if (Array.from({
        length: 1
    }, ()=>1)[0] === 1 && Array.from(new Set([
        1
    ]))[0] === 1) return;
    if (nativeArrayFrom) {
        Array.from = nativeArrayFrom;
        return;
    }
    // Produce dense results for both iterables and array-like values while preserving mapper identity
    Array.from = function(values, mapFn, thisArg) {
        if (values == null) throw new TypeError('Array.from requires an iterable or array-like value.');
        if (mapFn !== undefined && typeof mapFn !== 'function') throw new TypeError('Array.from mapper must be a function.');
        const source = Object(values), iterable = typeof source[Symbol.iterator] === 'function', length = Math.min(Math.max(Math.floor(Number(source.length) || 0), 0), Number.MAX_SAFE_INTEGER), output = typeof this === 'function' ? iterable ? new this() : new this(length) : [];
        let index = 0;
        // Apply mapper callbacks in input order and keep array-like holes as explicit undefined values
        if (iterable) {
            // Consume the iterator directly so maps, sets, and DOM collections preserve their values
            for (const value of source){
                output[index] = mapFn === undefined ? value : mapFn.call(thisArg, value, index);
                index++;
            }
        } else {
            // Read every array-like position including holes
            for(; index < length; index++)output[index] = mapFn === undefined ? source[index] : mapFn.call(thisArg, source[index], index);
        }
        output.length = index;
        return output;
    };
};
// Connect the upstream URL constructor to the native URLSearchParams API required by ACL's module URLs
const connectURLSearchParams = ()=>{
    if ('searchParams' in URL.prototype || typeof URLSearchParams !== 'function') return;
    const records = new WeakMap(), mutations = new Set([
        'append',
        'delete',
        'set',
        'sort'
    ]);
    Object.defineProperty(URL.prototype, 'searchParams', {
        configurable: true,
        // Preserve one live facade per URL, including query mutations and detached method calls
        get () {
            if (!records.has(this)) {
                const url = this, params = new Proxy(new URLSearchParams(), {
                    // Reflect every operation against the current query and write mutations back to the URL
                    get (target, name) {
                        const current = new URLSearchParams(url.search), value = Reflect.get(current, name, current);
                        if (typeof value !== 'function' || name === 'constructor') return value;
                        // Write query mutations back to their owning URL
                        return (...args)=>{
                            const result = value.apply(current, args);
                            if (mutations.has(name)) url.search = current.toString();
                            return result;
                        };
                    }
                });
                records.set(url, params);
            }
            return records.get(this);
        }
    });
};
// Detect the platform helpers supplied by webcomponentsjs rather than duplicating their implementations
const needsPlatformBundle = ()=>{
    if (!globalThis.Promise || !globalThis.URL || !globalThis.Symbol || !Array.from || !Object.assign) return true;
    // Older browsers expose event constructors that cannot be called with new
    try {
        new Event('acl-polyfill-check');
        new CustomEvent('acl-polyfill-check');
        new MouseEvent('acl-polyfill-check');
    } catch  {
        return true;
    }
    return false;
};
// Include broken nested-template cloning in the same feature test as the upstream loader
const needsWebComponents = ()=>{
    if (!globalThis.customElements || customElements.forcePolyfill || !Element.prototype.attachShadow || !Element.prototype.getRootNode || globalThis.ShadyDOM?.force || needsPlatformBundle()) return true;
    const outer = document.createElement('template'), inner = document.createElement('template');
    if (!outer.content || !inner.content || !(outer.content.cloneNode() instanceof DocumentFragment)) return true;
    inner.content.appendChild(document.createElement('div'));
    outer.content.appendChild(inner);
    const clone = outer.cloneNode(true);
    return !clone.content.firstChild?.content?.firstChild;
};
// Run and await an application callback through WebComponents.waitFor when an external loader is active
export const waitForWebComponents = (callback = ()=>undefined)=>{
    if (typeof callback !== 'function') throw new TypeError('[ACL] A Web Components readiness callback is required.');
    return AsyncPromise.resolve().then(()=>runWhenWebComponentsReady(callback));
};
// Load the maintained suite on demand and share bootstrap ownership with every ACL facade
export const loadPolyfills = (options = {})=>{
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('[ACL] loadPolyfills() expects an options object.');
    const { url = defaultUrl, nonce, timeout = 10000, trustedTypesPolicy } = options;
    if (typeof url !== 'string' || !url.trim()) throw new TypeError('[ACL] Polyfill url must be a non-empty string.');
    if (!Number.isFinite(timeout) || timeout < 0) throw new TypeError('[ACL] Polyfill timeout must be non-negative.');
    if (nonce != null && typeof nonce !== 'string') throw new TypeError('[ACL] Polyfill nonce must be a string.');
    if (trustedTypesPolicy != null && typeof trustedTypesPolicy.createScriptURL !== 'function') throw new TypeError('[ACL] Polyfill trustedTypesPolicy must provide createScriptURL().');
    if (typeof document === 'undefined' || typeof window === 'undefined') return AsyncPromise.reject(new ACLLoadError('Polyfills require browser DOM APIs.', {
        code: 'ACL_ENVIRONMENT_UNAVAILABLE',
        phase: 'polyfills'
    }));
    const context = getContext();
    if (context.polyfillStartup) return context.polyfillStartup;
    const existing = window.WebComponents, hasLoader = existing && (existing.ready || typeof existing.waitFor === 'function'), required = needsWebComponents();
    if (!hasLoader && !required) return AsyncPromise.resolve();
    // Own one document bootstrap transaction
    const loading = new AsyncPromise((resolve, reject)=>{
        let script = null, timer = null, completed = false, ownedWaitFor = null;
        // Release all readiness listeners and timer ownership on every settlement path
        const cleanup = ()=>{
            clearTimeout(timer);
            document.removeEventListener('WebComponentsReady', finish);
            document.removeEventListener('DOMContentLoaded', inject);
            if (script) script.onload = script.onerror = null;
        }, // Resolve only after the upstream suite reports completed upgrades
        finish = ()=>{
            if (completed || !window.WebComponents?.ready) return;
            connectURLSearchParams();
            completeArrayFrom();
            // The upstream Promise shim predates the batch primitive used by ACL teardown
            if (!Promise.allSettled) Promise.allSettled = AsyncPromise.allSettled.bind(AsyncPromise);
            // Native finally is generic and also supports the upstream thenable implementation
            if (!Promise.prototype.finally) Promise.prototype.finally = AsyncPromise.prototype.finally;
            completed = true;
            cleanup();
            resolve();
        }, // Permit a clean retry after an owned loader or nested bundle fails
        fail = (code, cause)=>{
            if (completed) return;
            completed = true;
            cleanup();
            script?.remove();
            if (!hasLoader && window.WebComponents?.waitFor === ownedWaitFor && ownedWaitFor) {
                delete window.WebComponents.waitFor;
                delete window.WebComponents._batchCustomElements;
            }
            reject(new ACLLoadError('Unable to initialize Web Components polyfills.', {
                code,
                phase: 'polyfills',
                retryable: true,
                cause
            }));
        }, // Wait for parsing to finish so the upstream loader cannot document.write into this page
        inject = ()=>{
            if (completed) return;
            // Surface CSP or policy failures through the retryable bootstrap contract
            try {
                const scriptUrl = needsPlatformBundle() ? url.replace(/webcomponents-loader\.js(?=[?#]|$)/, 'webcomponents-bundle.js') : url;
                script = document.createElement('script');
                script.async = true;
                script.src = trustedTypesPolicy?.createScriptURL(scriptUrl) ?? scriptUrl;
                if (nonce) script.nonce = nonce;
                script.onload = ()=>{
                    // Remember only the readiness API created by this attempt
                    ownedWaitFor = window.WebComponents?.waitFor;
                    finish();
                };
                // Surface classic script network failures through the public promise
                script.onerror = (event)=>fail('ACL_POLYFILL_LOAD_FAILED', event);
                document.head.appendChild(script);
            } catch (error) {
                fail('ACL_POLYFILL_LOAD_FAILED', error);
            }
        };
        document.addEventListener('WebComponentsReady', finish);
        // Exercise readiness and capture the observable result
        if (timeout) timer = setTimeout(()=>fail('ACL_POLYFILL_TIMEOUT'), timeout);
        if (hasLoader) finish();
        else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject, {
            once: true
        });
        else inject();
    });
    context.polyfillStartup = loading;
    // Release the shared bootstrap latch after success or failure without importing application code
    void loading.then(()=>{
        if (context.polyfillStartup === loading) delete context.polyfillStartup;
    }, ()=>{
        if (context.polyfillStartup === loading) delete context.polyfillStartup;
    });
    return loading;
};
export default loadPolyfills;
