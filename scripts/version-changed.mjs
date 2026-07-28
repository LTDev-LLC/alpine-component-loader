import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const semanticVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

// Read and validate only the public package version used by the CI gate
export const readPackageVersion = (source, label = 'package.json') => {
    const { version } = JSON.parse(source);
    if (typeof version !== 'string' || !semanticVersion.test(version))
        throw new TypeError(`${label} must contain a valid semantic version`);
    return version;
};

// Ignore unrelated package metadata changes when deciding whether CI should run
export const packageVersionChanged = (currentSource, previousSource) =>
    readPackageVersion(currentSource, 'Current package.json') !==
    readPackageVersion(previousSource, 'Previous package.json');

export const versionChangedSince = async (baseSha, cwd = process.cwd()) => {
    // Run the version changed since operation
    if (!baseSha || /^0+$/.test(baseSha)) return true;
    const currentSource = await readFile(join(cwd, 'package.json'), 'utf8');
    let previousSource;
    // Guard the version changed since operation against runtime failures
    try {
        previousSource = execFileSync('git', ['show', `${baseSha}:package.json`], {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    } catch {
        return true;
    }
    return packageVersionChanged(currentSource, previousSource);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const changed = await versionChangedSince(process.argv[2]);
    process.stdout.write(String(changed));
}
