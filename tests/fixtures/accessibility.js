// Return only violations that block the unified example shell accessibility gate
export const getSeriousAccessibilityViolations = (results) =>
    results.violations.filter(
        // Keep the two impacts that require release-blocking attention
        (violation) => ['serious', 'critical'].includes(violation.impact),
    );
