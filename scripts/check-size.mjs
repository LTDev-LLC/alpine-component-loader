import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { builtinModules } from 'node:module';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';

/**
 * @typedef {{ source: string, static: string[], dynamic: string[], external: string[] }} GraphNode
 * @typedef {{ initial: Set<string>, full: Set<string> }} EntryClosure
 */

// Bound actual browser entry closures against checked-in post-modernization baselines
const root = resolve('dist'),
    /** @type {{ entries: Record<string, { initial: number, full: number }>, sharedGraph: number }} */
    baselines = JSON.parse(await readFile(new URL('./size-baselines.json', import.meta.url), 'utf8')),
    /** @type {Record<string, { path: string, initialRoots?: string[] }>} */
    entries = {
        core: {
            path: 'dist/index.js',
        },
        explicitCore: { path: 'dist/core.js' },
        polyfills: { path: 'dist/polyfills.js' },
        basicReady: {
            path: 'dist/index.js',
            initialRoots: [
                'dist/runtime/loader.js',
                'dist/runtime/component/lifecycle-controller.js',
                'dist/runtime/rendering.js',
            ],
        },
        debugger: {
            path: 'dist/debugger.js',
        },
        auto: {
            path: 'dist/auto.js',
        },
        dev: {
            path: 'dist/dev.js',
        },
        offline: {
            path: 'dist/offline.js',
        },
        a11y: {
            path: 'dist/a11y.js',
        },
        scanner: {
            path: 'dist/a11y-scanner.js',
        },
        testing: {
            path: 'dist/testing.js',
        },
        testingPlaywright: {
            path: 'dist/testing-playwright.js',
        },
        testingVitest: {
            path: 'dist/testing-vitest.js',
        },
        observabilityExporters: {
            path: 'dist/observability-exporters.js',
        },
    };

/** @param {string} directory @returns {Promise<string[]>} */
const walk = async (directory) => {
    // Walk
    const files = [];
    // Process each entry
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...(await walk(path)));
        else if (entry.isFile() && extname(path) === '.js') files.push(path);
    }
    return files.sort();
};

/** @type {{ nodes: Record<string, { eager: string[], deferred: string[], external: string[], staticRelative: string[] }> }} */
const moduleGraph = JSON.parse(await readFile(join(root, 'module-graph.json'), 'utf8')),
    /** @type {Map<string, GraphNode>} */
    graph = new Map(),
    /** @type {Set<string>} */
    relativeStaticImports = new Set(),
    builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
// Consume the same structural graph used by offline and preload generation
for (const [path, node] of Object.entries(moduleGraph.nodes)) {
    const absolute = resolve(root, path);
    graph.set(absolute, {
        source: await readFile(absolute, 'utf8'),
        // Measure each module response independently
        static: node.eager.map((target) => resolve(root, target)),
        // Measure each module response independently
        dynamic: node.deferred.map((target) => resolve(root, target)),
        external: node.external,
    });
    // Measure each module response independently
    node.staticRelative.forEach((target) => relativeStaticImports.add(`${path} -> ${target}`));
}
/** @type {Map<string, { readableGzip: number, readableBrotli: number, minifiedGzip: number, minifiedBrotli: number }>} */
const compression = new Map();
await Promise.all(
    [...graph].map(async ([path, node]) => {
        // Compress each response independently so shared dictionary savings are not invented
        const minified = await readFile(path.replace(/\.js$/, '.min.js'));
        compression.set(path, {
            readableGzip: gzipSync(node.source).byteLength,
            readableBrotli: brotliCompressSync(node.source).byteLength,
            minifiedGzip: gzipSync(minified).byteLength,
            minifiedBrotli: brotliCompressSync(minified).byteLength,
        });
    }),
);
/** @type {{ entries: Record<string, { initial: number, full: number }>, sharedGraph: number }} */
const measured = {
    entries: {},
    sharedGraph: 0,
};
/** @type {Record<string, unknown>} */

const delivery = {};

/**
 * @param {string} entryPath
 * @param {boolean} includeDynamic
 * @returns {Set<string>}
 */
