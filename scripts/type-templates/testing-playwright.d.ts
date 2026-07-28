export interface ACLPlaywrightServer {
    origin: string;
    url: string;
    root: string;
    indexPath: string;
    close(): Promise<void>;
}

export interface ACLPlaywrightFixture {
    page: unknown;
    server: ACLPlaywrightServer | null;
    reset(): Promise<void>;
    metrics(): Promise<unknown>;
}

export interface ACLPlaywrightOptions {
    server?: false | Record<string, unknown>;
    route?: string | null;
    moduleUrl?: string | null;
}

export interface ACLPlaywrightTest {
    (...args: unknown[]): unknown;
    extend(fixtures: Record<string, unknown>): ACLPlaywrightTest;
}

export function createACLPlaywrightTest(options?: ACLPlaywrightOptions): ACLPlaywrightTest;

export const expect: unknown;
declare const ACLPlaywright: { createACLPlaywrightTest: typeof createACLPlaywrightTest; expect: typeof expect };
export default ACLPlaywright;
