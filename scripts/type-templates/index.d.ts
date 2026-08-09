export type ACLPropConstructor =
    | StringConstructor
    | NumberConstructor
    | BooleanConstructor
    | ArrayConstructor
    | ObjectConstructor;

export type ACLSerializedPropType = 'String' | 'Number' | 'Boolean' | 'Array' | 'Object';

export type ACLPropSchema = Record<string, ACLPropConstructor | ACLSerializedPropType | ACLPropConfig>;

export interface ACLPropConfig<T = unknown> {
    type?: ACLPropConstructor | ACLSerializedPropType;
    default?: T | (() => T);
    required?: boolean;
    nullable?: boolean;
    reflect?: boolean;
    options?: T[];
    schema?: ACLPropSchema;
    validator?: (value: T) => boolean;
    coerce?: (
        value: string,
        context: { el: HTMLElement; props: ACLProps; name: string; definition: ACLPropDefinition },
    ) => T;
}

export type ACLPropDefinition<T = unknown> = ACLPropConstructor | ACLSerializedPropType | ACLPropConfig<T>;

export interface ACLCacheHelpers {
    clearTemplate(): Promise<boolean>;
    clearData(): Promise<boolean>;
    clear(): Promise<boolean>;
}

export interface ACLPersistenceHelpers {
    $key: string;
    $save(value?: unknown): Promise<void>;
    $clear(): Promise<void>;
    $get<T = unknown>(key?: string | null, fallback?: T): Promise<T>;
    $flush(): Promise<void>;
}

export interface ACLFormHelpers {
    readonly form: HTMLFormElement | null;
    readonly labels: NodeListOf<HTMLLabelElement> | null;
    setValue(value: unknown, state?: unknown): void;
    setValidity(flags?: ValidityStateFlags, message?: string, anchor?: HTMLElement): void;
    checkValidity(): boolean;
    reportValidity(): boolean;
}

export interface ACLFormAssociatedElement extends HTMLElement {
    readonly form: HTMLFormElement | null;
    readonly labels: NodeListOf<HTMLLabelElement> | null;
    readonly validity: ValidityState | null;
    readonly validationMessage: string;
    readonly willValidate: boolean;
    checkValidity(): boolean;
    reportValidity(): boolean;
    setFormValue(value: unknown, state?: unknown): void;
    setValidity(flags?: ValidityStateFlags, message?: string, anchor?: HTMLElement): void;
}

export interface ACLErrorBoundaryElement extends HTMLElement {
    readonly error: unknown;
    readonly errors: Array<{
        error: unknown;
        component: HTMLElement | null;
        phase: string | null;
        timestamp: number;
    }>;
    reset(): void;
    retry(): Promise<PromiseSettledResult<unknown>[]>;
}

export interface ACLStorageAdapter {
    getItem(key: string): string | null | unknown | Promise<string | null | unknown>;
    setItem(key: string, value: string): void | Promise<void>;
    removeItem(key: string): void | Promise<void>;
}

export interface ACLIndexedDBPersistenceAdapterOptions {
    databaseName?: string;
    storeName?: string;
    indexedDBImpl?: IDBFactory;
}

export interface ACLIndexedDBPersistenceAdapter extends ACLStorageAdapter {
    close(): void;
}

export function createIndexedDBPersistenceAdapter(
    options?: ACLIndexedDBPersistenceAdapterOptions,
): ACLIndexedDBPersistenceAdapter;

export interface ACLPersistenceMigrationContext {
    fromVersion: number;
    toVersion: number;
    key: string;
    component: HTMLElement;
}

export interface ACLProps {
    $data: unknown;
    $loading: boolean;
    $error: string | null;
    $lastUpdated: number;
    $emit(name: string, detail?: unknown): boolean;
    $reload(options?: ACLReloadOptions): Promise<void> | void;
    $retry(): Promise<void> | void;
    $cancel(reason?: string): void;
    $cache: ACLCacheHelpers;
    $persistence?: ACLPersistenceHelpers;
    $form?: ACLFormHelpers;
    [key: string]: unknown;
}

