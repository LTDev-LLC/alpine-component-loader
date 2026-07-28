import type AlpineComponentLoader from './index.d.ts';
import type { ACLComponentOptions } from './index.d.ts';

export interface ACLWaitOptions {
    state?: 'ready' | 'error' | 'destroyed';
    timeout?: number;
    signal?: AbortSignal;
}

export function waitForComponent<T extends HTMLElement>(element: T, options?: ACLWaitOptions): Promise<T>;

export interface ACLMountOptions {
    loader?: typeof AlpineComponentLoader;
    tagName?: string;
    template?: string;
    options?: ACLComponentOptions;
    attributes?: Record<string, unknown>;
    properties?: Record<string, unknown>;
    slots?: string | Node | Record<string, string | Node | Array<string | Node>>;
    container?: ParentNode;
    state?: ACLWaitOptions['state'];
    timeout?: number;
    signal?: AbortSignal;
}

export interface ACLMountHandle<T extends HTMLElement = HTMLElement> {
    element: T;
    update(values?: { attributes?: Record<string, unknown>; properties?: Record<string, unknown> }): Promise<T>;
    reload(options?: unknown): Promise<void> | void;
    unmount(): Promise<void>;
}

export function mountComponent<T extends HTMLElement = HTMLElement>(options?: ACLMountOptions): Promise<ACLMountHandle<T>>;

export interface ACLEventRecorder {
    records: Event[];
    waitFor(name: string, options?: { timeout?: number }): Promise<Event>;
    clear(): void;
    stop(): void;
}

export function recordACLEvents(target: EventTarget, names?: string[]): ACLEventRecorder;

export interface ACLFetchMockRoute {
    match?: string | RegExp | ((request: { url: string; method: string; headers: Record<string, string>; request: Request }) => boolean);
    url?: string | RegExp;
    method?: string;
    response?: unknown | Response | ((request: unknown) => unknown | Response | Promise<unknown | Response>);
    body?: unknown;
    status?: number;
    headers?: HeadersInit;
    delay?: number;
}

export function installFetchMock(routes?: ACLFetchMockRoute[], options?: { target?: typeof globalThis }): {
    requests: Array<{ url: string; method: string; headers: Record<string, string>; request: Request }>;
    reset(routes?: ACLFetchMockRoute[]): void;
    restore(): void;
};

export interface ACLTestHarnessOptions {
    loader?: typeof AlpineComponentLoader | null;
    loaderOptions?: {
        root?: Document | Element | ShadowRoot | null;
        config?: Partial<ACLComponentOptions>;
        cacheNamespace?: string | null;
    };
    container?: ParentNode | null;
    disposeLoader?: boolean;
}

export interface ACLTestHarness {
    readonly loader: typeof AlpineComponentLoader;
    mount<T extends HTMLElement = HTMLElement>(options?: ACLMountOptions): Promise<ACLMountHandle<T>>;
    record(target?: EventTarget, names?: string[]): ACLEventRecorder;
    mockFetch(
        routes?: ACLFetchMockRoute[],
        options?: { target?: typeof globalThis },
    ): ReturnType<typeof installFetchMock>;
    assertLifecycle(records: Iterable<Event | string>, expected: string[], options?: { exact?: boolean }): string[];
    reset(): Promise<typeof AlpineComponentLoader>;
    cleanup(): Promise<void>;
}

export function assertLifecycleSequence(
    records: Iterable<Event | string>,
    expected: string[],
    options?: { exact?: boolean },
): string[];

export function createACLTestHarness(options?: ACLTestHarnessOptions): ACLTestHarness;

declare const ACLTesting: {
    createACLTestHarness: typeof createACLTestHarness;
    mountComponent: typeof mountComponent;
    waitForComponent: typeof waitForComponent;
    recordACLEvents: typeof recordACLEvents;
    installFetchMock: typeof installFetchMock;
    assertLifecycleSequence: typeof assertLifecycleSequence;
};

export default ACLTesting;
