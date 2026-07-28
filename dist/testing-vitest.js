// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Propagate jsDelivr's generated minified entry suffix to package-owned dependencies
const isMinifiedModule = new URL(import.meta.url).pathname.endsWith('.min.js'), resolveLocalModule = (specifier)=>isMinifiedModule ? specifier.replace(/\.js$/, '.min.js') : specifier, importLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), { createACLTestHarness } = await importLocalModule('./testing.js');
// Install browser-mode hooks without taking a hard dependency on a particular Vitest version
export const createACLVitestFixture = ({ beforeEach, afterEach }, options = {})=>{
    if (typeof beforeEach !== 'function' || typeof afterEach !== 'function') throw new TypeError('[ACL Testing] Vitest beforeEach and afterEach hooks are required.');
    let harness = null;
    beforeEach(()=>{
        harness = createACLTestHarness(options);
    });
    afterEach(async ()=>{
        await harness?.cleanup();
        harness = null;
    });
    return {
        get current () {
            if (!harness) throw new Error('[ACL Testing] The Vitest fixture is available only inside a running test.');
            return harness;
        }
    };
};
export default {
    createACLVitestFixture
};
