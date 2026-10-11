export interface ACLPolyfillOptions {
    /** webcomponents-loader.js URL; defaults to the pinned 2.8.0 jsDelivr package. */
    url?: string;
    /** Nonce for the injected top-level script. Configure CSP for the upstream bundle too. */
    nonce?: string;
    /** Milliseconds through WebComponentsReady, including DOM readiness. Default: 10000; 0 disables. */
    timeout?: number;
    /** Policy for ACL's script URL sink when Trusted Types is enforced. */
    trustedTypesPolicy?: { createScriptURL(input: string): unknown };
}

/** Feature-detect, load the upstream suite if needed, and await completed custom-element upgrades. */
export function loadPolyfills(options?: ACLPolyfillOptions): Promise<void>;
/** Run a callback through an existing WebComponents.waitFor loader, returning its asynchronous result. */
export function waitForWebComponents<T>(callback: () => T | PromiseLike<T>): Promise<Awaited<T>>;
export function waitForWebComponents(): Promise<void>;
export default loadPolyfills;
