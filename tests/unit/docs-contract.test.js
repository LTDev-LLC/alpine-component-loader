import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createDocumentationContracts,
    extractClassStaticMembers,
    extractFunctionReturnMembers,
    extractInterfaceMembers,
    findMissingDocumentation,
    markdownDocumentsMember,
} from '../../scripts/docs-contract.mjs';

test('documentation contracts extract generic methods, properties, and prefixed option names', () => {
    // Exercise representative declaration shapes used by the generated public types
    const source = `
export interface Options<T = unknown> {
    source?: string;
    resolve?<R = T>(value: R): Promise<R>;
}
export default class Loader {
    static readonly version: string;
    static define<T = unknown>(name: string): T;
}
export function observe(): {
    result: unknown;
    close(): void;
};
`;
    assert.deepEqual(extractInterfaceMembers(source, 'Options'), ['source', 'resolve']);
    assert.deepEqual(extractInterfaceMembers(source, 'Options', { prefix: 'data.' }), ['data.source', 'data.resolve']);
    assert.deepEqual(extractClassStaticMembers(source, 'Loader'), ['version', 'define']);
    assert.deepEqual(extractFunctionReturnMembers(source, 'observe'), ['result', 'close']);
});

test('documentation member matching accepts exact properties and method signatures only', () => {
    // Verify that prose mentions do not accidentally satisfy the reference contract
    const source = 'Use `start()` and inspect `globalConfig`. A plain start mention is insufficient.';
    assert.equal(markdownDocumentsMember(source, 'start'), true);
    assert.equal(markdownDocumentsMember(source, 'globalConfig'), true);
    assert.equal(markdownDocumentsMember(source, 'config'), false);
});

test('documentation coverage reports missing members by contract and target document', () => {
    // Build a minimal contract from declaration and package fixtures
    const contracts = createDocumentationContracts({
        packageJson: {
            name: 'example-loader',
            exports: {
                '.': {},
                './auto': {},
                './package.json': {},
            },
        },
        declarations: {
            'index.d.ts': `
export interface ACLComponentOptions {
    shadow?: boolean;
}
export interface ACLProps {
    $data: unknown;
}
export interface ACLCacheHelpers {
}
export interface ACLPersistenceHelpers {
}
export interface ACLPropConfig {
}
export interface ACLDataOptions {
    src?: string;
}
export interface ACLHooks {
    mounted?(): void;
}
export interface ACLReloadOptions {
}
export interface ACLStorageAdapter {
}
export interface ACLIndexedDBPersistenceAdapter {
}
export interface ACLAdaptivePrefetchController {
}
export default class AlpineComponentLoader {
    static start(): Promise<void>;
}
`,
            'auto.d.ts': 'export function startAutoLoader(): Promise<void>;',
            'dev.d.ts': 'export interface ACLDevConnection {\n}\n',
            'a11y-scanner.d.ts': 'export interface ACLA11yScannerController {\n}\n',
            'testing.d.ts': 'export interface ACLMountHandle {\n}\nexport interface ACLEventRecorder {\n}\n',
            'ssr.d.ts': 'export interface ACLSSRRenderer {\n}\n',
        },
    });
    // Detect the deliberately omitted nested data option
    const missing = findMissingDocumentation(contracts, {
        'docs/api.md': '`example-loader` `example-loader/auto` `shadow` `$data` `startAutoLoader()`',
        'docs/components.md': '',
        'docs/data.md': '',
        'docs/lifecycle.md': '`mounted()`',
        'docs/prefetch.md': '',
        'docs/accessibility-and-debugging.md': '',
        'docs/testing.md': '',
        'docs/ssr.md': '',
    });
    assert.deepEqual(
        missing.map(
            // Reduce diagnostics to their stable externally meaningful fields
            (item) => [item.group, item.document, item.member],
        ),
        [
            ['core loader methods and properties', 'docs/api.md', 'start'],
            ['data options', 'docs/data.md', 'data.src'],
        ],
    );
});
