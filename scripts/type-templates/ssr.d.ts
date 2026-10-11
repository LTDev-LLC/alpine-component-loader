import type { ACLManifest } from './index.d.ts';

export interface ACLSSRRendererOptions {
    manifest: ACLManifest;
    concurrency?: number;
    root?: string;
    fetch?: typeof fetch;
    resolver?: (source: string, definition: unknown, context: { signal?: AbortSignal }) => string | Promise<string>;
    timeout?: number;
    maxTemplateBytes?: number;
    maxDataBytes?: number;
    maxRedirects?: number;
    renderLightDom?: boolean;
    dataResolver?: (context: {
        signal?: AbortSignal;
        tagName: string;
        props: Record<string, unknown>;
        attributes: Record<string, unknown>;
        slots: string | Record<string, string | string[]>;
        definition: unknown;
    }) => unknown | Promise<unknown>;
    dataPolicy?: {
        baseUrl: string | URL;
        allowedOrigins?: Array<string | URL>;
        authorize?: (
            request: { url: string; method: string; headers?: Record<string, string>; redirect?: boolean },
            context: {
                signal?: AbortSignal;
        tagName: string;
                props: Record<string, unknown>;
                attributes: Record<string, unknown>;
                slots: string | Record<string, string | string[]>;
                definition: unknown;
            },
        ) => boolean | Promise<boolean>;
        resolve?: (context: {
            signal?: AbortSignal;
        tagName: string;
            props: Record<string, unknown>;
            attributes: Record<string, unknown>;
            slots: string | Record<string, string | string[]>;
            definition: unknown;
            data: unknown;
        }) =>
            | {
                  src?: string;
                  keys?: Record<string, unknown>;
                  params?: Record<string, unknown>;
                  method?: string;
                  body?: unknown;
                  options?: RequestInit;
              }
            | Promise<{
                  src?: string;
                  keys?: Record<string, unknown>;
                  params?: Record<string, unknown>;
                  method?: string;
                  body?: unknown;
                  options?: RequestInit;
              }>;
        fetch?: typeof fetch;
        timeout?: number;
        maxResponseBytes?: number;
        maxRedirects?: number;
        allowUnsafeMethods?: boolean;
        allowSensitiveHeaders?: boolean;
    };
    security?: {
        urlPolicy?: (url: string, context: Record<string, unknown>) => boolean;
    };
}

export interface ACLSSRRenderOptions {
    signal?: AbortSignal;
    props?: Record<string, unknown>;
    attributes?: Record<string, unknown>;
    slots?: string | Record<string, string | string[]>;
    resolveData?: boolean;
    lightDom?: boolean;
    hydrate?: 'eager' | 'visible' | 'idle' | 'interaction' | 'media';
    hydrateMedia?: string;
}

export interface ACLSSRRenderer {
    render(tagName: string, options?: ACLSSRRenderOptions): Promise<string>;
    renderMany(requests: Array<ACLSSRRenderOptions & { tagName: string }>, options?: { concurrency?: number; signal?: AbortSignal }): Promise<string[]>;
    renderStream(requests: Iterable<ACLSSRRenderOptions & { tagName: string }>, options?: { concurrency?: number; signal?: AbortSignal }): AsyncIterable<string>;
    clearCache(): void;
}

export function createSSRRenderer(options: ACLSSRRendererOptions): ACLSSRRenderer;

declare const ACLSSR: { createSSRRenderer: typeof createSSRRenderer };
export default ACLSSR;
