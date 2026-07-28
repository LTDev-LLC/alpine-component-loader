import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatAuditReport, runAccessibilityAudit } from '../../server/audit-runner.mjs';
import { createStarterProject } from '../../server/starter-generator.mjs';
import { startACLTestServer } from '../../server/testing-server.mjs';
import { createACLVitestFixture } from '../../src/testing-vitest.js';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

test('audit formatter emits console, JSON, JUnit, and SARIF diagnostics', () => {
    // Exercise every supported formatter against a normalized report
    const report = {
        version: 1,
        generatedAt: '2026-01-01T00:00:00.000Z',
        consoleErrors: 1,
        routes: [
            {
                route: 'http://127.0.0.1/example?a=1&b=2',
                errors: ['broken <script>'],
                violations: [
                    {
                        route: 'http://127.0.0.1/example?a=1&b=2',
                        rule: 'button-name',
                        severity: 'serious',
                        selector: 'button[data-label="<missing>"]',
                        remediation: 'Give controls an accessible name.',
                    },
                ],
            },
        ],
    };
    assert.match(formatAuditReport(report), /1 violation\(s\)/);
    assert.match(formatAuditReport(report), /broken <script>/);
    assert.equal(JSON.parse(formatAuditReport(report, 'json')).violationCount, undefined);
    assert.match(formatAuditReport(report, 'junit'), /&lt;missing&gt;/);
    const sarif = JSON.parse(formatAuditReport(report, 'sarif'));
    assert.equal(sarif.runs[0].results[0].ruleId, 'button-name');
    assert.throws(
        // Reject unknown output contracts instead of silently changing formats
        () => formatAuditReport(report, 'yaml'),
        /Unsupported audit format/,
    );
});

test('headless audit crawls local routes, records page errors, and writes reports', async () => {
    // Exercise the complete local audit lifecycle with the optional Axe pass disabled
    const directory = await mkdtemp(join(tmpdir(), 'acl-audit-test-')),
        outputPath = join(directory, 'reports', 'audit.json');
    // Release all temporary audit artifacts even when browser execution fails
    try {
        await writeFile(
            join(directory, 'index.html'),
            '<!doctype html><html lang="en"><title>Audit</title><body><button></button></body></html>',
        );
        await writeFile(
            join(directory, 'second.html'),
            '<!doctype html><html lang="en"><title>Second</title><body><script>console.error("audit marker")</script></body></html>',
        );
        const result = await runAccessibilityAudit({
            root: directory,
            routes: ['/', '/second.html'],
            format: 'json',
            outFile: outputPath,
            axe: false,
        });
        assert.equal(result.report.routes.length, 2);
        assert.ok(result.report.violationCount >= 1);
        assert.equal(result.report.consoleErrors, 1);
        assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), result.report);
        await assert.rejects(
            // Reject unsupported launchers before attempting to crawl
            runAccessibilityAudit({
                root: directory,
                browserType: 'not-a-browser',
                axe: false,
            }),
            /Unsupported audit browser/,
        );
    } finally {
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
});

test('starter generator copies maintained templates with dry-run and overwrite protection', async () => {
    // Exercise copy, dry-run, force, validation, and target-shape branches
    const directory = await mkdtemp(join(tmpdir(), 'acl-starter-test-')),
        target = join(directory, 'app');
    // Release copied starter artifacts after every assertion path
    try {
        const dryRun = await createStarterProject({
            directory: target,
            template: 'vite',
            dryRun: true,
        });
        assert.equal(dryRun.dryRun, true);
        assert.ok(
            dryRun.files.some(
                // Locate the expected Vite package descriptor
                (path) => path.endsWith('/package.json'),
            ),
        );
        assert.ok(
            dryRun.files.some(
                // Locate the shared project configuration
                (path) => path.endsWith('/acl.config.mjs'),
            ),
        );
        assert.ok(
            dryRun.files.some(
                // Locate the form-associated Vite component sidecar
                (path) => path.endsWith('/public/components/quantity-field.acl.json'),
            ),
        );
        assert.ok(
            dryRun.files.some(
                // Locate the exact route registration example
                (path) => path.endsWith('/src/router.js'),
            ),
        );
        assert.ok(
            dryRun.files.some(
                // Locate the checked-in audit baseline
                (path) => path.endsWith('/.acl/a11y-baseline.json'),
            ),
        );
        assert.ok(
            dryRun.files.some(
                // Locate the account group root sidecar
                (path) => path.endsWith('/public/components/account-dashboard.acl.json'),
            ),
        );
        assert.equal(
            dryRun.files.some(
                // Exclude local dependency installs from copied starter artifacts
                (path) => path.includes('/node_modules/'),
            ),
            false,
        );
        const created = await createStarterProject({
            directory: target,
            template: 'vanilla',
        });
        assert.equal(created.template, 'vanilla');
        assert.match(await readFile(join(target, 'index.html'), 'utf8'), /ACL vanilla starter/);
        assert.match(await readFile(join(target, 'acl.config.mjs'), 'utf8'), /defineConfig/);
        assert.match(await readFile(join(target, 'app.js'), 'utf8'), /registerManifestFrom/);
        await assert.rejects(
            // Preserve generated application files unless force is explicit
            createStarterProject({
                directory: target,
                template: 'vanilla',
            }),
            /overwrite existing file/,
        );
        await createStarterProject({
            directory: target,
            template: 'vanilla',
            force: true,
        });
        await assert.rejects(
            // Reject unsupported starter names
            createStarterProject({
                directory: target,
                template: 'unknown',
            }),
            /Unsupported starter/,
        );
        await assert.rejects(
            // Require an explicit destination
            createStarterProject(),
            /output directory/,
        );
        const fileTarget = join(directory, 'file-target');
        await writeFile(fileTarget, 'occupied');
        await assert.rejects(
            // Prevent treating an existing file as a directory
            createStarterProject({
                directory: fileTarget,
            }),
            /not a directory/,
        );
    } finally {
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
});

test('testing server and Vitest fixture own setup, reset, and cleanup', async () => {
    // Verify the optional server helper uses safe loopback defaults
    const server = await startACLTestServer({
        root: projectRoot,
        index: 'tests/fixtures/testing-integration.html',
    });
    // Close the helper server after its response contract is inspected
    try {
        const response = await fetch(server.url);
        assert.equal(response.status, 200);
        assert.match(await response.text(), /ACL testing integration/);
    } finally {
        await server.close();
    }

    let setup = null,
        teardown = null,
        clearMetrics = 0,
        clearData = 0;
    const loader = {
            // Track non-owned loader reset operations
            clearMetrics: () => clearMetrics++,
            // Track non-owned data cache reset operations
            clearDataCache: () => clearData++,
        },
        fixture = createACLVitestFixture(
            {
                // Capture the framework setup callback
                beforeEach: (callback) => {
                    setup = callback;
                },
                // Capture the framework teardown callback
                afterEach: (callback) => {
                    teardown = callback;
                },
            },
            {
                loader,
                disposeLoader: false,
            },
        );
    assert.throws(
        // Keep the fixture unavailable outside a running test
        () => fixture.current,
        /only inside a running test/,
    );
    setup();
    assert.equal(fixture.current.loader, loader);
    await fixture.current.reset();
    assert.equal(clearMetrics, 1);
    assert.equal(clearData, 1);
    await teardown();
    assert.throws(
        // Clear the fixture reference after framework teardown
        () => fixture.current,
        /only inside a running test/,
    );
    assert.throws(
        // Require both lifecycle hooks
        () => createACLVitestFixture({ beforeEach: () => {} }),
        /beforeEach and afterEach/,
    );
});
