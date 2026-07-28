import type { ACLTestHarness, ACLTestHarnessOptions } from './testing.d.ts';

export interface ACLVitestHooks {
    beforeEach(callback: () => void | Promise<void>): void;
    afterEach(callback: () => void | Promise<void>): void;
}

export interface ACLVitestFixture {
    readonly current: ACLTestHarness;
}

export function createACLVitestFixture(
    hooks: ACLVitestHooks,
    options?: ACLTestHarnessOptions,
): ACLVitestFixture;

declare const ACLVitest: { createACLVitestFixture: typeof createACLVitestFixture };
export default ACLVitest;
