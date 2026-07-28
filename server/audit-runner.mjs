import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startACLDevServer } from './dev-server.mjs';
import { writeProjectFile } from './file-writer.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const routeIdentity = // Run this operation
        (value) => {
            // Process try
            try {
                const url = new URL(value);
                return `${url.pathname}${url.search}`;
            } catch {
                return String(value);
            }
        },
    findingFingerprint = // Run this operation
        (finding) =>
            createHash('sha256')
                .update(
                    [
                        routeIdentity(finding.route),
                        finding.engine || 'unknown',
                        finding.rule || '',
                        finding.selector || '',
                    ].join('\0'),
                )
                .digest('base64url'),
    loadJson = // Run this operation
        async (path, label) => {
            // Process try
            try {
                return JSON.parse(await readFile(path, 'utf8'));
            } catch (error) {
                if (error?.code === 'ENOENT') throw new TypeError(`${label} does not exist: ${path}`);
                throw new TypeError(`${label} is invalid: ${error.message}`);
            }
        },
    normalizeSuppressions = // Run this operation
        (value) => {
            const entries = Array.isArray(value) ? value : value?.suppressions;
            if (!Array.isArray(entries)) throw new TypeError('Accessibility suppressions must be an array.');
            return entries.map(
                // Run this operation
                (entry, index) => {
                    if (!entry?.rule || !entry.reason || !entry.expires)
                        throw new TypeError(
                            `Accessibility suppression ${index + 1} requires rule, reason, and expires.`,
                        );
                    if (
                        typeof entry.expires !== 'string' ||
                        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(entry.expires)
                    )
                        throw new TypeError(
                            `Accessibility suppression ${index + 1} requires an ISO 8601 expiration timestamp.`,
                        );
                    const expiresAt = Date.parse(entry.expires);
                    if (Number.isNaN(expiresAt))
                        throw new TypeError(`Accessibility suppression ${index + 1} has an invalid expires date.`);
                    return {
                        ...entry,
                        expiresAt,
                    };
                },
            );
        },
    matchesSuppression = // Run this operation
        (finding, suppression) =>
            finding.rule === suppression.rule &&
            (suppression.engine == null || finding.engine === suppression.engine) &&
            (suppression.route == null || routeIdentity(finding.route) === routeIdentity(suppression.route)) &&
            (suppression.selector == null || finding.selector === suppression.selector);

export const fingerprintAuditFinding = findingFingerprint;

export const classifyAuditFindings = // Run this operation
    ({
        routes,
        baseline = {
            // Configure this value
            version: 1,
            findings: {},
        },
        suppressions = [],
        now = Date.now(),
    } = {}) => {
        if (!baseline || baseline.version !== 1 || !baseline.findings || typeof baseline.findings !== 'object')
            throw new TypeError('Accessibility baselines require version: 1 and a findings map.');
        const normalizedSuppressions = normalizeSuppressions(suppressions),
            expiredSuppressions = normalizedSuppressions.filter(
                // Run this operation
                (item) => item.expiresAt <= now,
            ),
            activeSuppressions = normalizedSuppressions.filter(
                // Run this operation
                (item) => item.expiresAt > now,
            ),
            currentFingerprints = new Set(),
            classifiedRoutes = Array.from(
                routes || [], // Run this operation
                (route) => ({
                    ...route,
                    violations: Array.from(
                        route.violations || [], // Run this operation
                        (finding) => {
                            const fingerprint = findingFingerprint(finding),
                                suppression = activeSuppressions.find(
                                    // Run this operation
                                    (candidate) => matchesSuppression(finding, candidate),
                                );
                            currentFingerprints.add(fingerprint);
                            return {
                                ...finding,
                                fingerprint,
                                status: suppression
                                    ? 'suppressed'
                                    : baseline.findings[fingerprint]
                                      ? 'unchanged'
                                      : 'new',
                                ...(suppression
                                    ? {
                                          suppression: {
                                              // Configure this value
                                              reason: suppression.reason,
                                              expires: suppression.expires,
                                          },
                                      }
                                    : {}),
                            };
                        },
                    ),
                }),
            ),
            resolved = Object.entries(baseline.findings)
                .filter(
                    // Run this operation
                    ([fingerprint]) => !currentFingerprints.has(fingerprint),
                )
                .map(
                    // Run this operation
                    ([fingerprint, finding]) => ({
                        // Configure this value
                        fingerprint,
                        ...finding,
                    }),
                ),
            allViolations = classifiedRoutes.flatMap(
                // Run this operation
                (route) => route.violations,
            );
        return {
            routes: classifiedRoutes,
            allViolations,
            resolved,
            expiredSuppressions,
            newViolationCount: allViolations.filter(
                // Run this operation
                (item) => item.status === 'new',
            ).length,
        };
    };

