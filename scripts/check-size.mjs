import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { builtinModules } from 'node:module';
import { gzipSync } from 'node:zlib';

/**
 * @typedef {{ source: string, static: string[], dynamic: string[], external: string[] }} GraphNode
 * @typedef {{ initial: Set<string>, full: Set<string> }} EntryClosure
 */

// Bound actual browser entry closures against checked-in post-modernization baselines
const root = resolve('dist'),
    /** @type {{ entries: Record<string, { initial: number, full: number }>, sharedGraph: number }} */
    baselines = JSON.parse(await readFile(new URL('./size-baselines.json', import.meta.url), 'utf8')),
    /** @type {Record<string, { path: string }>} */
    entries = {
        core: {
            path: 'dist/index.js',
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

const importPatterns = {
        static: /(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/g,
        dynamic: /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
        eagerHelper: /\bimportLocalModule\s*\(\s*["']([^"']+)["']/g,
        deferredHelper: /\b(?:importDeferredLocalModule|loadRuntimeModule)\s*\(\s*["']([^"']+)["']/g,
    },
    /** @type {Map<string, GraphNode>} */
    graph = new Map(),
    /** @type {Set<string>} */
    relativeStaticImports = new Set(),
    builtins = new Set([
        ...builtinModules,
        ...builtinModules.map(
            // Transform the current item
            (name) => `node:${name}`,
        ),
    ]);
// Process each path
for (const path of await walk(root)) {
    const source = await readFile(path, 'utf8'),
        directDynamicSpecifiers = new Set(
            [...source.matchAll(importPatterns.dynamic)].map(
                // Transform the current item
                (match) => match[1],
            ),
        ),
        eagerHelperSpecifiers = new Set(
            [...source.matchAll(importPatterns.eagerHelper)].map(
                // Transform the current item
                (match) => match[1],
            ),
        ),
        deferredHelperSpecifiers = new Set(
            [...source.matchAll(importPatterns.deferredHelper)].map(
                // Transform the current item
                (match) => match[1],
            ),
        ),
        dynamicSpecifiers = new Set([...directDynamicSpecifiers, ...deferredHelperSpecifiers]),
        directStaticSpecifiers = [...source.matchAll(importPatterns.static)]
            .map(
                // Transform the current item
                (match) => match[1],
            )
            .filter(
                // Select matching items
                (specifier) => !directDynamicSpecifiers.has(specifier),
            ),
        staticSpecifiers = directStaticSpecifiers.concat([...eagerHelperSpecifiers]),
        resolveSpecifier = (/** @type {string} */ specifier) => {
            // Resolve specifier
            return specifier.startsWith('.') ? resolve(dirname(path), specifier) : specifier;
        };
    directStaticSpecifiers
        .filter(
            // Select matching items
            (specifier) => specifier.startsWith('.'),
        )
        .forEach(
            // Track suffix-unsafe browser module edges
            (specifier) => relativeStaticImports.add(`${relative(process.cwd(), path)} -> ${specifier}`),
        );
    graph.set(resolve(path), {
        source,
        static: staticSpecifiers.map(resolveSpecifier),
        dynamic: [...dynamicSpecifiers].map(resolveSpecifier),
        external: [...staticSpecifiers, ...dynamicSpecifiers].filter(
            // Select matching items
            (specifier) => !specifier.startsWith('.'),
        ),
    });
}

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
    gzip = (/** @type {Iterable<string>} */ paths) => {
        // Run the gzip operation
        return gzipSync(
            [...paths]
                .sort()
                .map(
                    // Transform the current item
                    (path) => graph.get(path)?.source || '',
                )
                .join('\n'),
        ).byteLength;
    };

/** @type {Map<string, Set<string>>} */
const reachability = new Map(),
    /** @type {Map<string, EntryClosure>} */
    closures = new Map();
// Process each entry
for (const [name, config] of Object.entries(entries)) {
    const initial = closure(config.path, false),
        full = closure(config.path, true);
    closures.set(name, {
        initial,
        full,
    });
    full.forEach(
        // Process the current item
        (path) => reachability.set(path, new Set([...(reachability.get(path) || []), name])),
    );
}

let failed = false;
// Calculate one stable absolute-or-relative growth allowance
/** @param {number} baseline */
const limitFor = (baseline) => baseline + Math.max(64, Math.ceil(baseline * 0.05));
if (relativeStaticImports.size) {
    process.stderr.write(`Package-relative static browser imports:\n${[...relativeStaticImports].join('\n')}\n`);
    failed = true;
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
    failed = true;
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
    failed = true;
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
    failed = true;
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
if (failed) process.exitCode = 1;
