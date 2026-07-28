import type AlpineComponentLoader from './index.d.ts';

export interface ACLDevReloadResult {
    sources: string[];
    tags: string[];
    reloaded: number;
    failed?: number;
}

export function reloadChangedTemplates(
    sources: string | string[],
    loader?: typeof AlpineComponentLoader
): Promise<ACLDevReloadResult>;

export interface ACLDevConnection {
    readonly eventSource: EventSource | null;
    close(): void;
}

export function connectACLDevServer(options?: {
    url?: string | null;
    loader?: typeof AlpineComponentLoader;
    EventSourceImpl?: typeof EventSource;
}): ACLDevConnection;

export default connectACLDevServer;