export const createAccessibilityBaseline = // Run this operation
    (violations, generatedAt = new Date().toISOString()) => ({
        version: 1,
        generatedAt,
        findings: Object.fromEntries(
            Array.from(violations || [])
                .filter(
                    // Run this operation
                    (item) => item.status !== 'suppressed',
                )
                .map(
                    // Run this operation
                    (item) => [
                        item.fingerprint || findingFingerprint(item),
                        {
                            route: routeIdentity(item.route),
                            engine: item.engine,
                            rule: item.rule,
                            severity: item.severity,
                            selector: item.selector,
                            remediation: item.remediation,
                        },
                    ],
                ),
        ),
    });

// Run this operation
const escapeXml = (value) =>
    String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');

export const formatAuditReport = (report, format = 'console') => {
    // Render one normalized audit result for terminals and common CI consumers
    const violations = report.routes.flatMap((route) => route.violations),
        expiredSuppressions = report.expiredSuppressions || [],
        resolved = report.resolved || [];
    if (format === 'json') return `${JSON.stringify(report, null, 2)}\n`;
    if (format === 'junit') {
        const failures = violations.filter(
                // Run this operation
                (item) => item.status == null || item.status === 'new',
            ),
            unchanged = violations.filter(
                // Run this operation
                (item) => item.status === 'unchanged',
            ),
            suppressed = violations.filter(
                // Run this operation
                (item) => item.status === 'suppressed',
            ),
            pageErrors = report.routes.flatMap(
                // Run this operation
                (route) =>
                    route.errors.map(
                        // Run this operation
                        (message) => ({
                            // Configure this value
                            route: route.route,
                            message,
                        }),
                    ),
            ),
            cases = [
                ...failures.map(
                    // Run this operation
                    (item) =>
                        `<testcase classname="acl.accessibility" name="${escapeXml(item.rule)}" file="${escapeXml(item.route)}"><failure message="${escapeXml(item.remediation)}">${escapeXml(item.selector)}</failure></testcase>`,
                ),
                ...expiredSuppressions.map(
                    // Run this operation
                    (item) =>
                        `<testcase classname="acl.accessibility.suppression" name="${escapeXml(item.rule)}"><failure message="Suppression expired">${escapeXml(item.reason)}</failure></testcase>`,
                ),
                ...pageErrors.map(
                    // Run this operation
                    (item) =>
                        `<testcase classname="acl.accessibility.page" name="${escapeXml(item.route)}"><failure message="Page error">${escapeXml(item.message)}</failure></testcase>`,
                ),
                ...unchanged.map(
                    // Run this operation
                    (item) =>
                        `<testcase classname="acl.accessibility.unchanged" name="${escapeXml(item.rule)}" file="${escapeXml(item.route)}"/>`,
                ),
                ...suppressed.map(
                    // Run this operation
                    (item) =>
                        `<testcase classname="acl.accessibility.suppressed" name="${escapeXml(item.rule)}" file="${escapeXml(item.route)}"><skipped message="${escapeXml(item.suppression?.reason || 'suppressed')}"/></testcase>`,
                ),
                ...resolved.map(
                    // Run this operation
                    (item) =>
                        `<testcase classname="acl.accessibility.resolved" name="${escapeXml(item.rule)}" file="${escapeXml(item.route)}"><skipped message="resolved"/></testcase>`,
                ),
            ].join('');

        const failureCount = failures.length + expiredSuppressions.length + pageErrors.length,
            testCount =
                failures.length +
                expiredSuppressions.length +
                pageErrors.length +
                unchanged.length +
                suppressed.length +
                resolved.length;
        return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="ACL accessibility audit" tests="${testCount || 1}" failures="${failureCount}" skipped="${suppressed.length + resolved.length}">${cases || '<testcase classname="acl.accessibility" name="audit"/>'}</testsuite>\n`;
    }
    if (format === 'sarif') {
        const expiredResults = expiredSuppressions.map(
                // Run this operation
                (item) => ({
                    ruleId: 'acl-expired-suppression',
                    level: 'error',
                    message: { text: `Expired suppression for ${item.rule}: ${item.reason}` },
                    properties: {
                        // Configure this value
                        status: 'expired',
                        expires: item.expires,
                    },
                }),
            ),
            pageErrorResults = report.routes.flatMap(
                // Run this operation
                (route) =>
                    route.errors.map(
                        // Run this operation
                        (message) => ({
                            ruleId: 'acl-page-error',
                            level: 'error',
                            message: { text: message },
                            locations: [
                                {
                                    physicalLocation: {
                                        artifactLocation: { uri: route.route },
                                    },
                                },
                            ],
                            properties: { status: 'page-error' },
                        }),
                    ),
            ),
            rules = [
                ...new Map(
                    // Run this operation
                    violations.map((item) => [
                        item.rule,
                        {
                            id: item.rule,
                            shortDescription: { text: item.remediation },
                        },
                    ]),
                ).values(),
            ],
            sarif = {
                version: '2.1.0',
                $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
                runs: [
                    {
                        tool: {
                            driver: {
                                name: 'alpine-component-loader audit',
                                rules,
                            },
                        },
                        // Run this operation
                        results: [
                            ...violations.map(
                                // Run this operation
                                (item) => ({
                                    ruleId: item.rule,
                                    level:
                                        item.severity === 'critical' || item.severity === 'serious'
                                            ? 'error'
                                            : 'warning',
                                    message: { text: item.remediation },
                                    locations: [
                                        {
                                            physicalLocation: {
                                                artifactLocation: { uri: item.route },
                                                region: { snippet: { text: item.selector } },
                                            },
                                        },
                                    ],
                                    baselineState: item.status === 'unchanged' ? 'unchanged' : 'new',
                                    ...(item.status === 'suppressed'
                                        ? {
                                              suppressions: [
                                                  {
                                                      kind: 'external',
                                                      justification: item.suppression?.reason || 'ACL suppression',
                                                  },
                                              ],
                                          }
                                        : {}),
                                    properties: {
                                        // Configure this value
                                        status: item.status || 'new',
                                        fingerprint: item.fingerprint,
                                    },
                                }),
                            ),
                            ...resolved.map(
                                // Run this operation
                                (item) => ({
                                    ruleId: item.rule,
                                    level: 'none',
                                    message: { text: item.remediation || `${item.rule} resolved` },
                                    baselineState: 'absent',
                                    properties: {
                                        // Configure this value
                                        status: 'resolved',
                                        fingerprint: item.fingerprint,
                                    },
                                }),
                            ),
                            ...expiredResults,
                            ...pageErrorResults,
                        ],
                    },
                ],
            };
        return `${JSON.stringify(sarif, null, 2)}\n`;
    }
    if (format !== 'console') throw new TypeError(`Unsupported audit format "${format}".`);
    const lines = [
        `[ACL Audit] ${report.routes.length} route(s), ${violations.length} violation(s), ${report.newViolationCount ?? violations.length} new, ${resolved.length} resolved, ${report.consoleErrors} console/page error(s).`,
    ];
    // Run this operation
    violations.forEach((item) =>
        lines.push(
            `[${item.status || 'new'}/${item.severity}] ${item.route} ${item.rule} at ${item.selector}: ${item.remediation}`,
        ),
    );
    expiredSuppressions.forEach(
        // Run this operation
        (item) => lines.push(`[expired] Suppression for ${item.rule}: ${item.reason} (${item.expires})`),
    );
    resolved.forEach(
        // Run this operation
        (item) => lines.push(`[resolved] ${item.route} ${item.rule} at ${item.selector}`),
    );
    // Run this operation
    report.routes.forEach((route) =>
        // Run this operation
        route.errors.forEach((message) => lines.push(`[error] ${route.route}: ${message}`)),
    );
    return `${lines.join('\n')}\n`;
};

export const runAccessibilityAudit = async ({
    routes = ['/'],
    root = process.cwd(),
    index = 'index.html',
    format = 'console',
    outFile = null,
    axe = true,
    timeout = 15_000,
    browserType = 'chromium',
    baselineFile = null,
    suppressionsFile = null,
    updateBaseline = false,
} = {}) => {
    // Audit local routes or absolute URLs in one headless browser session
    const { [browserType]: launcher } = await import('playwright');
    if (!launcher) throw new TypeError(`Unsupported audit browser "${browserType}".`);
    const localRoutes = routes.filter((route) => !/^https?:\/\//i.test(route));
    let app = null,
        browser = null;
    // Run this operation
    try {
        if (localRoutes.length)
            app = await startACLDevServer({
                root,
                index,
                host: '127.0.0.1',
                port: 0,
                watchFiles: false,
                injectAllHtml: true,
            });
        browser = await launcher.launch();
        const page = await browser.newPage(),
            a11ySource = await readFile(resolve(packageRoot, 'dist/a11y.js'), 'utf8'),
            results = [];
        // Run this operation
        for (const route of routes) {
            const url = /^https?:\/\//i.test(route) ? route : new URL(route, app.url).href,
                errors = [];
            // Run this operation
            const onConsole = (message) => {
                    if (message.type() === 'error') errors.push(message.text());
                },
                // Run this operation
                onPageError = (error) => errors.push(error.message);
            page.on('console', onConsole);
            page.on('pageerror', onPageError);
            await page.goto(url, {
                // Wait for application requests to settle within the caller deadline
                waitUntil: 'load',
                timeout,
            });
            await page.waitForTimeout(100);
            await page.addScriptTag({
                type: 'module',
                content: `${a11ySource}\nglobalThis.__aclRunBasicAccessibilityAudit = runBasicAccessibilityAudit;`,
            });
            // Run this operation
            await page.waitForFunction(() => typeof globalThis.__aclRunBasicAccessibilityAudit === 'function');
            // Run this operation
            const builtIn = await page.evaluate(() => {
                const roots = [
                    {
                        // Label the document separately from component shadow roots
                        root: document,
                        label: 'document',
                    },
                ];
                // Run this operation
                document.querySelectorAll('*').forEach((element) => {
                    if (element.shadowRoot)
                        roots.push({
                            // Retain shadow-root ownership in diagnostic selectors
                            root: element.shadowRoot,
                            label: element.localName,
                        });
                });
                // Run this operation
                return roots.flatMap(({ root, label }) =>
                    // Run this operation
                    globalThis.__aclRunBasicAccessibilityAudit(root).map((item) => ({
                        ...item,
                        selector: label === 'document' ? item.selector : `${label}::shadow ${item.selector}`,
                        engine: 'acl',
                    })),
                );
            });
            let axeViolations = [];
            if (axe) {
                const { default: AxeBuilder } = await import('@axe-core/playwright'),
                    axeResult = await new AxeBuilder({ page }).analyze();
                // Run this operation
                axeViolations = axeResult.violations.flatMap((violation) =>
                    // Run this operation
                    violation.nodes.map((node) => ({
                        rule: violation.id,
                        severity: violation.impact || 'moderate',
                        selector: node.target.join(', '),
                        remediation: violation.help,
                        engine: 'axe',
                    })),
                );
            }
            page.off('console', onConsole);
            page.off('pageerror', onPageError);
            results.push({
                route: url,
                // Run this operation
                violations: [...builtIn, ...axeViolations].map((item) => ({
                    // Associate every normalized violation with its audited route
                    ...item,
                    route: url,
                })),
                errors,
            });
        }
        const baseline = baselineFile
                ? updateBaseline
                    ? await loadJson(baselineFile, 'Accessibility baseline').catch(
                          // Run this operation
                          (error) => {
                              if (String(error.message).includes('does not exist'))
                                  return {
                                      // Configure this value
                                      version: 1,
                                      findings: {},
                                  };
                              throw error;
                          },
                      )
                    : await loadJson(baselineFile, 'Accessibility baseline')
                : {
                      // Configure this value
                      version: 1,
                      findings: {},
                  },
            suppressions = suppressionsFile ? await loadJson(suppressionsFile, 'Accessibility suppressions') : [],
            classified = classifyAuditFindings({
                routes: results,
                baseline,
                suppressions,
            }),
            { routes: classifiedRoutes, allViolations, resolved, expiredSuppressions, newViolationCount } = classified,
            report = {
                version: 1,
                generatedAt: new Date().toISOString(),
                routes: classifiedRoutes,
                // Run this operation
                violationCount: classifiedRoutes.reduce((total, route) => total + route.violations.length, 0),
                newViolationCount,
                // Run this operation
                consoleErrors: classifiedRoutes.reduce((total, route) => total + route.errors.length, 0),
                resolved,
                expiredSuppressions,
                failed:
                    (updateBaseline ? false : newViolationCount > 0) ||
                    expiredSuppressions.length > 0 ||
                    classifiedRoutes.some(
                        // Run this operation
                        (route) => route.errors.length,
                    ),
            };
        if (baselineFile && updateBaseline) {
            const content = `${JSON.stringify(
                createAccessibilityBaseline(allViolations, report.generatedAt),
                null,
                2,
            )}\n`;
            await writeProjectFile(baselineFile, content, { force: true });
        }
        const output = formatAuditReport(report, format);
        if (outFile) await writeProjectFile(outFile, output, { force: true });
        return {
            // Return both structured and selected serialized forms
            report,
            output,
            outFile,
        };
    } finally {
        await browser?.close();
        await app?.close();
    }
};

export default {
    // Expose the formatter separately for CI integrations
    formatAuditReport,
    runAccessibilityAudit,
};