export interface ACLHookContext<TProps extends ACLProps = ACLProps> {
    el: HTMLElement & { $props: TProps };
    root: HTMLElement | ShadowRoot;
    props: TProps;
    name?: string;
    oldVal?: string | null;
    newVal?: string | null;
}

export interface ACLFetchContext<TProps extends ACLProps = ACLProps> {
    el: HTMLElement & { $props: TProps };
    $el: HTMLElement & { $props: TProps };
    props: TProps;
    $props: TProps;
    root: HTMLElement | ShadowRoot;
    $root: HTMLElement | ShadowRoot;
}

export interface ACLHooks<TProps extends ACLProps = ACLProps> {
    beforeMount?(context: ACLHookContext<TProps>): void | (() => void) | Promise<void | (() => void)>;
    mounted?(context: ACLHookContext<TProps>): void | (() => void) | Promise<void | (() => void)>;
    updated?(context: ACLHookContext<TProps>): void | (() => void) | Promise<void | (() => void)>;
    activated?(context: ACLHookContext<TProps>): void | (() => void) | Promise<void | (() => void)>;
    deactivated?(context: ACLHookContext<TProps>): void | (() => void) | Promise<void | (() => void)>;
    unmounted?(context: ACLHookContext<TProps>): void | (() => void) | Promise<void | (() => void)>;
    loaded?(context: ACLHookContext<TProps>): void | (() => void) | Promise<void | (() => void)>;
    beforeFetch?(options: RequestInit, context: ACLFetchContext<TProps>): RequestInit | Promise<RequestInit>;
    afterFetch?<TData = unknown>(data: TData, context: ACLFetchContext<TProps>): TData | Promise<TData>;
    captureState?(context: ACLHookContext<TProps> & { reason: string }): unknown | Promise<unknown>;
    restoreState?(snapshot: unknown, context: ACLHookContext<TProps> & { reason: string }): void | Promise<void>;
}

export interface ACLReloadOptions {
    preserveState?: boolean;
    clearTemplate?: boolean;
    clearData?: boolean;
    reason?: string;
}

export type ACLCacheStrategy = 'cache-first' | 'network-first' | 'stale-while-revalidate' | 'no-store';
export type ACLResponseType = 'json' | 'text' | 'blob' | 'arrayBuffer' | 'stream' | 'auto';

export interface ACLLoadErrorOptions {
    code?: string;
    phase?: string;
    status?: number | null;
    retryable?: boolean;
    cause?: unknown;
}

export class ACLLoadError extends Error {
    code: string;
    phase: string;
    status: number | null;
    retryable: boolean;
    constructor(message: string, options?: ACLLoadErrorOptions);
}

export interface ACLSourceResolverContext {
    tagName: string;
    config: ACLComponentOptions;
    globalConfig: ACLComponentOptions;
    loader: typeof AlpineComponentLoader;
}

export interface ACLEventForwardRule {
    from: string;
    as?: string;
    bubbles?: boolean;
    composed?: boolean;
}

export interface ACLEventOptions {
    forward?: Array<string | ACLEventForwardRule>;
}

export interface ACLAssetDescriptor {
    url: string;
    type?: string;
    integrity?: string;
    crossOrigin?: string;
    referrerPolicy?: ReferrerPolicy;
    nonce?: string;
    media?: string;
    timeout?: number;
}

export interface ACLDataOptions<TProps extends ACLProps = ACLProps> {
    src?: string | null;
    keys?:
        | Record<string, unknown>
        | ((context: ACLFetchContext<TProps>) => Record<string, unknown> | Promise<Record<string, unknown>>)
        | null;
    params?:
        | Record<string, unknown>
        | ((context: ACLFetchContext<TProps>) => Record<string, unknown> | Promise<Record<string, unknown>>)
        | null;
    options?: RequestInit;
    method?: string | null;
    body?: BodyInit | Record<string, unknown> | unknown[] | null;
    target?: string;
    poll?: number | null;
    timeout?: number;
    retries?: number;
    retryDelay?: number;
    cacheStrategy?: ACLCacheStrategy;
    cacheTtl?: number;
    cacheMax?: number;
    cacheKey?: string | ((context: ACLFetchContext<TProps>) => string | Promise<string>);
    responseType?: ACLResponseType;
    parser?: (response: Response, context: ACLFetchContext<TProps>) => unknown | Promise<unknown>;
    retryMaxDelay?: number;
    retryJitter?: number;
    retryUnsafeMethods?: boolean;
    pauseWhenHidden?: boolean;
    pauseWhenOffline?: boolean;
    pauseWhenOffscreen?: boolean;
}

