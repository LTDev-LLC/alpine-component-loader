// Extract the public runtime contract that must remain discoverable in the Markdown reference

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Extract public property and method names from one declaration interface
export const extractInterfaceMembers = (source, interfaceName, { prefix = '' } = {}) => {
    const match = String(source).match(
        new RegExp(`export interface ${escapeRegExp(interfaceName)}(?:<[^\\n{]+>)?\\s*\\{([\\s\\S]*?)^\\}`, 'm'),
    );
    if (!match) return [];
    return Array.from(
        match[1].matchAll(/^\s{4}(?:readonly\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\??(?:<[^;\n(]+>)?\s*(?=[:(])/gm),
        // Prefix nested option names with their public object path
        (item) => `${prefix}${item[1]}`,
    );
};

// Extract public static property and method names from one declaration class
export const extractClassStaticMembers = (source, className) => {
    const match = String(source).match(
        new RegExp(`export default class ${escapeRegExp(className)}\\s*\\{([\\s\\S]*?)^\\}`, 'm'),
    );
    if (!match) return [];
    return Array.from(
        match[1].matchAll(/^\s{4}static\s+(?:readonly\s+)?([A-Za-z_$][A-Za-z0-9_$]*)(?:<[^;\n(]+>)?\s*(?=[:(])/gm),
        // Return the captured static member name
        (item) => item[1],
    );
};

// Extract members from an inline object returned by one exported function
export const extractFunctionReturnMembers = (source, functionName) => {
    const text = String(source),
        start = text.indexOf(`export function ${functionName}`);
    if (start < 0) return [];
    const match = text.slice(start).match(/\)\s*:\s*\{([\s\S]*?)^\};/m);
    if (!match) return [];
    return Array.from(
        match[1].matchAll(/^\s{4}(?:readonly\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\??(?:<[^;\n(]+>)?\s*(?=[:(])/gm),
        // Return each controller property or method name
        (item) => item[1],
    );
};

// Extract runtime value exports while excluding declaration-only type contracts
export const extractRuntimeExports = (source) => {
    const names = new Set(
            Array.from(
                String(source).matchAll(
                    /^export\s+(?:declare\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm,
                ),
                // Return each exported runtime value name
                (item) => item[1],
            ),
        ),
        defaultMatch = String(source).match(/^export default\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*;/m);
    if (defaultMatch) names.add(defaultMatch[1]);
    return [...names];
};

// Convert package export-map keys to their consumer-facing specifiers
const publicPackageEntries = (packageJson) =>
    Object.keys(packageJson.exports || {})
        // Ignore metadata-only package access
        .filter((key) => key !== './package.json')
        // Expand relative export keys into complete package specifiers
        .map((key) => (key === '.' ? packageJson.name : `${packageJson.name}/${key.slice(2)}`));

// Build the documentation contracts assigned to each authoritative guide
export const createDocumentationContracts = ({ declarations, packageJson }) => {
    const index = declarations['index.d.ts'] || '',
        groups = [
            {
                name: 'package entry points',
                document: 'docs/api.md',
                members: publicPackageEntries(packageJson),
            },
            {
                name: 'core loader methods and properties',
                document: 'docs/api.md',
                members: extractClassStaticMembers(index, 'AlpineComponentLoader'),
            },
            {
                name: 'component options',
                document: 'docs/api.md',
                members: extractInterfaceMembers(index, 'ACLComponentOptions'),
            },
            {
                name: 'component built-in props',
                document: 'docs/api.md',
                members: extractInterfaceMembers(index, 'ACLProps'),
            },
            {
                name: 'component cache helpers',
                document: 'docs/api.md',
                members: extractInterfaceMembers(index, 'ACLCacheHelpers'),
            },
            {
                name: 'component persistence helpers',
                document: 'docs/api.md',
                members: extractInterfaceMembers(index, 'ACLPersistenceHelpers'),
            },
            {
                name: 'prop descriptor fields',
                document: 'docs/components.md',
                members: extractInterfaceMembers(index, 'ACLPropConfig'),
            },
            {
                name: 'data options',
                document: 'docs/data.md',
                members: extractInterfaceMembers(index, 'ACLDataOptions', { prefix: 'data.' }),
            },
            {
                name: 'lifecycle and data hooks',
                document: 'docs/lifecycle.md',
                members: extractInterfaceMembers(index, 'ACLHooks'),
            },
            {
                name: 'reload options',
                document: 'docs/lifecycle.md',
                members: extractInterfaceMembers(index, 'ACLReloadOptions'),
            },
            {
                name: 'storage adapter',
                document: 'docs/data.md',
                members: extractInterfaceMembers(index, 'ACLStorageAdapter'),
            },
            {
                name: 'IndexedDB adapter',
                document: 'docs/data.md',
                members: extractInterfaceMembers(index, 'ACLIndexedDBPersistenceAdapter'),
            },
            {
                name: 'adaptive prefetch controller',
                document: 'docs/prefetch.md',
                members: extractInterfaceMembers(index, 'ACLAdaptivePrefetchController'),
            },
            {
                name: 'development connection',
                document: 'docs/lifecycle.md',
                members: extractInterfaceMembers(declarations['dev.d.ts'], 'ACLDevConnection'),
            },
            {
                name: 'accessibility scanner controller',
                document: 'docs/accessibility-and-debugging.md',
                members: extractInterfaceMembers(declarations['a11y-scanner.d.ts'], 'ACLA11yScannerController'),
            },
            {
                name: 'accessibility observer controller',
                document: 'docs/accessibility-and-debugging.md',
                members: extractFunctionReturnMembers(declarations['a11y.d.ts'], 'observeAccessibility'),
            },
            {
                name: 'testing mount handle',
                document: 'docs/testing.md',
                members: extractInterfaceMembers(declarations['testing.d.ts'], 'ACLMountHandle'),
            },
            {
                name: 'testing event recorder',
                document: 'docs/testing.md',
                members: extractInterfaceMembers(declarations['testing.d.ts'], 'ACLEventRecorder'),
            },
            {
                name: 'testing fetch mock controller',
                document: 'docs/testing.md',
                members: extractFunctionReturnMembers(declarations['testing.d.ts'], 'installFetchMock'),
            },
            {
                name: 'SSR renderer',
                document: 'docs/ssr.md',
                members: extractInterfaceMembers(declarations['ssr.d.ts'], 'ACLSSRRenderer'),
            },
            {
                name: 'form helpers',
                document: 'docs/lifecycle.md',
                members: extractInterfaceMembers(index, 'ACLFormHelpers'),
            },
            {
                name: 'form-associated host',
                document: 'docs/lifecycle.md',
                members: extractInterfaceMembers(index, 'ACLFormAssociatedElement'),
            },
            {
                name: 'error boundary host',
                document: 'docs/lifecycle.md',
                members: extractInterfaceMembers(index, 'ACLErrorBoundaryElement'),
            },
            {
                name: 'IndexedDB adapter options',
                document: 'docs/data.md',
                members: extractInterfaceMembers(index, 'ACLIndexedDBPersistenceAdapterOptions'),
            },
            {
                name: 'persistence migration context',
                document: 'docs/data.md',
                members: extractInterfaceMembers(index, 'ACLPersistenceMigrationContext'),
            },
            {
                name: 'lifecycle hook context',
                document: 'docs/lifecycle.md',
                members: extractInterfaceMembers(index, 'ACLHookContext'),
            },
            {
                name: 'fetch hook context',
                document: 'docs/data.md',
                members: extractInterfaceMembers(index, 'ACLFetchContext'),
            },
            {
                name: 'load error options',
                document: 'docs/api.md',
                members: extractInterfaceMembers(index, 'ACLLoadErrorOptions'),
            },
            {
                name: 'source resolver context',
                document: 'docs/components.md',
                members: extractInterfaceMembers(index, 'ACLSourceResolverContext'),
            },
            {
                name: 'event forwarding rules',
                document: 'docs/lifecycle.md',
                members: extractInterfaceMembers(index, 'ACLEventForwardRule'),
            },
            {
                name: 'event options',
                document: 'docs/lifecycle.md',
                members: extractInterfaceMembers(index, 'ACLEventOptions'),
            },
            {
                name: 'asset descriptors',
                document: 'docs/components.md',
                members: extractInterfaceMembers(index, 'ACLAssetDescriptor'),
            },
            {
                name: 'sanitizer context',
                document: 'docs/security.md',
                members: extractInterfaceMembers(index, 'ACLSanitizeContext'),
            },
            {
                name: 'security options',
                document: 'docs/security.md',
                members: extractInterfaceMembers(index, 'ACLSecurityOptions'),
            },
            {
                name: 'observability records',
                document: 'docs/observability.md',
                members: extractInterfaceMembers(index, 'ACLRuntimeRecord'),
            },
            {
                name: 'observability logger',
                document: 'docs/observability.md',
                members: extractInterfaceMembers(index, 'ACLLogger'),
            },
            {
                name: 'observability options',
                document: 'docs/observability.md',
                members: extractInterfaceMembers(index, 'ACLObservabilityOptions'),
            },
            {
                name: 'metrics snapshot',
                document: 'docs/observability.md',
                members: extractInterfaceMembers(index, 'ACLMetricsSnapshot'),
            },
            {
                name: 'adaptive prefetch options',
                document: 'docs/prefetch.md',
                members: extractInterfaceMembers(index, 'ACLAdaptivePrefetchOptions'),
            },
            {
                name: 'manifest request options',
                document: 'docs/api.md',
                members: extractInterfaceMembers(index, 'ACLManifestRequestOptions'),
            },
            {
                name: 'loader factory options',
                document: 'docs/api.md',
                members: extractInterfaceMembers(index, 'ACLLoaderFactoryOptions'),
            },
            {
                name: 'loader disposal options',
                document: 'docs/api.md',
                members: extractInterfaceMembers(index, 'ACLLoaderDisposeOptions'),
            },
            {
                name: 'offline status',
                document: 'docs/offline.md',
                members: extractInterfaceMembers(declarations['offline.d.ts'], 'ACLOfflineStatus'),
            },
            {
                name: 'route configuration entries',
                document: 'docs/manifests-and-cli.md',
                members: extractInterfaceMembers(declarations['project.d.ts'], 'ACLRouteConfigEntry'),
            },
            {
                name: 'project configuration',
                document: 'docs/manifests-and-cli.md',
                members: extractInterfaceMembers(declarations['project.d.ts'], 'ACLProjectConfig'),
            },
            {
                name: 'Vite plugin options',
                document: 'docs/manifests-and-cli.md',
                members: extractInterfaceMembers(declarations['vite.d.ts'], 'AlpineComponentLoaderViteOptions'),
            },
            {
                name: 'SSR renderer options',
                document: 'docs/ssr.md',
                members: extractInterfaceMembers(declarations['ssr.d.ts'], 'ACLSSRRendererOptions'),
            },
            {
                name: 'SSR render options',
                document: 'docs/ssr.md',
                members: extractInterfaceMembers(declarations['ssr.d.ts'], 'ACLSSRRenderOptions'),
            },
            {
                name: 'testing wait options',
                document: 'docs/testing.md',
                members: extractInterfaceMembers(declarations['testing.d.ts'], 'ACLWaitOptions'),
            },
            {
                name: 'testing mount options',
                document: 'docs/testing.md',
                members: extractInterfaceMembers(declarations['testing.d.ts'], 'ACLMountOptions'),
            },
            {
                name: 'testing fetch mock routes',
                document: 'docs/testing.md',
                members: extractInterfaceMembers(declarations['testing.d.ts'], 'ACLFetchMockRoute'),
            },
            {
                name: 'testing harness options',
                document: 'docs/testing.md',
                members: extractInterfaceMembers(declarations['testing.d.ts'], 'ACLTestHarnessOptions'),
            },
            {
                name: 'testing harness',
                document: 'docs/testing.md',
                members: extractInterfaceMembers(declarations['testing.d.ts'], 'ACLTestHarness'),
            },
            {
                name: 'Playwright fixture options',
                document: 'docs/testing.md',
                members: extractInterfaceMembers(declarations['testing-playwright.d.ts'], 'ACLPlaywrightOptions'),
            },
            {
                name: 'Playwright fixture',
                document: 'docs/testing.md',
                members: extractInterfaceMembers(declarations['testing-playwright.d.ts'], 'ACLPlaywrightFixture'),
            },
            {
                name: 'Playwright test server',
                document: 'docs/testing.md',
                members: extractInterfaceMembers(declarations['testing-playwright.d.ts'], 'ACLPlaywrightServer'),
            },
            {
                name: 'Vitest hooks',
                document: 'docs/testing.md',
                members: extractInterfaceMembers(declarations['testing-vitest.d.ts'], 'ACLVitestHooks'),
            },
            {
                name: 'Vitest fixture',
                document: 'docs/testing.md',
                members: extractInterfaceMembers(declarations['testing-vitest.d.ts'], 'ACLVitestFixture'),
            },
            {
                name: 'testing server options',
                document: 'docs/testing.md',
                members: extractInterfaceMembers(declarations['testing-server.d.ts'], 'ACLTestServerOptions'),
            },
            {
                name: 'testing server',
                document: 'docs/testing.md',
                members: extractInterfaceMembers(declarations['testing-server.d.ts'], 'ACLTestServer'),
            },
            {
                name: 'batch exporter options',
                document: 'docs/observability.md',
                members: extractInterfaceMembers(
                    declarations['observability-exporters.d.ts'],
                    'ACLBatchExporterOptions',
                ),
            },
            {
                name: 'accessibility audit result',
                document: 'docs/accessibility-and-debugging.md',
                members: extractInterfaceMembers(declarations['a11y.d.ts'], 'ACLA11yResult'),
            },
            {
                name: 'accessibility scanner options',
                document: 'docs/accessibility-and-debugging.md',
                members: extractInterfaceMembers(declarations['a11y-scanner.d.ts'], 'ACLA11yScannerOptions'),
            },
        ],
        runtimeExports = new Set();

    Object.values(declarations).forEach(
        // Inspect each declaration entry point for exported runtime values
        (source) => {
            extractRuntimeExports(source).forEach(
                // Accumulate each unique exported value for the API reference
                (name) => runtimeExports.add(name),
            );
        },
    );
    groups.push({
        name: 'named and default runtime exports',
        document: 'docs/api.md',
        members: [...runtimeExports],
    });

    return groups.map(
        // Normalize duplicate contract names before checking Markdown coverage
        (group) => ({
            ...group,
            members: [...new Set(group.members)].sort(),
        }),
    );
};

// Require an exact backticked property or method reference in Markdown
export const markdownDocumentsMember = (source, member) => {
    const escaped = escapeRegExp(member);
    return new RegExp(`\`${escaped}(?:\\([^\\n\`]*\\))?\``).test(String(source));
};

// Return every required contract member absent from its assigned document
export const findMissingDocumentation = (contracts, documents) =>
    contracts.flatMap(
        // Compare one declaration contract with its designated reference document
        (contract) => {
            const source = documents[contract.document] || '';
            return contract.members
                .filter(
                    // Retain public members without exact reference coverage
                    (member) => !markdownDocumentsMember(source, member),
                )
                .map(
                    // Preserve contract provenance for grouped diagnostics
                    (member) => ({
                        group: contract.name,
                        document: contract.document,
                        member,
                    }),
                );
        },
    );
