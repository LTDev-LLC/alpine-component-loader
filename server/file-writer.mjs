import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** @param {string} path */
const pathExists = async (path) => {
    // Resolve one path while treating absence as an ordinary result
    try {
        return await stat(path);
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
        throw error;
    }
};

// Replace one generated project artifact atomically after validation succeeds
/**
 * @param {string} path
 * @param {string | Uint8Array} content
 * @param {{ force?: boolean }} [options]
 */
export const writeProjectFile = async (path, content, { force = false } = {}) => {
    if (!force && (await pathExists(path))) throw new TypeError(`Refusing to overwrite existing file: ${path}`);
    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = `${path}.acl-tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporaryPath, content);
    await rename(temporaryPath, path);
};

export default writeProjectFile;