export interface ACLSanitizeContext<TProps extends ACLProps = ACLProps> {
    el: HTMLElement & { $props: TProps };
    root: HTMLElement | ShadowRoot;
    props: TProps;
    tagName: string;
}

export interface ACLSecurityOptions {
    trustedTypesPolicy?: { createHTML(input: string): string | object } | null;
    urlPolicy?: (
        url: string,
        context: ACLSanitizeContext & { element: Element | string; attribute: string },
    ) => boolean;
}

export interface ACLRuntimeRecord {
    sequence: number;
    timestamp: number;
    type: string;
    severity: string;
    tagName: string | null;
    phase: string | null;
    requestId: string | null;
    duration: number | null;
    status: number | string | null;
    detail: unknown;
}

export interface ACLLogger {
    debug?(record: ACLRuntimeRecord): void;
    info?(record: ACLRuntimeRecord): void;
    warn?(record: ACLRuntimeRecord): void;
    error?(record: ACLRuntimeRecord): void;
}

export interface ACLObservabilityOptions {
    bufferSize?: number;
    performanceMarks?: boolean;
    logger?: false | ACLLogger | ((record: ACLRuntimeRecord) => void);
}

export interface ACLMetricsSnapshot {
    startedAt: number;
    totals: Record<string, number>;
    durations: Record<string, { count: number; total: number; min: number; max: number; average: number }>;
    recent: ACLRuntimeRecord[];
}

export interface ACLAdaptivePrefetchOptions {
    root?: ParentNode;
    selector?: string;
    triggers?: Array<'hover' | 'focus' | 'viewport' | 'visible' | 'idle'>;
    hoverDelay?: number;
    rootMargin?: string;
    concurrency?: number;
    respectDataSaver?: boolean;
    intersectionRoot?: Element | Document | null;
}

export interface ACLAdaptivePrefetchController {
    prefetch(target: string | Element | string[]): Promise<Record<string, ACLPrefetchResult>>;
    disconnect(): void;
}

export interface ACLComponentOptions<TProps extends ACLProps = ACLProps> {
    attributes?: Record<string, ACLPropDefinition>;
    debug?: boolean;
    autoStart?: boolean;
    observeTemplates?: boolean;
    basePath?: string;
    sourceResolver?: (
        source: string | HTMLTemplateElement,
        context: ACLSourceResolverContext,
    ) => string | HTMLTemplateElement;
    errorCss?: Partial<CSSStyleDeclaration> | Record<string, string | number>;
    loading?: 'eager' | 'lazy' | 'idle';
    hydrate?: 'eager' | 'visible' | 'idle' | 'interaction' | 'media';
    hydrateMedia?: string | null;
    shadow?: boolean;
    useConstructibleStyles?: boolean;
    sharedStyleSheets?: CSSStyleSheet[];
    executeScripts?: boolean;
    stripStyles?: boolean;
    sanitize?:
        | boolean
        | ((
              fragment: DocumentFragment,
              context: ACLSanitizeContext<TProps>,
          ) => void | Node | string | Promise<void | Node | string>);
    security?: ACLSecurityOptions;
    observability?: false | ACLObservabilityOptions;
    adaptivePrefetch?: false | true | ACLAdaptivePrefetchOptions;
    strictProps?: boolean;
    runtimeCacheMax?: number;
    cacheNamespace?: string;
    keepAliveMax?: number;
    dynamicTransition?: 'auto' | 'none' | 'fade' | 'view' | 'scale' | 'slide-left' | 'slide-right' | 'blur';
    transitionDuration?: number;
    events?: ACLEventOptions;
    externalCss?: Array<string | ACLAssetDescriptor>;
    externalScripts?: Array<string | ACLAssetDescriptor>;
    loadingTemplate?: string | HTMLTemplateElement | null;
    loadingHtml?: string | null;
    defaultComponentName?: string;
    defaultDynamicName?: string;
    defaultBoundaryName?: string;
    data?: ACLDataOptions<TProps>;
    cacheTemplates?: boolean;
    templateCacheStrategy?: ACLCacheStrategy;
    templateCacheTtl?: number;
    templateCacheMax?: number;
    templateRevision?: string | null;
    fallback?: string | HTMLTemplateElement | null;
    hooks?: ACLHooks<TProps>;
    persist?: false | 'local' | 'session' | 'indexeddb' | string;
    persistKey?: string | null;
    persistDebounce?: number;
    persistAdapter?: ACLStorageAdapter;
    persistVersion?: number;
    persistMigrate?: (data: unknown, context: ACLPersistenceMigrationContext) => unknown | Promise<unknown>;
    bindStore?: string | null;
    form?:
        | boolean
        | {
              value?: string;
              state?: string | null;
              disabled?: string | null;
          };
}

