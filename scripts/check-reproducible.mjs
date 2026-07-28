import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

// Compare generated artifacts and every checked-in public package surface that
// must remain byte-stable across consecutive builds
const run = promisify(execFile),
    roots = [resolve('dist'), resolve('types'), resolve('server'), resolve('docs')],
    files = [
        resolve('README.md'),
        resolve('MIGRATION.md'),
        resolve('examples/offline/acl-precache-manifest.json'),
        resolve('examples/offline/acl-sw.js'),
    ];

// Recursively enumerate every generated artifact
const walk = async (directory) => {
    // Walk
    const paths = [];
    // Process each entry
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) paths.push(...(await walk(path)));
        else if (entry.isFile()) paths.push(path);
    }
    return paths;
};

// Hash generated files by repository-relative path for deterministic comparison
const snapshot = async () => {
    // Snapshot
    const hashes = {};
    // Process each root
    for (const root of roots) {
        // Process each path
        for (const path of await walk(root)) {
            hashes[relative(process.cwd(), path)] = createHash('sha256')
                .update(await readFile(path))
                .digest('hex');
        }
    }
    // Process each path
    for (const path of files)
        hashes[relative(process.cwd(), path)] = createHash('sha256')
            .update(await readFile(path))
            .digest('hex');
    return hashes;
};

// Build twice from the same checkout and compare the complete output snapshots
await run('npm', ['run', 'build']);
const first = await snapshot();
await run('npm', ['run', 'build']);
const second = await snapshot();

// Report any byte-level difference between consecutive builds
if (JSON.stringify(first) !== JSON.stringify(second)) {
    process.stderr.write('Build output is not reproducible.\n');
    process.exitCode = 1;
} else {
    process.stdout.write(`Reproducible build passed (${Object.keys(first).length} artifacts).\n`);
}
