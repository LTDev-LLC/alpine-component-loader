import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { loadOptionalDependency } from './optional-dependency.mjs';

export const runtimeCapabilities = Object.freeze({
    component: ['runtime/component/lifecycle-controller.js', 'runtime/rendering.js'],
    templates: ['runtime/template-loader.js', 'runtime/template-requests.js'],
    cache: ['runtime/template-cache.js'],
    manifest: ['runtime/registry.js', 'runtime/manifest-loader.js'],
    data: ['runtime/component/data-controller.js', 'runtime/fetch-cache.js'],
    persistence: ['runtime/component/persistence-controller.js'],
    assets: ['runtime/component/asset-controller.js'],
    form: ['runtime/component/form-controller.js'],
    hydration: ['runtime/component/hydration.js'],
    triggers: ['runtime/component/triggers.js'],
    styles: ['runtime/component/styles.js'],
    slots: ['runtime/component/slots.js'],
    scripts: ['runtime/component/scripts.js'],
    scheduler: ['runtime/initialization-scheduler.js'],
    environment: ['runtime/environment.js'],
    polyfills: ['polyfills.js'],
    hmr: ['runtime/hmr.js'],
    observability: ['runtime/observability.js'],
    adaptivePrefetch: ['runtime/adaptive-prefetch.js'],
    dynamic: ['elements/dynamic.js'],
    boundary: ['elements/boundary.js'],
    declarative: ['elements/declarative.js'],
    offline: ['offline.js'],
    debugger: ['debugger.js', 'runtime/debugger-panel.js'],
    scanner: ['a11y-scanner.js', 'runtime/a11y-scanner-dialog.js'],
});

// Generate structural import edges without matching comments or string contents
export const generateModuleGraph = async (directory, packageVersion, capabilities = runtimeCapabilities) => {
    const { parse } = await loadOptionalDependency('@swc/core', 'module graph generation'),
        nodes = {};

    const walk = async (path) => {
        // Inspect every browser module in deterministic order
        for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) =>
            a.name.localeCompare(b.name),
        )) {
            const file = resolve(path, entry.name);
            if (entry.isDirectory()) {
                await walk(file);
                continue;
            }
            // Minified siblings use the same canonical dependency graph and URL suffix resolution
            if (!entry.name.endsWith('.js') || entry.name.endsWith('.min.js')) continue;
            const source = await readFile(file, 'utf8'),
                ast = await parse(source, { syntax: 'ecmascript' }),
                eager = new Set(),
                deferred = new Set(),
                external = new Set(),
                staticRelative = new Set(),
                helperEdges = new Set();
            let preservesInstance = false;

            const edge = (specifier, kind, helper = false, owner = file) => {
                    // Keep package edges relative to the distribution root
                    if (!specifier.startsWith('.')) {
                        external.add(specifier);
                        return;
                    }
                    const target = relative(directory, resolve(dirname(owner), specifier)).replaceAll('\\', '/');
                    if (target.startsWith('../')) {
                        external.add(specifier);
                        return;
                    }
                    (kind === 'eager' ? eager : deferred).add(target);
                    if (helper) helperEdges.add(target);
                },
                visit = (node) => {
                    // Follow structural nodes and recognize the loader import helpers
                    if (!node || typeof node !== 'object') return;
                    if (
                        ['ImportDeclaration', 'ExportAllDeclaration', 'ExportNamedDeclaration'].includes(node.type) &&
                        node.source
                    ) {
                        edge(node.source.value, 'eager');
                        if (node.source.value.startsWith('.')) staticRelative.add(node.source.value);
                    }
                    if (node.type === 'CallExpression') {
                        if (
                            node.callee?.type === 'MemberExpression' &&
                            node.callee.property?.value === 'set' &&
                            node.arguments?.[0]?.expression?.value === 'acl-instance'
                        )
                            preservesInstance = true;
                        if (
                            node.callee?.type === 'MemberExpression' &&
                            node.callee.property?.value === '_loadModule' &&
                            node.arguments?.[0]?.expression?.type === 'StringLiteral'
                        )
                            edge(
                                node.arguments[0].expression.value,
                                'deferred',
                                false,
                                resolve(directory, 'runtime/loader.js'),
                            );
                        const name = node.callee?.value || (node.callee?.type === 'Import' ? 'import' : ''),
                            value = node.arguments?.[0]?.expression;
                        if (
                            value?.type === 'StringLiteral' &&
                            [
                                'import',
                                'importLocalModule',
                                'importNativeModule',
                                'importSharedModule',
                                'importDeferredLocalModule',
                                'loadRuntimeModule',
                            ].includes(name)
                        )
                            edge(
                                value.value,
                                ['importLocalModule', 'importNativeModule', 'importSharedModule'].includes(name)
                                    ? 'eager'
                                    : 'deferred',
                                name !== 'import' &&
                                    !(name === 'loadRuntimeModule' && node.arguments?.[1]?.expression?.value === true),
                            );
                    }
                    // Visit structural module edges without evaluating browser code
                    Object.entries(node).forEach(([key, value]) => {
                        if (key === 'span') return;
                        if (Array.isArray(value)) value.forEach(visit);
                        else if (value && typeof value === 'object') visit(value);
                    });
                };
            visit(ast);
            nodes[relative(directory, file).replaceAll('\\', '/')] = {
                eager: [...eager].sort(),
                deferred: [...deferred].sort(),
                external: [...external].sort(),
                staticRelative: [...staticRelative].sort(),
                instanceEdges: preservesInstance ? [...helperEdges].sort() : [],
            };
        }
    };
    await walk(directory);
    Object.entries(nodes).forEach(([file, node]) =>
        [...node.eager, ...node.deferred].forEach((target) => {
            if (!nodes[target]) throw new TypeError(`Missing browser module ${file} -> ${target}`);
        }),
    );
    Object.entries(capabilities).forEach(([capability, roots]) =>
        roots.forEach((root) => {
            if (!nodes[root]) throw new TypeError(`Missing runtime capability module ${capability} -> ${root}`);
        }),
    );
    const graph = {
        version: 1,
        packageVersion,
        capabilities,
        nodes,
    };
    await writeFile(resolve(directory, 'module-graph.json'), `${JSON.stringify(graph, null, 4)}\n`);
    return graph;
};

// Compute a unique transitive closure using only the requested edge family
export const moduleClosure = (graph, roots, includeDeferred = false) => {
    const selected = new Set(),
        // Visit structural module edges without evaluating browser code
        visit = (path) => {
            if (selected.has(path)) return;
            const node = graph.nodes[path];
            if (!node) throw new TypeError(`Unknown browser module ${path}`);
            selected.add(path);
            node.eager.forEach(visit);
            if (includeDeferred) node.deferred.forEach(visit);
        };
    roots.forEach(visit);
    return [...selected].sort();
};
