export interface ACLA11yViolation {
    rule: string;
    severity: string;
    selector: string;
    remediation: string;
}

export interface ACLA11yResult {
    violations: ACLA11yViolation[];
    duration: number;
}

export type ACLAuditor = (
    root: ParentNode,
    context: { basic(root: ParentNode): ACLA11yViolation[] }
) => ACLA11yViolation[] | Promise<ACLA11yViolation[]>;

export function runBasicAccessibilityAudit(root: ParentNode): ACLA11yViolation[];
export function auditAccessibility(root: ParentNode, options?: { auditor?: ACLAuditor | null }): Promise<ACLA11yResult>;
export function observeAccessibility(loaderClass: unknown, options?: {
    auditor?: ACLAuditor | null;
    debounce?: number;
    logFindings?: boolean;
}): {
    audit(element: HTMLElement): Promise<ACLA11yResult | null>;
    getResults(element: HTMLElement): ACLA11yResult | null;
    disconnect(): void;
    loader: unknown;
};

declare const ACLA11y: {
    audit: typeof auditAccessibility;
    observe: typeof observeAccessibility;
    runBasicAudit: typeof runBasicAccessibilityAudit;
};

export default ACLA11y;
