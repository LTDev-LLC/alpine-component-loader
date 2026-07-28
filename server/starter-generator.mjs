import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProjectFile } from './file-writer.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    starterRoot = resolve(packageRoot, 'starters'),
    supportedTemplates = new Set(['vanilla', 'vite']);

// Run this operation
const walk = async (directory) => {
    const output = [];
    // Run this operation
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name === '.DS_Store' || entry.name === 'node_modules') continue;
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) output.push(...(await walk(path)));
        else if (entry.isFile()) output.push(path);
    }
    return output.sort();
};

export const createStarterProject = async ({ directory, template = 'vanilla', force = false, dryRun = false } = {}) => {
    // Copy a maintained starter without executing package-manager or network commands
    if (!supportedTemplates.has(template)) throw new TypeError(`Unsupported starter template "${template}".`);
    if (!directory) throw new TypeError('A starter output directory is required.');
    const sourceRoot = resolve(starterRoot, template),
        files = await walk(sourceRoot),
        // Run this operation
        writes = files.map((source) => ({
            source,
            path: resolve(directory, relative(sourceRoot, source)),
        }));
    if (!dryRun) {
        // Run this operation
        const info = await stat(directory).catch(() => null);
        if (info && !info.isDirectory()) throw new TypeError(`Starter target is not a directory: ${directory}`);
        // Run this operation
        for (const write of writes)
            await writeProjectFile(write.path, await readFile(write.source, 'utf8'), {
                force,
            });
    }
    return {
        command: 'create',
        template,
        directory,
        dryRun,
        // Run this operation
        files: writes.map((write) => write.path.split(sep).join('/')),
    };
};

export default { createStarterProject };