export type ACLInlineComponentDefinition<TProps extends ACLProps = ACLProps> = ACLComponentOptions<TProps> & {
    template: string;
};

export interface ACLDefinition {
    tagName: string;
    source: string | HTMLTemplateElement;
    settings: ACLComponentOptions;
    dependencies: string[];
}

export interface ACLManifestComponent {
    source: string | HTMLTemplateElement;
    options?: ACLComponentOptions;
    dependencies?: string[];
    metadata?: ACLComponentMetadata;
}

export interface ACLContractSchema {
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null' | 'unknown';
    properties?: Record<string, ACLContractSchema>;
    items?: ACLContractSchema;
    required?: string[];
    enum?: Array<string | number | boolean | null>;
    nullable?: boolean;
}

export interface ACLComponentMetadata {
    description?: string;
    events?: Record<string, { description?: string; detail?: ACLContractSchema }>;
    slots?: Record<string, { description?: string }>;
}

export interface ACLManifest {
    version: 1;
    basePath?: string;
    components: Record<string, string | ACLManifestComponent>;
    groups?: Record<string, string[]>;
}

export interface ACLRouteIndex {
    version: 1;
    routes: Record<
        string,
        {
            manifest: string;
            revision?: string;
            components?: string[];
        }
    >;
}

export interface ACLManifestRequestOptions {
    basePath?: string;
    prefetch?: boolean | string[];
    concurrency?: number;
    fetch?: typeof fetch;
    signal?: AbortSignal;
    timeout?: number;
    maxBytes?: number;
    cache?: RequestCache;
    integrity?: string;
}

export interface ACLSkeletonDefinition {
    html: string;
}

export interface ACLSkeletonManifest {
    version: 1;
    skeletons: Record<string, ACLSkeletonDefinition>;
}

export interface ACLPrefetchResult<T = string | DocumentFragment | undefined> {
    status: 'fulfilled' | 'rejected';
    value?: T;
    reason?: unknown;
}

export interface ACLDataCacheInfo {
    size?: number;
    keys?: string[];
    key?: string;
    finalUrl?: string;
    target?: string;
    strategy?: string;
    expiresAt?: number;
    lastAccess?: number;
    pending?: boolean;
    subscribers?: number;
}

export interface ACLTemplateLoadInfo {
    source: string | HTMLTemplateElement;
    cacheKey: string;
    cacheHit: boolean;
    loadedAt: number;
    fetchedAt: number;
    revision?: string | null;
}

export interface ACLTemplateCacheEntry {
    request: string;
    source: string;
    revision: string | null;
    fetchedAt: number;
    lastAccess: number;
    ttl: number | null;
}

export interface ACLLoaderFactoryOptions {
    root?: Document | Element | ShadowRoot | null;
    config?: Partial<ACLComponentOptions>;
    cacheNamespace?: string | null;
}

export interface ACLLoaderDisposeOptions {
    clearPersistentCaches?: boolean;
}

