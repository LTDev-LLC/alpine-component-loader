import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const alpineAlias = 'alpinejs-pinned',
    repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Derive exact CDN identities from the repository's authoritative npm alias
export const resolveAlpineRuntime = (packageJson) => {
    const specification = packageJson.devDependencies?.[alpineAlias],
        match = /^npm:alpinejs@(\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?)$/i.exec(specification || '');
    if (!match)
        throw new TypeError(`package.json devDependencies.${alpineAlias} must pin npm:alpinejs@<exact-version>.`);
    const version = match[1],
        baseUrl = `https://cdn.jsdelivr.net/npm/alpinejs@${version}/dist/`;
    return {
        alias: alpineAlias,
        version,
        cdnUrl: `${baseUrl}cdn.min.js`,
        esmUrl: `${baseUrl}module.esm.min.js`,
    };
};

// Read the configured pin without depending on the installed package or lockfile
export const readAlpineRuntime = async (root = repositoryRoot) =>
    resolveAlpineRuntime(JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')));

// Locate the matching local bundle for capture, benchmarks, and browser fixtures
export const resolveAlpineFile = (root, file = 'cdn.min.js') =>
    resolve(root, 'node_modules', alpineAlias, 'dist', file);

export const alpineRuntime = await readAlpineRuntime();
