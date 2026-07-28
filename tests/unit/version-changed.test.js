import assert from 'node:assert/strict';
import test from 'node:test';
import { packageVersionChanged, readPackageVersion } from '../../scripts/version-changed.mjs';

test('CI version gate ignores unrelated package metadata changes', () => {
    // Exercise the test scenario
    const previous = JSON.stringify({
            version: '1.1.0',
            description: 'Before',
        }),
        current = JSON.stringify({
            version: '1.1.0',
            description: 'After',
        });
    assert.equal(packageVersionChanged(current, previous), false);
});

test('CI version gate detects semantic version changes', () => {
    // Exercise the test scenario
    assert.equal(
        packageVersionChanged(JSON.stringify({ version: '1.2.0' }), JSON.stringify({ version: '1.1.0' })),
        true,
    );
    assert.equal(readPackageVersion(JSON.stringify({ version: '2.0.0-beta.1+build.4' })), '2.0.0-beta.1+build.4');
    assert.throws(
        // Run the operation expected to throw
        () => readPackageVersion(JSON.stringify({ version: 'next' })),
        /valid semantic version/,
    );
});