export default class AlpineComponentLoader {
    static readonly version: string;
    static root: Document | Element | ShadowRoot | null;
    static readonly ready?: Promise<typeof AlpineComponentLoader>;
    static globalConfig: ACLComponentOptions;
    static config(options: Partial<ACLComponentOptions>): void;
    static start(): Promise<void>;
    static registerComponent(name?: string): Promise<CustomElementConstructor>;
    static registerDynamicLoader(name?: string): Promise<CustomElementConstructor>;
    static registerErrorBoundary(name?: string): Promise<CustomElementConstructor>;
    static registerTemplates(root?: ParentNode): Promise<CustomElementConstructor[]>;
    static observeTemplates(options?: { root?: Node; subtree?: boolean }): () => void;
    static stopObservingTemplates(): void;
    static observePrefetch(options?: ACLAdaptivePrefetchOptions): Promise<ACLAdaptivePrefetchController>;
    static stopObservingPrefetch(): void;
    static subscribe(listener: (record: ACLRuntimeRecord) => void): () => void;
    static getMetrics(): ACLMetricsSnapshot;
    static clearMetrics(): void;
    static define<TProps extends ACLProps = ACLProps>(
        tagName: string,
        source: string | HTMLTemplateElement,
        config?: ACLComponentOptions<TProps>,
    ): Promise<CustomElementConstructor>;
    static define<TProps extends ACLProps = ACLProps>(
        tagName: string,
        definition: ACLInlineComponentDefinition<TProps>,
    ): Promise<CustomElementConstructor>;
    static has(tagName: string): boolean;
    static getDefinition(tagName: string): ACLDefinition | null;
    static getRegisteredTags(): string[];
    static getDependencies(tagName: string, options?: { transitive?: boolean }): string[];
    static prefetch(tagName: string): Promise<string | DocumentFragment | undefined>;
    static prefetchAll(
        tagNames?: Iterable<string> | null,
        options?: { concurrency?: number },
    ): Promise<Record<string, ACLPrefetchResult>>;
    static prefetchGraph(
        tagNames: Iterable<string>,
        options?: { concurrency?: number; includeRoots?: boolean },
    ): Promise<Record<string, ACLPrefetchResult>>;
    static registerManifest(
        manifest: ACLManifest,
        options?: { basePath?: string; prefetch?: boolean | string[]; concurrency?: number },
    ): Promise<{ registered: string[]; prefetched: Record<string, ACLPrefetchResult> }>;
    static registerManifestFrom(
        source: string | URL,
        options?: ACLManifestRequestOptions,
    ): Promise<{
        registered: string[];
        prefetched: Record<string, ACLPrefetchResult>;
        manifest: ACLManifest;
        manifestUrl: string;
    }>;
    static registerRouteManifest(
        routeKey: string,
        indexOrUrl: ACLRouteIndex | string | URL,
        options?: ACLManifestRequestOptions & { baseUrl?: string },
    ): ReturnType<typeof AlpineComponentLoader.registerManifestFrom>;
    static registerSkeletonManifest(manifest: ACLSkeletonManifest): Promise<string[]>;
    static loadTemplate(
        source: string | HTMLTemplateElement,
        settings?: ACLComponentOptions,
    ): Promise<string | DocumentFragment>;
    static pruneCaches(prefix?: string, current?: string): Promise<boolean[] | undefined>;
    static clearTemplateCaches(prefix?: string): Promise<boolean[] | undefined>;
    static clearTemplate(source: string, cacheKey?: string): Promise<boolean>;
    static clearDataCache(finalUrl?: string | null): boolean;
    static getDataCacheSize(): number;
    static getDataCacheInfo(finalUrl?: string | null): ACLDataCacheInfo | null;
    static getTemplateLoadInfo(
        source: string | HTMLTemplateElement,
        settings?: ACLComponentOptions,
    ): ACLTemplateLoadInfo | null;
    static getTemplateCacheInfo(
        source?: string | null,
        settings?: ACLComponentOptions,
    ): Promise<ACLTemplateCacheEntry | { size: number; entries: ACLTemplateCacheEntry[] } | null>;
    static pruneTemplateCache(options?: { max?: number }): Promise<Array<ACLTemplateCacheEntry & { reason: string }>>;
    static dispose(options?: ACLLoaderDisposeOptions): Promise<void>;
    static toggleDebug(): void | Promise<void>;
}

export function createLoader(options?: ACLLoaderFactoryOptions): typeof AlpineComponentLoader;
