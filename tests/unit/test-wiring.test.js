import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const readProjectFile = async (path) => {
    // Read one repository file used by the wiring contract
    return await readFile(resolve(projectRoot, path), 'utf8');
};

const readWorkflowJob = (workflow, name) => {
    // Extract one top-level workflow job without requiring a YAML runtime dependency
    const startMarker = `  ${name}:\n`,
        start = workflow.indexOf(startMarker);
    assert.notEqual(start, -1, `Missing ${name} CI job.`);
    const remainder = workflow.slice(start + startMarker.length),
        nextJob = remainder.search(/^  [a-z][a-z0-9-]*:\n/m);
    return nextJob === -1 ? remainder : remainder.slice(0, nextJob);
};

test('package scripts expose every maintained test layer', async () => {
    // Verify the public npm commands retain every test layer
    const manifest = JSON.parse(await readProjectFile('package.json')),
        scripts = manifest.scripts;
    assert.equal(scripts['test:unit'], 'node --test tests/unit/*.test.js');
    assert.equal(scripts['test:coverage'], 'node scripts/coverage.mjs');
    assert.equal(scripts['test:browser'], 'playwright test --project=chromium');
    assert.equal(scripts['test:cross-browser'], 'playwright test');
    assert.match(scripts['test:other-browsers'], /--project=firefox --project=webkit/);
    assert.equal(scripts['check:lean-install'], 'node scripts/check-lean-install.mjs');
    // Check every complete-validation requirement
    for (const required of [
        'test:coverage',
        'test:types',
        'test:implementation-types',
        'security:static',
        'security:audit',
        'test:other-browsers',
        'check:lean-install',
    ])
        assert.match(scripts.validate, new RegExp(`npm run ${required}`));
});

test('test files follow the discovery contracts without focused cases', async () => {
    // Discover test files through the same naming contracts as their runners
    const browserFiles = (await readdir(resolve(projectRoot, 'tests'))).filter(
            // Select browser specifications
            (name) => name.endsWith('.spec.js'),
        ),
        unitFiles = (await readdir(resolve(projectRoot, 'tests/unit'))).filter(
            // Select Node test modules
            (name) => name.endsWith('.test.js'),
        );
    assert.ok(browserFiles.length > 0);
    assert.ok(unitFiles.length > 0);
    // Reject focused cases across every discovered test file
    for (const path of [
        ...browserFiles.map(
            // Resolve browser test paths
            (name) => `tests/${name}`,
        ),
        ...unitFiles.map(
            // Resolve unit test paths
            (name) => `tests/unit/${name}`,
        ),
    ]) {
        const source = await readProjectFile(path);
        assert.doesNotMatch(source, /\b(?:test|describe|it)\.only\s*\(/, `${path} contains a focused test.`);
    }
});

test('CI runs coverage and complete browser suites before merge and after pushes', async () => {
    // Verify pull requests and pushes share the authoritative browser topology
    const workflow = await readProjectFile('.github/workflows/ci.yml'),
        browsers = readWorkflowJob(workflow, 'browsers'),
        coverage = readWorkflowJob(workflow, 'coverage'),
        staticValidation = readWorkflowJob(workflow, 'static'),
        fullBrowserCommand = 'npx --no-install playwright test --project=${{ matrix.browser }}';
    assert.doesNotMatch(coverage, /github\.event_name/);
    assert.match(coverage, /npm run test:coverage/);
    assert.doesNotMatch(browsers, /github\.event_name/);
    assert.match(browsers, /browser: \[firefox, webkit\]/);
    assert.ok(browsers.includes(fullBrowserCommand));
    assert.doesNotMatch(browsers, /tests\/[^\s]+\.spec\.js/);
    // Check the static job retains its non-browser test layers
    for (const required of [
        'test:unit',
        'test:types',
        'test:implementation-types',
        'security:static',
        'security:audit',
        'check:lean-install',
    ])
        assert.match(staticValidation, new RegExp(`npm run ${required}`));
});