const closure = (entryPath, includeDynamic) => {
        // Run the closure operation
        /** @type {Set<string>} */
        const seen = new Set(),
            visit = (/** @type {string} */ path) => {
                // Visit
                if (seen.has(path) || !graph.has(path)) return;
                seen.add(path);
                const item = graph.get(path);
                if (!item) return;
                item.static.forEach(visit);
                if (includeDynamic) item.dynamic.forEach(visit);
            };
        visit(resolve(entryPath));
        return seen;
    },
    gzip = (/** @type {Iterable<string>} */ paths) =>
        [...paths].reduce((total, path) => total + (compression.get(path)?.readableGzip || 0), 0);

/** @type {Map<string, Set<string>>} */
const reachability = new Map(),
    /** @type {Map<string, EntryClosure>} */
    closures = new Map();
// Process each entry
for (const [name, config] of Object.entries(entries)) {
    const initial = closure(config.path, false),
        full = closure(config.path, true);
    config.initialRoots?.forEach((path) => {
        // Measure the basic inline component closure verified by browser request tests
        closure(path, false).forEach((module) => initial.add(module));
    });
    closures.set(name, {
        initial,
        full,
    });
    full.forEach(
        // Process the current item
        (path) => reachability.set(path, new Set([...(reachability.get(path) || []), name])),
    );
}

let failed = false,
    structuralFailed = false;
// Calculate one stable absolute-or-relative growth allowance
/** @param {number} baseline */
const limitFor = (baseline) => baseline + Math.max(64, Math.ceil(baseline * 0.05));
if (relativeStaticImports.size) {
    process.stderr.write(`Package-relative static browser imports:\n${[...relativeStaticImports].join('\n')}\n`);
    failed = structuralFailed = true;
}
// Process each entry
for (const [name, config] of Object.entries(entries)) {
    const selected = closures.get(name);
    if (!selected) throw new Error(`Missing size closure for ${name}.`);
    const { initial, full } = selected,
        entryPath = resolve(config.path),
        shared = new Set(
            [...full].filter(
                // Select matching items
                (path) => path !== entryPath && (reachability.get(path)?.size || 0) > 1,
            ),
        ),
        initialOwned = new Set(
            [...initial].filter(
                // Select matching items
                (path) => path === entryPath || !shared.has(path),
            ),
        ),
        fullOwned = new Set(
            [...full].filter(
                // Select matching items
                (path) => path === entryPath || !shared.has(path),
            ),
        ),
        entryBytes = gzipSync(graph.get(entryPath)?.source || '').byteLength,
        initialBytes = gzip(initial),
        fullBytes = gzip(full),
        initialOwnedBytes = gzip(initialOwned),
        fullOwnedBytes = gzip(fullOwned),
        sharedBytes = gzip(shared),
        baseline = baselines.entries[name],
        initialLimit = limitFor(baseline.initial),
        fullLimit = limitFor(baseline.full),
        status = initialBytes <= initialLimit && fullBytes <= fullLimit ? 'ok' : 'over baseline';
    process.stdout.write(
        `${name}: initial ${initialBytes}/${initialLimit} (owned ${initialOwnedBytes}), full ${fullBytes}/${fullLimit} (owned ${fullOwnedBytes}), entry ${entryBytes}, shared ${sharedBytes} gzip bytes (${status})\n`,
    );
    measured.entries[name] = {
        initial: initialBytes,
        full: fullBytes,
    };
    delivery[name] = Object.fromEntries(
        [
            ['initial', initial],
            ['full', full],
        ].map(([label, paths]) => {
            // Report all compression variants and actual module counts for each closure
            const selected = /** @type {Set<string>} */ (paths);
            return [
                String(label),
                {
                    requests: selected.size,
                    ...Object.fromEntries(
                        // Measure each module response independently
                        ['readableGzip', 'readableBrotli', 'minifiedGzip', 'minifiedBrotli'].map((key) => [
                            key,
                            [...selected].reduce(
                                // Measure each module response independently
                                (sum, path) =>
                                    sum + (compression.get(path)?.[/** @type {'readableGzip'} */ (key)] || 0),
                                0,
                            ),
                        ]),
                    ),
                },
            ];
        }),
    );
    failed ||= status !== 'ok';
}

