import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPolyfills, waitForWebComponents } from '../../src/polyfills.js';

// Validate opt-in configuration without activating a browser runtime
test('polyfill options validate synchronously and server use rejects with a structured error', async () => {
    // Reject each invalid option without starting browser work
    for (const value of [null, [], 2]) assert.throws(() => loadPolyfills(value), TypeError);
    // Reject each invalid option without starting browser work
    for (const value of ['', null, 2]) assert.throws(() => loadPolyfills({ url: value }), TypeError);
    // Reject each invalid option without starting browser work
    for (const value of [-1, Infinity, NaN]) assert.throws(() => loadPolyfills({ timeout: value }), TypeError);
    // Exercise readiness and capture the observable result
    assert.throws(() => loadPolyfills({ nonce: 2 }), TypeError);
    // Reject incomplete script policies before attempting browser activation
    assert.throws(() => loadPolyfills({ trustedTypesPolicy: {} }), TypeError);
    // Exercise readiness and capture the observable result
    assert.throws(() => waitForWebComponents(null), TypeError);
    await assert.rejects(loadPolyfills(), { code: 'ACL_ENVIRONMENT_UNAVAILABLE' });
    // Exercise readiness and capture the observable result
    assert.equal(await waitForWebComponents(() => 42), 42);
    await assert.rejects(
        // Exercise readiness and capture the observable result
        waitForWebComponents(() => {
            throw new Error('callback failure');
        }),
        /callback failure/,
    );
});
