import type { ACLA11yViolation, ACLAuditor } from './a11y.d.ts';

export interface ACLA11yScannerButtonOptions {
    bottom?: number;
    right?: number;
    gap?: number;
    companionSelector?: string | null;
}

export interface ACLA11yScannerOptions {
    root?: Document | Element | ShadowRoot;
    auditor?: ACLAuditor | null;
    concurrency?: number;
    button?: ACLA11yScannerButtonOptions;
}

export interface ACLA11yComponentScanResult {
    element: HTMLElement;
    tag: string;
    violations: ACLA11yViolation[];
    duration: number;
    error: string | null;
}

export interface ACLA11yPageScanResult {
    scannedAt: string;
    duration: number;
    componentCount: number;
    violationCount: number;
    errorCount: number;
    components: ACLA11yComponentScanResult[];
}

export interface ACLA11yScannerController {
    scan(): Promise<ACLA11yPageScanResult>;
    open(): Promise<ACLA11yPageScanResult>;
    close(): void;
    destroy(): void;
    getResult(): ACLA11yPageScanResult | null;
}

export function mountAccessibilityScanner(options?: ACLA11yScannerOptions): ACLA11yScannerController;

declare const ACLA11yScanner: {
    mount: typeof mountAccessibilityScanner;
};

export default ACLA11yScanner;