const reachable = new Set(
        [...closures.values()].flatMap(
            // Expand the current item
            (value) => [...value.full],
        ),
    ),
    orphans = [...graph.keys()].filter(
        // Select matching items
        (path) => !reachable.has(path),
    );
if (orphans.length) {
    process.stderr.write(
        `Orphaned browser chunks:\n${orphans
            .map(
                // Transform the current item
                (path) => relative(process.cwd(), path),
            )
            .join('\n')}\n`,
    );
    failed = structuralFailed = true;
}

const nodeImports = [...reachable].flatMap(
    // Expand the current item
    (path) =>
        (graph.get(path)?.external || [])
            .filter(
                // Select matching items
                (specifier) => builtins.has(specifier) || specifier.startsWith('node:'),
            )
            .map(
                // Transform the current item
                (specifier) => `${relative(process.cwd(), path)} -> ${specifier}`,
            ),
);
if (nodeImports.length) {
    process.stderr.write(`Unexpected Node imports in browser entries:\n${nodeImports.join('\n')}\n`);
    failed = structuralFailed = true;
}

/** @type {Map<string, string[]>} */
const hashes = new Map();
// Process each path
for (const path of reachable) {
    const hash = createHash('sha256')
            .update(graph.get(path)?.source || '')
            .digest('hex'),
        matches = hashes.get(hash) || [];
    matches.push(path);
    hashes.set(hash, matches);
}
const duplicates = [...hashes.values()].filter(
    // Select matching items
    (paths) => paths.length > 1,
);
if (duplicates.length) {
    process.stderr.write(
        `Duplicated browser chunks:\n${duplicates
            .map(
                // Transform the current item
                (paths) =>
                    paths
                        .map(
                            // Transform the current item
                            (path) => relative(process.cwd(), path),
                        )
                        .join(' = '),
            )
            .join('\n')}\n`,
    );
    failed = structuralFailed = true;
}

const sharedChunks = [...reachability].filter(
        // Select matching items
        ([, owners]) => owners.size > 1,
    ),
    // Select shared graph paths from the reachability ownership index
    sharedGraphBytes = gzip(new Set(sharedChunks.map(([path]) => path))),
    sharedGraphLimit = limitFor(baselines.sharedGraph),
    sharedGraphStatus = sharedGraphBytes <= sharedGraphLimit ? 'ok' : 'over baseline';
process.stdout.write(
    `Shared graph: ${sharedGraphBytes}/${sharedGraphLimit} gzip bytes (${sharedGraphStatus}); shared chunks: ${sharedChunks.length}; reachable chunks: ${reachable.size}; orphaned chunks: ${orphans.length}.\n`,
);
failed ||= sharedGraphStatus !== 'ok';
measured.sharedGraph = sharedGraphBytes;
process.stdout.write(`${JSON.stringify(delivery, null, 2)}\n`);
if (structuralFailed) throw new Error('Invalid browser module distribution');
if (process.argv.includes('--update')) {
    await writeFile(new URL('./size-baselines.json', import.meta.url), `${JSON.stringify(measured, null, 4)}\n`);
    await writeFile(new URL('./delivery-baselines.json', import.meta.url), `${JSON.stringify(delivery, null, 4)}\n`);
} else {
    const expected = JSON.parse(await readFile(new URL('./delivery-baselines.json', import.meta.url), 'utf8'));
    // Measure each module response independently
    for (const [name, measurements] of Object.entries(delivery)) {
        // Gate independently delivered variants with the same reviewed growth allowance
        for (const [phase, values] of Object.entries(
            /** @type {Record<string, Record<string, number>>} */ (measurements),
        )) {
            // Measure each module response independently
            for (const [metric, value] of Object.entries(values)) {
                const baseline = expected[name]?.[phase]?.[metric];
                if (!Number.isFinite(baseline)) {
                    failed = true;
                    continue;
                }
                if (value > (metric === 'requests' ? baseline : limitFor(baseline))) {
                    process.stderr.write(`${name} ${phase} ${metric} exceeds delivery budget\n`);
                    failed = true;
                }
            }
        }
    }
    if (failed) process.exitCode = 1;
}
